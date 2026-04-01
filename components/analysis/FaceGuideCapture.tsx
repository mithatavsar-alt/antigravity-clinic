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

// ─── Types ──────────────────────────────────────────────────
export type CaptureMode = 'single' | 'multi'
export type MultiStep = 'front' | 'left' | 'right' | 'mimic'

export interface CaptureMetadata {
  confidence: 'high' | 'medium' | 'low'
  qualityScore: number
}

export interface MultiCaptureResult {
  front: string
  left: string
  right: string
  mimicFrames?: string[]
}

interface FaceGuideCaptureProps {
  onCapture: (dataUrl: string, meta?: CaptureMetadata) => void
  onClose: () => void
  mode?: CaptureMode
  autoConfirm?: boolean
  onMultiCapture?: (photos: MultiCaptureResult, meta?: CaptureMetadata) => void
}

// ─── Mimic sequence expressions ─────────────────────────────
const MIMIC_EXPRESSIONS = [
  { key: 'neutral', label: 'Nötr İfade', instruction: 'Rahat ve nötr bir ifade yapın', durationMs: 2500 },
  { key: 'smile', label: 'Hafif Gülümseme', instruction: 'Hafifçe gülümseyin', durationMs: 2500 },
  { key: 'squint', label: 'Göz Kısma', instruction: 'Gözlerinizi hafifçe kısın', durationMs: 2500 },
  { key: 'relaxed', label: 'Rahat', instruction: 'Dudaklarınızı kapalı tutun, rahat bırakın', durationMs: 2500 },
] as const

type InitState = 'loading' | 'ready' | 'error'

/**
 * Validation state machine — purely Face Mesh driven.
 *  idle → detecting → tracking → stabilizing → validated → advancing
 */
type ValidationPhase = 'idle' | 'detecting' | 'tracking' | 'stabilizing' | 'validated' | 'advancing'

// ─── Constants ──────────────────────────────────────────────
const AUTO_CAPTURE_QUALITY_THRESHOLD = 0.85
const VALIDATION_HOLD_MS = 1400
const ADVANCE_DELAY_MS = 600
const FAILSAFE_MS = 10000
const BEST_FRAME_BUFFER_SIZE = 20
const BEST_FRAME_WINDOW_MS = 3000
const STABILITY_FRAMES_REQUIRED = 10

