/**
 * Skin Confidence Mask — Per-cell confidence layer for skin trustworthiness
 *
 * Even inside the face mask, not every pixel is trustworthy skin.
 * Hair intrusions, specular highlights, deep shadows, blur, and
 * non-skin-tone patches are detected and downweighted.
 *
 * Client-side only — uses Canvas/ImageData APIs.
 */

import type {
  SkinConfidenceCell,
  SkinRejectReason,
  SkinConfidenceMap,
  RegionSkinConfidence,
  FaceMaskResult,
  ComputedRegion,
  Point2D,
} from './types'
import { SKIN_CONFIDENCE_GRID_SIZE, SKIN_TONE_RANGE } from './constants'
import { pointInPolygon } from './face-mask'
import { edgeDensity, sobelEdges, textureRoughness } from '../ai/specialists/pixel-utils'

// ─── RGB → HSV Conversion ───────────────────────────────

interface HSV {
  h: number // 0-360
  s: number // 0-255
  v: number // 0-255
}

/**
 * Standard RGB to HSV conversion.
 * H: 0-360, S: 0-255, V: 0-255
 */
function rgbToHsv(r: number, g: number, b: number): HSV {
  const rN = r / 255
  const gN = g / 255
  const bN = b / 255

  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const delta = max - min

  // Value
  const v = max * 255

  // Saturation
  const s = max === 0 ? 0 : (delta / max) * 255

  // Hue
  let h = 0
  if (delta !== 0) {
    if (max === rN) {
      h = 60 * (((gN - bN) / delta) % 6)
    } else if (max === gN) {
      h = 60 * ((bN - rN) / delta + 2)
    } else {
      h = 60 * ((rN - gN) / delta + 4)
    }
  }
  if (h < 0) h += 360

  return { h, s, v }
}

// ─── Source → Canvas Helper ─────────────────────────────

function toCanvas(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement | null {
  if (source instanceof HTMLCanvasElement) return source

  const canvas = document.createElement('canvas')
  const w = source.naturalWidth || source.width
  const h = source.naturalHeight || source.height
  if (w === 0 || h === 0) return null
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0)
  return canvas
}

// ─── Laplacian Variance (Sharpness) ─────────────────────

/**
 * Compute Laplacian variance on grayscale data.
 * sum of (center*4 - top - bottom - left - right)^2 / pixelCount
 */
function laplacianVariance(gray: Uint8ClampedArray, w: number, h: number): number {
  if (w < 3 || h < 3) return 0

  let sum = 0
  let count = 0

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const center = gray[y * w + x]
      const top = gray[(y - 1) * w + x]
      const bottom = gray[(y + 1) * w + x]
      const left = gray[y * w + (x - 1)]
      const right = gray[y * w + (x + 1)]
      const lap = center * 4 - top - bottom - left - right
      sum += lap * lap
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

// ─── Cell Feature Extraction ────────────────────────────

interface CellFeatures {
  meanR: number
  meanG: number
  meanB: number
  meanBrightness: number
  hsv: HSV
  colorVariance: number
  laplacianVar: number
  edgeDens: number
  texRoughness: number
}

function extractCellFeatures(
  rgba: Uint8ClampedArray,
  imgWidth: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): CellFeatures {
  const pixelCount = cellW * cellH
  const gray = new Uint8ClampedArray(pixelCount)

  let sumR = 0, sumG = 0, sumB = 0

  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < cellW; dx++) {
      const srcIdx = ((cellY + dy) * imgWidth + (cellX + dx)) * 4
      const r = rgba[srcIdx]
      const g = rgba[srcIdx + 1]
      const b = rgba[srcIdx + 2]
      sumR += r
      sumG += g
      sumB += b
      const grayVal = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      gray[dy * cellW + dx] = grayVal
    }
  }

  const meanR = sumR / pixelCount
  const meanG = sumG / pixelCount
  const meanB = sumB / pixelCount
  const meanBright = (meanR * 0.299 + meanG * 0.587 + meanB * 0.114)

  // Color variance (sum of per-channel variance)
  let varR = 0, varG = 0, varB = 0
  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < cellW; dx++) {
      const srcIdx = ((cellY + dy) * imgWidth + (cellX + dx)) * 4
      varR += (rgba[srcIdx] - meanR) ** 2
      varG += (rgba[srcIdx + 1] - meanG) ** 2
      varB += (rgba[srcIdx + 2] - meanB) ** 2
    }
  }
  const colorVariance = (varR + varG + varB) / (3 * pixelCount)

  const hsv = rgbToHsv(Math.round(meanR), Math.round(meanG), Math.round(meanB))
  const laplacianVar = laplacianVariance(gray, cellW, cellH)

  const edges = sobelEdges(gray, cellW, cellH)
  const edgeDens = edgeDensity(edges, cellW, cellH)
  const texRough = textureRoughness(gray)

  return {
    meanR,
    meanG,
    meanB,
    meanBrightness: meanBright,
    hsv,
    colorVariance,
    laplacianVar: laplacianVar,
    edgeDens,
    texRoughness: texRough,
  }
}

