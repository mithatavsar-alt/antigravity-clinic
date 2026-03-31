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
export type MultiStep = 'front' | 'left' | 'right'

interface FaceGuideCaptureProps {
  onCapture: (dataUrl: string) => void
  onClose: () => void
  mode?: CaptureMode
  onMultiCapture?: (photos: { front: string; left: string; right: string }) => void
}

type InitState = 'loading' | 'ready' | 'error'

/**
 * Validation state machine — purely Face Mesh driven.
 *  idle → detecting → tracking → stabilizing → validated → advancing
 */
type ValidationPhase = 'idle' | 'detecting' | 'tracking' | 'stabilizing' | 'validated' | 'advancing'

// ─── Constants ──────────────────────────────────────────────
const AUTO_CAPTURE_QUALITY_THRESHOLD = 0.82
const VALIDATION_HOLD_MS = 1200
const ADVANCE_DELAY_MS = 600
const FAILSAFE_MS = 8000
const BEST_FRAME_BUFFER_SIZE = 20
const BEST_FRAME_WINDOW_MS = 3000

const TIPS = [
  'Nötr ifade kullanın',
  'Saçlar yüzünüzü kapatmasın',
  'Gözlük varsa çıkarın',
  'Doğal ışık tercih edin',
  'Arka planınız düz olsun',
]
const MULTI_LABELS: Record<MultiStep, string> = {
  front: 'Önden',
  left: 'Sol Profil',
  right: 'Sağ Profil',
}
const MULTI_INSTRUCTIONS: Record<MultiStep, string> = {
  front: 'Düz bakın',
  left: 'Yüzünüzü sola çevirin',
  right: 'Yüzünüzü sağa çevirin',
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

export function drawMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  _allOk: boolean,
  mirror = true,
  _clipOval = true,   // kept for signature compat — ignored
  qualityScore = 0,
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

async function acquireCamera(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new DOMException('Kamera HTTPS veya localhost gerektirir.', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Bu tarayıcı kamera erişimini desteklemiyor.', 'NotFoundError')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
    })
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') throw err
  }
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

// ─── Best-frame scoring ─────────────────────────────────────
interface ScoredFrame { dataUrl: string; score: number; time: number }

