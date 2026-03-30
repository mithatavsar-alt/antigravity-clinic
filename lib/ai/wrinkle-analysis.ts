/**
 * Wrinkle / Skin-Line Analysis
 *
 * Extracts facial regions using FaceMesh landmark coordinates,
 * converts to grayscale, applies Sobel edge detection, and
 * computes wrinkle density scores.
 *
 * All outputs are presented as "ön değerlendirme" — never diagnosis.
 * This module does NOT use external APIs.
 */

import type { Landmark, WrinkleRegion, WrinkleLevel, WrinkleRegionResult, WrinkleAnalysisResult, SkinTextureProfile } from './types'
import { clamp } from './utils'

// ─── Landmark indices (MediaPipe 468 compatible) ────────────

interface RegionConfig {
  label: string
  /** Landmark indices defining a polygon for the region */
  landmarks: number[]
  /** Weight in overall score */
  weight: number
  /** Use boost mode (upscale + enhance) */
  boost?: boolean
  /** Use horizontal-bias Sobel */
  horizontalBias?: boolean
  /** Edge density → score multiplier (default 350) */
  sensitivity?: number
}

const REGIONS: Record<WrinkleRegion, RegionConfig> = {
  forehead: {
    label: 'Alın Çizgileri',
    // Expanded ROI: wider temple coverage (54,63,284,293) + lower near-brow (66,296)
    landmarks: [10, 151, 67, 109, 108, 107, 66, 54, 63, 55, 8, 285, 293, 284, 296, 336, 337, 338, 297],
    weight: 0.14,
    boost: true,
    horizontalBias: true,
    sensitivity: 400,
  },
  glabella: {
    label: 'Kaş Arası (Glabella)',
    landmarks: [107, 9, 336, 296, 334, 293, 283, 282, 295, 55, 65, 52, 53, 66],
    weight: 0.10,
    boost: true,
    sensitivity: 380,
  },
  crow_feet_left: {
    label: 'Sol Kaz Ayağı',
    landmarks: [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25],
    weight: 0.09,
  },
  crow_feet_right: {
    label: 'Sağ Kaz Ayağı',
    landmarks: [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255],
    weight: 0.09,
  },
  under_eye_left: {
    label: 'Sol Göz Altı',
    landmarks: [33, 7, 163, 144, 145, 153, 154, 155, 133, 243, 112, 26, 22, 23, 24, 110, 25],
    weight: 0.09,
    sensitivity: 320,
  },
  under_eye_right: {
    label: 'Sağ Göz Altı',
    landmarks: [362, 382, 381, 380, 374, 373, 390, 249, 263, 463, 341, 256, 252, 253, 254, 339, 255],
    weight: 0.09,
    sensitivity: 320,
  },
  nasolabial_left: {
    label: 'Sol Nazolabial',
    landmarks: [98, 240, 64, 48, 115, 220, 45, 4, 1, 196, 197, 195, 5],
    weight: 0.08,
    sensitivity: 300,
  },
  nasolabial_right: {
    label: 'Sağ Nazolabial',
    landmarks: [327, 460, 294, 278, 344, 440, 275, 4, 1, 419, 197, 195, 5],
    weight: 0.08,
    sensitivity: 300,
  },
  marionette_left: {
    label: 'Sol Marionette',
    landmarks: [61, 146, 91, 181, 84, 17, 202, 210, 169, 150, 136, 172],
    weight: 0.06,
    sensitivity: 280,
  },
  marionette_right: {
    label: 'Sağ Marionette',
    landmarks: [291, 375, 321, 405, 314, 17, 422, 430, 394, 379, 365, 397],
    weight: 0.06,
    sensitivity: 280,
  },
  cheek_left: {
    label: 'Sol Yanak',
    landmarks: [116, 117, 118, 119, 120, 121, 128, 245, 193, 55, 65, 52, 53],
    weight: 0.06,
    sensitivity: 250,
  },
  cheek_right: {
    label: 'Sağ Yanak',
    landmarks: [345, 346, 347, 348, 349, 350, 357, 465, 417, 285, 295, 282, 283],
    weight: 0.06,
    sensitivity: 250,
  },
  jawline: {
    label: 'Çene Hattı',
    landmarks: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
    weight: 0.06,
    sensitivity: 260,
  },
}

// ─── Forehead sub-zones for more granular analysis ──────────

/** Sub-zone landmark groups within the forehead for center/left/right scoring */
const FOREHEAD_SUBZONES = {
  center: {
    // Center forehead strip (avoids glabella point 9, focuses on wrinkle zone)
    landmarks: [10, 151, 8, 108, 107, 66, 105, 104, 103, 67, 109, 337, 336, 296, 334, 333],
  },
  left: {
    // Left forehead: from center towards left temple
    landmarks: [10, 67, 109, 108, 107, 69, 104, 68, 71, 63, 54],
  },
  right: {
    // Right forehead: from center towards right temple
    landmarks: [10, 297, 338, 337, 336, 299, 333, 298, 301, 293, 284],
  },
}

// ─── Boost mode: zoom crop + contrast + edge enhancement ────

/** Upscale factor for boost-mode regions (forehead) */
const BOOST_SCALE = 2