// ─── Reject Reason Penalties ────────────────────────────

const REJECT_PENALTIES: Record<SkinRejectReason, number> = {
  out_of_skin_tone: 0.2,
  deep_shadow: 0.3,
  specular_highlight: 0.4,
  overexposed: 0.1,
  strong_blur: 0.5,
  edge_noise: 0.4,
  hair_intrusion: 0.15,
  beard_noise: 0.5,
}

// ─── Main: computeSkinConfidenceMap ─────────────────────

/**
 * Compute a per-cell skin confidence map over the image.
 *
 * Divides the image into a grid of cells (SKIN_CONFIDENCE_GRID_SIZE px each),
 * then for each cell overlapping the face mask, evaluates skin tone, brightness,
 * blur, edge noise, and hair intrusion heuristics. Returns a confidence value
 * per cell and aggregate statistics.
 */
export function computeSkinConfidenceMap(
  source: HTMLCanvasElement | HTMLImageElement,
  faceMask: FaceMaskResult,
): SkinConfidenceMap {
  const canvas = toCanvas(source)
  const emptyMap: SkinConfidenceMap = {
    cells: [],
    gridRows: 0,
    gridCols: 0,
    cellWidth: SKIN_CONFIDENCE_GRID_SIZE,
    cellHeight: SKIN_CONFIDENCE_GRID_SIZE,
    overallSkinConfidence: 0,
    usableSkinRatio: 0,
  }

  if (!canvas || !faceMask.reliable) return emptyMap

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return emptyMap

  const imgW = canvas.width
  const imgH = canvas.height
  const imageData = ctx.getImageData(0, 0, imgW, imgH)
  const rgba = imageData.data

  const cellSize = SKIN_CONFIDENCE_GRID_SIZE
  const gridCols = Math.floor(imgW / cellSize)
  const gridRows = Math.floor(imgH / cellSize)

  if (gridCols === 0 || gridRows === 0) return emptyMap

  const cells: SkinConfidenceCell[][] = []
  let faceCellCount = 0
  let confidenceSum = 0
  let usableCellCount = 0

  for (let row = 0; row < gridRows; row++) {
    const rowCells: SkinConfidenceCell[] = []

    for (let col = 0; col < gridCols; col++) {
      const cellX = col * cellSize
      const cellY = row * cellSize

      // Check if center of cell is inside the face mask (normalized coords)
      const centerNormX = (cellX + cellSize / 2) / imgW
      const centerNormY = (cellY + cellSize / 2) / imgH
      const centerPoint: Point2D = { x: centerNormX, y: centerNormY }

      let insideFace = pointInPolygon(centerPoint, faceMask.outerPolygon)
      if (!insideFace && faceMask.foreheadExtension) {
        insideFace = pointInPolygon(centerPoint, faceMask.foreheadExtension)
      }

      // Check exclusion zones
      if (insideFace) {
        for (const zone of faceMask.exclusions) {
          if (pointInPolygon(centerPoint, zone.polygon)) {
            insideFace = false
            break
          }
        }
      }

      if (!insideFace) {
        rowCells.push({
          row,
          col,
          confidence: 0,
          isLikelySkin: false,
          rejectReasons: [],
        })
        continue
      }

      // Extract features for this cell
      const actualCellW = Math.min(cellSize, imgW - cellX)
      const actualCellH = Math.min(cellSize, imgH - cellY)

      if (actualCellW < 3 || actualCellH < 3) {
        rowCells.push({
          row,
          col,
          confidence: 0,
          isLikelySkin: false,
          rejectReasons: [],
        })
        continue
      }

      const features = extractCellFeatures(rgba, imgW, cellX, cellY, actualCellW, actualCellH)
      const rejectReasons: SkinRejectReason[] = []

      // (a) Skin tone check
      const { h, s, v } = features.hsv
      if (
        h < SKIN_TONE_RANGE.minH || h > SKIN_TONE_RANGE.maxH ||
        s < SKIN_TONE_RANGE.minS || s > SKIN_TONE_RANGE.maxS ||
        v < SKIN_TONE_RANGE.minV || v > SKIN_TONE_RANGE.maxV
      ) {
        rejectReasons.push('out_of_skin_tone')
      }

      // (b) Brightness checks
      const mb = features.meanBrightness
      if (mb < 50) {
        rejectReasons.push('deep_shadow')
      }
      if (mb > 240) {
        rejectReasons.push('overexposed')
      } else if (mb > 230) {
        rejectReasons.push('specular_highlight')
      }

      // (c) Blur check — Laplacian variance
      if (features.laplacianVar < 5) {
        rejectReasons.push('strong_blur')
      }

      // (d) Edge noise check — high edge density + low texture coherence
      if (features.edgeDens > 0.6 && features.texRoughness < 0.3) {
        rejectReasons.push('edge_noise')
      }

      // (e) Hair intrusion heuristic — very dark + low color variance
      if (mb < 40 && features.colorVariance < 100) {
        rejectReasons.push('hair_intrusion')
      }

      // Compute confidence
      let confidence = 1.0
      for (const reason of rejectReasons) {
        confidence *= REJECT_PENALTIES[reason]
      }

      // isLikelySkin: confidence > 0.5 AND no single reject with severity > 0.5 penalty
      const hasHighSeverityReject = rejectReasons.some(
        (reason) => REJECT_PENALTIES[reason] < 0.5,
      )
      const isLikelySkin = confidence > 0.5 && !hasHighSeverityReject

      rowCells.push({
        row,
        col,
        confidence,
        isLikelySkin,
        rejectReasons,
      })

      faceCellCount++
      confidenceSum += confidence
      if (isLikelySkin) usableCellCount++
    }

    cells.push(rowCells)
  }

  return {
    cells,
    gridRows,
    gridCols,
    cellWidth: cellSize,
    cellHeight: cellSize,
    overallSkinConfidence: faceCellCount > 0 ? confidenceSum / faceCellCount : 0,
    usableSkinRatio: faceCellCount > 0 ? usableCellCount / faceCellCount : 0,
  }
}

