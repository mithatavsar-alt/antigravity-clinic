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
import {
  computeFaceContour,
  drawFaceContour,
  drawDynamicVignette,
  drawContourAccents,
  resetContourSmoothing,
} from '@/lib/ai/face-contour'

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

// ─── ANGLE-SPECIFIC READINESS ──────────────────────────────
// 6 checks aligned with the visible quality pills:
//   1. Distance  (Mesafe)  — face size / proximity
//   2. Lighting  (Işık)    — brightness & shadow
//   3. Angle     (Açı)     — head pose for current step
//   4. Centering (Konum)   — face position in frame
//   5. Sharpness (Netlik)  — image clarity
//   6. Stability (İfade)   — landmark consistency / expression
//
// Hard blockers reject immediately (no face, too far, outside frame,
// unreadable blur, completely wrong pose for the current step).
//
// FRONT VIEW:  strict — all 6/6 soft checks must pass.
// LEFT/RIGHT:  tolerant — 5/6 soft checks, so one marginal metric
//              (e.g. stability after head turn) doesn't stall capture.
//              Wrong pose direction is still a hard blocker.

/** Hard-blocker floors — below these, capture is unsafe */
const HARD_MIN_DISTANCE   = 0.25
const HARD_MIN_CENTERING  = 0.15
const HARD_MIN_SHARPNESS  = 0.15

/** Minimum ready frames before countdown starts (prevents single-frame triggers) */
const STABILITY_FRAMES_REQUIRED = 4

/** Soft checks required: front must pass all 6, sides need 5 of 6 */
const MIN_PASSING_FRONT = 6
const MIN_PASSING_SIDE  = 5

/** Crow's feet visibility threshold for side captures */
const SIDE_CROW_FEET_THRESHOLD = 0.35

function isReadyForCapture(
  status: FaceGuideStatus,
  isSide: boolean,
  relaxed = false,
): boolean {
  // ── Hard blockers — always reject (all steps) ──
  if (!status.faceDetected) return false
  if (!status.faceLocked) return false

  const qb = status.qualityBreakdown

  // Face too small / too far
  if (qb.distance < HARD_MIN_DISTANCE) return false
  // Face completely outside frame
  if (qb.centering < HARD_MIN_CENTERING) return false
  // Image unreadable
  if (qb.sharpness < HARD_MIN_SHARPNESS) return false
  // Wrong pose direction: side requires 'ok' (correct yaw for left/right);
  // front rejects hard turns (angle score near zero).
  // This is a hard blocker — wrong-angle capture is never allowed.
  if (isSide && status.angle !== 'ok') return false
  if (!isSide && qb.angle < 0.25) return false

  // ── 6 soft checks — counted individually ──
  // 1. Distance   2. Lighting   3. Angle
  // 4. Centering  5. Sharpness  6. Stability
  const t = relaxed
    ? (isSide ? 0.28 : 0.38)
    : (isSide ? 0.38 : 0.48)

  let passing = 0
  if (qb.distance  >= t) passing++                         // 1. Distance
  if (qb.lighting  >= t) passing++                         // 2. Lighting
  if (qb.angle     >= t) passing++                         // 3. Angle
  // Side poses naturally de-center — use a relaxed centering threshold
  if (qb.centering >= (isSide ? t * 0.6 : t)) passing++   // 4. Centering
  if (qb.sharpness >= t) passing++                         // 5. Sharpness
  // Side poses have volatile stability after head turn — relax
  if (qb.stability >= (isSide ? t * 0.5 : t)) passing++   // 6. Stability

  // Front: strict 6/6 — all checks must pass
  // Left/Right: tolerant 5/6 — one marginal check won't stall capture
  const required = isSide ? MIN_PASSING_SIDE : MIN_PASSING_FRONT
  return passing >= required
}

// ─── MANUAL CAPTURE ELIGIBILITY (separate from auto) ───────
// More lenient than auto-capture — acts as a reliable fallback.
//
// FRONT:  score >= 75 + hard blockers only (no 6/6 soft-check gate)
// SIDE:   score >= 65 + hard blockers only (no strict angle match)
//
// Hard blockers for manual: no face, face too small, face outside
// frame, image unreadable (blur). Extreme wrong-angle for front only.

const MANUAL_THRESHOLD_FRONT = 0.75
const MANUAL_THRESHOLD_SIDE  = 0.65