/**
 * CLAHE (Contrast Limited Adaptive Histogram Equalization).
 * Divides the image into tiles, equalizes each tile's histogram with a clip
 * limit, and bilinearly interpolates across tile borders. Far superior to
 * global histogram stretch for revealing subtle wrinkle lines.
 */
function applyCLAHE(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  clipLimit = 2.5,
): Uint8ClampedArray {
  const total = width * height
  if (total === 0) return gray

  // Adaptive tile grid: ensure tiles are at least 16px in each dimension
  const tilesX = Math.max(1, Math.min(4, Math.floor(width / 16)))
  const tilesY = Math.max(1, Math.min(4, Math.floor(height / 16)))
  const tileW = width / tilesX
  const tileH = height / tilesY

  // Build clipped + equalized LUT for each tile
  const luts: Uint8ClampedArray[][] = []

  for (let ty = 0; ty < tilesY; ty++) {
    luts[ty] = []
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = Math.round(tx * tileW)
      const y0 = Math.round(ty * tileH)
      const x1 = Math.min(Math.round((tx + 1) * tileW), width)
      const y1 = Math.min(Math.round((ty + 1) * tileH), height)
      const tilePixels = (x1 - x0) * (y1 - y0)

      if (tilePixels === 0) {
        const identity = new Uint8ClampedArray(256)
        for (let i = 0; i < 256; i++) identity[i] = i
        luts[ty][tx] = identity
        continue
      }

      // Build histogram
      const hist = new Float32Array(256)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * width + x]]++
        }
      }

      // Clip histogram and redistribute excess evenly
      const limit = Math.max(1, (clipLimit * tilePixels) / 256)
      let excess = 0
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit
          hist[i] = limit
        }
      }
      const redistrib = excess / 256
      for (let i = 0; i < 256; i++) hist[i] += redistrib

      // Build CDF → LUT
      const lut = new Uint8ClampedArray(256)
      let cdf = 0
      for (let i = 0; i < 256; i++) {
        cdf += hist[i]
        lut[i] = Math.round(Math.max(0, Math.min(255, (cdf / tilePixels) * 255)))
      }

      luts[ty][tx] = lut
    }
  }

  // Apply with bilinear interpolation between tile centers
  const result = new Uint8ClampedArray(total)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = gray[y * width + x]

      // Position relative to tile centers
      const fcx = x / tileW - 0.5
      const fcy = y / tileH - 0.5
      const tx0 = Math.max(0, Math.floor(fcx))
      const ty0 = Math.max(0, Math.floor(fcy))
      const tx1 = Math.min(tilesX - 1, tx0 + 1)
      const ty1 = Math.min(tilesY - 1, ty0 + 1)

      const fx = Math.max(0, Math.min(1, fcx - tx0))
      const fy = Math.max(0, Math.min(1, fcy - ty0))

      // Bilinear interpolation of the 4 tile LUT values
      const v00 = luts[ty0][tx0][val]
      const v10 = luts[ty0][tx1][val]
      const v01 = luts[ty1][tx0][val]
      const v11 = luts[ty1][tx1][val]

      const top = v00 + (v10 - v00) * fx
      const bottom = v01 + (v11 - v01) * fx
      result[y * width + x] = Math.round(top + (bottom - top) * fy)
    }
  }

  return result
}

/**
 * Apply unsharp-mask sharpening on grayscale data.
 * Enhances fine edge details (wrinkle lines).
 */
function unsharpMask(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 1.5,
): Uint8ClampedArray {
  const total = width * height
  const blurred = new Float32Array(total)

  // Simple 3x3 box blur
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += gray[(y + dy) * width + (x + dx)]
        }
      }
      blurred[y * width + x] = sum / 9
    }
  }

  // Unsharp: original + amount * (original - blurred)
  const sharpened = new Uint8ClampedArray(total)
  for (let i = 0; i < total; i++) {
    const val = gray[i] + amount * (gray[i] - blurred[i])
    sharpened[i] = Math.max(0, Math.min(255, Math.round(val)))
  }

  return sharpened
}

// ─── Image processing helpers ───────────────────────────────

/**
 * Extract a rectangular region from the source image using landmark polygon bounds.
 * Returns grayscale pixel data for the region.
 * When boost=true, upscales the region and applies contrast + edge enhancement.
 */
