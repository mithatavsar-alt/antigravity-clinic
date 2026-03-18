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
  FOREHEAD_ZONE,
  LEFT_TEMPLE,
  RIGHT_TEMPLE,
  LEFT_UNDER_EYE,
  RIGHT_UNDER_EYE,
  type FaceGuideStatus,
} from '@/lib/ai/face-guide'

// ─── Types ──────────────────────────────────────────────────
export type CaptureMode = 'single' | 'multi'
export type MultiStep = 'front' | 'left' | 'right'

interface FaceGuideCaptureProps {
  onCapture: (dataUrl: string) => void
  onClose: () => void
  /** 'multi' enables 3-photo flow: front → left → right */
  mode?: CaptureMode
  /** Called with all 3 photos in multi mode */
  onMultiCapture?: (photos: { front: string; left: string; right: string }) => void
}

type InitState = 'loading' | 'ready' | 'error'

// ─── Constants ──────────────────────────────────────────────
const AUTO_CAPTURE_QUALITY_THRESHOLD = 0.8
const AUTO_CAPTURE_STABLE_MS = 1000 // quality must stay above threshold for 1s
const COUNTDOWN_SECONDS = 3
const FAILSAFE_MS = 6000 // show manual capture after 6s of face detected
const READY_HOLD_MS = 500
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

// Oval dimensions as fractions of the container
// Expanded: scaleX=1.15, scaleY=1.25 (extra forehead space)
const OVAL_RX_RATIO = 0.42   // was 0.38 — wider to cover temple edges
const OVAL_RY_RATIO = 0.38   // was 0.32 — taller to cover forehead + jawline
const OVAL_CY_RATIO = 0.40   // was 0.42 — shifted up for forehead priority

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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-medium tracking-[0.1em] uppercase border backdrop-blur-md transition-all duration-300 ${
        isOk
          ? 'bg-[rgba(61,122,95,0.2)] text-[#7DCE9E] border-[rgba(61,122,95,0.3)]'
          : isWarn
            ? 'bg-[rgba(196,163,90,0.2)] text-[#D4B96A] border-[rgba(196,163,90,0.3)]'
            : 'bg-[rgba(160,82,82,0.15)] text-[#E07070] border-[rgba(160,82,82,0.25)]'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-[#3D7A5F]' : isWarn ? 'bg-[#C4A35A]' : 'bg-[#A05252]'}`} />
      {label}
    </span>
  )
}

// ─── Canvas mesh renderer (expanded full-face coverage) ─────
// Priority zones: forehead, under-eye, temples get brighter glow
const PRIORITY_POINT_SET = new Set([
  ...FOREHEAD_ZONE, ...LEFT_UNDER_EYE, ...RIGHT_UNDER_EYE,
  ...LEFT_TEMPLE, ...RIGHT_TEMPLE,
])

