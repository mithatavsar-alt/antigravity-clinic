'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Landmark } from '@/lib/ai/types'
import {
  init as initHumanEngine,
  detectFaceFromVideo,
  destroy as destroyHumanEngine,
} from '@/lib/ai/human-engine'
import {
  evaluateFaceGuide,
  type TargetAngle,
  calculateBrightness,
  estimateSharpness,
  detectShadow,
  smoothLandmarks,
  resetSmoothing,
  resetStability,
  pushDetection,
  pushMiss,
  resetFaceLock,
  NO_FACE_STATUS,
  FACE_OVAL,
  LEFT_EYE,
  RIGHT_EYE,
  LEFT_EYEBROW,
  RIGHT_EYEBROW,
  NOSE_BRIDGE,
  UPPER_LIP,
  LOWER_LIP,
  JAWLINE,
  type FaceGuideStatus,
} from '@/lib/ai/face-guide'
import { FACEMESH_TESSELATION } from '@/lib/ai/facemesh-tesselation'

// ─── Types ──────────────────────────────────────────────────
export type CaptureMode = 'single' | 'multi'
export type MultiStep = 'front' | 'left' | 'right'

export interface CaptureMetadata {
  confidence: 'high' | 'medium' | 'low'
  qualityScore: number
}

export interface MultiCaptureResult {
  front: string
  left: string
  right: string
}

interface FaceGuideCaptureProps {
  onCapture: (dataUrl: string, meta?: CaptureMetadata) => void
  onClose: () => void
  mode?: CaptureMode
  autoConfirm?: boolean
  onMultiCapture?: (photos: MultiCaptureResult, meta?: CaptureMetadata) => void
}

// Mimic expressions removed — 3-pose capture only (front, left, right)

type InitState = 'loading' | 'ready' | 'error'

/**
 * Validation state machine — purely Face Mesh driven.
 *  idle → detecting → tracking → stabilizing → validated → advancing
 */
type ValidationPhase = 'idle' | 'detecting' | 'tracking' | 'stabilizing' | 'validated' | 'advancing'

// ─── Constants ──────────────────────────────────────────────
const ADVANCE_DELAY_MS = 600
const FAILSAFE_MS = 10000
const BEST_FRAME_BUFFER_SIZE = 20
const BEST_FRAME_WINDOW_MS = 3000

// ─── Auto-fit (software preview fitting) ───────────────────
// Smoothly zooms/pans the camera preview so the detected face
// is brought into the target oval, giving the camera an
// "assisted" feeling. Purely visual — does NOT affect capture.
const AUTOFIT_SMOOTHING = 0.07          // Per-frame blend toward target (gentle)
const AUTOFIT_RELEASE_SPEED = 0.035     // Slower return to neutral when face lost
const AUTOFIT_MAX_SCALE = 1.35          // Max zoom to preserve image quality
const AUTOFIT_IDEAL_FACE_HEIGHT = 0.45  // Target face-height ratio in frame (lower = less aggressive zoom, fits larger oval)
const AUTOFIT_MAX_SHIFT = 10            // Max translate in % of container
const AUTOFIT_DEAD_ZONE = 0.03          // Ignore offsets smaller than this (reduces jitter)

interface AutoFitState {
  scale: number
  tx: number   // translateX in %
  ty: number   // translateY in %
}

// ─── Countdown constants (all captures) ────────────────────
// Every capture (front, left, right) uses a visible 3→2→1 countdown.
const COUNTDOWN_SECONDS = 3
const COUNTDOWN_MS = COUNTDOWN_SECONDS * 1000

// ─── FRONT readiness: STRICT ──────────────────────────────
// Front is the primary reference — requires tight alignment on all axes.
// These thresholds are the CAPTURE GATE: if a frame passes these, it's
// guaranteed to produce a clean result page with no blocking errors.
const FRONT_STABILITY_FRAMES = 10

function isFrontReady(status: FaceGuideStatus, relaxed = false): boolean {
  const { qualityBreakdown: qb } = status
  return (
    status.faceDetected &&
    status.allOk &&
    status.faceLocked &&
    // Single face: faceDetected is true (multi-face blocked at detection level)
    // Face in frame and large enough
    qb.distance >= (relaxed ? 0.55 : 0.60) &&
    // Head angle acceptable
    qb.angle >= (relaxed ? 0.55 : 0.60) &&
    // Face centered in frame
    qb.centering >= (relaxed ? 0.45 : 0.50) &&
    // Adequate lighting
    qb.lighting >= (relaxed ? 0.50 : 0.55) &&
    // Sharp enough (no heavy blur)
    qb.sharpness >= (relaxed ? 0.50 : 0.55) &&
    // Stable across frames (eyes open, landmarks consistent)
    qb.stability >= (relaxed ? 0.50 : 0.55) &&
    // Overall composite quality
    status.qualityScore >= (relaxed ? 0.75 : 0.85)
  )
}

// ─── SIDE readiness: MODERATE ─────────────────────────────
// Side captures allow some centering flexibility but still require
// face visible, correct side angle, acceptable light + sharpness.
//
// IMPORTANT: Does NOT use composite qualityScore because it includes
// centering penalty, which naturally drops when the face is angled.
// Instead, checks only the sub-scores that matter for side views.
const SIDE_CROW_FEET_THRESHOLD = 0.35    // relaxed from 0.45

function isSideReady(status: FaceGuideStatus, relaxed = false): boolean {
  const { qualityBreakdown: qb } = status
  return (
    status.faceDetected &&
    status.faceLocked &&
    // Angle is the key gate — must be 'ok' (within the angled window)
    (status.angle === 'ok') &&
    // Individual sub-scores — stricter to ensure clean results
    qb.distance >= (relaxed ? 0.30 : 0.40) &&
    qb.angle >= (relaxed ? 0.30 : 0.40) &&
    qb.lighting >= (relaxed ? 0.30 : 0.40) &&
    qb.sharpness >= (relaxed ? 0.25 : 0.35) &&
    qb.stability >= (relaxed ? 0.15 : 0.25)
  )
}

const TIPS = [
  'Doğal ve nötr bir ifade koruyun',
  'Saçlarınız yüzünüzü örtmesin',
  'Varsa gözlüğünüzü çıkarın',
  'Doğal, dengeli ışık tercih edin',
  'Sade bir arka plan en iyi sonucu verir',
]
const MULTI_LABELS: Record<MultiStep, string> = {
  front: 'Ön Görünüm',
  left: 'Sol Yüz',
  right: 'Sağ Yüz',
}
const MULTI_INSTRUCTIONS: Record<MultiStep, string> = {
  front: 'Düz bakın — nötr ifade',
  left: 'Sol yanağınızı hafifçe gösterin',
  right: 'Sağ yanağınızı hafifçe gösterin',
}

// ─── Badge component with score-driven color ───────────────
// Color is driven by the continuous sub-score (0–1), NOT by the
// discrete ok/tilt/etc category. This ensures pills reflect real
// image suitability and match auto-capture readiness logic.
//
// Hysteresis: once a tier is reached, a wider band prevents flicker.
//  GREEN  ≥ 0.60  (drops back to YELLOW at < 0.50)
//  YELLOW ≥ 0.30  (drops back to RED at < 0.20)
//  RED    < 0.30  (initial state)

// ─── Quality pill definitions ─────────────────────────────
// 6 visible checks: Mesafe, Işık, Açı, Konum, Netlik, İfade
// Each shows a fixed Turkish label + a colored dot driven by the sub-score.

interface PillDef {
  key: string
  label: string
}