function extractRegionGrayscale(
  sourceCanvas: HTMLCanvasElement,
  landmarks: Landmark[],
  regionIndices: number[],
  imgWidth: number,
  imgHeight: number,
  boost = false,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  // Get bounding box from polygon landmarks
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of regionIndices) {
    const lm = landmarks[idx]
    if (!lm) continue
    const px = lm.x * imgWidth
    const py = lm.y * imgHeight
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }

  // Add padding (larger for boost mode to avoid clipping wrinkle zones)
  const pad = boost ? 14 : 2
  minX = Math.max(0, Math.floor(minX) - pad)
  minY = Math.max(0, Math.floor(minY) - pad)
  maxX = Math.min(imgWidth, Math.ceil(maxX) + pad)
  maxY = Math.min(imgHeight, Math.ceil(maxY) + pad)

  const rw = maxX - minX
  const rh = maxY - minY
  if (rw < 10 || rh < 10) return null

  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // For boost mode, use a separate canvas to upscale the crop
  if (boost) {
    const boostCanvas = document.createElement('canvas')
    const bw = rw * BOOST_SCALE
    const bh = rh * BOOST_SCALE
    boostCanvas.width = bw
    boostCanvas.height = bh
    const bctx = boostCanvas.getContext('2d', { willReadFrequently: true })
    if (!bctx) return null

    // Use bicubic-like interpolation via CSS
    bctx.imageSmoothingEnabled = true
    bctx.imageSmoothingQuality = 'high'
    bctx.drawImage(sourceCanvas, minX, minY, rw, rh, 0, 0, bw, bh)

    const imageData = bctx.getImageData(0, 0, bw, bh)
    const rawGray = new Uint8ClampedArray(bw * bh)
    for (let i = 0; i < bw * bh; i++) {
      const r = imageData.data[i * 4]
      const g = imageData.data[i * 4 + 1]
      const b = imageData.data[i * 4 + 2]
      rawGray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    }

    // Apply CLAHE contrast enhancement + unsharp mask
    const enhanced = applyCLAHE(rawGray, bw, bh)
    const sharpened = unsharpMask(enhanced, bw, bh, 1.5)

    return { data: sharpened, width: bw, height: bh }
  }

  const imageData = ctx.getImageData(minX, minY, rw, rh)
  const gray = new Uint8ClampedArray(rw * rh)

  // Convert to grayscale using luminance formula
  for (let i = 0; i < rw * rh; i++) {
    const r = imageData.data[i * 4]
    const g = imageData.data[i * 4 + 1]
    const b = imageData.data[i * 4 + 2]
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  return { data: gray, width: rw, height: rh }
}

/**
 * Apply Sobel edge detection on grayscale image data.
 * Returns edge magnitude array (0–255).
 */
function sobelEdgeDetection(
  gray: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(width * height)

  // Sobel kernels
  // Gx: [[-1,0,1],[-2,0,2],[-1,0,1]]
  // Gy: [[-1,-2,-1],[0,0,0],[1,2,1]]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x

      // Sample 3x3 neighborhood
      const tl = gray[(y - 1) * width + (x - 1)]
      const tc = gray[(y - 1) * width + x]
      const tr = gray[(y - 1) * width + (x + 1)]
      const ml = gray[y * width + (x - 1)]
      const mr = gray[y * width + (x + 1)]
      const bl = gray[(y + 1) * width + (x - 1)]
      const bc = gray[(y + 1) * width + x]
      const br = gray[(y + 1) * width + (x + 1)]

      // Horizontal gradient (detects vertical edges / horizontal lines)
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      // Vertical gradient (detects horizontal edges / wrinkle lines)
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br

      const magnitude = Math.sqrt(gx * gx + gy * gy)
      edges[idx] = Math.min(255, Math.round(magnitude))
    }
  }

  return edges
}

/**
 * Horizontal-line–biased Sobel for forehead wrinkle detection.
 * Wrinkle lines on the forehead are predominantly horizontal,
 * so we weight the vertical gradient (Gy) more heavily.
 */
function sobelHorizontalBias(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(width * height)
  const GY_WEIGHT = 2.0  // Emphasize horizontal lines
  const GX_WEIGHT = 0.5  // Suppress vertical edges (hair, temples)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x

      const tl = gray[(y - 1) * width + (x - 1)]
      const tc = gray[(y - 1) * width + x]
      const tr = gray[(y - 1) * width + (x + 1)]
      const ml = gray[y * width + (x - 1)]
      const mr = gray[y * width + (x + 1)]
      const bl = gray[(y + 1) * width + (x - 1)]
      const bc = gray[(y + 1) * width + x]
      const br = gray[(y + 1) * width + (x + 1)]

      const gx = (-tl + tr - 2 * ml + 2 * mr - bl + br) * GX_WEIGHT
      const gy = (-tl - 2 * tc - tr + bl + 2 * bc + br) * GY_WEIGHT

      const magnitude = Math.sqrt(gx * gx + gy * gy)
      edges[idx] = Math.min(255, Math.round(magnitude))
    }
  }

  return edges
}

/**
 * Calculate wrinkle density from edge-detected image.
 * Uses adaptive thresholding to count significant edge pixels.
 */
function calculateWrinkleDensity(
  edges: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const totalPixels = width * height
  if (totalPixels === 0) return 0

  // Calculate mean edge intensity
  let sum = 0
  for (let i = 0; i < totalPixels; i++) {
    sum += edges[i]
  }
  const mean = sum / totalPixels

  // Adaptive threshold: lower floor catches subtle wrinkle edges that CLAHE reveals
  const threshold = Math.max(20, mean * 0.6 + 10)
  let edgePixels = 0
  for (let i = 0; i < totalPixels; i++) {
    if (edges[i] > threshold) edgePixels++
  }

  return edgePixels / totalPixels
}

/**
 * Measure horizontal line continuity in edge data.
 * Scans each row for consecutive edge pixels — longer runs indicate
 * real wrinkle lines rather than noise.
 * Returns a 0–1 score where higher = more continuous horizontal lines.
 */