export function drawMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  allOk: boolean,
  mirror = true,
  clipOval = true
) {
  ctx.clearRect(0, 0, w, h)

  ctx.save()

  if (clipOval) {
    const cx = w / 2
    const cy = h * OVAL_CY_RATIO
    const rx = w * OVAL_RX_RATIO
    const ry = h * OVAL_RY_RATIO
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
  }

  const glowR = allOk ? 0 : 232
  const glowG = allOk ? 255 : 197
  const glowB = allOk ? 102 : 71
  const glowColor = `rgb(${glowR}, ${glowG}, ${glowB})`
  // Priority zones use neon green
  const priorityColor = allOk ? 'rgba(74, 227, 167,' : 'rgba(232, 201, 122,'

  const toX = (lm: Landmark) => mirror ? (1 - lm.x) * w : lm.x * w
  const toY = (lm: Landmark) => lm.y * h

  const drawPath = (indices: number[], opacity: number, neonGlow = false) => {
    ctx.beginPath()
    if (neonGlow) {
      ctx.shadowColor = glowColor
      ctx.shadowBlur = 8
    }
    ctx.strokeStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${opacity})`
    ctx.lineWidth = neonGlow ? 1.5 : 1.2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    let started = false
    for (const idx of indices) {
      const lm = landmarks[idx]
      if (!lm) continue
      if (!started) { ctx.moveTo(toX(lm), toY(lm)); started = true }
      else ctx.lineTo(toX(lm), toY(lm))
    }
    ctx.stroke()
    if (neonGlow) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0 }
  }

  // Outer contour — neon glow line
  drawPath(FACE_OVAL, 0.4, true)
  // Extended contours
  drawPath(JAWLINE, 0.35, true)
  drawPath(FOREHEAD_ZONE, 0.35, true)
  drawPath(LEFT_TEMPLE, 0.25)
  drawPath(RIGHT_TEMPLE, 0.25)
  // Standard facial features
  drawPath(LEFT_EYE, 0.35)
  drawPath(RIGHT_EYE, 0.35)
  drawPath(LEFT_EYEBROW, 0.25)
  drawPath(RIGHT_EYEBROW, 0.25)
  drawPath(NOSE_BRIDGE, 0.2)
  drawPath(UPPER_LIP, 0.25)
  drawPath(LOWER_LIP, 0.25)
  // Under-eye contours (priority)
  drawPath(LEFT_UNDER_EYE, 0.3)
  drawPath(RIGHT_UNDER_EYE, 0.3)

  // Collect all key points (including extended landmarks)
  const keyPoints = [
    ...FACE_OVAL.filter((_, i) => i % 2 === 0),
    ...LEFT_EYE.filter((_, i) => i % 2 === 0),
    ...RIGHT_EYE.filter((_, i) => i % 2 === 0),
    ...LEFT_EYEBROW,
    ...RIGHT_EYEBROW,
    ...NOSE_BRIDGE,
    ...UPPER_LIP,
    ...LOWER_LIP,
    ...JAWLINE.filter((_, i) => i % 2 === 0),
    ...FOREHEAD_ZONE,
    ...LEFT_TEMPLE,
    ...RIGHT_TEMPLE,
    ...LEFT_UNDER_EYE.filter((_, i) => i % 2 === 0),
    ...RIGHT_UNDER_EYE.filter((_, i) => i % 2 === 0),
    33, 133, 362, 263,
    1, 4, 6,
    61, 291,
    10, 152,
  ]
  const uniquePoints = [...new Set(keyPoints)]

  // Outer glow ring (larger for priority zones)
  for (const idx of uniquePoints) {
    const lm = landmarks[idx]
    if (!lm) continue
    const isPriority = PRIORITY_POINT_SET.has(idx)
    ctx.shadowColor = isPriority ? (allOk ? '#4AE3A7' : '#E8C97A') : glowColor
    ctx.shadowBlur = isPriority ? 10 : 8
    ctx.fillStyle = isPriority ? `${priorityColor}0.35)` : `rgba(${glowR}, ${glowG}, ${glowB}, 0.25)`
    ctx.beginPath()
    ctx.arc(toX(lm), toY(lm), isPriority ? 4 : 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Inner glow
  ctx.shadowBlur = 4
  for (const idx of uniquePoints) {
    const lm = landmarks[idx]
    if (!lm) continue
    const isPriority = PRIORITY_POINT_SET.has(idx)
    ctx.shadowColor = isPriority ? (allOk ? '#4AE3A7' : '#E8C97A') : glowColor
    ctx.fillStyle = isPriority ? `${priorityColor}0.8)` : `rgba(${glowR}, ${glowG}, ${glowB}, 0.7)`
    ctx.beginPath()
    ctx.arc(toX(lm), toY(lm), isPriority ? 2.5 : 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Bright core
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  for (const idx of uniquePoints) {
    const lm = landmarks[idx]
    if (!lm) continue
    ctx.beginPath()
    ctx.arc(toX(lm), toY(lm), 0.8, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

// ─── 3-tier status color system ─────────────────────────────
type TierColor = 'green' | 'yellow' | 'red' | 'neutral'

function getTier(validCount: number, faceDetected: boolean): TierColor {
  if (!faceDetected) return 'neutral'
  if (validCount === 4) return 'green'
  if (validCount >= 2) return 'yellow'
  return 'red'
}

const TIER_STROKE: Record<TierColor, string> = {
  green: 'rgba(61,155,122,0.75)',
  yellow: 'rgba(214,185,140,0.6)',
  red: 'rgba(196,100,100,0.55)',
  neutral: 'rgba(255,255,255,0.15)',
}
const TIER_DOT: Record<TierColor, string> = {
  green: 'rgba(61,155,122,0.8)',
  yellow: 'rgba(214,185,140,0.5)',
  red: 'rgba(196,100,100,0.5)',
  neutral: 'rgba(255,255,255,0.15)',
}
const TIER_GLOW_STD: Record<TierColor, string> = {
  green: '4', yellow: '3', red: '2.5', neutral: '2',
}

// ─── Oval overlay SVG (with progressive glow + breathing) ───
function OvalOverlay({ validCount, faceDetected, qualityScore }: { validCount: number; faceDetected: boolean; qualityScore: number }) {
  const tier = getTier(validCount, faceDetected)
  const isGreen = tier === 'green'

  const vw = 400
  const vh = 600
  const cx = vw / 2
  const cy = vh * OVAL_CY_RATIO
  const rx = vw * OVAL_RX_RATIO
  const ry = vh * OVAL_RY_RATIO

  // Progressive glow: scales from 0 to full based on qualityScore
  const glowIntensity = faceDetected ? qualityScore : 0
  const glowOpacity = (glowIntensity * 0.2).toFixed(3)
  const glowSpread = Math.round(15 + glowIntensity * 15)

  // Breathing animation range
  const breatheRx = 3
  const breatheRy = 4

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <mask id="fg-oval-mask">
          <rect width={vw} height={vh} fill="white" />
          {/* Breathing mask ellipse */}
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black">
            {faceDetected && (
              <>
                <animate attributeName="rx" values={`${rx - breatheRx};${rx + breatheRx};${rx - breatheRx}`} dur="3s" repeatCount="indefinite" />
                <animate attributeName="ry" values={`${ry - breatheRy};${ry + breatheRy};${ry - breatheRy}`} dur="3s" repeatCount="indefinite" />
              </>
            )}
          </ellipse>
        </mask>
        <filter id="fg-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={TIER_GLOW_STD[tier]} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        {/* Progressive glow gradient — strengthens with quality */}
        <radialGradient id="fg-quality-glow" cx="50%" cy={`${(OVAL_CY_RATIO * 100).toFixed(0)}%`} r="50%">
          <stop offset="0%" stopColor={`rgba(61,155,122,${glowOpacity})`} />
          <stop offset="100%" stopColor="rgba(61,155,122,0)" />
        </radialGradient>
      </defs>

      <rect width={vw} height={vh} fill="rgba(0,0,0,0.55)" mask="url(#fg-oval-mask)" />

      {/* Progressive glow ellipse — always present when face detected, intensity varies */}
      {faceDetected && glowIntensity > 0.3 && (
        <ellipse cx={cx} cy={cy} rx={rx + glowSpread} ry={ry + glowSpread} fill="url(#fg-quality-glow)">
          <animate attributeName="rx" values={`${rx + glowSpread - 5};${rx + glowSpread + 5};${rx + glowSpread - 5}`} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="ry" values={`${ry + glowSpread - 5};${ry + glowSpread + 5};${ry + glowSpread - 5}`} dur="2.5s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Main oval contour — elastic breathing */}
      <ellipse
        cx={cx} cy={cy} rx={rx} ry={ry}
        fill="none"
        stroke={TIER_STROKE[tier]}
        strokeWidth={isGreen ? '2.5' : '1.5'}
        strokeDasharray={isGreen ? 'none' : '6 4'}
        filter="url(#fg-glow)"
        style={{ transition: 'stroke 0.4s, stroke-width 0.4s' }}
      >
        {faceDetected && (
          <>
            <animate attributeName="rx" values={`${rx - breatheRx};${rx + breatheRx};${rx - breatheRx}`} dur="3s" repeatCount="indefinite" />
            <animate attributeName="ry" values={`${ry - breatheRy};${ry + breatheRy};${ry - breatheRy}`} dur="3s" repeatCount="indefinite" />
          </>
        )}
      </ellipse>

      {/* Corner anchor dots with breathing */}
      {[
        { x: cx, y: cy - ry, label: 'top' },
        { x: cx, y: cy + ry, label: 'bottom' },
        { x: cx - rx, y: cy, label: 'left' },
        { x: cx + rx, y: cy, label: 'right' },
      ].map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="3" fill={TIER_DOT[tier]} style={{ transition: 'fill 0.4s' }} />
          {isGreen && (
            <circle cx={p.x} cy={p.y} r="3" fill="none" stroke="rgba(61,155,122,0.4)" strokeWidth="1">
              <animate attributeName="r" values="3;8;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}

      {/* Face placement guides when no face detected */}
      {!faceDetected && (
        <>
          <text x={cx} y={cy - ry * 0.55} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="9" fontFamily="system-ui">alın</text>
          <text x={cx} y={cy + ry * 0.15} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="9" fontFamily="system-ui">burun</text>
          <text x={cx} y={cy + ry * 0.55} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="9" fontFamily="system-ui">çene</text>
          <text x={cx - rx * 0.5} y={cy - ry * 0.15} textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="8" fontFamily="system-ui">göz</text>
          <text x={cx + rx * 0.5} y={cy - ry * 0.15} textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="8" fontFamily="system-ui">göz</text>
        </>
      )}
    </svg>
  )
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
    default: return `Kamera hatası: ${err.message}`
  }
}

async function acquireCamera(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new DOMException('Kamera HTTPS veya localhost gerektirir.', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Bu tarayıcı kamera erişimini desteklemiyor.', 'NotFoundError')
  }

  // Attempt 1: front camera, portrait-biased
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
    })
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }

  // Attempt 2: front camera + 720p
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }

  // Attempt 3: front camera only
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') throw err
  }

  // Attempt 4: enumerate devices
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((d) => d.kind === 'videoinput')
    if (videoDevices.length === 0) throw new DOMException('Kamera bulunamadı.', 'NotFoundError')
    for (const device of videoDevices) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } })
      } catch { /* next */ }
    }
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }

  // Attempt 5: bare
  return await navigator.mediaDevices.getUserMedia({ video: true })
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
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
  const readyStartRef = useRef<number | null>(null)

  // Auto-capture refs
  const qualityStableStartRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoCaptureTriggeredRef = useRef(false)
  const faceFirstSeenRef = useRef<number | null>(null)

  // Best-frame buffer: collect scored frames for optimal selection
  const frameBufferRef = useRef<Array<{ dataUrl: string; score: number; time: number }>>([])

  const [initState, setInitState] = useState<InitState>('loading')
  const [initError, setInitError] = useState<string | null>(null)
  const [status, setStatus] = useState<FaceGuideStatus>(NO_FACE_STATUS)
  const [preview, setPreview] = useState<string | null>(null)
  const [readyHoldMs, setReadyHoldMs] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [landmarksRef] = useState<{ current: Landmark[] | null }>({ current: null })

  // Auto-capture state
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showFlash, setShowFlash] = useState(false)
  const [failsafeActive, setFailsafeActive] = useState(false)

  // Multi-capture state
  const [multiStep, setMultiStep] = useState<MultiStep>('front')
  const [multiPhotos, setMultiPhotos] = useState<{ front?: string; left?: string; right?: string }>({})

  // ─── Rotating tips ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000)
    return () => clearInterval(interval)
  }, [])

  // ─── Initialize camera + Human engine ─────────────────────
  useEffect(() => {
    let cancelled = false

    async function setup() {
      try {
        // Start camera acquisition and engine init in parallel
        const [stream] = await Promise.all([
          acquireCamera(),
          initHumanEngine(),
        ])

        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try { await videoRef.current.play() } catch { /* autoPlay handles it */ }
        }

        if (cancelled) return

        engineReadyRef.current = true
        resetSmoothing()
        resetStability()
        setInitState('ready')
      } catch (err) {
        if (!cancelled) {
          setInitState('error')
          setInitError(diagnoseCameraError(err))
        }
      }
    }

    setup()
    return () => {
      cancelled = true
      cancelAnimationFrame(animFrameRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      engineReadyRef.current = false
      destroyHumanEngine()
      resetSmoothing()
      resetStability()
    }
  }, [])

  // ─── Auto-capture: start countdown ─────────────────────────
  const startCountdown = useCallback(() => {
    if (autoCaptureTriggeredRef.current || countdownTimerRef.current) return
    autoCaptureTriggeredRef.current = true
    setCountdown(COUNTDOWN_SECONDS)

    let remaining = COUNTDOWN_SECONDS
    countdownTimerRef.current = setInterval(() => {
      remaining--
      if (remaining > 0) {
        setCountdown(remaining)
      } else {
        // Countdown finished — capture!
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
        setCountdown(null)

        // Flash effect
        setShowFlash(true)
        setTimeout(() => setShowFlash(false), 350)

        // Select the BEST frame from the buffer (highest quality score)
        const buffer = frameBufferRef.current
        let bestDataUrl: string | null = null
        if (buffer.length > 0) {
          const best = buffer.reduce((a, b) => (b.score > a.score ? b : a))
          bestDataUrl = best.dataUrl
        }

        // Fallback: capture live frame if buffer is empty
        if (!bestDataUrl) {
          const video = videoRef.current
          const canvas = captureCanvasRef.current
          if (video && canvas && video.videoWidth > 0) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.resetTransform()
              ctx.translate(canvas.width, 0)
              ctx.scale(-1, 1)
              ctx.drawImage(video, 0, 0)
              bestDataUrl = canvas.toDataURL('image/jpeg', 0.92)
            }
          }
        }

        if (bestDataUrl) {
          if (mode === 'multi') {
            setMultiPhotos((prev) => ({ ...prev, [multiStep]: bestDataUrl }))
          }
          setPreview(bestDataUrl)
        }
        frameBufferRef.current = []
      }
    }, 1000)
  }, [mode, multiStep])

  // ─── Cancel countdown if quality drops ─────────────────────
  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    autoCaptureTriggeredRef.current = false
    setCountdown(null)
  }, [])

  // ─── Real-time analysis + mesh render loop ────────────────
  const processFrame = useCallback(() => {
    const video = videoRef.current
    const bc = brightnessCanvasRef.current
    const mc = meshCanvasRef.current

    if (!video || !engineReadyRef.current || !bc || !mc || processingRef.current || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }

    // Throttle ~12 fps
    const now = performance.now()
    if (now - lastFrameTime.current < 83) {
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }
    lastFrameTime.current = now
    processingRef.current = true

    const brightness = calculateBrightness(video, bc)

    // Estimate sharpness every frame (uses small canvas sample)
    estimateSharpness(video, bc)

    // Size mesh canvas to match video display size
    const rect = video.getBoundingClientRect()
    if (mc.width !== rect.width || mc.height !== rect.height) {
      mc.width = rect.width
      mc.height = rect.height
    }

    // Use Human engine for face detection
    detectFaceFromVideo(video)
      .then((detection) => {
        processingRef.current = false
        const raw = detection?.landmarks ?? null

        if (!raw || raw.length < 468) {
          setStatus(NO_FACE_STATUS)
          readyStartRef.current = null
          setReadyHoldMs(0)
          landmarksRef.current = null
          qualityStableStartRef.current = null
          faceFirstSeenRef.current = null
          frameBufferRef.current = []
          setFailsafeActive(false)
          cancelCountdown()
          const ctx = mc.getContext('2d')
          if (ctx) ctx.clearRect(0, 0, mc.width, mc.height)
        } else {
          const smoothed = smoothLandmarks(raw)
          landmarksRef.current = smoothed

          // Shadow detection (uses face landmarks for region sampling)
          const shadowScore = detectShadow(video, bc, smoothed)

          const guide = evaluateFaceGuide(smoothed, brightness, shadowScore)
          setStatus(guide)

          // Track face-first-seen for failsafe
          if (!faceFirstSeenRef.current) faceFirstSeenRef.current = now

          // Failsafe: show manual capture button after FAILSAFE_MS
          if (now - faceFirstSeenRef.current > FAILSAFE_MS && !autoCaptureTriggeredRef.current) {
            setFailsafeActive(true)
          }

          if (guide.allOk) {
            if (!readyStartRef.current) readyStartRef.current = performance.now()
            setReadyHoldMs(performance.now() - readyStartRef.current)
          } else {
            readyStartRef.current = null
            setReadyHoldMs(0)
          }

          // ── Best-frame buffer: collect high-quality frames ──
          // Buffer up to 15 frames over 2 seconds when quality is above threshold
          if (guide.qualityScore >= 0.6 && !preview) {
            const cc = captureCanvasRef.current
            if (cc && video.videoWidth > 0) {
              cc.width = video.videoWidth
              cc.height = video.videoHeight
              const cctx = cc.getContext('2d')
              if (cctx) {
                cctx.resetTransform()
                cctx.translate(cc.width, 0)
                cctx.scale(-1, 1)
                cctx.drawImage(video, 0, 0)
                const dataUrl = cc.toDataURL('image/jpeg', 0.92)
                frameBufferRef.current.push({ dataUrl, score: guide.qualityScore, time: now })
                // Keep only last 15 frames within 2 seconds
                const bufCutoff = now - 2000
                frameBufferRef.current = frameBufferRef.current
                  .filter((f) => f.time > bufCutoff)
                  .slice(-15)
              }
            }
          }

          // Auto-capture quality check
          if (guide.qualityScore >= AUTO_CAPTURE_QUALITY_THRESHOLD && !preview) {
            if (!qualityStableStartRef.current) {
              qualityStableStartRef.current = now
            } else if (now - qualityStableStartRef.current >= AUTO_CAPTURE_STABLE_MS) {
              // Quality has been stable above threshold — start countdown
              startCountdown()
            }
          } else {
            qualityStableStartRef.current = null
            // If quality dropped during countdown, cancel it
            if (autoCaptureTriggeredRef.current && !preview) {
              cancelCountdown()
            }
          }

          const ctx = mc.getContext('2d')
          if (ctx) drawMesh(ctx, smoothed, mc.width, mc.height, guide.allOk)
        }
      })
      .catch(() => {
        processingRef.current = false
      })

    animFrameRef.current = requestAnimationFrame(processFrame)
  }, [landmarksRef, preview, startCountdown, cancelCountdown])

  useEffect(() => {
    if (initState === 'ready' && !preview) {
      animFrameRef.current = requestAnimationFrame(processFrame)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [initState, preview, processFrame])

  // ─── Capture logic ────────────────────────────────────────
  const canCapture = status.allOk && readyHoldMs >= READY_HOLD_MS
  const canManualCapture = failsafeActive && status.faceDetected

  const takeSnapshot = () => {
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Mirror
    ctx.resetTransform()
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    if (mode === 'multi') {
      setMultiPhotos((prev) => ({ ...prev, [multiStep]: dataUrl }))
    }
    setPreview(dataUrl)
  }

  const confirmSingle = () => { if (preview) onCapture(preview) }

  const resetAutoCapture = () => {
    qualityStableStartRef.current = null
    autoCaptureTriggeredRef.current = false
    faceFirstSeenRef.current = null
    frameBufferRef.current = []
    setFailsafeActive(false)
    setCountdown(null)
    resetStability()
  }

  const confirmMulti = () => {
    if (multiStep === 'front') {
      setPreview(null)
      setMultiStep('left')
      readyStartRef.current = null
      setReadyHoldMs(0)
      resetSmoothing()
      resetAutoCapture()
    } else if (multiStep === 'left') {
      setPreview(null)
      setMultiStep('right')
      readyStartRef.current = null
      setReadyHoldMs(0)
      resetSmoothing()
      resetAutoCapture()
    } else {
      const photos = { ...multiPhotos, [multiStep]: preview! }
      if (onMultiCapture && photos.front && photos.left && photos.right) {
        onMultiCapture({ front: photos.front, left: photos.left, right: photos.right })
      } else if (photos.front) {
        onCapture(photos.front)
      }
    }
  }

  const retake = () => {
    setPreview(null)
    readyStartRef.current = null
    setReadyHoldMs(0)
    // Reset auto-capture state
    qualityStableStartRef.current = null
    autoCaptureTriggeredRef.current = false
    faceFirstSeenRef.current = null
    frameBufferRef.current = []
    setFailsafeActive(false)
    setCountdown(null)
    resetStability()
  }

  // ─── Render ───────────────────────────────────────────────
  const isMulti = mode === 'multi'
  const currentStepLabel = isMulti ? MULTI_LABELS[multiStep] : null
  const stepNumber = multiStep === 'front' ? 1 : multiStep === 'left' ? 2 : 3

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0E0B09 0%, #060609 60%, #030305 100%)' }}>
      {/* Hidden canvases */}
      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={brightnessCanvasRef} className="hidden" />

      {/* ─── Top bar ─────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-[env(safe-area-inset-top,12px)] pb-2">
        <div className="flex items-center justify-between pt-3 mb-2">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-md border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-white/50 hover:text-white hover:bg-[rgba(255,255,255,0.12)] transition-all active:scale-95"
            aria-label="Kapat"
            type="button"
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
                    s === multiStep ? 'bg-[#C4A35A] text-white' : multiPhotos[s] ? 'bg-[#3D7A5F] text-white' : 'bg-white/8 text-white/30'
                  }`}>
                    {multiPhotos[s] ? '✓' : i + 1}
                  </div>
                  {i < 2 && <div className={`w-3 h-px ${multiPhotos[s] ? 'bg-[#3D7A5F]' : 'bg-white/10'}`} />}
                </div>
              ))}
            </div>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </div>

      {/* ─── Centered camera card ────────────────────────── */}
      <div className="relative w-[62vw] max-w-[270px] aspect-[4/5] rounded-[28px] overflow-hidden border border-[rgba(214,185,140,0.12)] shadow-[0_0_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(214,185,140,0.05)]">
        {/* Loading */}
        {initState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#060609]">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#C4A35A] border-r-[#2D5F5D] animate-spin" />
              <div className="absolute inset-3 rounded-full border border-[rgba(196,163,90,0.12)]" />
            </div>
            <div className="text-center">
              <p className="font-body text-[13px] text-white/60 tracking-wide">AI modeli yükleniyor</p>
              <p className="font-body text-[10px] text-white/25 mt-1">İlk kullanımda biraz sürebilir</p>
            </div>
          </div>
        )}

        {/* Error */}
        {initState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 bg-[#060609]">
            <div className="w-12 h-12 rounded-full bg-[rgba(160,82,82,0.12)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#E07070]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="font-body text-[12px] text-white/60 text-center leading-relaxed">{initError}</p>
            <button type="button" onClick={onClose} className="mt-1 font-body text-[10px] tracking-[0.15em] uppercase text-[#C4A35A] hover:text-[#D4B96A] transition-colors">
              Kapat
            </button>
          </div>
        )}

        {/* Camera + overlays */}
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
            <OvalOverlay validCount={status.validCount} faceDetected={status.faceDetected} qualityScore={status.qualityScore} />

            {/* Countdown overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  <span
                    key={countdown}
                    className="text-[72px] font-display font-light text-white/90 animate-[countdownPop_0.6s_ease-out]"
                    style={{ textShadow: '0 0 40px rgba(61,155,122,0.6), 0 0 80px rgba(61,155,122,0.3)' }}
                  >
                    {countdown}
                  </span>
                </div>
              </div>
            )}

            {/* Flash effect */}
            {showFlash && (
              <div className="absolute inset-0 z-30 bg-white animate-[flashFade_0.35s_ease-out_forwards] pointer-events-none" />
            )}
          </>
        )}

        {/* Preview */}
        {preview && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Önizleme" className="w-full h-full object-cover" />
            {isMulti && (
              <div className="absolute top-4 left-0 right-0 flex justify-center">
                <span className="px-3 py-1 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md text-[10px] font-medium tracking-[0.15em] uppercase text-white/80">
                  {currentStepLabel} — Fotoğraf {stepNumber}/3
                </span>
              </div>
            )}
          </div>
        )}

        {/* Status badges — 4 indicators */}
        {initState === 'ready' && !preview && (
          <div className="absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-1">
            <Badge category="distance" value={status.distance} />
            <Badge category="lighting" value={status.lighting} />
            <Badge category="angle" value={status.angle} />
            <Badge category="forehead" value={status.foreheadVisible ? 'ok' : 'hidden'} />
          </div>
        )}
      </div>

      {/* ─── Below-container guidance + controls ─────────── */}
      <div className="flex flex-col items-center gap-3 mt-7 px-6">
        {initState === 'ready' && !preview && (
          <div className="flex flex-col items-center gap-1.5">
            {isMulti && (
              <span className="px-3 py-1 rounded-full bg-[rgba(196,163,90,0.1)] border border-[rgba(196,163,90,0.15)] text-[9px] font-medium tracking-[0.15em] uppercase text-[#D4B96A]">
                {currentStepLabel} — {stepNumber}/3
              </span>
            )}

            <p className={`font-display text-[18px] font-light tracking-[-0.01em] text-center transition-all duration-500 ${
              canCapture
                ? 'text-[#7DCE9E]'
                : !status.faceDetected
                  ? 'text-white/35'
                  : status.validCount >= 2
                    ? 'text-[#D4B96A]'
                    : 'text-[#E07070]'
            }`}>
              {canCapture
                ? 'Pozisyon uygun'
                : isMulti && !status.faceDetected
                  ? MULTI_INSTRUCTIONS[multiStep]
                  : status.mainMessage
              }
            </p>

            {!canCapture && status.faceDetected && (
              <p className="font-body text-[10px] text-white/25 text-center transition-opacity duration-500" key={tipIndex}>
                {TIPS[tipIndex]}
              </p>
            )}
            {!status.faceDetected && (
              <p className="font-body text-[10px] text-white/20 text-center">
                Yüzünüzü çerçevenin ortasına yerleştirin
              </p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="pb-[env(safe-area-inset-bottom,16px)] flex flex-col items-center gap-2">
          {!preview ? (
            <>
              {/* Quality score indicator */}
              {status.faceDetected && countdown === null && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-24 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(status.qualityScore * 100)}%`,
                        background: status.qualityScore >= AUTO_CAPTURE_QUALITY_THRESHOLD
                          ? 'linear-gradient(90deg, #3D9B7A, #7DCE9E)'
                          : status.qualityScore >= 0.5
                            ? 'linear-gradient(90deg, #C4A35A, #D4B96A)'
                            : 'linear-gradient(90deg, #A05252, #C47A7A)',
                      }}
                    />
                  </div>
                  <span className="font-body text-[9px] text-white/30 tabular-nums w-7">
                    {Math.round(status.qualityScore * 100)}%
                  </span>
                </div>
              )}

              {/* Failsafe manual capture button — shown after FAILSAFE_MS */}
              {(canManualCapture || canCapture) && countdown === null ? (
                <>
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    className="group relative"
                    aria-label="Fotoğraf çek"
                  >
                    <div className={`w-[76px] h-[76px] rounded-full border-[3px] transition-all duration-500 flex items-center justify-center ${
                      canCapture
                        ? 'border-[#3D9B7A] shadow-[0_0_28px_rgba(61,155,122,0.35)]'
                        : 'border-[rgba(196,163,90,0.5)] shadow-[0_0_20px_rgba(196,163,90,0.2)]'
                    }`}>
                      <div className={`w-[62px] h-[62px] rounded-full transition-all duration-300 ${
                        canCapture
                          ? 'bg-white group-hover:bg-[#E8FFF0] group-active:scale-90'
                          : 'bg-[rgba(255,255,255,0.15)] group-hover:bg-[rgba(255,255,255,0.25)] group-active:scale-90'
                      }`} />
                    </div>
                    {canCapture && (
                      <div className="absolute inset-[-7px] rounded-full border-2 border-[#3D9B7A] animate-ping opacity-20" />
                    )}
                  </button>
                  <p className="font-body text-[9px] text-white/20 tracking-[0.15em] uppercase">
                    {canCapture ? 'Otomatik çekim hazır' : 'Manuel çekim yapabilirsiniz'}
                  </p>
                </>
              ) : countdown !== null ? (
                <p className="font-body text-[11px] text-[#7DCE9E] tracking-[0.1em] uppercase animate-pulse">
                  Otomatik çekim...
                </p>
              ) : (
                <>
                  <div className="w-[76px] h-[76px] rounded-full border-[3px] border-[rgba(255,255,255,0.06)] flex items-center justify-center">
                    <div className="w-[62px] h-[62px] rounded-full bg-[rgba(255,255,255,0.04)]" />
                  </div>
                  <p className="font-body text-[9px] text-white/20 tracking-[0.15em] uppercase">
                    Otomatik çekim yapılacak
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="flex gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={retake}
                className="flex-1 font-body text-[12px] font-medium tracking-[0.1em] uppercase py-3.5 rounded-[14px] border border-white/12 text-white/50 hover:text-white hover:border-white/25 transition-all active:scale-[0.98]"
              >
                Yeniden Çek
              </button>
              <button
                type="button"
                onClick={isMulti ? confirmMulti : confirmSingle}
                className="flex-1 font-body text-[12px] font-medium tracking-[0.1em] uppercase py-3.5 rounded-[14px] bg-gradient-to-br from-[#2D5F5D] to-[#3D7A5F] text-white hover:shadow-[0_4px_20px_rgba(45,95,93,0.4)] transition-all active:scale-[0.98]"
              >
                {isMulti && multiStep !== 'right' ? 'Sonraki' : 'Kullan'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