const PILL_DEFS: PillDef[] = [
  { key: 'distance', label: 'Mesafe' },
  { key: 'lighting', label: 'Işık' },
  { key: 'angle', label: 'Açı' },
  { key: 'centering', label: 'Konum' },
  { key: 'sharpness', label: 'Netlik' },
  { key: 'expression', label: 'İfade' },
]

type BadgeTier = 'red' | 'yellow' | 'green'
const badgeTierCache: Record<string, BadgeTier> = {}

function scoreToBadgeTier(category: string, score: number): BadgeTier {
  const prev = badgeTierCache[category] ?? 'red'
  let next: BadgeTier
  if (prev === 'green') {
    next = score >= 0.50 ? 'green' : score >= 0.20 ? 'yellow' : 'red'
  } else if (prev === 'yellow') {
    next = score >= 0.60 ? 'green' : score >= 0.20 ? 'yellow' : 'red'
  } else {
    next = score >= 0.60 ? 'green' : score >= 0.30 ? 'yellow' : 'red'
  }
  badgeTierCache[category] = next
  return next
}

const DOT_COLORS: Record<BadgeTier, string> = {
  green: '#00FFB4',
  yellow: '#C4A35A',
  red: '#A05252',
}

function QualityPillStrip({ scores }: { scores: Record<string, number> }) {
  return (
    <div className="flex items-center justify-center gap-[6px] flex-wrap">
      {PILL_DEFS.map(({ key, label }) => {
        const tier = scoreToBadgeTier(key, scores[key] ?? 0)
        return (
          <span key={key} className="inline-flex items-center gap-[5px] text-[9px] font-medium tracking-[0.06em] text-white/40 transition-colors duration-500">
            <span
              className="w-[6px] h-[6px] rounded-full transition-colors duration-500"
              style={{ backgroundColor: DOT_COLORS[tier], boxShadow: `0 0 4px ${DOT_COLORS[tier]}50` }}
            />
            {label}
          </span>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PURE LANDMARK MESH DRAWING — no static overlays, no templates
// Only real Face Mesh data rendered as premium contour lines.
// ════════════════════════════════════════════════════════════

/** Detected region info for overlay highlighting — only regions with real detections */
export interface OverlayRegionHighlight {
  region: string
  score: number
  detected: boolean
}

/**
 * Resolve the shared accent RGB triplet from quality score.
 * This single source of truth drives mesh color AND bottom bar color.
 *   fail (< 0.5)       → warm red   (200,120,120)
 *   borderline (0.5–0.8) → gold     (212,185,106)
 *   accepted (≥ 0.8)   → mint green (0,255,180)
 */
export function accentFromQuality(q: number): string {
  if (q >= 0.8) return '0,255,180'
  if (q >= 0.5) {
    // Lerp gold → mint between 0.5 and 0.8
    const t = (q - 0.5) / 0.3
    return `${Math.round(212 - 212 * t)},${Math.round(185 + 70 * t)},${Math.round(106 + 74 * t)}`
  }
  // Lerp red → gold between 0 and 0.5
  const t = q / 0.5
  return `${Math.round(200 + 12 * t)},${Math.round(120 + 65 * t)},${Math.round(120 - 14 * t)}`
}

export function drawMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  _allOk: boolean,
  mirror = true,
  _clipOval = true,   // eslint-disable-line @typescript-eslint/no-unused-vars -- kept for signature compat
  qualityScore = 0,
  /** Optional: wrinkle regions with real detections for subtle highlight overlay */
  detectedRegions?: OverlayRegionHighlight[],
  /** Dynamic accent RGB triplet — if omitted, derived from qualityScore */
  accentRgb?: string,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.save()

  const toX = (lm: Landmark) => mirror ? (1 - lm.x) * w : lm.x * w
  const toY = (lm: Landmark) => lm.y * h

  // Shared dynamic accent — drives ALL mesh colors
  const accent = accentRgb ?? accentFromQuality(qualityScore)

  // Tier-based opacity: mesh gets brighter as quality improves
  const baseOpacity = 0.25 + qualityScore * 0.45  // range 0.25–0.70

  // Quality tier flag — used by region highlights
  const isHigh = qualityScore >= 0.8

  // ── Contour drawing helper ──
  const drawContour = (
    indices: number[],
    color: string,
    opacity: number,
    lineW: number,
    glowColor: string | null = null,
    glowBlur = 0,
  ) => {
    ctx.beginPath()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = lineW
    ctx.strokeStyle = `${color}${Math.min(1, opacity * baseOpacity).toFixed(3)})`
    if (glowColor && glowBlur > 0) {
      ctx.shadowColor = `${glowColor}${(0.25 * baseOpacity).toFixed(3)})`
      ctx.shadowBlur = glowBlur
    }
    let started = false
    for (const idx of indices) {
      const lm = landmarks[idx]
      if (!lm) continue
      if (!started) { ctx.moveTo(toX(lm), toY(lm)); started = true }
      else ctx.lineTo(toX(lm), toY(lm))
    }
    ctx.stroke()
    if (glowColor) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0 }
  }

  // ════════════════════════════════════════════════════════════
  // DENSE TRIANGULATED MESH — full MediaPipe-style tesselation
  // Single batched draw call for all ~900 edges. Neon mint/green
  // with subtle glow. PURELY VISUAL — does NOT affect analysis.
  // Drawn FIRST so feature contours render on top.
  // ════════════════════════════════════════════════════════════
  {
    const meshAlpha = Math.min(0.55, 0.15 + qualityScore * 0.40)
    ctx.beginPath()
    ctx.lineWidth = 0.6
    ctx.strokeStyle = `rgba(${accent},${meshAlpha.toFixed(3)})`
    ctx.shadowColor = `rgba(${accent},${(meshAlpha * 0.35).toFixed(3)})`
    ctx.shadowBlur = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const [a, b] of FACEMESH_TESSELATION) {
      const la = landmarks[a], lb = landmarks[b]
      if (!la || !lb) continue
      ctx.moveTo(toX(la), toY(la))
      ctx.lineTo(toX(lb), toY(lb))
    }
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }

  // ════════════════════════════════════════════════════════════
  // OUTER CONTOURS — dynamic accent face oval + jawline on top of mesh
  // ════════════════════════════════════════════════════════════
  drawContour(FACE_OVAL, `rgba(${accent},`, 0.90, 1.8, `rgba(${accent},`, 14)
  drawContour(JAWLINE, `rgba(${accent},`, 0.70, 1.5, `rgba(${accent},`, 10)

  // ════════════════════════════════════════════════════════════
  // INNER FEATURES — brighter contours for eyes, brows, nose, lips
  // ════════════════════════════════════════════════════════════
  drawContour(LEFT_EYE, `rgba(${accent},`, 0.95, 1.6, `rgba(${accent},`, 10)
  drawContour(RIGHT_EYE, `rgba(${accent},`, 0.95, 1.6, `rgba(${accent},`, 10)
  drawContour(LEFT_EYEBROW, `rgba(${accent},`, 0.75, 1.3, `rgba(${accent},`, 7)
  drawContour(RIGHT_EYEBROW, `rgba(${accent},`, 0.75, 1.3, `rgba(${accent},`, 7)
  drawContour(NOSE_BRIDGE, `rgba(${accent},`, 0.80, 1.4, `rgba(${accent},`, 8)
  drawContour(UPPER_LIP, `rgba(${accent},`, 0.75, 1.2, `rgba(${accent},`, 6)
  drawContour(LOWER_LIP, `rgba(${accent},`, 0.75, 1.2, `rgba(${accent},`, 6)

  // ════════════════════════════════════════════════════════════
  // ANCHOR DOTS — key landmarks as small glowing mint points
  // ════════════════════════════════════════════════════════════
  const anchors = [
    1,    // nose tip
    33,   // left eye outer
    263,  // right eye outer
    61,   // left mouth corner
    291,  // right mouth corner
    152,  // chin
    10,   // forehead top
  ]
  for (const idx of anchors) {
    const lm = landmarks[idx]
    if (!lm) continue
    const x = toX(lm), y = toY(lm)
    // Soft glow halo
    ctx.shadowColor = `rgba(${accent},${(0.5 * baseOpacity).toFixed(3)})`
    ctx.shadowBlur = 10
    ctx.fillStyle = `rgba(${accent},${(0.65 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
    // White core
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill()
  }

  // ════════════════════════════════════════════════════════════
  // DETECTED REGION HIGHLIGHTS — subtle glow ONLY on real detections
  // No highlight = no detection. Never creates false heatmaps.
  // ════════════════════════════════════════════════════════════
  if (detectedRegions && detectedRegions.length > 0) {
    /** Map region keys to landmark-based center points */
    const regionCenters: Record<string, number[]> = {
      forehead: [10, 151, 9, 8],
      glabella: [9, 107, 336],
      crow_feet_left: [33, 130, 226],
      crow_feet_right: [263, 359, 446],
      under_eye_left: [33, 7, 163, 144],
      under_eye_right: [362, 382, 381, 380],
      nasolabial_left: [98, 240, 64],
      nasolabial_right: [327, 460, 294],
      marionette_left: [61, 146, 91],
      marionette_right: [291, 375, 321],
      jawline: [152, 148, 377],
    }
    for (const region of detectedRegions) {
      if (!region.detected || region.score < 15) continue
      const centerLandmarks = regionCenters[region.region]
      if (!centerLandmarks) continue

      // Compute region center from landmarks
      let cx = 0, cy = 0, count = 0
      for (const idx of centerLandmarks) {
        const lm = landmarks[idx]
        if (!lm) continue
        cx += toX(lm); cy += toY(lm); count++
      }
      if (count === 0) continue
      cx /= count; cy /= count

      // Very subtle warm glow — intensity scales with score, max 0.08 alpha
      const intensity = Math.min(0.08, (region.score / 100) * 0.10)
      const radius = Math.max(w, h) * 0.06

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      grad.addColorStop(0, `rgba(${accent},${intensity.toFixed(3)})`)
      grad.addColorStop(0.6, `rgba(${accent},${(intensity * 0.4).toFixed(3)})`)
      grad.addColorStop(1, `rgba(${accent},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ════════════════════════════════════════════════════════════
  // FACE-DERIVED BOUNDING SOFT GLOW — replaces static oval glow
  // Uses actual face center from landmarks, not a template.
  // ════════════════════════════════════════════════════════════
  if (qualityScore > 0.3) {
    const forehead = landmarks[10]
    const chin = landmarks[152]
    const leftCheek = landmarks[234]
    const rightCheek = landmarks[454]
    if (forehead && chin && leftCheek && rightCheek) {
      const fcx = toX({ x: (leftCheek.x + rightCheek.x) / 2, y: 0, z: 0 })
      const fcy = toY({ x: 0, y: (forehead.y + chin.y) / 2, z: 0 })
      const faceW = Math.abs(toX(rightCheek) - toX(leftCheek))
      const faceH = Math.abs(toY(chin) - toY(forehead))
      const radius = Math.max(faceW, faceH) * 0.8

      const intensity = Math.min(1, (qualityScore - 0.3) / 0.7)
      const breathe = Math.sin(Date.now() / 2000) * 0.02 + 1
      const glowAlpha = (intensity * (isHigh ? 0.10 : 0.06)).toFixed(3)

      const ambientGrad = ctx.createRadialGradient(
        fcx, fcy, radius * 0.1 * breathe,
        fcx, fcy, radius * 1.4 * breathe,
      )
      ambientGrad.addColorStop(0, `rgba(${accent},${glowAlpha})`)
      ambientGrad.addColorStop(0.6, `rgba(${accent},${(parseFloat(glowAlpha) * 0.4).toFixed(3)})`)
      ambientGrad.addColorStop(1, `rgba(${accent},0)`)
      ctx.fillStyle = ambientGrad
      ctx.beginPath()
      ctx.arc(fcx, fcy, radius * 1.4 * breathe, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}

// ─── Camera acquisition ─────────────────────────────────────
function diagnoseCameraError(err: unknown): string {
  if (!(err instanceof DOMException)) return 'Kamera başlatılamadı'
  switch (err.name) {
    case 'NotAllowedError': return 'Kamera izni reddedildi. Tarayıcı ayarlarından kamera iznini açın.'
    case 'NotFoundError': return 'Kamera bulunamadı. Lütfen bir kamera bağlayın.'
    case 'NotReadableError': return 'Kamera başka bir uygulama tarafından kullanılıyor.'
    case 'OverconstrainedError': return 'Kamera istenen çözünürlüğü desteklemiyor.'
    case 'SecurityError': return 'Kamera güvenli bağlantı (HTTPS) gerektirir.'
    default: return `Kamera hatası: ${(err as DOMException).message}`
  }
}

// ─── Target aspect ratio for the capture frame ─────────────
// 3:4 portrait — matches the UI container and prevents distortion.
// All capture/mesh canvases use this ratio for consistency.
const TARGET_ASPECT = 3 / 4

async function acquireCamera(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new DOMException('Kamera HTTPS veya localhost gerektirir.', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Bu tarayıcı kamera erişimini desteklemiyor.', 'NotFoundError')
  }
  // Prefer 3:4 portrait to match the UI frame exactly
  const portraitConstraints = [
    { facingMode: 'user' as const, width: { ideal: 720 }, height: { ideal: 960 } },
    { facingMode: 'user' as const, width: { ideal: 640 }, height: { ideal: 480 } },
    { facingMode: 'user' as const },
  ]
  for (const constraints of portraitConstraints) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: constraints })
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
    }
  }
  // Last resort: enumerate devices
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((d) => d.kind === 'videoinput')
    if (videoDevices.length === 0) throw new DOMException('Kamera bulunamadı.', 'NotFoundError')
    for (const device of videoDevices) {
      try { return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } }) } catch { /* next */ }
    }
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }
  return await navigator.mediaDevices.getUserMedia({ video: true })
}