function measureHorizontalContinuity(
  edges: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 10 || height < 5) return 0

  const threshold = 22
  const MIN_RUN = Math.max(3, Math.round(width * 0.05)) // At least 5% of width
  let totalRunLength = 0
  let lineCount = 0

  for (let y = 1; y < height - 1; y++) {
    let run = 0
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > threshold) {
        run++
      } else {
        if (run >= MIN_RUN) {
          totalRunLength += run
          lineCount++
        }
        run = 0
      }
    }
    if (run >= MIN_RUN) {
      totalRunLength += run
      lineCount++
    }
  }

  // Normalize: ratio of horizontal-line pixels to total area
  const totalPixels = width * height
  const continuityRatio = totalRunLength / totalPixels

  // Also factor in how many distinct lines we found
  const expectedLines = Math.max(1, height / 15) // ~1 line per 15px of height
  const linePresence = Math.min(1, lineCount / expectedLines)

  return clamp(continuityRatio * 3 + linePresence * 0.3, 0, 1)
}

// ─── Horizontal line detector (primary forehead signal) ─────

interface HorizontalLineResult {
  lineCount: number
  avgLineLength: number
  avgContrast: number
  maxContrast: number
  coverageRatio: number
  lineScore: number
}

/**
 * Detect discrete horizontal line structures in edge data.
 * Uses gap-bridging to handle broken wrinkle lines, then clusters
 * adjacent-row segments into distinct lines. Returns structured
 * metrics that directly inform wrinkle scoring.
 */
function detectHorizontalLines(
  edges: Uint8ClampedArray,
  width: number,
  height: number,
): HorizontalLineResult {
  const empty: HorizontalLineResult = {
    lineCount: 0, avgLineLength: 0, avgContrast: 0,
    maxContrast: 0, coverageRatio: 0, lineScore: 0,
  }
  if (width < 15 || height < 10) return empty

  const THRESHOLD = 18
  const MIN_SEG_LEN = Math.max(3, Math.round(width * 0.04))
  const GAP_TOLERANCE = 4

  // Step 1: Extract horizontal edge segments per row
  interface Seg { y: number; x0: number; x1: number; sumEdge: number; count: number }
  const allSegs: Seg[] = []

  for (let y = 1; y < height - 1; y++) {
    let segX0 = -1
    let gap = 0
    let sumEdge = 0
    let count = 0

    for (let x = 0; x < width; x++) {
      const e = edges[y * width + x]
      if (e > THRESHOLD) {
        if (segX0 < 0) segX0 = x
        gap = 0
        sumEdge += e
        count++
      } else {
        gap++
        if (gap > GAP_TOLERANCE && segX0 >= 0) {
          const x1 = x - gap
          if (x1 - segX0 >= MIN_SEG_LEN) {
            allSegs.push({ y, x0: segX0, x1, sumEdge, count })
          }
          segX0 = -1; gap = 0; sumEdge = 0; count = 0
        }
      }
    }
    if (segX0 >= 0) {
      const x1 = width - 1 - Math.max(0, gap)
      if (x1 - segX0 >= MIN_SEG_LEN) {
        allSegs.push({ y, x0: segX0, x1, sumEdge, count })
      }
    }
  }

  if (allSegs.length === 0) return empty

  // Step 2: Cluster segments into lines (adjacent rows, overlapping x-range)
  const segUsed = new Array(allSegs.length).fill(false)
  const lines: Seg[][] = []

  const sortedIdx = allSegs.map((_, i) => i).sort((a, b) => {
    const dy = allSegs[a].y - allSegs[b].y
    return dy !== 0 ? dy : allSegs[a].x0 - allSegs[b].x0
  })

  for (const si of sortedIdx) {
    if (segUsed[si]) continue
    const line: Seg[] = [allSegs[si]]
    segUsed[si] = true
    let lineMinY = allSegs[si].y
    let lineMaxY = allSegs[si].y

    let changed = true
    while (changed) {
      changed = false
      for (const sj of sortedIdx) {
        if (segUsed[sj]) continue
        const seg = allSegs[sj]
        if (seg.y < lineMinY - 2 || seg.y > lineMaxY + 2) continue
        const overlaps = line.some(ls =>
          seg.x0 <= ls.x1 + 5 && seg.x1 >= ls.x0 - 5
        )
        if (overlaps) {
          line.push(seg)
          segUsed[sj] = true
          lineMinY = Math.min(lineMinY, seg.y)
          lineMaxY = Math.max(lineMaxY, seg.y)
          changed = true
        }
      }
    }
    lines.push(line)
  }

  // Filter: a "line" must span at least 8% of image width
  const MIN_LINE_SPAN = width * 0.08
  const validLines = lines.filter(line => {
    const lx0 = Math.min(...line.map(s => s.x0))
    const lx1 = Math.max(...line.map(s => s.x1))
    return (lx1 - lx0) >= MIN_LINE_SPAN
  })

  if (validLines.length === 0) return empty

  // Step 3: Compute statistics
  const lineSpans = validLines.map(line => {
    const lx0 = Math.min(...line.map(s => s.x0))
    const lx1 = Math.max(...line.map(s => s.x1))
    return lx1 - lx0
  })
  const lineContrasts = validLines.map(line => {
    const totalEdge = line.reduce((s, seg) => s + seg.sumEdge, 0)
    const totalCount = line.reduce((s, seg) => s + seg.count, 0)
    return totalCount > 0 ? totalEdge / totalCount : 0
  })

  const avgLineLength = lineSpans.reduce((a, b) => a + b, 0) / lineSpans.length
  const avgContrast = lineContrasts.reduce((a, b) => a + b, 0) / lineContrasts.length
  const maxContrast = Math.max(...lineContrasts)
  const totalLinePixels = validLines.reduce((s, line) =>
    s + line.reduce((ss, seg) => ss + seg.count, 0), 0
  )
  const coverageRatio = totalLinePixels / (width * height)

  // Composite line score
  const countFactor = Math.min(1, validLines.length / 5)
  const lengthFactor = Math.min(1, avgLineLength / (width * 0.25))
  const contrastFactor = Math.min(1, avgContrast / 60)

  const lineScore = clamp(
    countFactor * 0.4 + lengthFactor * 0.35 + contrastFactor * 0.25,
    0, 1,
  )

  return {
    lineCount: validLines.length,
    avgLineLength,
    avgContrast,
    maxContrast,
    coverageRatio,
    lineScore,
  }
}

