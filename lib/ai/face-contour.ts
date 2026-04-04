/**
 * Dynamic Face Contour — FaceMesh-driven overlay geometry
 *
 * Extracts the outer face boundary from MediaPipe FaceMesh landmarks,
 * expands it to fully wrap forehead/chin/cheeks, applies per-frame
 * smoothing, and provides drawing utilities for premium canvas rendering.
 *
 * This replaces the static CSS oval with a face-following guide that
 * is drawn on the same canvas as the mesh — guaranteeing zero drift.
 */

import type { Landmark } from './types'

// ─── Outer face boundary landmarks (ordered clockwise) ──────
// MediaPipe FaceMesh face oval indices, starting from forehead center.
// This is the silhouette path used to derive the expanded contour.
const FACE_BOUNDARY_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

// ─── Expansion config ───────────────────────────────────────
// How much to expand each region beyond the raw landmark boundary.
// Values are multipliers of the face bounding box dimensions.
interface ExpansionConfig {
  top: number      // forehead — strongest expansion
  bottom: number   // chin
  left: number     // left cheek
  right: number    // right cheek
}

export type FaceContourTargetAngle = 'front' | 'left' | 'right'

const FRONT_EXPANSION: ExpansionConfig = {
  top: 0.095,
  bottom: 0.055,
  left: 0.045,
  right: 0.045,
}

const LEFT_EXPANSION: ExpansionConfig = {
  top: 0.085,
  bottom: 0.05,
  left: 0.055,
  right: 0.022,
}

const RIGHT_EXPANSION: ExpansionConfig = {
  top: 0.085,
  bottom: 0.05,
  left: 0.022,
  right: 0.055,
}

// ─── Smoothing state ────────────────────────────────────────
// Per-frame smoothed contour points to prevent jitter.
let smoothedContour: { x: number; y: number }[] = []
const SMOOTH_FACTOR = 0.18  // 0 = frozen, 1 = raw (reduced for less jitter)

export function resetContourSmoothing(): void {
  smoothedContour = []
}

// ─── Core types ─────────────────────────────────────────────
export interface FaceContourResult {
  /** Smoothed, expanded outer contour points in canvas coordinates */
  points: { x: number; y: number }[]
  /** Face center in canvas coordinates */
  center: { x: number; y: number }
  /** Face bounding box in canvas coordinates */
  bounds: { x: number; y: number; w: number; h: number }
  /** Whether the contour has enough points to render */
  valid: boolean
}

export interface FaceProjectionOptions {
  mirror?: boolean
  sourceWidth?: number
  sourceHeight?: number
}

export interface FaceContourOptions extends FaceProjectionOptions {
  targetAngle?: FaceContourTargetAngle
  expansion?: ExpansionConfig
}

function getExpansionForAngle(targetAngle: FaceContourTargetAngle): ExpansionConfig {
  if (targetAngle === 'left') return LEFT_EXPANSION
  if (targetAngle === 'right') return RIGHT_EXPANSION
  return FRONT_EXPANSION
}

export function projectLandmarkToCanvas(
  landmark: Landmark,
  canvasW: number,
  canvasH: number,
  options: FaceProjectionOptions = {},
): { x: number; y: number } {
  const { mirror = true, sourceWidth, sourceHeight } = options
  const normalizedX = mirror ? 1 - landmark.x : landmark.x
  const normalizedY = landmark.y

  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      x: normalizedX * canvasW,
      y: normalizedY * canvasH,
    }
  }

  const sourceAspect = sourceWidth / sourceHeight
  const targetAspect = canvasW / canvasH

  let drawW = canvasW
  let drawH = canvasH
  let offsetX = 0
  let offsetY = 0

  if (sourceAspect > targetAspect) {
    drawH = canvasH
    drawW = canvasH * sourceAspect
    offsetX = (canvasW - drawW) / 2
  } else {
    drawW = canvasW
    drawH = canvasW / sourceAspect
    offsetY = (canvasH - drawH) / 2
  }

  return {
    x: offsetX + normalizedX * drawW,
    y: offsetY + normalizedY * drawH,
  }
}

/**
 * Compute the dynamic face contour from FaceMesh landmarks.
 *
 * @param landmarks  Raw FaceMesh landmarks (468+)
 * @param canvasW    Canvas pixel width
 * @param canvasH    Canvas pixel height
 * @param mirror     Whether to mirror X (selfie camera)
 * @param expansion  Optional expansion overrides
 */