function isManualCaptureEligible(
  status: FaceGuideStatus,
  isSide: boolean,
): boolean {
  // ── Hard blockers — always reject ──
  if (!status.faceDetected) return false
  if (!status.faceLocked) return false

  const qb = status.qualityBreakdown

  // Face too small / too far
  if (qb.distance < HARD_MIN_DISTANCE) return false
  // Face completely outside frame
  if (qb.centering < HARD_MIN_CENTERING) return false
  // Image unreadable
  if (qb.sharpness < HARD_MIN_SHARPNESS) return false

  // Front only: reject extreme wrong angles (looking sideways)
  // but NOT as strict as auto-capture's qb.angle < 0.25
  if (!isSide && qb.angle < 0.15) return false

  // Side views: NO strict angle match required for manual.
  // The user is responsible for framing; we only block unusable frames.

  // Score threshold — the live qualityScore is the gate
  const threshold = isSide ? MANUAL_THRESHOLD_SIDE : MANUAL_THRESHOLD_FRONT
  return status.qualityScore >= threshold
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
 *
 * Premium med-tech violet palette:
 *   fail (< 0.5)       → muted warm purple (160,105,185)
 *   borderline (0.5–0.8) → refined violet  (145,115,215)
 *   accepted (≥ 0.8)   → electric violet   (135,130,240)
 */
export function accentFromQuality(q: number): string {
  if (q >= 0.8) return '135,130,240'
  if (q >= 0.5) {
    const t = (q - 0.5) / 0.3
    return `${Math.round(145 - 10 * t)},${Math.round(115 + 15 * t)},${Math.round(215 + 25 * t)}`
  }
  const t = q / 0.5
  return `${Math.round(160 - 15 * t)},${Math.round(105 + 10 * t)},${Math.round(185 + 30 * t)}`
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
  /** When false, skip inner tesselation mesh (contour + features still draw) */
  showTesselation = true,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.save()

  const toX = (lm: Landmark) => mirror ? (1 - lm.x) * w : lm.x * w
  const toY = (lm: Landmark) => lm.y * h

  // Shared dynamic accent — drives ALL mesh colors
  const accent = accentRgb ?? accentFromQuality(qualityScore)

  // Tier-based opacity: mesh gets brighter as quality improves
  const baseOpacity = 0.30 + qualityScore * 0.40  // range 0.30–0.70

  // ── Wireframe contour drawing helper (clean, no glow) ──
  const drawContour = (
    indices: number[],
    color: string,
    opacity: number,
    lineW: number,
  ) => {
    ctx.beginPath()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = lineW
    ctx.strokeStyle = `${color}${Math.min(1, opacity * baseOpacity).toFixed(3)})`
    let started = false
    for (const idx of indices) {
      const lm = landmarks[idx]
      if (!lm) continue
      if (!started) { ctx.moveTo(toX(lm), toY(lm)); started = true }
      else ctx.lineTo(toX(lm), toY(lm))
    }
    ctx.stroke()
  }

  // ════════════════════════════════════════════════════════════
  // FULL TRIANGULATED WIREFRAME MESH — 1348 edges, 880 triangles,
  // all 468 vertices. Dense geometric facial mapping overlay.
  // Clean anti-aliased lines, no glow, premium med-tech look.
  // Naturally denser around eyes/nose/mouth (more triangles there).
  // PURELY VISUAL — does NOT affect analysis.
  // ════════════════════════════════════════════════════════════
  if (showTesselation) {
    const meshAlpha = Math.min(0.35, 0.10 + qualityScore * 0.25)
    ctx.beginPath()
    ctx.lineWidth = 0.35
    ctx.strokeStyle = `rgba(${accent},${meshAlpha.toFixed(3)})`
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const [a, b] of FACEMESH_TESSELATION) {
      const la = landmarks[a], lb = landmarks[b]
      if (!la || !lb) continue
      ctx.moveTo(toX(la), toY(la))
      ctx.lineTo(toX(lb), toY(lb))
    }
    ctx.stroke()
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE CONTOURS — slightly brighter wireframe for key regions.
  // The full mesh already provides dense detail in these areas;
  // these contours reinforce boundaries at slightly higher opacity.
  // ════════════════════════════════════════════════════════════
  drawContour(JAWLINE, `rgba(${accent},`, 0.55, 0.7)
  drawContour(LEFT_EYE, `rgba(${accent},`, 0.70, 0.8)
  drawContour(RIGHT_EYE, `rgba(${accent},`, 0.70, 0.8)
  drawContour(LEFT_EYEBROW, `rgba(${accent},`, 0.55, 0.6)
  drawContour(RIGHT_EYEBROW, `rgba(${accent},`, 0.55, 0.6)
  drawContour(NOSE_BRIDGE, `rgba(${accent},`, 0.60, 0.7)
  drawContour(UPPER_LIP, `rgba(${accent},`, 0.55, 0.6)
  drawContour(LOWER_LIP, `rgba(${accent},`, 0.55, 0.6)

  // ════════════════════════════════════════════════════════════
  // ANCHOR DOTS — key landmarks as small geometric vertex points
  // Minimal, refined — just enough to mark structural nodes.
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
    // Accent dot — small, clean
    ctx.fillStyle = `rgba(${accent},${(0.55 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill()
    // Bright core
    ctx.fillStyle = `rgba(255,255,255,${(0.50 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 0.6, 0, Math.PI * 2); ctx.fill()
  }

  // ════════════════════════════════════════════════════════════
  // DETECTED REGION HIGHLIGHTS — very subtle, wireframe-compatible
  // No highlight = no detection. Never creates false heatmaps.
  // ════════════════════════════════════════════════════════════
  if (detectedRegions && detectedRegions.length > 0) {
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

      let cx = 0, cy = 0, count = 0
      for (const idx of centerLandmarks) {
        const lm = landmarks[idx]
        if (!lm) continue
        cx += toX(lm); cy += toY(lm); count++
      }
      if (count === 0) continue
      cx /= count; cy /= count

      // Extremely subtle — just enough to hint at detection
      const intensity = Math.min(0.04, (region.score / 100) * 0.05)
      const radius = Math.max(w, h) * 0.05

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      grad.addColorStop(0, `rgba(${accent},${intensity.toFixed(3)})`)
      grad.addColorStop(1, `rgba(${accent},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
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

  // ── Grace frames: tolerate brief dips during countdown ──
  // Allows up to 3 consecutive non-ready frames before resetting.
  // Prevents micro-tremor dips from killing a valid countdown.
  const dipFramesRef = useRef(0)
  const MAX_DIP_FRAMES = 3

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
    dipFramesRef.current = 0
    setCountdown(null)
    updatePhase('idle')
    setValidationProgress(0)
    setFailsafeActive(false)
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    resetSmoothing(); resetStability(); resetFaceLock(); resetContourSmoothing()
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

          // ── READINESS + COUNTDOWN (angle-specific rule) ──────
          // Front: hard blockers + 6/6 soft checks (strict)
          // Left/Right: hard blockers + 5/6 soft checks (tolerant)
          //   1. isReadyForCapture() checks hard blockers + step-aware soft gate
          //   2. Accumulate STABILITY_FRAMES_REQUIRED consecutive ready frames
          //   3. Start 3-second countdown
          //   4. Grace: up to 3 dip frames tolerated during countdown
          //   5. Auto-capture when countdown completes
          const isSideStep = mode === 'multi' && multiStep !== 'front'
          const curPhase = phaseRef.current
          const canAct = !previewRef.current && curPhase !== 'validated' && curPhase !== 'advancing'

          const readyNow = isReadyForCapture(guide, isSideStep, failsafeActive)

          if (readyNow) {
            stableReadyFrames.current++
          } else {
            stableReadyFrames.current = Math.max(0, stableReadyFrames.current - 2)
          }

          const requiredStable = failsafeActive ? 2 : STABILITY_FRAMES_REQUIRED

          if (readyNow && stableReadyFrames.current >= requiredStable && canAct) {
            // Ready — start or continue countdown, reset dip counter
            dipFramesRef.current = 0
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
          } else if (!readyNow && canAct) {
            // Not ready — grace window during active countdown
            if (countdownStartRef.current) {
              dipFramesRef.current++
              if (dipFramesRef.current > MAX_DIP_FRAMES) {
                // Too many dip frames — hard reset
                countdownStartRef.current = null
                dipFramesRef.current = 0
                setCountdown(null)
                setValidationProgress(0)
                if (curPhase === 'stabilizing') updatePhase('tracking')
              }
              // else: within grace window, keep countdown running
            } else if (curPhase === 'stabilizing') {
              updatePhase('tracking')
            }
          }

          // Buffer best frames — uses aligned 3:4 capture to match UI
          // Only buffer frames that meet minimum quality for clean results
          const bufferThreshold = isSideStep ? 0.30 : 0.50
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

          // Draw REAL mesh + dynamic face contour — unified on one canvas
          const meshAccent = accentFromQuality(guide.qualityScore)
          const ctx = mc.getContext('2d')
          if (ctx) {
            drawMesh(ctx, smoothed, mc.width, mc.height, guide.allOk, true, false, guide.qualityScore, undefined, meshAccent, showMesh)
            // Dynamic face contour — follows real face, replaces fixed oval
            const contour = computeFaceContour(smoothed, mc.width, mc.height, true)
            if (contour.valid) {
              drawDynamicVignette(ctx, contour, mc.width, mc.height, 0.65)
              drawFaceContour(ctx, contour, meshAccent, guide.qualityScore)
              drawContourAccents(ctx, contour, meshAccent, guide.qualityScore)
            }
          }
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

  // Manual capture — separate, more lenient eligibility (score-based fallback).
  // Auto-capture uses isReadyForCapture() with strict 6/6 / 5/6 soft-check gates.
  // Manual uses isManualCaptureEligible() with score thresholds (75 front, 65 side).
  const isSideStep = mode === 'multi' && multiStep !== 'front'
  const manualCaptureEnabled = isManualCaptureEligible(status, isSideStep)
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
      className="fixed inset-0 z-50 flex flex-col select-none overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0E0B09 0%, #060609 60%, #030305 100%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={brightnessCanvasRef} className="hidden" />

      {/* ═══ SECTION 1: Header ═══════════════════════════════ */}
      <div className="flex-none px-4 pt-3 pb-2 sm:pt-4 sm:pb-2">
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
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 sm:px-4 pt-2 pb-2 sm:pt-4 sm:pb-2">
        <div
          className="relative w-full rounded-[20px] sm:rounded-[28px] overflow-hidden border border-[rgba(214,185,140,0.12)] shadow-[0_0_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(214,185,140,0.05)]"
          style={{ aspectRatio: '3/4', maxWidth: 'min(92vw, 420px)', maxHeight: 'min(100%, 62dvh)' }}
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
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>

              {/* ── Initial face guide — shown only before face is detected ──
                  Once the face is detected, the dynamic canvas contour takes over.
                  This CSS oval is purely an initial positioning hint. */}
              {!preview && !status.faceDetected && phase !== 'validated' && phase !== 'advancing' && (
                <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none" style={{ paddingBottom: '1%' }}>
                  {/* Static vignette for initial state */}
                  <div className="absolute inset-0" style={{
                    background: 'radial-gradient(ellipse 70% 65% at 50% 46%, transparent 35%, rgba(3,3,5,0.30) 55%, rgba(3,3,5,0.70) 75%, rgba(3,3,5,0.90) 100%)',
                  }} />
                  <div
                    className="relative"
                    style={{ width: '72%', aspectRatio: '7/10' }}
                  >
                    {/* Soft hint oval — fades to nothing once face is found */}
                    <div
                      className="absolute inset-0 rounded-[50%]"
                      style={{
                        border: '1.5px solid rgba(214,185,140,0.14)',
                        boxShadow: '0 0 28px 6px rgba(214,185,140,0.04), inset 0 0 28px 6px rgba(214,185,140,0.02)',
                        animation: 'ovalBreathe 4s ease-in-out infinite',
                      }}
                    />
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

      {/* ── Guidance card — below camera preview ── */}
      {initState === 'ready' && !preview && phase !== 'validated' && phase !== 'advancing' && (
        <div className="flex-none flex justify-center px-4 mt-2 sm:mt-2.5">
          <div
            className="flex flex-col items-center gap-1 px-5 sm:px-7 py-2.5 sm:py-3 rounded-[14px] sm:rounded-[16px] max-w-[92%]"
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

      {/* ═══ SECTION 3: Controls (flex-none) ═══ */}
      <div className="flex-none px-5 pb-5 sm:pb-6 pt-2 sm:pt-3">
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

                  {/* Shutter button — enabled at score threshold (75 front / 65 side) */}
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    disabled={!manualCaptureEnabled}
                    className="group relative flex-shrink-0 transition-opacity duration-300"
                    style={{ opacity: manualCaptureEnabled ? 1 : 0.25 }}
                    aria-label="Fotoğraf çek"
                  >
                    <div className={`w-[62px] h-[62px] sm:w-[72px] sm:h-[72px] rounded-full border-[2.5px] transition-all duration-500 flex items-center justify-center ${
                      manualCaptureEnabled
                        ? 'border-[rgba(0,255,180,0.45)] shadow-[0_0_20px_rgba(0,255,180,0.15)]'
                        : 'border-[rgba(255,255,255,0.08)]'
                    }`}>
                      <div className={`w-[50px] h-[50px] sm:w-[58px] sm:h-[58px] rounded-full transition-all duration-300 ${
                        manualCaptureEnabled
                          ? 'bg-[rgba(0,255,180,0.12)] group-hover:bg-[rgba(0,255,180,0.22)] group-active:scale-90'
                          : 'bg-[rgba(255,255,255,0.04)]'
                      }`} />
                    </div>
                  </button>

                  {/* Status hint — right of shutter */}
                  <div className="w-[76px] sm:w-[86px]">
                    {manualCaptureEnabled ? (
                      <p className="font-body text-[9px] text-[rgba(0,255,180,0.5)] tracking-[0.08em] uppercase leading-tight text-center">
                        Manuel çekim
                      </p>
                    ) : status.faceDetected ? (
                      <p className="font-body text-[9px] text-white/20 tracking-[0.08em] uppercase leading-tight text-center">
                        {phase === 'stabilizing' ? 'Doğrulanıyor…' : `Skor ${isSideStep ? '65' : '75'}+`}
                      </p>
                    ) : (
                      <p className="font-body text-[9px] text-white/15 tracking-[0.08em] uppercase leading-tight text-center">
                        Otomatik çekim
                      </p>
                    )}
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
