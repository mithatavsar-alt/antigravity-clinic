/**
 * ROI (Region of Interest) Extraction Utilities
 *
 * Extracts normalized facial region crops from landmark data.
 * Each function takes 468 MediaPipe-compatible landmarks and the source
 * image/canvas, returning a cropped & normalized canvas for the target region.
 *
 * Used for:
 * - Region-specific analysis enhancement
 * - Debug overlay visualization
 * - Future model-based region scoring
 */

import type { Landmark } from './types'

// ─── Types ──────────────────────────────────────────────────

export interface ROIRegion {
  /** Region identifier */
  key: string
  /** Turkish label */
  label: string
  /** Extracted canvas (cropped + normalized) */
  canvas: HTMLCanvasElement
  /** Bounding box in normalized coordinates (0–1) */
  bbox: { x: number; y: number; w: number; h: number }
  /** Landmarks used to define this region */
  landmarkIndices: number[]
}

export interface ROIExtractionOptions {
  /** Output width for normalized crops (default: 128) */
  outputSize?: number
  /** Padding around the region as fraction of region size (default: 0.15) */
  padding?: number
  /** Whether to mirror horizontally (for front camera) */
  mirror?: boolean
}

// ─── Landmark index sets for each region ────────────────────

/** Crow's feet — lateral eye corners and surrounding orbital area */
const CROW_FEET_LEFT = [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25]
const CROW_FEET_RIGHT = [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255]

/** Under-eye — infraorbital area */
const UNDER_EYE_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 243, 112, 26, 22, 23, 24, 110, 25]
const UNDER_EYE_RIGHT = [362, 382, 381, 380, 374, 373, 390, 249, 263, 463, 341, 256, 252, 253, 254, 339, 255]

/** Lip region — full perioral area */
const LIP_REGION = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,  // outer
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,    // inner
  0, 267, 269, 270, 409, 270, 269, 267, 0, 37, 39, 40, 185, // perioral extended
]

/** Cheek — mid-face support area */
const CHEEK_LEFT = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152]
const CHEEK_RIGHT = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152]

/** Chin & lower face */
const CHIN_REGION = [152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234,
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377]

/** Jawline contour */
const JAWLINE = [234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454]

/** Forehead */
const FOREHEAD = [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109, 10]

/** Nasolabial folds */
const NASOLABIAL_LEFT = [92, 165, 167, 164, 2, 98, 240, 64]
const NASOLABIAL_RIGHT = [206, 205, 36, 142, 126, 217, 174, 327, 460, 294]

// ─── Core extraction function ───────────────────────────────

/**
 * Extract a normalized ROI crop from landmarks.
 * Computes a bounding box from the given landmark indices,
 * adds padding, and crops the source image.
 */
function extractROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  indices: number[],
  options: ROIExtractionOptions = {},
): { canvas: HTMLCanvasElement; bbox: { x: number; y: number; w: number; h: number } } | null {
  const { outputSize = 128, padding = 0.15, mirror = false } = options

  if (!landmarks || landmarks.length < 468) return null

  // Compute bounding box from landmarks
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  let count = 0
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    const x = mirror ? 1 - lm.x : lm.x
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, lm.y)
    maxY = Math.max(maxY, lm.y)
    count++
  }
  if (count < 3) return null

  // Add padding
  const w = maxX - minX
  const h = maxY - minY
  const padX = w * padding
  const padY = h * padding
  const bbox = {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    w: Math.min(1 - (minX - padX), w + padX * 2),
    h: Math.min(1 - (minY - padY), h + padY * 2),
  }

  // Get source dimensions
  const srcW = 'videoWidth' in source ? source.videoWidth
    : 'naturalWidth' in source ? source.naturalWidth
    : source.width
  const srcH = 'videoHeight' in source ? source.videoHeight
    : 'naturalHeight' in source ? source.naturalHeight
    : source.height

  if (srcW === 0 || srcH === 0) return null

  // Create output canvas
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Crop source to ROI
  const sx = Math.round(bbox.x * srcW)
  const sy = Math.round(bbox.y * srcH)
  const sw = Math.round(bbox.w * srcW)
  const sh = Math.round(bbox.h * srcH)

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outputSize, outputSize)

  return { canvas, bbox }
}

// ─── Public API: region-specific extractors ─────────────────

export function getCrowFeetROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  side: 'left' | 'right',
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const indices = side === 'left' ? CROW_FEET_LEFT : CROW_FEET_RIGHT
  const result = extractROI(source, landmarks, indices, options)
  if (!result) return null
  return {
    key: `crow_feet_${side}`,
    label: side === 'left' ? 'Sol Kaz Ayağı' : 'Sağ Kaz Ayağı',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: indices,
  }
}