// ─── getRegionSkinConfidence ────────────────────────────

/**
 * For a ComputedRegion, find all grid cells that overlap with the region's bbox
 * and compute aggregate skin confidence metrics.
 */
export function getRegionSkinConfidence(
  skinMap: SkinConfidenceMap,
  region: ComputedRegion,
): RegionSkinConfidence {
  const { bbox } = region
  const { cells, gridCols, gridRows, cellWidth, cellHeight } = skinMap

  // Convert normalized bbox to grid cell range
  // We need image dimensions to denormalize — derive from grid size
  const imgW = gridCols * cellWidth
  const imgH = gridRows * cellHeight

  const startCol = Math.max(0, Math.floor((bbox.x * imgW) / cellWidth))
  const endCol = Math.min(gridCols - 1, Math.floor(((bbox.x + bbox.width) * imgW) / cellWidth))
  const startRow = Math.max(0, Math.floor((bbox.y * imgH) / cellHeight))
  const endRow = Math.min(gridRows - 1, Math.floor(((bbox.y + bbox.height) * imgH) / cellHeight))

  let totalCells = 0
  let usableCells = 0
  let confidenceSum = 0
  const reasonCounts = new Map<SkinRejectReason, number>()
  const reasonSeveritySum = new Map<SkinRejectReason, number>()

  for (let row = startRow; row <= endRow; row++) {
    if (!cells[row]) continue
    for (let col = startCol; col <= endCol; col++) {
      const cell = cells[row][col]
      if (!cell || cell.confidence === 0 && cell.rejectReasons.length === 0) {
        // Cell outside face mask — skip
        continue
      }

      totalCells++
      confidenceSum += cell.confidence
      if (cell.isLikelySkin) usableCells++

      for (const reason of cell.rejectReasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1)
        const penalty = 1 - REJECT_PENALTIES[reason]
        reasonSeveritySum.set(reason, (reasonSeveritySum.get(reason) || 0) + penalty)
      }
    }
  }

  // Aggregate reduction factors
  const reductionFactors: { reason: SkinRejectReason; severity: number }[] = []
  for (const [reason] of reasonCounts.entries()) {
    if (totalCells > 0) {
      const avgSeverity = (reasonSeveritySum.get(reason) || 0) / totalCells
      reductionFactors.push({ reason, severity: avgSeverity })
    }
  }

  // Sort by severity descending
  reductionFactors.sort((a, b) => b.severity - a.severity)

  return {
    regionId: region.definition.id,
    usableSkinRatio: totalCells > 0 ? usableCells / totalCells : 0,
    averageSkinConfidence: totalCells > 0 ? confidenceSum / totalCells : 0,
    reductionFactors,
  }
}