// ─── Strict READY gate ─────────────────────────────────────
// Capture is only allowed when ALL of these conditions are met simultaneously.
// When `relaxed` is true (failsafe after extended wait), thresholds are lowered.
function isReadyForCapture(status: FaceGuideStatus, relaxed = false): boolean {
  const { qualityBreakdown: qb } = status
  const qThresh = relaxed ? 0.65 : AUTO_CAPTURE_QUALITY_THRESHOLD
  const subThresh = relaxed ? 0.35 : 0.50
  const alignThresh = relaxed ? 0.40 : 0.55
  return (
    status.faceDetected &&
    status.allOk &&
    status.faceLocked &&
    qb.distance >= (relaxed ? 0.40 : 0.55) &&
    qb.alignment >= alignThresh &&
    qb.lighting >= subThresh &&
    qb.sharpness >= subThresh &&
    qb.stability >= (relaxed ? 0.30 : 0.50) &&
    status.qualityScore >= qThresh
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
  left: 'Sol Açı',
  right: 'Sağ Açı',
  mimic: 'Mimik Tarama',
}
const MULTI_INSTRUCTIONS: Record<MultiStep, string> = {
  front: 'Düz bakın — nötr ifade',
  left: 'Yüzünüzü hafifçe sola çevirin',
  right: 'Yüzünüzü hafifçe sağa çevirin',
  mimic: 'Yönergeleri takip edin',
}

// ─── Badge component ────────────────────────────────────────
const BADGE_LABELS: Record<string, Record<string, string>> = {
  lighting: { ok: 'Işık', too_dark: 'Karanlık', too_bright: 'Parlak', shadow: 'Gölge' },
  angle: { ok: 'Açı', tilt: 'Eğik', look_left: 'Sola', look_right: 'Sağa', look_up: 'Yukarı', look_down: 'Aşağı' },
  distance: { ok: 'Mesafe', too_close: 'Yakın', too_far: 'Uzak' },
  forehead: { ok: 'Alın', hidden: 'Alın Gizli' },
}

function Badge({ category, value }: { category: string; value: string }) {
  const label = BADGE_LABELS[category]?.[value] ?? value
  const isOk = value === 'ok'
  const isWarn = value === 'tilt' || value === 'too_dark' || value === 'too_bright' || value === 'shadow' || value === 'look_up' || value === 'look_down'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-medium tracking-[0.12em] uppercase border backdrop-blur-xl transition-all duration-500 ${
        isOk
          ? 'bg-[rgba(0,180,100,0.12)] text-[#7CE8B2] border-[rgba(0,180,100,0.2)]'
          : isWarn
            ? 'bg-[rgba(196,163,90,0.12)] text-[#D4B96A] border-[rgba(196,163,90,0.2)]'
            : 'bg-[rgba(160,82,82,0.1)] text-[#D89090] border-[rgba(160,82,82,0.15)]'
      }`}
    >
      <span className={`w-1 h-1 rounded-full ${isOk ? 'bg-[#00DC82]' : isWarn ? 'bg-[#C4A35A]' : 'bg-[#A05252]'}`} />
      {label}
    </span>
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
) {
  ctx.clearRect(0, 0, w, h)
  ctx.save()

  const toX = (lm: Landmark) => mirror ? (1 - lm.x) * w : lm.x * w
  const toY = (lm: Landmark) => lm.y * h

  // Tier-based opacity: mesh gets brighter as quality improves
  const baseOpacity = 0.25 + qualityScore * 0.45  // range 0.25–0.70

  // Color palette — quality-responsive
  const isHigh = qualityScore >= 0.8
  const gold = {
    stroke: isHigh ? 'rgba(150,210,160,' : 'rgba(201,169,110,',
    glow:   isHigh ? 'rgba(150,210,160,' : 'rgba(201,169,110,',
  }
  const purple = {
    line:  'rgba(155,143,168,',
    glow:  'rgba(140,115,185,',
    dot:   'rgba(170,150,200,',
  }

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
  // OUTER CONTOURS — gold face oval + jawline (from real landmarks)
  // ════════════════════════════════════════════════════════════
  drawContour(FACE_OVAL, gold.stroke, 0.85, 1.8, gold.glow, 16)
  drawContour(JAWLINE, gold.stroke, 0.65, 1.5, gold.glow, 12)

  // ════════════════════════════════════════════════════════════
  // INNER FEATURES — purple AI contours (eyes, brows, nose, lips)
  // ════════════════════════════════════════════════════════════
  drawContour(LEFT_EYE, purple.line, 0.9, 1.5, purple.glow, 10)
  drawContour(RIGHT_EYE, purple.line, 0.9, 1.5, purple.glow, 10)
  drawContour(LEFT_EYEBROW, purple.line, 0.65, 1.2, purple.glow, 7)
  drawContour(RIGHT_EYEBROW, purple.line, 0.65, 1.2, purple.glow, 7)
  drawContour(NOSE_BRIDGE, purple.line, 0.7, 1.3, purple.glow, 8)
  drawContour(UPPER_LIP, purple.line, 0.6, 1.1, null, 0)
  drawContour(LOWER_LIP, purple.line, 0.6, 1.1, null, 0)

  // ════════════════════════════════════════════════════════════
  // TRIANGULATED MESH — premium medical-grade overlay
  // Denser in forehead, glabella, and periorbital zones.
  // Very thin lines that don't obscure skin texture.
  // PURELY VISUAL — does NOT affect analysis scores.
  // ════════════════════════════════════════════════════════════
  const drawLink = (a: number, b: number, opacity: number, lineW: number, glowBlur = 0) => {
    const la = landmarks[a], lb = landmarks[b]
    if (!la || !lb) return
    ctx.beginPath()
    ctx.lineWidth = lineW
    ctx.strokeStyle = `${gold.stroke}${(opacity * baseOpacity).toFixed(3)})`
    if (glowBlur > 0) {
      ctx.shadowColor = `${gold.glow}${(0.12 * baseOpacity).toFixed(3)})`
      ctx.shadowBlur = glowBlur
    }
    ctx.moveTo(toX(la), toY(la))
    ctx.lineTo(toX(lb), toY(lb))
    ctx.stroke()
    if (glowBlur > 0) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0 }
  }

  // Forehead mesh — dense horizontal + vertical + cross (premium scanning feel)
  const foreheadH: [number, number][] = [
    [54, 103], [103, 67], [67, 109], [109, 10], [10, 338], [338, 297], [297, 332], [332, 284],
    [63, 105], [105, 66], [66, 107], [107, 9], [9, 336], [336, 296], [296, 334], [334, 293],
  ]
  const foreheadV: [number, number][] = [
    [54, 63], [103, 105], [67, 66], [109, 107], [10, 9], [338, 336], [297, 296], [332, 334], [284, 293],
  ]
  const foreheadX: [number, number][] = [
    [54, 105], [103, 66], [67, 107], [109, 9], [10, 336], [338, 296], [297, 334], [332, 293],
  ]
  // Glabella mesh — vertical guide lines between brows
  const glabellaMesh: [number, number][] = [
    [55, 8], [8, 285], [66, 9], [9, 296], [107, 151], [151, 336],
    [65, 55], [55, 285], [285, 295],
  ]
  // Periorbital mesh — radial connections around eye areas
  const periorbitalMesh: [number, number][] = [
    [130, 247], [247, 30], [30, 29], [29, 27], [27, 28], [28, 56],
    [359, 467], [467, 260], [260, 259], [259, 257], [257, 258], [258, 286],
    [111, 117], [117, 118], [118, 119], [119, 120], [120, 121],
    [340, 346], [346, 347], [347, 348], [348, 349], [349, 350],
  ]
  // Midface + nose radial mesh — sparse, elegant
  const midfaceMesh: [number, number][] = [
    [234, 93], [93, 132], [132, 58], [454, 323], [323, 361], [361, 288],
    [168, 107], [168, 336], [168, 55], [168, 285],
    [1, 33], [1, 263], [1, 61], [1, 291],
  ]
  // Draw each mesh zone — forehead densest, midface sparsest
  for (const [a, b] of foreheadH) drawLink(a, b, 0.28, 0.5, 4)
  for (const [a, b] of foreheadV) drawLink(a, b, 0.22, 0.4, 3)
  for (const [a, b] of foreheadX) drawLink(a, b, 0.15, 0.35, 2)
  for (const [a, b] of glabellaMesh) drawLink(a, b, 0.22, 0.45, 3)
  for (const [a, b] of periorbitalMesh) drawLink(a, b, 0.20, 0.4, 3)
  for (const [a, b] of midfaceMesh) drawLink(a, b, 0.12, 0.3, 0)

  // Mesh node dots — tiny points at mesh intersections
  const meshNodes = [103, 67, 109, 10, 338, 297, 332, 105, 66, 107, 9, 336, 296, 334, 8, 151, 55, 285, 168]
  for (const idx of meshNodes) {
    const lm = landmarks[idx]
    if (!lm) continue
    ctx.fillStyle = `${gold.stroke}${(0.18 * baseOpacity).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(toX(lm), toY(lm), 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // ════════════════════════════════════════════════════════════
  // ANCHOR DOTS — key landmarks as small glowing points
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
    ctx.shadowColor = `${purple.glow}${(0.4 * baseOpacity).toFixed(3)})`
    ctx.shadowBlur = 8
    ctx.fillStyle = `${purple.dot}${(0.5 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 2.0, 0, Math.PI * 2); ctx.fill()
    // White core
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
    ctx.fillStyle = `rgba(255,255,255,${(0.6 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill()
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
      grad.addColorStop(0, `rgba(220,170,100,${intensity.toFixed(3)})`)
      grad.addColorStop(0.6, `rgba(220,170,100,${(intensity * 0.4).toFixed(3)})`)
      grad.addColorStop(1, 'rgba(220,170,100,0)')
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
      if (isHigh) {
        ambientGrad.addColorStop(0, `rgba(150,210,160,${glowAlpha})`)
        ambientGrad.addColorStop(0.6, `rgba(150,210,160,${(parseFloat(glowAlpha) * 0.4).toFixed(3)})`)
        ambientGrad.addColorStop(1, 'rgba(150,210,160,0)')
      } else {
        ambientGrad.addColorStop(0, `rgba(201,169,110,${glowAlpha})`)
        ambientGrad.addColorStop(0.6, `rgba(201,169,110,${(parseFloat(glowAlpha) * 0.4).toFixed(3)})`)
        ambientGrad.addColorStop(1, 'rgba(201,169,110,0)')
      }
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
  return qb.distance * 0.30 + qb.alignment * 0.25 + qb.sharpness * 0.20 + qb.lighting * 0.15 + qb.stability * 0.10
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
  const [mimicFrames, setMimicFrames] = useState<string[]>([])
  const [mimicExprIndex, setMimicExprIndex] = useState(0)
  const [mimicActive, setMimicActive] = useState(false)
  const mimicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rotating tips
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000)
    return () => clearInterval(interval)
  }, [])

  // ─── Mimic sequence: auto-cycle expressions and capture frames ──
  useEffect(() => {
    if (multiStep !== 'mimic' || !mimicActive || preview) return
    if (mimicExprIndex >= MIMIC_EXPRESSIONS.length) return

    const expr = MIMIC_EXPRESSIONS[mimicExprIndex]

    mimicTimerRef.current = setTimeout(() => {
      // Capture current frame for this expression
      const video = videoRef.current
      const canvas = captureCanvasRef.current
      if (video && canvas) {
        const frame = captureAlignedFrame(video, canvas)
        if (frame) {
          setMimicFrames(prev => [...prev, frame])
        }
      }

      // Advance to next expression
      const nextIdx = mimicExprIndex + 1
      if (nextIdx >= MIMIC_EXPRESSIONS.length) {
        // All expressions captured — mimic sequence complete
        setMimicActive(false)
        setPhase('validated')
        setShowFlash(true)
        setTimeout(() => setShowFlash(false), 350)
        // Build final result
        setTimeout(() => {
          setPhase('advancing')
          // Trigger completion — mimic frames are stored in state
          setPreview(multiPhotos.front ?? '') // Show front photo as preview
        }, ADVANCE_DELAY_MS)
      } else {
        setMimicExprIndex(nextIdx)
      }
    }, expr.durationMs)

    return () => {
      if (mimicTimerRef.current) clearTimeout(mimicTimerRef.current)
    }
  }, [multiStep, mimicActive, mimicExprIndex, preview, multiPhotos.front])

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
    setPhase('validated')
    setShowFlash(true)
    setTimeout(() => setShowFlash(false), 350)

    advanceTimerRef.current = setTimeout(() => {
      setPhase('advancing')
      const bestDataUrl = captureBestFrame()
      if (bestDataUrl) {
        if (mode === 'multi') setMultiPhotos((prev) => ({ ...prev, [multiStep]: bestDataUrl }))
        setPreview(bestDataUrl)
      }
      frameBufferRef.current = []
      advanceTimerRef.current = null
    }, ADVANCE_DELAY_MS)
  }, [captureBestFrame, mode, multiStep])

  // Reset
  const resetValidation = useCallback(() => {
    validationStartRef.current = null
    faceFirstSeenRef.current = null
    frameBufferRef.current = []
    stableReadyFrames.current = 0
    setPhase('idle')
    setValidationProgress(0)
    setFailsafeActive(false)
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    resetSmoothing(); resetStability(); resetFaceLock()
  }, [])

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
        setInitState('ready'); setPhase('detecting')
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
      animFrameRef.current = requestAnimationFrame(processFrame) // eslint-disable-line react-hooks/immutability -- rAF self-ref
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
            if (phase === 'stabilizing' || phase === 'tracking') setPhase('detecting')
            const ctx = mc.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, mc.width, mc.height)
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

          if (!faceFirstSeenRef.current) faceFirstSeenRef.current = now
          if (now - faceFirstSeenRef.current > FAILSAFE_MS && phase !== 'validated' && phase !== 'advancing') {
            setFailsafeActive(true)
          }

          // Phase transitions
          if (phase === 'detecting' || phase === 'idle') setPhase('tracking')

          // Skip auto-capture during mimic sequence (mimic uses timed capture)
          const isMimicStep = multiStep === 'mimic'

          // Strict READY gate: all sub-scores must meet minimums
          // Use relaxed thresholds after failsafe timer (10s+ of trying)
          const readyNow = !isMimicStep && isReadyForCapture(guide, failsafeActive)
          if (readyNow) {
            stableReadyFrames.current++
          } else {
            // Decay instead of hard reset — prevents single dropped frames from restarting
            stableReadyFrames.current = Math.floor(stableReadyFrames.current * 0.5)
          }

          // After failsafe, also reduce required stability frames
          const requiredFrames = failsafeActive
            ? Math.max(3, Math.floor(STABILITY_FRAMES_REQUIRED * 0.5))
            : STABILITY_FRAMES_REQUIRED

          if (readyNow && stableReadyFrames.current >= requiredFrames && !preview) {
            if (!validationStartRef.current) {
              validationStartRef.current = now
              setPhase('stabilizing')
            }
            const elapsed = now - validationStartRef.current
            setValidationProgress(Math.min(1, elapsed / VALIDATION_HOLD_MS))
            if (elapsed >= VALIDATION_HOLD_MS && phase !== 'validated' && phase !== 'advancing') {
              triggerAutoAdvance()
            }
          } else if (phase === 'stabilizing' || phase === 'tracking') {
            if (!readyNow) {
              validationStartRef.current = null
              setValidationProgress(0)
              if (phase === 'stabilizing') setPhase('tracking')
            }
          }

          // Buffer best frames — uses aligned 3:4 capture to match UI
          if (guide.qualityScore >= 0.6 && !preview && phase !== 'validated' && phase !== 'advancing') {
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
          const ctx = mc.getContext('2d')
          if (ctx) drawMesh(ctx, smoothed, mc.width, mc.height, guide.allOk, true, false, guide.qualityScore)
        }
      })
      .catch(() => { processingRef.current = false })

    animFrameRef.current = requestAnimationFrame(processFrame)
  }, [landmarksRef, preview, phase, status.faceLocked, triggerAutoAdvance, mode, multiStep, failsafeActive])

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
        confidence: q >= 0.85 ? 'high' : q >= 0.5 ? 'medium' : 'low',
        qualityScore: q,
      }
      onCapture(preview, meta)
    }
  }, [autoConfirm, mode, preview, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Manual capture — only allowed when READY (all quality gates passed)
  const takeSnapshot = () => {
    if (!isReadyForCapture(status)) return
    const dataUrl = captureBestFrame()
    if (!dataUrl) return
    setShowFlash(true); setTimeout(() => setShowFlash(false), 350)
    if (mode === 'multi') setMultiPhotos((prev) => ({ ...prev, [multiStep]: dataUrl }))
    setPreview(dataUrl); setPhase('advancing')
  }

  const buildMeta = useCallback((): CaptureMetadata => {
    const q = status.qualityScore
    return {
      confidence: q >= 0.85 ? 'high' : q >= 0.5 ? 'medium' : 'low',
      qualityScore: q,
    }
  }, [status.qualityScore])

  const confirmSingle = () => { if (preview) onCapture(preview, buildMeta()) }

  const confirmMulti = () => {
    if (multiStep === 'front') {
      setPreview(null); setMultiStep('left'); resetValidation(); setPhase('detecting')
    } else if (multiStep === 'left') {
      setPreview(null); setMultiStep('right'); resetValidation(); setPhase('detecting')
    } else if (multiStep === 'right') {
      startMimicStep()
      return
    } else if (multiStep === 'mimic') {
      finalizeMimicCapture()
      return
    } else {
      const photos = { ...multiPhotos, [multiStep]: preview! }
      if (onMultiCapture && photos.front && photos.left && photos.right) {
        onMultiCapture({ front: photos.front, left: photos.left, right: photos.right }, buildMeta())
      } else if (photos.front) onCapture(photos.front, buildMeta())
    }
  }

  /** Start mimic sequence after right angle is confirmed */
  const startMimicStep = () => {
    setMultiPhotos(prev => ({ ...prev, right: preview! }))
    setPreview(null); setMultiStep('mimic'); resetValidation(); setPhase('tracking')
    setMimicExprIndex(0); setMimicFrames([]); setMimicActive(true)
  }

  /** Finalize multi-capture with mimic frames */
  const finalizeMimicCapture = () => {
    const photos = multiPhotos
    if (onMultiCapture && photos.front && photos.left && photos.right) {
      onMultiCapture({
        front: photos.front, left: photos.left, right: photos.right,
        mimicFrames: mimicFrames.length > 0 ? mimicFrames : undefined,
      }, buildMeta())
    } else if (photos.front) onCapture(photos.front, buildMeta())
  }

  const retake = () => { setPreview(null); resetValidation(); setPhase('detecting') }

  // ─── Render ───────────────────────────────────────────────
  const isMulti = mode === 'multi'
  const currentStepLabel = isMulti ? MULTI_LABELS[multiStep] : null
  const STEP_ORDER: MultiStep[] = ['front', 'left', 'right', 'mimic']
  const stepNumber = STEP_ORDER.indexOf(multiStep) + 1
  const totalSteps = STEP_ORDER.length

  const phaseMessage = (() => {
    if (preview) return null
    // Mimic step: show current expression instruction
    if (multiStep === 'mimic' && mimicActive) {
      const expr = MIMIC_EXPRESSIONS[mimicExprIndex]
      return expr ? expr.instruction : 'Mimik taraması tamamlanıyor…'
    }
    switch (phase) {
      case 'idle':
      case 'detecting':
        return isMulti ? MULTI_INSTRUCTIONS[multiStep] : 'Yüzünüz aranıyor'
      case 'tracking':
        return status.mainMessage
      case 'stabilizing':
        return 'Harika, biraz daha sabit kalın'
      case 'validated':
      case 'advancing':
        return multiStep === 'mimic' ? 'Mimik taraması tamamlandı' : 'Mükemmel — çekim tamamlandı'
      default:
        return status.mainMessage
    }
  })()

  const messageColor = (() => {
    switch (phase) {
      case 'validated':
      case 'advancing': return 'text-[#00DC82]'
      case 'stabilizing': return 'text-[#D4B96A]'
      case 'tracking': return status.qualityScore >= 0.5 ? 'text-[#D4B96A]' : 'text-[#C47A7A]'
      default: return 'text-white/35'
    }
  })()

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
                const isDone = s === 'mimic' ? mimicFrames.length >= MIMIC_EXPRESSIONS.length
                  : !!multiPhotos[s as 'front' | 'left' | 'right']
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
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 sm:px-4 py-2 sm:py-4">
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

          {/* Live camera + Face Mesh canvas */}
          {(initState === 'ready' || initState === 'loading') && !preview && (
            <>
              <video
                ref={videoRef}
                autoPlay playsInline muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={meshCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />

              {/* Soft vignette */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: 'radial-gradient(ellipse 70% 65% at 50% 45%, transparent 50%, rgba(3,3,5,0.7) 100%)',
              }} />

              {/* Stabilization ring */}
              {phase === 'stabilizing' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <svg width="90" height="90" viewBox="0 0 100 100" className="opacity-60">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="rgba(0,220,130,0.7)"
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${validationProgress * 264} 264`}
                      transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dasharray 0.15s ease-out' }}
                    />
                  </svg>
                </div>
              )}

              {/* Validated success */}
              {(phase === 'validated' || phase === 'advancing') && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-[fadeIn_0.3s_ease]">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[rgba(0,220,130,0.15)] backdrop-blur-md border border-[rgba(0,220,130,0.4)] flex items-center justify-center">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#00DC82]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Flash */}
              {showFlash && (
                <div className="absolute inset-0 z-30 bg-white animate-[flashFade_0.35s_ease-out_forwards] pointer-events-none" />
              )}

              {/* Dev-only debug panel */}
              {process.env.NODE_ENV === 'development' && status.debug && (
                <div className="absolute top-1 left-1 z-40 bg-black/70 text-[8px] font-mono text-green-300 px-2 py-1 rounded pointer-events-none leading-tight max-w-[200px]">
                  <div>yaw: {status.debug.yawDeg}° nose: {status.debug.noseOffset}</div>
                  <div>pitch: {status.debug.pitchDeg}° tilt: {status.debug.tiltDeg}°</div>
                  <div>target: {status.debug.targetAngle} angle: {status.angle}</div>
                  <div>center: {status.centering} dist: {status.distance}</div>
                  <div>stable: {stableReadyFrames.current} phase: {phase}</div>
                  <div>quality: {(status.qualityScore * 100).toFixed(0)}% allOk: {String(status.allOk)}</div>
                  <div>locked: {String(status.faceLocked)} failsafe: {String(failsafeActive)}</div>
                  {status.debug.rejectionReason && (
                    <div className="text-red-300">reject: {status.debug.rejectionReason}</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Preview */}
          {preview && (
            <div className="absolute inset-0 animate-[fadeIn_0.5s_ease]">
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
                <span className="px-3.5 py-1.5 rounded-full bg-[rgba(0,220,130,0.15)] backdrop-blur-md border border-[rgba(0,220,130,0.3)] text-[9px] sm:text-[10px] font-medium tracking-[0.1em] uppercase text-[#7CE8B2] whitespace-nowrap">
                  ✓ Çekim tamamlandı
                </span>
              </div>
            </div>
          )}

          {/* Status badges */}
          {initState === 'ready' && !preview && phase !== 'validated' && phase !== 'advancing' && (
            <div className="absolute bottom-2.5 left-2 right-2 z-10 flex justify-center gap-1 flex-wrap">
              <Badge category="distance" value={status.distance} />
              <Badge category="lighting" value={status.lighting} />
              <Badge category="angle" value={status.angle} />
              <Badge category="forehead" value={status.foreheadVisible ? 'ok' : 'hidden'} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ SECTION 3: Controls (flex-none, never overflows) ═══ */}
      <div className="flex-none px-5 pb-3 sm:pb-5">
        {/* Guidance text */}
        {initState === 'ready' && !preview && (
          <div className="flex flex-col items-center gap-1 mb-2.5 sm:mb-3">
            {isMulti && (
              <span className="px-3 py-0.5 rounded-full bg-[rgba(196,163,90,0.1)] border border-[rgba(196,163,90,0.15)] text-[9px] font-medium tracking-[0.15em] uppercase text-[#D4B96A]">
                {currentStepLabel} — {stepNumber}/{totalSteps}
              </span>
            )}
            <p className={`font-display text-[16px] sm:text-[18px] font-light tracking-[-0.01em] text-center transition-all duration-500 ${messageColor}`}>
              {phaseMessage}
            </p>
            {/* Mimic expression progress */}
            {multiStep === 'mimic' && mimicActive && (
              <div className="flex items-center gap-1.5 mt-1">
                {MIMIC_EXPRESSIONS.map((expr, i) => (
                  <div key={expr.key} className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    i < mimicExprIndex ? 'bg-[#00DC82]'
                      : i === mimicExprIndex ? 'bg-[#D4B96A] animate-pulse'
                      : 'bg-white/10'
                  }`} />
                ))}
              </div>
            )}
            {multiStep !== 'mimic' && phase === 'tracking' && status.faceDetected && (
              <p className="font-body text-[10px] text-white/30 text-center animate-[fadeIn_0.4s_ease]" key={tipIndex}>
                {TIPS[tipIndex]}
              </p>
            )}
            {multiStep !== 'mimic' && (phase === 'idle' || phase === 'detecting') && !status.faceDetected && (
              <p className="font-body text-[10px] text-white/20 text-center">
                Yüzünüzü çerçevenin içine yerleştirin
              </p>
            )}
          </div>
        )}

        {/* Action area */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          {!preview ? (
            <>
              {/* Mimic sequence: show expression label and auto-progress */}
              {multiStep === 'mimic' && mimicActive && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-14 h-14 rounded-full bg-[rgba(196,163,90,0.1)] border border-[rgba(196,163,90,0.2)] flex items-center justify-center">
                    <span className="text-[20px]">
                      {mimicExprIndex === 0 ? '😐' : mimicExprIndex === 1 ? '🙂' : mimicExprIndex === 2 ? '😑' : '😶'}
                    </span>
                  </div>
                  <p className="font-body text-[11px] text-[#D4B96A] tracking-[0.1em] uppercase">
                    {MIMIC_EXPRESSIONS[mimicExprIndex]?.label ?? 'Tamamlanıyor…'}
                  </p>
                  <p className="font-body text-[9px] text-white/25">
                    {mimicExprIndex + 1} / {MIMIC_EXPRESSIONS.length} ifade
                  </p>
                </div>
              )}
              {/* Quality bar — not during mimic */}
              {multiStep !== 'mimic' && status.faceDetected && phase !== 'validated' && phase !== 'advancing' && (
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-24 sm:w-28 h-[4px] sm:h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.round(status.qualityScore * 100)}%`,
                        background: status.qualityScore >= 0.8
                          ? 'linear-gradient(90deg, #00B864, #00DC82, #4AE3A7)'
                          : status.qualityScore >= 0.5
                            ? 'linear-gradient(90deg, #B8944A, #D4B96A)'
                            : 'linear-gradient(90deg, #8C5555, #C47A7A)',
                      }}
                    />
                  </div>
                  <span className={`font-body text-[10px] tabular-nums w-7 transition-colors duration-500 ${
                    status.qualityScore >= 0.8 ? 'text-[#00DC82]/60' : status.qualityScore >= 0.5 ? 'text-[#D4B96A]/50' : 'text-white/25'
                  }`}>
                    {Math.round(status.qualityScore * 100)}
                  </span>
                </div>
              )}

              {/* Capture button / status — skip during mimic sequence */}
              {multiStep === 'mimic' && mimicActive ? null
              : failsafeActive && status.faceDetected && phase !== 'validated' && phase !== 'advancing' ? (
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    disabled={!isReadyForCapture(status)}
                    className="group relative disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Fotoğraf çek"
                  >
                    <div className={`w-[64px] h-[64px] sm:w-[76px] sm:h-[76px] rounded-full border-[3px] transition-all duration-500 flex items-center justify-center ${
                      isReadyForCapture(status)
                        ? 'border-[rgba(196,163,90,0.4)] shadow-[0_0_16px_rgba(196,163,90,0.12)]'
                        : 'border-[rgba(255,255,255,0.08)]'
                    }`}>
                      <div className="w-[52px] h-[52px] sm:w-[62px] sm:h-[62px] rounded-full bg-[rgba(255,255,255,0.12)] group-hover:bg-[rgba(255,255,255,0.22)] group-active:scale-90 transition-all duration-300 group-disabled:bg-[rgba(255,255,255,0.04)]" />
                    </div>
                  </button>
                  <p className="font-body text-[9px] text-white/20 tracking-[0.12em] uppercase">
                    {isReadyForCapture(status) ? 'Manuel çekim' : 'Pozisyonunuzu ayarlayın'}
                  </p>
                </div>
              ) : phase === 'validated' || phase === 'advancing' ? (
                <p className="font-body text-[11px] text-[#00DC82] tracking-[0.1em] uppercase py-2">Çekim tamamlandı</p>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-[64px] h-[64px] sm:w-[76px] sm:h-[76px] rounded-full border-[3px] border-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <div className="w-[52px] h-[52px] sm:w-[62px] sm:h-[62px] rounded-full bg-[rgba(255,255,255,0.04)]" />
                  </div>
                  <p className="font-body text-[9px] text-white/20 tracking-[0.12em] uppercase">
                    {phase === 'stabilizing' ? 'Doğrulanıyor…' : 'Otomatik çekim aktif'}
                  </p>
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
                  ? multiStep === 'right' ? 'Sonraki: Mimik Tarama'
                    : multiStep === 'mimic' ? 'Analizi Başlat'
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