/**
 * Evaluate region quality / confidence.
 * Low contrast, very dark/bright, or tiny regions get low confidence.
 */
function evaluateRegionConfidence(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const total = width * height
  if (total < 100) return 0.1

  // Compute mean and stddev
  let sum = 0
  for (let i = 0; i < total; i++) sum += gray[i]
  const mean = sum / total

  let variance = 0
  for (let i = 0; i < total; i++) {
    const d = gray[i] - mean
    variance += d * d
  }
  const stddev = Math.sqrt(variance / total)

  // Low stddev → flat/overexposed region → low confidence
  const contrastScore = clamp(stddev / 40, 0, 1) // stddev 0→0, 40+→1

  // Very dark or very bright mean → poor lighting → penalty
  const brightnessPenalty = (mean < 40 || mean > 220) ? 0.5 : 1.0

  // Region size factor: very small regions are less reliable
  const sizeFactor = clamp(total / 2000, 0.3, 1.0)

  return clamp(contrastScore * brightnessPenalty * sizeFactor, 0.1, 1.0)
}

// ─── Classification ─────────────────────────────────────────

function classifyWrinkleLevel(score: number): WrinkleLevel {
  if (score >= 55) return 'high'
  if (score >= 30) return 'medium'
  if (score >= 12) return 'low'
  return 'minimal'
}

const REGION_LABELS: Record<WrinkleRegion, string> = {
  forehead: 'Alın bölgesi',
  glabella: 'Kaş arası bölge',
  crow_feet_left: 'Sol göz kenarı',
  crow_feet_right: 'Sağ göz kenarı',
  under_eye_left: 'Sol göz altı',
  under_eye_right: 'Sağ göz altı',
  nasolabial_left: 'Sol nazolabial',
  nasolabial_right: 'Sağ nazolabial',
  marionette_left: 'Sol ağız kenarı',
  marionette_right: 'Sağ ağız kenarı',
  cheek_left: 'Sol yanak',
  cheek_right: 'Sağ yanak',
  jawline: 'Çene hattı',
}

