/**
 * Face Mask Builder — Face oval extraction, exclusion zones, and masking
 *
 * Builds a face mask from 468-landmark face mesh data. The mask defines
 * the analysable face surface by combining the outer face boundary with
 * exclusion zones (eyes, lips, nostrils) and an optional forehead extension.
 *
 * All coordinates are normalized 0-1.
 */

import type { Landmark } from '../ai/types'
import type {
  Point2D,
  BBox,
  Polygon,
  FaceMaskResult,
  ExclusionZone,
  ExclusionZoneId,
} from './types'
import {
  FACE_OVAL_INDICES,
  LEFT_EYE_INDICES,
  RIGHT_EYE_INDICES,
  LIPS_INTERIOR_INDICES,
  LEFT_NOSTRIL_INDICES,
  RIGHT_NOSTRIL_INDICES,
  FOREHEAD_EXTENSION_RATIO,
  QUALITY_THRESHOLDS,
} from './constants'

// ─── Geometry Utilities ──────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Returns true if the point is inside the polygon.
 */
export function pointInPolygon(point: Point2D, polygon: Polygon): boolean {
  const { vertices } = polygon
  const n = vertices.length
  let inside = false

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i]
    const vj = vertices[j]

    if (
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Extract a polygon from landmark coordinates using the given indices.
 * Returns null if more than 20% of the landmarks are missing/invalid.
 */
export function landmarksToPolygon(
  landmarks: Landmark[],
  indices: readonly number[],
): Polygon | null {
  const vertices: Point2D[] = []
  let missing = 0

  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm || typeof lm.x !== 'number' || typeof lm.y !== 'number') {
      missing++
      continue
    }
    vertices.push({ x: lm.x, y: lm.y })
  }

  const missingRatio = missing / indices.length
  if (missingRatio > 0.2) {
    return null
  }

  return { vertices }
}

/**
 * Get the face oval boundary polygon from FACE_OVAL_INDICES.
 */
export function getFaceOvalPolygon(landmarks: Landmark[]): Polygon | null {
  return landmarksToPolygon(landmarks, FACE_OVAL_INDICES)
}

/**
 * Compute the axis-aligned bounding box of a polygon.
 */
export function polygonBBox(polygon: Polygon): BBox {
  const { vertices } = polygon
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const v of vertices) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Compute the area of a polygon using the Shoelace formula.
 * Returns absolute area (always positive).
 */
export function polygonArea(polygon: Polygon): number {
  const { vertices } = polygon
  const n = vertices.length
  if (n < 3) return 0

  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += vertices[i].x * vertices[j].y
    area -= vertices[j].x * vertices[i].y
  }

  return Math.abs(area) / 2
}

// ─── Forehead Extension ──────────────────────────────────

/**
 * Build a forehead extension polygon by shifting the top portion
 * of the face oval upward.
 */
function buildForeheadExtension(
  outerPolygon: Polygon,
  faceBBox: BBox,
): Polygon | null {
  const extensionAmount = faceBBox.height * FOREHEAD_EXTENSION_RATIO
  if (extensionAmount <= 0) return null

  // Find the topmost vertices (upper 30% of face bbox)
  const topThreshold = faceBBox.y + faceBBox.height * 0.3
  const topVertices = outerPolygon.vertices.filter((v) => v.y <= topThreshold)

  if (topVertices.length < 3) return null

  // Sort by x to form a left-to-right sweep
  const sorted = [...topVertices].sort((a, b) => a.x - b.x)

  // Build the extension: shifted-up top + original top (reversed)
  const shiftedUp = sorted.map((v) => ({
    x: v.x,
    y: Math.max(0, v.y - extensionAmount),
  }))
  const originalReversed = [...sorted].reverse()

  return {
    vertices: [...shiftedUp, ...originalReversed],
  }
}

// ─── Exclusion Zones ─────────────────────────────────────

function buildExclusionZone(
  landmarks: Landmark[],
  indices: readonly number[],
  id: ExclusionZoneId,
): ExclusionZone | null {
  const polygon = landmarksToPolygon(landmarks, indices)
  if (!polygon || polygon.vertices.length < 3) return null
  return { id, polygon }
}

// ─── Main Face Mask Builder ──────────────────────────────

/**
 * Build a complete face mask from landmarks.
 *
 * Returns an unreliable result if:
 * - Fewer than minLandmarkCount landmarks are available
 * - Detection confidence is below minDetectionConfidence
 * - The face oval polygon cannot be extracted
 */