function computeFrameScore(status: FaceGuideStatus): number {
  const { qualityBreakdown: qb } = status
  return qb.distance * 0.30 + qb.alignment * 0.25 + qb.sharpness * 0.20 + qb.lighting * 0.15 + qb.stability * 0.10
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT — Pure Face Mesh driven, no static overlays
// ═══════════════════════════════════════════════════════════
export function FaceGuideCapture({ onCapture, onClose, mode = 'single', onMultiCapture }: FaceGuideCaptureProps) {
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
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (video && canvas && video.videoWidth > 0) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.resetTransform(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1)
        ctx.drawImage(video, 0, 0)
        return canvas.toDataURL('image/jpeg', 0.92)
      }
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
          const guide = evaluateFaceGuide(smoothed, brightness, shadowScore)
          setStatus(guide)

          if (!faceFirstSeenRef.current) faceFirstSeenRef.current = now
          if (now - faceFirstSeenRef.current > FAILSAFE_MS && phase !== 'validated' && phase !== 'advancing') {
            setFailsafeActive(true)
          }

          // Phase transitions
          if (phase === 'detecting' || phase === 'idle') setPhase('tracking')

          if (guide.qualityScore >= AUTO_CAPTURE_QUALITY_THRESHOLD && guide.faceLocked && !preview) {
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
            validationStartRef.current = null
            setValidationProgress(0)
            if (phase === 'stabilizing') setPhase('tracking')
          }

          // Buffer best frames
          if (guide.qualityScore >= 0.6 && !preview && phase !== 'validated' && phase !== 'advancing') {
            const cc = captureCanvasRef.current
            if (cc && video.videoWidth > 0) {
              cc.width = video.videoWidth; cc.height = video.videoHeight
              const cctx = cc.getContext('2d')
              if (cctx) {
                cctx.resetTransform(); cctx.translate(cc.width, 0); cctx.scale(-1, 1)
                cctx.drawImage(video, 0, 0)
                const dataUrl = cc.toDataURL('image/jpeg', 0.92)
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
  }, [landmarksRef, preview, phase, status.faceLocked, triggerAutoAdvance])

  useEffect(() => {
    if (initState === 'ready' && !preview) {
      animFrameRef.current = requestAnimationFrame(processFrame)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [initState, preview, processFrame])

  // Manual capture (failsafe)
  const takeSnapshot = () => {
    const dataUrl = captureBestFrame()
    if (!dataUrl) return
    setShowFlash(true); setTimeout(() => setShowFlash(false), 350)
    if (mode === 'multi') setMultiPhotos((prev) => ({ ...prev, [multiStep]: dataUrl }))
    setPreview(dataUrl); setPhase('advancing')
  }

  const confirmSingle = () => { if (preview) onCapture(preview) }

  const confirmMulti = () => {
    if (multiStep === 'front') {
      setPreview(null); setMultiStep('left'); resetValidation(); setPhase('detecting')
    } else if (multiStep === 'left') {
      setPreview(null); setMultiStep('right'); resetValidation(); setPhase('detecting')
    } else {
      const photos = { ...multiPhotos, [multiStep]: preview! }
      if (onMultiCapture && photos.front && photos.left && photos.right) {
        onMultiCapture({ front: photos.front, left: photos.left, right: photos.right })
      } else if (photos.front) onCapture(photos.front)
    }
  }

  const retake = () => { setPreview(null); resetValidation(); setPhase('detecting') }

  // ─── Render ───────────────────────────────────────────────
  const isMulti = mode === 'multi'
  const currentStepLabel = isMulti ? MULTI_LABELS[multiStep] : null
  const stepNumber = multiStep === 'front' ? 1 : multiStep === 'left' ? 2 : 3

  const phaseMessage = (() => {
    if (preview) return null
    switch (phase) {
      case 'idle':
      case 'detecting':
        return isMulti ? MULTI_INSTRUCTIONS[multiStep] : 'Yüz algılanıyor'
      case 'tracking':
        return status.mainMessage
      case 'stabilizing':
        return 'Sabit kalın'
      case 'validated':
      case 'advancing':
        return 'Yüz doğrulandı'
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
            <div className="flex items-center gap-1.5">
              {(['front', 'left', 'right'] as MultiStep[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full text-[10px] font-medium flex items-center justify-center transition-all ${
                    s === multiStep ? 'bg-[#C4A35A] text-white' : multiPhotos[s] ? 'bg-[#00905A] text-white' : 'bg-white/8 text-white/30'
                  }`}>
                    {multiPhotos[s] ? '✓' : i + 1}
                  </div>
                  {i < 2 && <div className={`w-3 h-px ${multiPhotos[s] ? 'bg-[#00905A]' : 'bg-white/10'}`} />}
                </div>
              ))}
            </div>
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10" />
          )}
        </div>
      </div>

      {/* ═══ SECTION 2: Camera preview (flex-1, fills available space) ═══ */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-2 sm:py-4">
        <div
          className="relative w-full max-w-[min(88vw,400px)] sm:max-w-[340px] rounded-[20px] sm:rounded-[28px] overflow-hidden border border-[rgba(214,185,140,0.12)] shadow-[0_0_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(214,185,140,0.05)]"
          style={{ aspectRatio: '3/4', maxHeight: '100%' }}
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
                    {currentStepLabel} — Fotoğraf {stepNumber}/3
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
                {currentStepLabel} — {stepNumber}/3
              </span>
            )}
            <p className={`font-display text-[16px] sm:text-[18px] font-light tracking-[-0.01em] text-center transition-all duration-500 ${messageColor}`}>
              {phaseMessage}
            </p>
            {phase === 'tracking' && status.faceDetected && (
              <p className="font-body text-[10px] text-white/30 text-center animate-[fadeIn_0.4s_ease]" key={tipIndex}>
                {TIPS[tipIndex]}
              </p>
            )}
            {(phase === 'idle' || phase === 'detecting') && !status.faceDetected && (
              <p className="font-body text-[10px] text-white/20 text-center">
                Yüzünüzü kameraya gösterin
              </p>
            )}
          </div>
        )}

        {/* Action area */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          {!preview ? (
            <>
              {/* Quality bar */}
              {status.faceDetected && phase !== 'validated' && phase !== 'advancing' && (
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

              {/* Capture button / status */}
              {failsafeActive && status.faceDetected && phase !== 'validated' && phase !== 'advancing' ? (
                <div className="flex flex-col items-center gap-1.5">
                  <button type="button" onClick={takeSnapshot} className="group relative" aria-label="Fotoğraf çek">
                    <div className="w-[64px] h-[64px] sm:w-[76px] sm:h-[76px] rounded-full border-[3px] border-[rgba(196,163,90,0.4)] shadow-[0_0_16px_rgba(196,163,90,0.12)] transition-all duration-500 flex items-center justify-center">
                      <div className="w-[52px] h-[52px] sm:w-[62px] sm:h-[62px] rounded-full bg-[rgba(255,255,255,0.12)] group-hover:bg-[rgba(255,255,255,0.22)] group-active:scale-90 transition-all duration-300" />
                    </div>
                  </button>
                  <p className="font-body text-[9px] text-white/20 tracking-[0.12em] uppercase">Manuel çekim</p>
                </div>
              ) : phase === 'validated' || phase === 'advancing' ? (
                <p className="font-body text-[11px] text-[#00DC82] tracking-[0.1em] uppercase py-2">Çekim tamamlandı</p>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-[64px] h-[64px] sm:w-[76px] sm:h-[76px] rounded-full border-[3px] border-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <div className="w-[52px] h-[52px] sm:w-[62px] sm:h-[62px] rounded-full bg-[rgba(255,255,255,0.04)]" />
                  </div>
                  <p className="font-body text-[9px] text-white/20 tracking-[0.12em] uppercase">
                    {phase === 'stabilizing' ? 'Doğrulanıyor...' : 'Otomatik çekim'}
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
                {isMulti && multiStep !== 'right' ? 'Sonraki Açı' : 'Bu Fotoğrafı Kullan'}
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