function getInsight(region: WrinkleRegion, level: WrinkleLevel, confidence: number): string {
  const label = REGION_LABELS[region]

  // Low confidence → unreliable evaluation
  if (confidence < 0.3) {
    return `${label} güvenilir şekilde değerlendirilemedi — daha net bir görüntü ile tekrar denenebilir.`
  }

  // Region-specific insights: observation-first, clinical tone, non-prescriptive.
  // Structure: observation → intensity → optional soft advisory
  const insights: Record<WrinkleRegion, Record<WrinkleLevel, string>> = {
    forehead: {
      minimal: 'Alın bölgesinde belirgin çizgi oluşumu gözlenmemektedir.',
      low: 'Alın bölgesinde hafif düzeyde yatay çizgi belirtileri dikkat çekmektedir.',
      medium: 'Alın bölgesinde orta düzey yatay çizgi belirginliği gözlenmektedir. İstenirse bu bölgeye yönelik mimik çizgisi uygulamaları değerlendirilebilir.',
      high: 'Alın bölgesinde belirgin mimik kaynaklı yatay çizgiler izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    glabella: {
      minimal: 'Kaş arası bölgede belirgin çizgi oluşumu gözlenmemektedir.',
      low: 'Kaş arası bölgede hafif düzeyde kırışıklık belirtisi dikkat çekmektedir.',
      medium: 'Kaş arası bölgede orta düzey mimik çizgileri gözlenmektedir. İstenirse bu bölgeye yönelik uygulamalar değerlendirilebilir.',
      high: 'Kaş arası bölgede belirgin mimik çizgileri izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    crow_feet_left: {
      minimal: 'Sol göz kenarında belirgin çizgi oluşumu gözlenmemektedir.',
      low: 'Sol göz kenarında hafif düzeyde ince çizgi yoğunluğu dikkat çekmektedir.',
      medium: 'Sol göz kenarında orta düzey kaz ayağı belirtileri gözlenmektedir.',
      high: 'Sol göz kenarında belirgin kaz ayağı çizgileri izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    crow_feet_right: {
      minimal: 'Sağ göz kenarında belirgin çizgi oluşumu gözlenmemektedir.',
      low: 'Sağ göz kenarında hafif düzeyde ince çizgi yoğunluğu dikkat çekmektedir.',
      medium: 'Sağ göz kenarında orta düzey kaz ayağı belirtileri gözlenmektedir.',
      high: 'Sağ göz kenarında belirgin kaz ayağı çizgileri izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    under_eye_left: {
      minimal: 'Sol göz altında belirgin doku farkı gözlenmemektedir.',
      low: 'Sol göz altı dokusunda hafif düzeyde tekstür değişimi dikkat çekmektedir.',
      medium: 'Sol göz altı dokusunda orta düzey tekstür farkı gözlenmektedir. İstenirse bu bölge için uygulamalar düşünülebilir.',
      high: 'Sol göz altında belirgin doku değişimi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    under_eye_right: {
      minimal: 'Sağ göz altında belirgin doku farkı gözlenmemektedir.',
      low: 'Sağ göz altı dokusunda hafif düzeyde tekstür değişimi dikkat çekmektedir.',
      medium: 'Sağ göz altı dokusunda orta düzey tekstür farkı gözlenmektedir. İstenirse bu bölge için uygulamalar düşünülebilir.',
      high: 'Sağ göz altında belirgin doku değişimi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    nasolabial_left: {
      minimal: 'Sol nazolabial bölgede belirgin kıvrım gözlenmemektedir.',
      low: 'Sol nazolabial bölgede hafif düzeyde derinlik artışı dikkat çekmektedir.',
      medium: 'Sol nazolabial bölgede orta düzey kıvrım belirginliği gözlenmektedir. İstenirse hacim desteği açısından uygulamalar düşünülebilir.',
      high: 'Sol nazolabial bölgede belirgin kıvrım derinliği izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    nasolabial_right: {
      minimal: 'Sağ nazolabial bölgede belirgin kıvrım gözlenmemektedir.',
      low: 'Sağ nazolabial bölgede hafif düzeyde derinlik artışı dikkat çekmektedir.',
      medium: 'Sağ nazolabial bölgede orta düzey kıvrım belirginliği gözlenmektedir. İstenirse hacim desteği açısından uygulamalar düşünülebilir.',
      high: 'Sağ nazolabial bölgede belirgin kıvrım derinliği izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    marionette_left: {
      minimal: 'Sol ağız kenarında belirgin çizgi oluşumu gözlenmemektedir.',
      low: 'Sol ağız kenarında hafif düzeyde çizgi belirtisi dikkat çekmektedir.',
      medium: 'Sol ağız kenarında orta düzey marionette çizgisi gözlenmektedir. İstenirse bu bölge için uygulamalar düşünülebilir.',
      high: 'Sol ağız kenarında belirgin marionette çizgisi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    marionette_right: {
      minimal: 'Sağ ağız kenarında belirgin çizgi oluşumu gözlenmemektedir.',
      low: 'Sağ ağız kenarında hafif düzeyde çizgi belirtisi dikkat çekmektedir.',
      medium: 'Sağ ağız kenarında orta düzey marionette çizgisi gözlenmektedir. İstenirse bu bölge için uygulamalar düşünülebilir.',
      high: 'Sağ ağız kenarında belirgin marionette çizgisi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    cheek_left: {
      minimal: 'Sol yanak dokusunda belirgin tekstür farkı gözlenmemektedir.',
      low: 'Sol yanak dokusunda hafif düzeyde tekstür değişimi dikkat çekmektedir.',
      medium: 'Sol yanak bölgesinde orta düzey doku pürüzlülüğü gözlenmektedir.',
      high: 'Sol yanak bölgesinde belirgin doku değişimi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    cheek_right: {
      minimal: 'Sağ yanak dokusunda belirgin tekstür farkı gözlenmemektedir.',
      low: 'Sağ yanak dokusunda hafif düzeyde tekstür değişimi dikkat çekmektedir.',
      medium: 'Sağ yanak bölgesinde orta düzey doku pürüzlülüğü gözlenmektedir.',
      high: 'Sağ yanak bölgesinde belirgin doku değişimi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
    jawline: {
      minimal: 'Çene hattında belirgin doku değişimi gözlenmemektedir.',
      low: 'Çene hattında hafif düzeyde kontur yumuşaması dikkat çekmektedir.',
      medium: 'Çene hattında orta düzey kontur yumuşaması gözlenmektedir. İstenirse bu bölge için uygulamalar düşünülebilir.',
      high: 'Çene hattında belirgin kontur değişimi izlenmektedir. Klinik değerlendirme ile desteklenebilir.',
    },
  }

  const text = insights[region]?.[level] ?? `${label} değerlendirmesi tamamlandı.`

  // Medium confidence with minimal/low score → hedge the result
  if (confidence < 0.5 && (level === 'minimal' || level === 'low')) {
    return text + ' (sınırlı güvenilirlik — doktor değerlendirmesi önerilir)'
  }

  return text
}

// ─── Forehead-specific analysis ─────────────────────────────

/**
 * Analyze forehead with sub-zone granularity, horizontal-line detection,
 * and false-negative prevention. The primary signal is discrete horizontal
 * line counting — if real lines are detected, the score cannot be minimal.
 */
function analyzeForehead(
  sourceCanvas: HTMLCanvasElement,
  landmarks: Landmark[],
  imgWidth: number,
  imgHeight: number,
  ageFactor: number,
): WrinkleRegionResult {
  const region: WrinkleRegion = 'forehead'
  const label = REGIONS.forehead.label

  // Full-region extraction with boost (CLAHE + unsharp applied in extractRegionGrayscale)
  const fullRegion = extractRegionGrayscale(
    sourceCanvas, landmarks, REGIONS.forehead.landmarks,
    imgWidth, imgHeight, true,
  )

  if (!fullRegion) {
    return {
      region, label, density: 0, score: 0, level: 'low',
      insight: getInsight(region, 'low', 0.1),
      confidence: 0.1,
    }
  }

  const fullConfidence = evaluateRegionConfidence(fullRegion.data, fullRegion.width, fullRegion.height)

  if (fullConfidence < 0.15) {
    return {
      region, label, density: 0, score: 0, level: 'low',
      insight: getInsight(region, 'low', fullConfidence),
      confidence: fullConfidence,
    }
  }

  // ── Edge detection ──
  const hEdges = sobelHorizontalBias(fullRegion.data, fullRegion.width, fullRegion.height)
  const hDensity = calculateWrinkleDensity(hEdges, fullRegion.width, fullRegion.height)
  const stdEdges = sobelEdgeDetection(fullRegion.data, fullRegion.width, fullRegion.height)
  const stdDensity = calculateWrinkleDensity(stdEdges, fullRegion.width, fullRegion.height)

  // ── Horizontal line detection (primary signal) ──
  const lineResult = detectHorizontalLines(hEdges, fullRegion.width, fullRegion.height)

  // ── Horizontal continuity (secondary signal) ──
  const continuity = measureHorizontalContinuity(hEdges, fullRegion.width, fullRegion.height)

  // ── Sub-zone analysis ──
  let subzoneMaxDensity = 0
  let subzoneCount = 0
  let subzoneTotalDensity = 0

  for (const [, zone] of Object.entries(FOREHEAD_SUBZONES)) {
    const subRegion = extractRegionGrayscale(
      sourceCanvas, landmarks, zone.landmarks,
      imgWidth, imgHeight, true,
    )
    if (!subRegion || subRegion.width < 8 || subRegion.height < 8) continue

    const subEdges = sobelHorizontalBias(subRegion.data, subRegion.width, subRegion.height)
    const subDensity = calculateWrinkleDensity(subEdges, subRegion.width, subRegion.height)

    subzoneCount++
    subzoneTotalDensity += subDensity
    if (subDensity > subzoneMaxDensity) subzoneMaxDensity = subDensity
  }

  const subzoneAvg = subzoneCount > 0 ? subzoneTotalDensity / subzoneCount : hDensity

  // ── Composite density (line detection is now a major signal) ──
  const compositeDensity = (
    hDensity * 0.25 +
    subzoneMaxDensity * 0.15 +
    subzoneAvg * 0.10 +
    stdDensity * 0.05 +
    continuity * 0.10 +
    lineResult.lineScore * 0.35
  )

  // ── Scoring with softer age modulation ──
  const adjustedDensity = compositeDensity * ageFactor
  let score = clamp(Math.round(adjustedDensity * (REGIONS.forehead.sensitivity ?? 400)), 0, 100)

  // ── False negative prevention ──
  // If real horizontal lines were detected, enforce minimum scores.
  // Visible wrinkles MUST be reflected in the score.
  if (lineResult.lineCount >= 2 && lineResult.avgContrast > 22) {
    const lineFloor = Math.min(85, 12 + lineResult.lineCount * 8 + lineResult.avgContrast * 0.3)
    score = Math.max(score, Math.round(lineFloor))
  }
  if (lineResult.lineCount >= 4) {
    score = Math.max(score, 35)
  }

  const level = classifyWrinkleLevel(score)

  // ── Confidence ──
  const subzoneAgreement = subzoneCount >= 2
    ? 1 - Math.abs(subzoneMaxDensity - subzoneAvg) / Math.max(0.001, subzoneMaxDensity)
    : 0.5
  const lineConfidenceBoost = lineResult.lineCount >= 2 ? 0.15 : 0
  const confidence = clamp(
    fullConfidence * 0.5 + subzoneAgreement * 0.3 + lineConfidenceBoost + 0.05,
    0.1, 1.0,
  )

  return {
    region, label,
    density: compositeDensity,
    score, level,
    insight: getInsight(region, level, confidence),
    confidence,
  }
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Analyze wrinkle lines from an image using FaceMesh landmarks.
 *
 * Process:
 * 1. Draw image onto a canvas
 * 2. For each region, extract the landmark-defined area
 * 3. Convert to grayscale
 * 4. Apply Sobel edge detection
 * 5. Calculate edge density as wrinkle indicator
 * 6. Classify and score, modulated by estimated age
 *
 * @param image - Source image element
 * @param landmarks - Normalized FaceMesh landmarks (0–1)
 * @param estimatedAge - Age from Human engine (used to modulate scores)
 */
export function analyzeWrinkles(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmark[],
  estimatedAge: number | null
): WrinkleAnalysisResult | null {
  if (landmarks.length < 400) {
    console.warn('[Wrinkle] Insufficient landmarks:', landmarks.length)
    return null
  }

  // Create working canvas from the source image
  const canvas = document.createElement('canvas')
  let imgWidth: number
  let imgHeight: number

  if (image instanceof HTMLImageElement) {
    imgWidth = image.naturalWidth || image.width
    imgHeight = image.naturalHeight || image.height
  } else {
    imgWidth = image.width
    imgHeight = image.height
  }

  if (imgWidth < 50 || imgHeight < 50) {
    console.warn('[Wrinkle] Image too small:', imgWidth, 'x', imgHeight)
    return null
  }

  canvas.width = imgWidth
  canvas.height = imgHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(image, 0, 0, imgWidth, imgHeight)

  // Age factor: younger faces expected to have fewer wrinkles,
  // so we modulate the raw density score
  const age = estimatedAge ?? 35
  // Softer age modulation: preserves visible wrinkle signals instead of zeroing them.
  // Old formula (0.3 at age 30) destroyed scores for young faces with real lines.
  // New: 0.72 at age 30, 1.0 at age 55, 1.17 at age 70 — modulates, never erases.
  const rawAgeFactor = clamp((age - 20) / 35, 0.3, 1.5)
  const ageFactor = clamp(0.6 + rawAgeFactor * 0.4, 0.6, 1.3)

  const results: WrinkleRegionResult[] = []

  for (const [regionKey, regionConfig] of Object.entries(REGIONS)) {
    const region = regionKey as WrinkleRegion

    // Forehead gets specialized sub-zone analysis
    if (region === 'forehead') {
      results.push(analyzeForehead(canvas, landmarks, imgWidth, imgHeight, ageFactor))
      continue
    }

    const useBoost = regionConfig.boost === true
    const useSensitivity = regionConfig.sensitivity ?? 350
    const grayRegion = extractRegionGrayscale(
      canvas,
      landmarks,
      regionConfig.landmarks,
      imgWidth,
      imgHeight,
      useBoost,
    )

    if (!grayRegion) {
      console.warn(`[Wrinkle] Could not extract region: ${region}`)
      results.push({
        region,
        label: regionConfig.label,
        density: 0,
        score: 0,
        level: 'minimal',
        insight: getInsight(region, 'minimal', 0.1),
        confidence: 0.1,
      })
      continue
    }

    const confidence = evaluateRegionConfidence(grayRegion.data, grayRegion.width, grayRegion.height)
    const useHorizontal = regionConfig.horizontalBias === true
    const edges = useHorizontal
      ? sobelHorizontalBias(grayRegion.data, grayRegion.width, grayRegion.height)
      : sobelEdgeDetection(grayRegion.data, grayRegion.width, grayRegion.height)
    const rawDensity = calculateWrinkleDensity(edges, grayRegion.width, grayRegion.height)

    // Scale density to a 0–100 score using region-specific sensitivity
    const adjustedDensity = rawDensity * ageFactor
    const score = clamp(Math.round(adjustedDensity * useSensitivity), 0, 100)
    const level = classifyWrinkleLevel(score)

    results.push({
      region,
      label: regionConfig.label,
      density: rawDensity,
      score,
      level,
      insight: getInsight(region, level, confidence),
      confidence,
    })
  }

  // Overall score: weighted average
  let weightedSum = 0
  let totalWeight = 0
  for (const r of results) {
    const w = REGIONS[r.region]?.weight ?? 0.05
    weightedSum += r.score * w
    totalWeight += w
  }
  const overallScore = totalWeight > 0 ? clamp(Math.round(weightedSum / totalWeight), 0, 100) : 0
  const overallLevel = classifyWrinkleLevel(overallScore)

  return {
    regions: results,
    overallScore,
    overallLevel,
  }
}

/**
 * Derive skin texture profile from wrinkle analysis results.
 * Aggregates regional densities and confidence into a texture summary.
 */
export function deriveSkinTexture(
  wrinkleResult: WrinkleAnalysisResult,
): SkinTextureProfile {
  const regions = wrinkleResult.regions
  if (regions.length === 0) {
    return { uniformity: 50, smoothness: 50, roughness: 0.5, confidence: 0.1 }
  }

  // Cheek regions are the best indicator of overall skin texture
  const cheekRegions = regions.filter(r =>
    r.region === 'cheek_left' || r.region === 'cheek_right'
  )
  const allDensities = regions.map(r => r.density)
  const avgDensity = allDensities.reduce((a, b) => a + b, 0) / allDensities.length
  const avgConfidence = regions.reduce((a, r) => a + r.confidence, 0) / regions.length

  // Uniformity: how consistent densities are across regions (low variance = uniform)
  const densityVariance = allDensities.reduce((acc, d) => acc + (d - avgDensity) ** 2, 0) / allDensities.length
  const uniformity = clamp(Math.round(100 - densityVariance * 5000), 10, 95)

  // Smoothness: inverse of average density, weighted toward cheek texture
  const cheekAvgDensity = cheekRegions.length > 0
    ? cheekRegions.reduce((a, r) => a + r.density, 0) / cheekRegions.length
    : avgDensity
  const blendedDensity = cheekRegions.length > 0
    ? cheekAvgDensity * 0.6 + avgDensity * 0.4
    : avgDensity
  const smoothness = clamp(Math.round(100 - blendedDensity * 600), 10, 95)

  return {
    uniformity,
    smoothness,
    roughness: clamp(avgDensity, 0, 1),
    confidence: clamp(avgConfidence, 0.1, 1),
  }
}