export function buildFaceMask(
  landmarks: Landmark[],
  confidence: number,
): FaceMaskResult {
  const unreliable = (reason: string): FaceMaskResult => ({
    outerPolygon: { vertices: [] },
    exclusions: [],
    foreheadExtension: null,
    faceBBox: { x: 0, y: 0, width: 0, height: 0 },
    reliable: false,
    unreliableReason: reason,
  })

  // Safety checks
  if (landmarks.length < QUALITY_THRESHOLDS.minLandmarkCount) {
    return unreliable(
      `Yetersiz landmark sayısı: ${landmarks.length} < ${QUALITY_THRESHOLDS.minLandmarkCount}`,
    )
  }

  if (confidence < QUALITY_THRESHOLDS.minDetectionConfidence) {
    return unreliable(
      `Düşük tespit güveni: ${confidence.toFixed(2)} < ${QUALITY_THRESHOLDS.minDetectionConfidence}`,
    )
  }

  // Build outer polygon
  const outerPolygon = getFaceOvalPolygon(landmarks)
  if (!outerPolygon || outerPolygon.vertices.length < 10) {
    return unreliable('Yüz oval poligonu oluşturulamadı')
  }

  const faceBBox = polygonBBox(outerPolygon)

  // Build exclusion zones
  const exclusions: ExclusionZone[] = []
  const exclusionConfigs: { indices: readonly number[]; id: ExclusionZoneId }[] = [
    { indices: LEFT_EYE_INDICES, id: 'left_eye' },
    { indices: RIGHT_EYE_INDICES, id: 'right_eye' },
    { indices: LIPS_INTERIOR_INDICES, id: 'lips_interior' },
    { indices: LEFT_NOSTRIL_INDICES, id: 'left_nostril' },
    { indices: RIGHT_NOSTRIL_INDICES, id: 'right_nostril' },
  ]

  for (const config of exclusionConfigs) {
    const zone = buildExclusionZone(landmarks, config.indices, config.id)
    if (zone) {
      exclusions.push(zone)
    }
  }

  // Build forehead extension
  const foreheadExtension = buildForeheadExtension(outerPolygon, faceBBox)

  return {
    outerPolygon,
    exclusions,
    foreheadExtension,
    faceBBox,
    reliable: true,
  }
}

// ─── Canvas Clipping ─────────────────────────────────────

/**
 * Clip a canvas 2D context to the face mask using evenodd fill rule.
 * The exclusion zones are subtracted from the face area.
 */
export function clipCanvasToFaceMask(
  ctx: CanvasRenderingContext2D,
  faceMask: FaceMaskResult,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (!faceMask.reliable) return

  const toPixelX = (x: number) => x * canvasWidth
  const toPixelY = (y: number) => y * canvasHeight

  ctx.save()
  ctx.beginPath()

  // Draw outer polygon (clockwise)
  const outer = faceMask.outerPolygon.vertices
  if (outer.length > 0) {
    ctx.moveTo(toPixelX(outer[0].x), toPixelY(outer[0].y))
    for (let i = 1; i < outer.length; i++) {
      ctx.lineTo(toPixelX(outer[i].x), toPixelY(outer[i].y))
    }
    ctx.closePath()
  }

  // Include forehead extension if present
  if (faceMask.foreheadExtension) {
    const ext = faceMask.foreheadExtension.vertices
    if (ext.length > 0) {
      ctx.moveTo(toPixelX(ext[0].x), toPixelY(ext[0].y))
      for (let i = 1; i < ext.length; i++) {
        ctx.lineTo(toPixelX(ext[i].x), toPixelY(ext[i].y))
      }
      ctx.closePath()
    }
  }

  // Draw exclusion zones (counter-clockwise for evenodd subtraction)
  for (const zone of faceMask.exclusions) {
    const verts = zone.polygon.vertices
    if (verts.length > 0) {
      ctx.moveTo(toPixelX(verts[0].x), toPixelY(verts[0].y))
      for (let i = verts.length - 1; i >= 1; i--) {
        ctx.lineTo(toPixelX(verts[i].x), toPixelY(verts[i].y))
      }
      ctx.closePath()
    }
  }

  ctx.clip('evenodd')
}

// ─── Pixel Mask Builder ──────────────────────────────────

/**
 * Build a binary pixel mask (Uint8Array) from the face mask.
 * Each pixel is 1 if inside the face (and not in an exclusion zone), 0 otherwise.
 *
 * @param faceMask - The face mask result
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Uint8Array of length width*height, 1 = face, 0 = not face
 */
export function buildPixelMask(
  faceMask: FaceMaskResult,
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)

  if (!faceMask.reliable) return mask

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      const point: Point2D = { x: nx, y: ny }

      // Check if inside outer polygon
      let inside = pointInPolygon(point, faceMask.outerPolygon)

      // Also check forehead extension
      if (!inside && faceMask.foreheadExtension) {
        inside = pointInPolygon(point, faceMask.foreheadExtension)
      }

      if (!inside) continue

      // Check exclusion zones
      let excluded = false
      for (const zone of faceMask.exclusions) {
        if (pointInPolygon(point, zone.polygon)) {
          excluded = true
          break
        }
      }

      if (!excluded) {
        mask[y * width + x] = 1
      }
    }
  }

  return mask
}