export function computeFaceContour(
  landmarks: Landmark[],
  canvasW: number,
  canvasH: number,
  options: FaceContourOptions = {},
): FaceContourResult {
  const {
    mirror = true,
    sourceWidth,
    sourceHeight,
    targetAngle = 'front',
    expansion = getExpansionForAngle(targetAngle),
  } = options

  // 1) Extract raw boundary points
  const rawPoints: { x: number; y: number }[] = []
  for (const idx of FACE_BOUNDARY_INDICES) {
    const lm = landmarks[idx]
    if (!lm) continue
    rawPoints.push(projectLandmarkToCanvas(lm, canvasW, canvasH, { mirror, sourceWidth, sourceHeight }))
  }

  if (rawPoints.length < 20) {
    return { points: [], center: { x: canvasW / 2, y: canvasH / 2 }, bounds: { x: 0, y: 0, w: canvasW, h: canvasH }, valid: false }
  }

  // 2) Compute face bounding box from raw boundary
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of rawPoints) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const faceW = maxX - minX
  const faceH = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  // 3) Expand each point outward from face center, with directional bias
  const expanded: { x: number; y: number }[] = rawPoints.map((p) => {
    const dx = p.x - centerX
    const dy = p.y - centerY

    // Determine directional expansion factor
    // top/bottom bias based on vertical position relative to center
    let expandX: number
    let expandY: number

    if (dy < 0) {
      // Point is above center → forehead region
      expandY = expansion.top
    } else {
      // Point is below center → chin region
      expandY = expansion.bottom
    }

    expandX = dx < 0 ? expansion.left : expansion.right

    return {
      x: p.x + dx * expandX,
      y: p.y + dy * expandY,
    }
  })

  // 4) Apply temporal smoothing
  if (smoothedContour.length !== expanded.length) {
    // First frame or landmark count changed — snap to current
    smoothedContour = expanded.map(p => ({ ...p }))
  } else {
    for (let i = 0; i < expanded.length; i++) {
      smoothedContour[i].x += (expanded[i].x - smoothedContour[i].x) * SMOOTH_FACTOR
      smoothedContour[i].y += (expanded[i].y - smoothedContour[i].y) * SMOOTH_FACTOR
    }
  }

  return {
    points: smoothedContour.map(p => ({ ...p })),  // defensive copy
    center: { x: centerX, y: centerY },
    bounds: { x: minX, y: minY, w: faceW, h: faceH },
    valid: true,
  }
}

// ─── Canvas rendering ───────────────────────────────────────

/**
 * Draw the premium outer face contour on canvas.
 *
 * Renders a smooth, glowing face boundary with:
 * - Catmull-Rom spline interpolation for silky curves
 * - Multi-layer rendering: soft outer glow → main contour → inner highlight
 * - Quality-driven accent color and opacity
 */
export function drawFaceContour(
  ctx: CanvasRenderingContext2D,
  contour: FaceContourResult,
  accentRgb: string,
  qualityScore: number,
): void {
  if (!contour.valid || contour.points.length < 10) return

  const points = contour.points
  const baseAlpha = 0.25 + qualityScore * 0.50  // range 0.25–0.75

  // Breathing animation — subtle scale pulse
  const breathe = 1 + Math.sin(Date.now() / 2500) * 0.006

  // ── Layer 1: Soft outer glow (wide, low opacity) ──
  ctx.save()
  ctx.shadowColor = `rgba(${accentRgb},${(baseAlpha * 0.12).toFixed(3)})`
  ctx.shadowBlur = 18
  ctx.lineWidth = 2.5
  ctx.strokeStyle = `rgba(${accentRgb},${(baseAlpha * 0.08).toFixed(3)})`
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  drawSmoothCurve(ctx, points, contour.center, breathe)
  ctx.stroke()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.restore()

  // ── Layer 2: Main contour line ──
  ctx.save()
  ctx.shadowColor = `rgba(${accentRgb},${(baseAlpha * 0.18).toFixed(3)})`
  ctx.shadowBlur = 8
  ctx.lineWidth = 1.2
  ctx.strokeStyle = `rgba(${accentRgb},${(baseAlpha * 0.50).toFixed(3)})`
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  drawSmoothCurve(ctx, points, contour.center, breathe)
  ctx.stroke()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.restore()

  // ── Layer 3: Inner highlight (thin, bright core) ──
  ctx.save()
  ctx.lineWidth = 0.5
  ctx.strokeStyle = `rgba(255,255,255,${(baseAlpha * 0.15).toFixed(3)})`
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  drawSmoothCurve(ctx, points, contour.center, breathe)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw the dynamic vignette that follows the face.
 *
 * Creates a radial gradient centered on the face that darkens the
 * edges, guiding visual focus to the detected face area.
 */
export function drawDynamicVignette(
  ctx: CanvasRenderingContext2D,
  contour: FaceContourResult,
  canvasW: number,
  canvasH: number,
  intensity = 0.7,
): void {
  if (!contour.valid) return

  const cx = contour.center.x
  const cy = contour.center.y
  // Use face size to scale the clear zone
  const clearRadius = Math.max(contour.bounds.w, contour.bounds.h) * 0.7
  const outerRadius = Math.max(canvasW, canvasH) * 0.9

  const grad = ctx.createRadialGradient(cx, cy, clearRadius, cx, cy, outerRadius)
  grad.addColorStop(0, 'rgba(3,3,5,0)')
  grad.addColorStop(0.35, 'rgba(3,3,5,0)')
  grad.addColorStop(0.55, `rgba(3,3,5,${(0.10 * intensity).toFixed(3)})`)
  grad.addColorStop(0.70, `rgba(3,3,5,${(0.28 * intensity).toFixed(3)})`)
  grad.addColorStop(0.85, `rgba(3,3,5,${(0.50 * intensity).toFixed(3)})`)
  grad.addColorStop(1.0, `rgba(3,3,5,${(0.70 * intensity).toFixed(3)})`)

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvasW, canvasH)
}