/**
 * Captures a center-cropped 3:4 frame from the video, matching exactly
 * what the user sees in the UI. Prevents stretched or squeezed faces.
 */
function captureAlignedFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw === 0 || vh === 0) return null

  const videoAspect = vw / vh
  let sx = 0, sy = 0, sw = vw, sh = vh

  if (videoAspect > TARGET_ASPECT) {
    // Video is wider than 3:4 — crop sides
    sw = Math.round(vh * TARGET_ASPECT)
    sx = Math.round((vw - sw) / 2)
  } else if (videoAspect < TARGET_ASPECT) {
    // Video is taller than 3:4 — crop top/bottom
    sh = Math.round(vw / TARGET_ASPECT)
    sy = Math.round((vh - sh) / 2)
  }

  // Output at a clean resolution
  const outW = Math.min(sw, 720)
  const outH = Math.round(outW / TARGET_ASPECT)
  canvas.width = outW
  canvas.height = outH

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Mirror horizontally (front camera) and draw cropped region
  ctx.resetTransform()
  ctx.translate(outW, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)

  return canvas.toDataURL('image/jpeg', 0.92)
}

// ─── Best-frame scoring ─────────────────────────────────────
interface ScoredFrame { dataUrl: string; score: number; time: number }

function computeFrameScore(status: FaceGuideStatus): number {
  const { qualityBreakdown: qb } = status
  return qb.distance * 0.25 + qb.angle * 0.20 + qb.centering * 0.10 + qb.sharpness * 0.20 + qb.lighting * 0.15 + qb.stability * 0.10
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT — Pure Face Mesh driven, no static overlays
// ═══════════════════════════════════════════════════════════
export function FaceGuideCapture({ onCapture, onClose, mode = 'single', autoConfirm = false, onMultiCapture }: FaceGuideCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const meshCanvasRef = useRef<HTMLCanvasElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const brightnessCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const engineReadyRef = useRef(false)
  const processingRef = useRef(false)
  const animFrameRef = useRef(0)
  const lastFrameTime = useRef(0)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-fit: smooth software preview fitting
  const autoFitWrapperRef = useRef<HTMLDivElement>(null)
  const autoFitRef = useRef<AutoFitState>({ scale: 1, tx: 0, ty: 0 })

  const validationStartRef = useRef<number | null>(null)
  const faceFirstSeenRef = useRef<number | null>(null)
  const frameBufferRef = useRef<ScoredFrame[]>([])
  const stableReadyFrames = useRef(0)

  const [initState, setInitState] = useState<InitState>('loading')
  const [initError, setInitError] = useState<string | null>(null)
  const [status, setStatus] = useState<FaceGuideStatus>(NO_FACE_STATUS)
  const [preview, setPreview] = useState<string | null>(null)
  const [phase, setPhase] = useState<ValidationPhase>('idle')
  const [validationProgress, setValidationProgress] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [failsafeActive, setFailsafeActive] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const [landmarksRef] = useState<{ current: Landmark[] | null }>({ current: null })

  const [multiStep, setMultiStep] = useState<MultiStep>('front')
  const [multiPhotos, setMultiPhotos] = useState<{ front?: string; left?: string; right?: string }>({})

  // 3-second countdown (all captures: front, left, right)
  const countdownStartRef = useRef<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  // ── Refs that mirror state for use inside processFrame ──
  // processFrame runs in a rAF loop. If it depends on React state (phase,
  // countdown, preview), each setState recreates the callback and
  // re-registers the animation frame, causing timing gaps that prevent
  // the countdown from completing. These refs let processFrame read
  // current values without being in the dependency array.
  const phaseRef = useRef<ValidationPhase>('idle')
  const previewRef = useRef<string | null>(null)

  // Keep refs in sync with state
  const updatePhase = useCallback((p: ValidationPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])
  const updatePreview = useCallback((p: string | null) => {
    previewRef.current = p
    setPreview(p)
  }, [])

  // AI mesh overlay visibility — ON by default
  const [showMesh, setShowMesh] = useState(true)

  // Rotating tips
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000)
    return () => clearInterval(interval)
  }, [])

  // Capture best frame from buffer
  const captureBestFrame = useCallback((): string | null => {
    const buffer = frameBufferRef.current
    if (buffer.length > 0) {
      return buffer.reduce((a, b) => (b.score > a.score ? b : a)).dataUrl
    }
    // Fallback: capture current frame with proper alignment
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (video && canvas) {
      return captureAlignedFrame(video, canvas)
    }
    return null
  }, [])

  // Auto-advance
  const triggerAutoAdvance = useCallback(() => {
    if (advanceTimerRef.current) return
    updatePhase('validated')
    setShowFlash(true)
    setTimeout(() => setShowFlash(false), 350)

    advanceTimerRef.current = setTimeout(() => {
      updatePhase('advancing')
      const bestDataUrl = captureBestFrame()
      if (bestDataUrl) {
        if (mode === 'multi') setMultiPhotos((prev) => ({ ...prev, [multiStep]: bestDataUrl }))
        updatePreview(bestDataUrl)
      }
      frameBufferRef.current = []
      advanceTimerRef.current = null
    }, ADVANCE_DELAY_MS)
  }, [captureBestFrame, mode, multiStep, updatePhase, updatePreview])

  // Reset
  const resetValidation = useCallback(() => {
    validationStartRef.current = null
    faceFirstSeenRef.current = null
    frameBufferRef.current = []
    stableReadyFrames.current = 0
    countdownStartRef.current = null
    setCountdown(null)
    updatePhase('idle')
    setValidationProgress(0)
    setFailsafeActive(false)
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    resetSmoothing(); resetStability(); resetFaceLock()
    // Reset badge hysteresis so next step starts at red
    for (const key of Object.keys(badgeTierCache)) delete badgeTierCache[key]
    // Reset auto-fit to neutral (will animate out via release speed)
    autoFitRef.current = { scale: 1, tx: 0, ty: 0 }
    if (autoFitWrapperRef.current) autoFitWrapperRef.current.style.transform = ''
  }, [updatePhase])

  // Init camera + engine
  useEffect(() => {
    let cancelled = false
    async function setup() {
      try {
        const [stream] = await Promise.all([acquireCamera(), initHumanEngine()])
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try { await videoRef.current.play() } catch { /* autoPlay */ }
        }
        if (cancelled) return
        engineReadyRef.current = true
        resetSmoothing(); resetStability(); resetFaceLock()
        setInitState('ready'); updatePhase('detecting')
      } catch (err) {
        if (!cancelled) { setInitState('error'); setInitError(diagnoseCameraError(err)) }
      }
    }
    setup()
    return () => {
      cancelled = true
      cancelAnimationFrame(animFrameRef.current)
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      engineReadyRef.current = false
      destroyHumanEngine(); resetSmoothing(); resetStability(); resetFaceLock()
    }
  }, [])

  // ─── MAIN LOOP: detect → evaluate → draw mesh → validate ──
  const processFrame = useCallback(() => {
    const video = videoRef.current
    const bc = brightnessCanvasRef.current
    const mc = meshCanvasRef.current

    if (!video || !engineReadyRef.current || !bc || !mc || processingRef.current || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }

    const now = performance.now()
    if (now - lastFrameTime.current < 83) { // ~12fps
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }
    lastFrameTime.current = now
    processingRef.current = true

    const brightness = calculateBrightness(video, bc)
    estimateSharpness(video, bc)

    // Sync canvas to video display size — critical for mobile alignment
    const rect = video.getBoundingClientRect()
    const rw = Math.round(rect.width), rh = Math.round(rect.height)
    if (mc.width !== rw || mc.height !== rh) { mc.width = rw; mc.height = rh }

    detectFaceFromVideo(video)
      .then((detection) => {
        processingRef.current = false
        const raw = detection?.landmarks ?? null

        if (!raw || raw.length < 468) {
          // ── Miss ──
          pushMiss()
          // Keep last mesh visible while face is locked (prevents flicker)
          if (!status.faceLocked) {
            setStatus(NO_FACE_STATUS)
            landmarksRef.current = null
            validationStartRef.current = null
            setValidationProgress(0)
            if (phaseRef.current === 'stabilizing' || phaseRef.current === 'tracking') updatePhase('detecting')
            const ctx = mc.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, mc.width, mc.height)
          }
          // Auto-fit: smoothly release back to neutral when no face
          {
            const af = autoFitRef.current
            const wrapper = autoFitWrapperRef.current
            if (wrapper && (Math.abs(af.scale - 1) > 0.002 || Math.abs(af.tx) > 0.02 || Math.abs(af.ty) > 0.02)) {
              af.scale += (1 - af.scale) * AUTOFIT_RELEASE_SPEED
              af.tx += (0 - af.tx) * AUTOFIT_RELEASE_SPEED
              af.ty += (0 - af.ty) * AUTOFIT_RELEASE_SPEED
              wrapper.style.transform = `scale(${af.scale.toFixed(4)}) translate(${af.tx.toFixed(2)}%, ${af.ty.toFixed(2)}%)`
            } else if (wrapper && af.scale !== 1) {
              af.scale = 1; af.tx = 0; af.ty = 0
              wrapper.style.transform = ''
            }
          }
        } else {
          // ── Face detected — all logic from real landmarks ──
          const smoothed = smoothLandmarks(raw)
          landmarksRef.current = smoothed
          pushDetection(smoothed, detection?.confidence ?? 0.5)

          const shadowScore = detectShadow(video, bc, smoothed)
          // Map multi-step to target angle for face guide evaluation
          const targetAngle: TargetAngle = mode === 'multi' ? multiStep as TargetAngle : 'front'
          const guide = evaluateFaceGuide(smoothed, brightness, shadowScore, targetAngle)
          setStatus(guide)

          // ── AUTO-FIT: software preview fitting ──────────────
          // Compute signed face offset from landmarks (face guide uses abs values)
          // Landmarks are in raw camera coords (0-1); video is CSS-mirrored.
          // Because of CSS scaleX(-1) on the video, raw X offsets translate
          // directly to correct visual shifts (mirror cancels the sign flip).
          {
            const wrapper = autoFitWrapperRef.current
            if (wrapper && guide.faceLocked && !preview) {
              const af = autoFitRef.current
              const leftCheek = smoothed[234]
              const rightCheek = smoothed[454]
              const foreheadLm = smoothed[10]
              const chinLm = smoothed[152]

              if (leftCheek && rightCheek && foreheadLm && chinLm) {
                const faceCX = (leftCheek.x + rightCheek.x) / 2
                const faceCY = (foreheadLm.y + chinLm.y) / 2
                const fh = guide.faceHeightRatio

                // Target scale: bring face to ideal size in frame
                let tScale = 1
                if (fh > 0.08 && fh < AUTOFIT_IDEAL_FACE_HEIGHT * 1.5) {
                  tScale = Math.min(AUTOFIT_MAX_SCALE, Math.max(1, AUTOFIT_IDEAL_FACE_HEIGHT / Math.max(fh, 0.15)))
                }
                // Don't zoom in if face is already large enough
                if (fh >= AUTOFIT_IDEAL_FACE_HEIGHT * 0.9) tScale = Math.max(1, Math.min(tScale, 1.05))

                // Signed offset from center (raw landmark space)
                const rawOffX = faceCX - 0.5     // positive = face right of center in raw
                const rawOffY = faceCY - 0.45    // positive = face below ideal center

                // Apply dead zone to reduce jitter on small movements
                const offX = Math.abs(rawOffX) > AUTOFIT_DEAD_ZONE ? rawOffX : 0
                const offY = Math.abs(rawOffY) > AUTOFIT_DEAD_ZONE ? rawOffY : 0

                // Translate to center the face — scaled by current zoom
                // Raw X maps directly to visual X because CSS mirror cancels
                const tTx = Math.max(-AUTOFIT_MAX_SHIFT, Math.min(AUTOFIT_MAX_SHIFT,
                  offX * 100 * tScale * 0.7))
                const tTy = Math.max(-AUTOFIT_MAX_SHIFT * 0.7, Math.min(AUTOFIT_MAX_SHIFT * 0.7,
                  -offY * 100 * tScale * 0.5))

                // Smooth toward target
                af.scale += (tScale - af.scale) * AUTOFIT_SMOOTHING
                af.tx += (tTx - af.tx) * AUTOFIT_SMOOTHING
                af.ty += (tTy - af.ty) * AUTOFIT_SMOOTHING

                wrapper.style.transform = `scale(${af.scale.toFixed(4)}) translate(${af.tx.toFixed(2)}%, ${af.ty.toFixed(2)}%)`
              }
            }
          }

          if (!faceFirstSeenRef.current) faceFirstSeenRef.current = now
          if (now - faceFirstSeenRef.current > FAILSAFE_MS && phaseRef.current !== 'validated' && phaseRef.current !== 'advancing') {
            setFailsafeActive(true)
          }

          // Phase transitions
          if (phaseRef.current === 'detecting' || phaseRef.current === 'idle') updatePhase('tracking')

          // ── READINESS + COUNTDOWN ────────────────────────────
          // Uses phaseRef/previewRef (not state) to avoid stale closures.
          //
          // ═══ SIDE RULE (RIGHT / LEFT) ═══
          // Single source of truth: a numeric "side score" (0–100).
          //   score > 60 → start 3-second countdown
          //   score stays > 60 for 3 full seconds → auto-capture
          //   score drops to ≤ 60 → cancel countdown immediately
          //   No isSideReady(), no green-state matching, no stability frames.
          //
          // The side score is computed from the sub-scores that matter for
          // side views, EXCLUDING centering (which drops when face is angled).
          // Gate: face must be detected, locked, and at the correct angle.
          //
          // ═══ FRONT RULE ═══
          // Unchanged — uses isFrontReady() + stability frames.
          //
          const isSideStep = mode === 'multi' && multiStep !== 'front'
          const curPhase = phaseRef.current
          const canAct = !previewRef.current && curPhase !== 'validated' && curPhase !== 'advancing'

          if (isSideStep) {
            // ── Compute side score (0–100) ──
            // Only sub-scores relevant for side capture, no centering.
            const qb = guide.qualityBreakdown
            const sideScore = guide.faceDetected && guide.faceLocked && guide.angle === 'ok'
              ? Math.round(
                  (qb.distance * 0.30 +
                   qb.angle * 0.30 +
                   qb.lighting * 0.20 +
                   qb.stability * 0.10 +
                   qb.sharpness * 0.10) * 100
                )
              : 0

            const SIDE_THRESHOLD = 65

            if (sideScore > SIDE_THRESHOLD && canAct) {
              // ABOVE 60 — start or continue countdown
              if (!countdownStartRef.current) {
                countdownStartRef.current = now
                updatePhase('stabilizing')
              }
              const elapsed = now - countdownStartRef.current
              const remaining = Math.ceil((COUNTDOWN_MS - elapsed) / 1000)
              setCountdown(Math.max(0, remaining))
              setValidationProgress(Math.min(1, elapsed / COUNTDOWN_MS))

              if (elapsed >= COUNTDOWN_MS) {
                setCountdown(null)
                triggerAutoAdvance()
              }
            } else if (sideScore <= SIDE_THRESHOLD && canAct) {
              // AT OR BELOW 60 — cancel countdown immediately
              if (countdownStartRef.current || curPhase === 'stabilizing') {
                countdownStartRef.current = null
                setCountdown(null)
                setValidationProgress(0)
                if (curPhase === 'stabilizing') updatePhase('tracking')
              }
            }
          } else {
            // ═══ FRONT CAPTURE: unchanged — isFrontReady + stability frames ═══
            const readyNow = isFrontReady(guide, failsafeActive)

            if (readyNow) {
              stableReadyFrames.current++
            } else {
              stableReadyFrames.current = Math.floor(stableReadyFrames.current * 0.5)
            }

            const requiredStable = failsafeActive ? 4 : FRONT_STABILITY_FRAMES

            if (readyNow && stableReadyFrames.current >= requiredStable && canAct) {
              if (!countdownStartRef.current) {
                countdownStartRef.current = now
                updatePhase('stabilizing')
              }
              const elapsed = now - countdownStartRef.current
              const remaining = Math.ceil((COUNTDOWN_MS - elapsed) / 1000)
              setCountdown(Math.max(0, remaining))
              setValidationProgress(Math.min(1, elapsed / COUNTDOWN_MS))

              if (elapsed >= COUNTDOWN_MS) {
                setCountdown(null)
                triggerAutoAdvance()
              }
            } else if (!readyNow) {
              if (countdownStartRef.current || curPhase === 'stabilizing') {
                countdownStartRef.current = null
                setCountdown(null)
                setValidationProgress(0)
                if (curPhase === 'stabilizing') updatePhase('tracking')
              }
            }
          }

          // Buffer best frames — uses aligned 3:4 capture to match UI
          // Only buffer frames that meet minimum quality for clean results
          const bufferThreshold = isSideStep ? 0.40 : 0.65
          if (guide.qualityScore >= bufferThreshold && !previewRef.current && curPhase !== 'validated' && curPhase !== 'advancing') {
            const cc = captureCanvasRef.current
            if (cc && video.videoWidth > 0) {
              const dataUrl = captureAlignedFrame(video, cc)
              if (dataUrl) {
                frameBufferRef.current.push({ dataUrl, score: computeFrameScore(guide), time: now })
                const cutoff = now - BEST_FRAME_WINDOW_MS
                frameBufferRef.current = frameBufferRef.current.filter((f) => f.time > cutoff).slice(-BEST_FRAME_BUFFER_SIZE)
              }
            }
          }

          // Draw REAL mesh from landmarks — the only visual feedback
          // Pass the shared accent so mesh color matches the bottom bar
          const meshAccent = accentFromQuality(guide.qualityScore)
          const ctx = mc.getContext('2d')
          if (ctx) drawMesh(ctx, smoothed, mc.width, mc.height, guide.allOk, true, false, guide.qualityScore, undefined, meshAccent)
        }
      })
      .catch(() => { processingRef.current = false })

    animFrameRef.current = requestAnimationFrame(processFrame)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- phase/preview/countdown read via refs to avoid stale-closure restarts
  }, [landmarksRef, status.faceLocked, triggerAutoAdvance, mode, multiStep, failsafeActive, updatePhase])

  useEffect(() => {
    if (initState === 'ready' && !preview) {
      animFrameRef.current = requestAnimationFrame(processFrame)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [initState, preview, processFrame])

  // Auto-confirm: in single mode, call onCapture as soon as preview is set
  useEffect(() => {
    if (autoConfirm && mode === 'single' && preview && phase === 'advancing') {
      const q = status.qualityScore
      const meta: CaptureMetadata = {
        confidence: q >= 0.85 ? 'high' : 'medium',
        qualityScore: q,
      }
      onCapture(preview, meta)
    }
  }, [autoConfirm, mode, preview, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Manual capture — requires READY state (same gate as auto-capture).
  // This ensures every captured frame produces a clean result page.
  // The button is disabled until the quality gate criteria are met.
  const isSideStep = mode === 'multi' && multiStep !== 'front'
  const manualCaptureEnabled = isSideStep
    ? isSideReady(status, failsafeActive)
    : isFrontReady(status, failsafeActive)
  const takeSnapshot = () => {
    if (!manualCaptureEnabled) return
    const dataUrl = captureBestFrame()
    if (!dataUrl) return
    setShowFlash(true); setTimeout(() => setShowFlash(false), 350)
    if (mode === 'multi') setMultiPhotos((prev) => ({ ...prev, [multiStep]: dataUrl }))
    updatePreview(dataUrl); updatePhase('advancing')
  }

  const buildMeta = useCallback((): CaptureMetadata => {
    const q = status.qualityScore
    // Since capture gate is strict, captured frames are at least 'medium'
    return {
      confidence: q >= 0.85 ? 'high' : 'medium',
      qualityScore: q,
    }
  }, [status.qualityScore])

  const confirmSingle = () => { if (preview) onCapture(preview, buildMeta()) }

  const confirmMulti = () => {
    if (multiStep === 'front') {
      updatePreview(null); setMultiStep('left'); resetValidation(); updatePhase('detecting')
    } else if (multiStep === 'left') {
      updatePreview(null); setMultiStep('right'); resetValidation(); updatePhase('detecting')
    } else if (multiStep === 'right') {
      // Final step — finalize multi-capture
      const photos = { ...multiPhotos, right: preview! }
      if (onMultiCapture && photos.front && photos.left && photos.right) {
        onMultiCapture({ front: photos.front, left: photos.left, right: photos.right }, buildMeta())
      } else if (photos.front) onCapture(photos.front, buildMeta())
    }
  }

  const retake = () => { updatePreview(null); resetValidation(); updatePhase('detecting') }

  // ─── Render ───────────────────────────────────────────────
  const isMulti = mode === 'multi'
  const currentStepLabel = isMulti ? MULTI_LABELS[multiStep] : null
  const STEP_ORDER: MultiStep[] = ['front', 'left', 'right']
  const stepNumber = STEP_ORDER.indexOf(multiStep) + 1
  const totalSteps = STEP_ORDER.length

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0E0B09 0%, #060609 60%, #030305 100%)',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={brightnessCanvasRef} className="hidden" />

      {/* ═══ SECTION 1: Header ═══════════════════════════════ */}
      <div className="flex-none px-4 pt-3 pb-1 sm:pt-4 sm:pb-2">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-md border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-white/50 hover:text-white hover:bg-[rgba(255,255,255,0.12)] transition-all active:scale-95"
            aria-label="Kapat" type="button"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <span className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(214,185,140,0.5)]">
            Yüz Tarama
          </span>

          {isMulti && !preview ? (
            <div className="flex items-center gap-1">
              {STEP_ORDER.map((s, i) => {
                const isDone = !!multiPhotos[s]
                const isCurrent = s === multiStep
                return (
                  <div key={s} className="flex items-center gap-0.5">
                    <div className={`w-5 h-5 rounded-full text-[9px] font-medium flex items-center justify-center transition-all ${
                      isCurrent ? 'bg-[#C4A35A] text-white' : isDone ? 'bg-[#00905A] text-white' : 'bg-white/8 text-white/30'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    {i < STEP_ORDER.length - 1 && <div className={`w-2 h-px ${isDone ? 'bg-[#00905A]' : 'bg-white/10'}`} />}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10" />
          )}
        </div>
      </div>

      {/* ═══ SECTION 2: Camera preview (flex-1, fills available space) ═══ */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 sm:px-4 pt-2 pb-0.5 sm:pt-4 sm:pb-1">
        <div
          className="relative w-full rounded-[20px] sm:rounded-[28px] overflow-hidden border border-[rgba(214,185,140,0.12)] shadow-[0_0_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(214,185,140,0.05)]"
          style={{ aspectRatio: '3/4', maxWidth: 'min(92vw, 420px)', maxHeight: '100%' }}
        >
          {/* Loading */}
          {initState === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#060609]">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#C4A35A] border-r-[#2D5F5D] animate-spin" />
                <div className="absolute inset-3 rounded-full border border-[rgba(196,163,90,0.12)]" />
              </div>
              <div className="text-center px-4">
                <p className="font-body text-[12px] sm:text-[13px] text-white/60 tracking-wide">AI modeli yükleniyor</p>
                <p className="font-body text-[10px] text-white/25 mt-1">İlk kullanımda biraz sürebilir</p>
              </div>
            </div>
          )}

          {/* Error */}
          {initState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 bg-[#060609]">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[rgba(160,82,82,0.12)] flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#E07070]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="font-body text-[11px] sm:text-[12px] text-white/60 text-center leading-relaxed">{initError}</p>
              <button type="button" onClick={onClose} className="mt-1 font-body text-[10px] tracking-[0.15em] uppercase text-[#C4A35A] hover:text-[#D4B96A] transition-colors">
                Kapat
              </button>
            </div>
          )}

          {/* Live camera + Face Mesh canvas — ALWAYS MOUNTED to keep srcObject attached.
              When preview is shown, these stay in the DOM but are hidden under the preview layer.
              Wrapped in auto-fit div that smoothly zooms/pans to bring face into the oval. */}
          {(initState === 'ready' || initState === 'loading') && (
            <>
              <div
                ref={autoFitWrapperRef}
                className="absolute inset-0"
                style={{ willChange: 'transform', transformOrigin: '50% 43%' }}
              >
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                />
                <canvas
                  ref={meshCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300"
                  style={{ opacity: showMesh ? 1 : 0 }}
                />
              </div>

              {/* Vignette — generous center reveal matching enlarged oval */}
              {!preview && (
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: 'radial-gradient(ellipse 78% 72% at 50% 46%, transparent 38%, rgba(3,3,5,0.25) 55%, rgba(3,3,5,0.65) 75%, rgba(3,3,5,0.88) 100%)',
                }} />
              )}

              {/* Face-placement oval guide — luminous border with breathing glow */}
              {!preview && phase !== 'validated' && phase !== 'advancing' && (
                <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none" style={{ paddingBottom: '1%' }}>
                  <div
                    className="relative"
                    style={{ width: '82%', aspectRatio: '7/10' }}
                  >
                    {/* Outer glow halo — wide diffuse ring */}
                    <div
                      className="absolute rounded-[50%]"
                      style={{
                        inset: '-14px',
                        border: `1px solid rgba(${status.faceDetected ? accentFromQuality(status.qualityScore) : '214,185,140'},0.06)`,
                        boxShadow: `0 0 40px 12px rgba(${status.faceDetected ? accentFromQuality(status.qualityScore) : '214,185,140'},0.06), inset 0 0 40px 12px rgba(${status.faceDetected ? accentFromQuality(status.qualityScore) : '214,185,140'},0.03)`,
                        animation: 'ovalBreathe 4s ease-in-out infinite',
                        transition: 'border-color 0.8s ease, box-shadow 0.8s ease',
                      }}
                    />
                    {/* Main oval ring — stronger, clearly visible */}
                    <div
                      className="absolute inset-0 rounded-[50%]"
                      style={{
                        border: `2px solid rgba(${status.faceDetected ? accentFromQuality(status.qualityScore) : '214,185,140'},${status.faceDetected ? '0.40' : '0.18'})`,
                        boxShadow: status.faceDetected
                          ? `0 0 28px 6px rgba(${accentFromQuality(status.qualityScore)},0.12), inset 0 0 28px 6px rgba(${accentFromQuality(status.qualityScore)},0.06), 0 0 0 1px rgba(${accentFromQuality(status.qualityScore)},0.08)`
                          : '0 0 28px 6px rgba(214,185,140,0.05), inset 0 0 28px 6px rgba(214,185,140,0.03), 0 0 0 1px rgba(214,185,140,0.04)',
                        transition: 'border-color 0.8s ease, box-shadow 0.8s ease',
                      }}
                    />
                    {/* Corner accent marks — top and bottom crosshairs */}
                    {(['top-0 left-1/2 -translate-x-1/2 -translate-y-[1px]', 'bottom-0 left-1/2 -translate-x-1/2 translate-y-[1px]'] as const).map((pos, i) => (
                      <div key={i} className={`absolute ${pos}`}>
                        <div
                          className="w-12 h-[1.5px]"
                          style={{
                            background: `linear-gradient(90deg, transparent, rgba(${status.faceDetected ? accentFromQuality(status.qualityScore) : '214,185,140'},0.35), transparent)`,
                            transition: 'background 0.8s ease',
                          }}
                        />
                      </div>
                    ))}
                    {/* Side accent marks — left and right crosshairs */}
                    {(['top-1/2 left-0 -translate-y-1/2 -translate-x-[1px]', 'top-1/2 right-0 -translate-y-1/2 translate-x-[1px]'] as const).map((pos, i) => (
                      <div key={`side-${i}`} className={`absolute ${pos}`}>
                        <div
                          className="w-[1.5px] h-12"
                          style={{
                            background: `linear-gradient(180deg, transparent, rgba(${status.faceDetected ? accentFromQuality(status.qualityScore) : '214,185,140'},0.35), transparent)`,
                            transition: 'background 0.8s ease',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stabilization ring + countdown number */}
              {!preview && phase === 'stabilizing' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    <svg width="90" height="90" viewBox="0 0 100 100" className="opacity-60">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={`rgba(${accentFromQuality(status.qualityScore)},0.7)`}
                        strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${validationProgress * 264} 264`}
                        transform="rotate(-90 50 50)"
                        style={{ transition: 'stroke-dasharray 0.15s ease-out' }}
                      />
                    </svg>
                    {/* Countdown number — visible for all captures */}
                    {countdown !== null && countdown > 0 && (
                      <span
                        key={countdown}
                        className="absolute font-display text-[38px] sm:text-[44px] font-light tabular-nums"
                        style={{
                          color: `rgba(${accentFromQuality(status.qualityScore)},0.9)`,
                          textShadow: `0 0 24px rgba(${accentFromQuality(status.qualityScore)},0.4)`,
                          animation: 'countdownPop 0.35s ease-out',
                        }}
                      >
                        {countdown}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Validated success */}
              {!preview && (phase === 'validated' || phase === 'advancing') && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-[fadeIn_0.3s_ease]">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[rgba(0,255,180,0.15)] backdrop-blur-md border border-[rgba(0,255,180,0.4)] flex items-center justify-center">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#00FFB4]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Flash */}
              {showFlash && (
                <div className="absolute inset-0 z-30 bg-white animate-[flashFade_0.35s_ease-out_forwards] pointer-events-none" />
              )}

            </>
          )}

          {/* Preview — rendered ON TOP of the always-mounted video, at z-10 */}
          {preview && (
            <div className="absolute inset-0 z-10 animate-[fadeIn_0.5s_ease]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Önizleme" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              {isMulti && (
                <div className="absolute top-3 left-0 right-0 flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md text-[9px] sm:text-[10px] font-medium tracking-[0.15em] uppercase text-white/80">
                    {currentStepLabel} — Adım {stepNumber}/{totalSteps}
                  </span>
                </div>
              )}
              <div className="absolute bottom-3 left-3 right-3 flex justify-center pointer-events-none">
                <span className="px-3.5 py-1.5 rounded-full bg-[rgba(0,255,180,0.15)] backdrop-blur-md border border-[rgba(0,255,180,0.3)] text-[9px] sm:text-[10px] font-medium tracking-[0.1em] uppercase text-[#7CE8B2] whitespace-nowrap">
                  ✓ Çekim tamamlandı
                </span>
              </div>
            </div>
          )}

          {/* ── Quality pill strip — top of frame, compact dots+labels ── */}
          {initState === 'ready' && !preview && phase !== 'validated' && phase !== 'advancing' && (
            <div className="absolute top-2.5 left-2 right-2 z-10">
              <QualityPillStrip scores={{
                distance: status.faceDetected ? status.qualityBreakdown.distance : 0,
                lighting: status.faceDetected ? status.qualityBreakdown.lighting : 0,
                angle: status.faceDetected ? status.qualityBreakdown.angle : 0,
                centering: status.faceDetected ? status.qualityBreakdown.centering : 0,
                sharpness: status.faceDetected ? status.qualityBreakdown.sharpness : 0,
                expression: status.faceDetected ? Math.min(status.qualityBreakdown.stability, status.faceLocked ? 1 : 0.3) : 0,
              }} />
            </div>
          )}

          {/* ── AI Haritası toggle — bottom-left of camera frame ── */}
          {initState === 'ready' && !preview && (
            <button
              type="button"
              onClick={() => setShowMesh((v) => !v)}
              className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all duration-200 active:scale-95"
              style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: `1px solid ${showMesh ? 'rgba(214,185,140,0.15)' : 'rgba(255,255,255,0.08)'}`,
              }}
              aria-label={showMesh ? 'AI Haritasını Gizle' : 'AI Haritasını Göster'}
            >
              <svg className={`w-3 h-3 transition-colors duration-200 ${showMesh ? 'text-[#D6B98C]' : 'text-white/30'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              <span className={`font-body text-[9px] tracking-[0.06em] transition-colors duration-200 ${showMesh ? 'text-white/50' : 'text-white/25'}`}>
                {showMesh ? 'AI Haritası' : 'Harita Kapalı'}
              </span>
            </button>
          )}

        </div>
      </div>

      {/* ── Guidance card — directly below camera preview, tight spacing ── */}
      {initState === 'ready' && !preview && phase !== 'validated' && phase !== 'advancing' && (
        <div className="flex-none flex justify-center px-4 mt-0.5 sm:mt-1">
          <div
            className="flex flex-col items-center gap-1 px-5 sm:px-7 py-2 sm:py-2.5 rounded-[14px] sm:rounded-[16px] max-w-[92%]"
            style={{
              background: 'rgba(10,8,6,0.85)',
              border: '1px solid rgba(214,185,140,0.06)',
            }}
          >
            {isMulti && (
              <span className="text-[9px] font-medium tracking-[0.16em] uppercase text-[#D4B96A]/60">
                {currentStepLabel} — {stepNumber}/{totalSteps}
              </span>
            )}
            <p className={`font-display text-[15px] sm:text-[17px] font-normal text-center leading-[1.35] tracking-[0.01em] transition-colors duration-500 whitespace-pre-line ${
              phase === 'stabilizing' ? 'text-[#D4B96A]'
                : status.faceDetected && status.qualityScore >= 0.5 ? 'text-white/90'
                : 'text-white/60'
            }`}>
              {(() => {
                const isSide = isMulti && multiStep !== 'front'
                // Countdown active (front or side)
                if (countdown !== null && countdown > 0) {
                  return isSide ? 'Harika, burada kalın' : 'Hazır olun…'
                }
                if (phase === 'stabilizing') return 'Harika, sabit kalın…'
                // Side-specific: crow's feet not yet visible
                if (isSide && phase === 'tracking' && status.faceDetected && status.angle === 'ok' && status.crowFeetScore < SIDE_CROW_FEET_THRESHOLD) {
                  return 'Göz kenarını biraz daha gösterin'
                }
                if (phase === 'tracking' && status.faceDetected) return status.mainMessage
                if (phase === 'idle' || phase === 'detecting' || !status.faceDetected) {
                  return isMulti ? MULTI_INSTRUCTIONS[multiStep] : 'Yüzünüzü çerçevenin içinde tutun'
                }
                return status.mainMessage
              })()}
            </p>
            {/* Secondary hint */}
            {(() => {
              const isSide = isMulti && multiStep !== 'front'
              if (countdown !== null && countdown > 0) {
                return <p className="font-body text-[10px] text-[#D4B96A]/40 text-center tracking-wide">Çekim hazırlanıyor</p>
              }
              if (isSide && phase === 'tracking' && status.faceDetected && status.angle === 'ok' && status.crowFeetScore < SIDE_CROW_FEET_THRESHOLD) {
                return <p className="font-body text-[10px] text-white/25 text-center tracking-wide">Kaz ayağı bölgesi görünür olmalı</p>
              }
              if ((phase === 'idle' || phase === 'detecting') && !status.faceDetected) {
                return <p className="font-body text-[10px] text-white/30 text-center tracking-wide">Başınızı dik tutun ve kameraya bakın</p>
              }
              if (phase === 'tracking' && status.faceDetected) {
                return <p className="font-body text-[10px] text-white/22 text-center tracking-wide" key={tipIndex}>{TIPS[tipIndex]}</p>
              }
              return null
            })()}
          </div>
        </div>
      )}

      {/* ═══ SECTION 3: Controls (flex-none, compact) ═══ */}
      <div className="flex-none px-5 pb-3 sm:pb-5 pt-1.5">
        <div className="flex flex-col items-center gap-2">
          {!preview ? (
            <>
              {/* Quality bar + capture button */}
              {phase === 'validated' || phase === 'advancing' ? (
                <p className="font-body text-[11px] text-[#00FFB4] tracking-[0.1em] uppercase py-2">Çekim tamamlandı</p>
              ) : (
                <div className="flex items-center gap-5">
                  {/* Quality bar — left of shutter */}
                  {status.faceDetected && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 sm:w-20 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.round(status.qualityScore * 100)}%`,
                            background: `rgb(${accentFromQuality(status.qualityScore)})`,
                          }}
                        />
                      </div>
                      <span
                        className="font-mono text-[10px] tabular-nums w-6 transition-colors duration-500"
                        style={{ color: `rgba(${accentFromQuality(status.qualityScore)},0.55)` }}
                      >
                        {Math.round(status.qualityScore * 100)}
                      </span>
                    </div>
                  )}

                  {/* Shutter button */}
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    disabled={!manualCaptureEnabled}
                    className="group relative disabled:opacity-25 disabled:cursor-not-allowed flex-shrink-0"
                    aria-label="Fotoğraf çek"
                  >
                    <div className={`w-[62px] h-[62px] sm:w-[72px] sm:h-[72px] rounded-full border-[2.5px] transition-all duration-500 flex items-center justify-center ${
                      manualCaptureEnabled
                        ? 'border-[rgba(0,255,180,0.4)] shadow-[0_0_16px_rgba(0,255,180,0.12)]'
                        : 'border-[rgba(255,255,255,0.08)]'
                    }`}>
                      <div className="w-[50px] h-[50px] sm:w-[58px] sm:h-[58px] rounded-full bg-[rgba(255,255,255,0.12)] group-hover:bg-[rgba(255,255,255,0.22)] group-active:scale-90 transition-all duration-300 group-disabled:bg-[rgba(255,255,255,0.04)]" />
                    </div>
                  </button>

                  {/* Status hint — right of shutter */}
                  <div className="w-[76px] sm:w-[86px]">
                    <p className="font-body text-[9px] text-white/20 tracking-[0.08em] uppercase leading-tight text-center">
                      {manualCaptureEnabled ? 'Manuel çekim' : phase === 'stabilizing' ? 'Doğrulanıyor…' : 'Otomatik çekim'}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ─── Preview action buttons ─── */
            <div className="flex flex-col gap-2.5 w-full max-w-[300px] sm:max-w-xs">
              <button
                type="button"
                onClick={isMulti ? confirmMulti : confirmSingle}
                className="w-full font-body text-[12px] font-medium tracking-[0.1em] uppercase py-3 sm:py-3.5 rounded-[14px] bg-gradient-to-br from-[#00905A] to-[#00B864] text-white hover:shadow-[0_4px_24px_rgba(0,184,100,0.35)] transition-all active:scale-[0.98]"
              >
                {isMulti
                  ? multiStep === 'right' ? 'Analizi Başlat'
                    : 'Sonraki Açı'
                  : 'Bu Fotoğrafı Kullan'}
              </button>
              <button
                type="button"
                onClick={retake}
                className="w-full font-body text-[11px] font-medium tracking-[0.1em] uppercase py-2.5 sm:py-3 rounded-[12px] border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all active:scale-[0.98]"
              >
                Yeniden Çek
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