export function getUnderEyeROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  side: 'left' | 'right',
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const indices = side === 'left' ? UNDER_EYE_LEFT : UNDER_EYE_RIGHT
  const result = extractROI(source, landmarks, indices, options)
  if (!result) return null
  return {
    key: `under_eye_${side}`,
    label: side === 'left' ? 'Sol Göz Altı' : 'Sağ Göz Altı',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: indices,
  }
}

export function getLipROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const result = extractROI(source, landmarks, LIP_REGION, { ...options, padding: 0.2 })
  if (!result) return null
  return {
    key: 'lips',
    label: 'Dudak Bölgesi',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: LIP_REGION,
  }
}

export function getCheekROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  side: 'left' | 'right',
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const indices = side === 'left' ? CHEEK_LEFT : CHEEK_RIGHT
  const result = extractROI(source, landmarks, indices, options)
  if (!result) return null
  return {
    key: `cheek_${side}`,
    label: side === 'left' ? 'Sol Yanak' : 'Sağ Yanak',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: indices,
  }
}

export function getChinROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const result = extractROI(source, landmarks, CHIN_REGION, options)
  if (!result) return null
  return {
    key: 'chin',
    label: 'Çene / Alt Yüz',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: CHIN_REGION,
  }
}

export function getForeheadROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const result = extractROI(source, landmarks, FOREHEAD, { ...options, padding: 0.2 })
  if (!result) return null
  return {
    key: 'forehead',
    label: 'Alın',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: FOREHEAD,
  }
}

export function getNasolabialROI(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  side: 'left' | 'right',
  options?: ROIExtractionOptions,
): ROIRegion | null {
  const indices = side === 'left' ? NASOLABIAL_LEFT : NASOLABIAL_RIGHT
  const result = extractROI(source, landmarks, indices, options)
  if (!result) return null
  return {
    key: `nasolabial_${side}`,
    label: side === 'left' ? 'Sol Nazolabial' : 'Sağ Nazolabial',
    canvas: result.canvas,
    bbox: result.bbox,
    landmarkIndices: indices,
  }
}

// ─── Batch extraction ───────────────────────────────────────

/**
 * Extract all consultation-relevant ROIs at once.
 * Returns regions needed for the 5 score cards:
 * crow's feet, under-eye, lips, cheeks, chin/lower face
 */
export function extractAllROIs(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  landmarks: Landmark[],
  options?: ROIExtractionOptions,
): ROIRegion[] {
  const regions: ROIRegion[] = []

  const fns: (() => ROIRegion | null)[] = [
    () => getCrowFeetROI(source, landmarks, 'left', options),
    () => getCrowFeetROI(source, landmarks, 'right', options),
    () => getUnderEyeROI(source, landmarks, 'left', options),
    () => getUnderEyeROI(source, landmarks, 'right', options),
    () => getLipROI(source, landmarks, options),
    () => getCheekROI(source, landmarks, 'left', options),
    () => getCheekROI(source, landmarks, 'right', options),
    () => getChinROI(source, landmarks, options),
    () => getForeheadROI(source, landmarks, options),
    () => getNasolabialROI(source, landmarks, 'left', options),
    () => getNasolabialROI(source, landmarks, 'right', options),
  ]

  for (const fn of fns) {
    const roi = fn()
    if (roi) regions.push(roi)
  }

  return regions
}

// ─── Debug overlay ──────────────────────────────────────────

/**
 * Draw ROI bounding boxes on a canvas (for development only).
 * Set DEBUG_ROI=true in environment to enable.
 */
export function drawROIDebugOverlay(
  ctx: CanvasRenderingContext2D,
  regions: ROIRegion[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save()
  ctx.lineWidth = 1.5
  ctx.font = '10px monospace'

  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F0B27A',
  ]

  regions.forEach((region, i) => {
    const color = colors[i % colors.length]
    const { x, y, w, h } = region.bbox

    ctx.strokeStyle = color
    ctx.setLineDash([4, 2])
    ctx.strokeRect(
      x * canvasWidth,
      y * canvasHeight,
      w * canvasWidth,
      h * canvasHeight,
    )

    ctx.fillStyle = color
    ctx.fillText(
      region.key,
      x * canvasWidth + 2,
      y * canvasHeight - 3,
    )
  })

  ctx.restore()
}

// Re-export landmark sets for external use
export {
  CROW_FEET_LEFT, CROW_FEET_RIGHT,
  UNDER_EYE_LEFT, UNDER_EYE_RIGHT,
  LIP_REGION, CHEEK_LEFT, CHEEK_RIGHT,
  CHIN_REGION, JAWLINE, FOREHEAD,
  NASOLABIAL_LEFT, NASOLABIAL_RIGHT,
}