// ─── Smooth curve drawing (Catmull-Rom → Bézier) ────────────

/**
 * Draw a closed smooth curve through the given points using
 * Catmull-Rom to cubic Bézier conversion.
 *
 * This produces silky, anatomically natural curves instead of
 * jagged polygon edges.
 */
function drawSmoothCurve(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  center: { x: number; y: number },
  scale: number,
): void {
  const n = points.length
  if (n < 4) return

  // Apply breathing scale around center
  const scaled = points.map(p => ({
    x: center.x + (p.x - center.x) * scale,
    y: center.y + (p.y - center.y) * scale,
  }))

  ctx.beginPath()
  ctx.moveTo(scaled[0].x, scaled[0].y)

  // Catmull-Rom tension (0.5 = centripetal, natural feel)
  const tension = 0.5

  for (let i = 0; i < n; i++) {
    const p0 = scaled[(i - 1 + n) % n]
    const p1 = scaled[i]
    const p2 = scaled[(i + 1) % n]
    const p3 = scaled[(i + 2) % n]

    // Convert Catmull-Rom to cubic Bézier control points
    const cp1x = p1.x + (p2.x - p0.x) / (6 * tension)
    const cp1y = p1.y + (p2.y - p0.y) / (6 * tension)
    const cp2x = p2.x - (p3.x - p1.x) / (6 * tension)
    const cp2y = p2.y - (p3.y - p1.y) / (6 * tension)

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }

  ctx.closePath()
}

/**
 * Draw subtle corner crosshair accents at the cardinal points
 * of the face contour. These provide spatial orientation cues
 * without a fixed oval.
 */
/**
 * Draw premium corner bracket accents at the four corners of the face
 * bounding area. These provide a "scanner frame" aesthetic that feels
 * precise and high-tech without being distracting.
 */
export function drawContourAccents(
  ctx: CanvasRenderingContext2D,
  contour: FaceContourResult,
  accentRgb: string,
  qualityScore: number,
): void {
  if (!contour.valid) return

  const alpha = (0.12 + qualityScore * 0.22).toFixed(3)
  const cx = contour.center.x
  const cy = contour.center.y
  const halfW = contour.bounds.w * 0.58
  const halfH = contour.bounds.h * 0.58
  const arm = Math.min(contour.bounds.w, contour.bounds.h) * 0.08  // bracket arm length

  ctx.save()
  ctx.strokeStyle = `rgba(${accentRgb},${alpha})`
  ctx.lineWidth = 1.0
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Top-left corner bracket
  ctx.beginPath()
  ctx.moveTo(cx - halfW, cy - halfH + arm)
  ctx.lineTo(cx - halfW, cy - halfH)
  ctx.lineTo(cx - halfW + arm, cy - halfH)
  ctx.stroke()

  // Top-right corner bracket
  ctx.beginPath()
  ctx.moveTo(cx + halfW - arm, cy - halfH)
  ctx.lineTo(cx + halfW, cy - halfH)
  ctx.lineTo(cx + halfW, cy - halfH + arm)
  ctx.stroke()

  // Bottom-left corner bracket
  ctx.beginPath()
  ctx.moveTo(cx - halfW, cy + halfH - arm)
  ctx.lineTo(cx - halfW, cy + halfH)
  ctx.lineTo(cx - halfW + arm, cy + halfH)
  ctx.stroke()

  // Bottom-right corner bracket
  ctx.beginPath()
  ctx.moveTo(cx + halfW - arm, cy + halfH)
  ctx.lineTo(cx + halfW, cy + halfH)
  ctx.lineTo(cx + halfW, cy + halfH - arm)
  ctx.stroke()

  ctx.restore()
}
