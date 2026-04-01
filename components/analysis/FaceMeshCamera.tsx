'use client'

/* eslint-disable @typescript-eslint/no-explicit-any -- Legacy MediaPipe CDN globals use untyped APIs */

import { useEffect, useRef, useState, useCallback } from 'react'

/* ─── MediaPipe CDN globals ─────────────────────────────────── */
declare global {
  interface Window {
    FaceMesh: any
    Camera: any
    drawConnectors: (ctx: CanvasRenderingContext2D, landmarks: any[], connections: any[], style: any) => void
    drawLandmarks: (ctx: CanvasRenderingContext2D, landmarks: any[], style: any) => void
    FACEMESH_TESSELATION: any
    FACEMESH_FACE_OVAL: any
    FACEMESH_LEFT_EYE: any
    FACEMESH_RIGHT_EYE: any
    FACEMESH_LEFT_EYEBROW: any
    FACEMESH_RIGHT_EYEBROW: any
    FACEMESH_LIPS: any
    FACEMESH_LEFT_IRIS: any
    FACEMESH_RIGHT_IRIS: any
  }
}

/* ─── Types ─────────────────────────────────────────────────── */
export interface CaptureMetadata {
  confidence: 'high' | 'medium' | 'low'
  missingCheck: string | null
}

interface FaceMeshCameraProps {
  onCapture: (dataUrl: string, meta?: CaptureMetadata) => void
  onClose: () => void
  /** When true, auto-captured high-confidence frames skip the preview and call onCapture immediately */
  autoConfirm?: boolean
}

type Phase =
  | 'loading'       // scripts loading
  | 'initializing'  // camera + model init
  | 'detecting'     // searching for face
  | 'tracking'      // face found, not yet valid
  | 'validating'    // all checks pass, confirming stability
  | 'countdown'     // 3-2-1 auto-capture countdown
  | 'captured'      // photo taken, showing preview
  | 'error'

interface FaceBBox { x: number; y: number; w: number; h: number }

interface ValidationState {
  centered: boolean
  sizeOk: boolean
  angleOk: boolean
  lightOk: boolean
  stable: boolean
  allPass: boolean
}

interface ScoredFrame {
  dataUrl: string
  score: number
  timestamp: number
}

/* ─── Constants ─────────────────────────────────────────────── */
const MEDIAPIPE_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js',
]

// Colors
const COLOR_TRACKING = '#A078FF'    // purple — tracking, not ready
const COLOR_READY = '#4AE68A'       // green — all checks pass
const COLOR_IRIS = '#5BC0EB'
const LW = 1

// Face crop
const FACE_MARGIN = 0.22
const SMOOTH_FACTOR = 0.15
const LOCK_FRAMES = 3
const UNLOCK_FRAMES = 6
const VIEWPORT_ASPECT = 3 / 4 // portrait

// Validation thresholds
const CENTER_TOLERANCE = 0.15       // face center must be within 15% of frame center
const MIN_FACE_RATIO = 0.22         // face must fill ≥22% of frame width
const MAX_FACE_RATIO = 0.65         // face must fill ≤65% of frame width
const MAX_YAW = 22                  // hard limit head yaw degrees
const MAX_PITCH = 20                // hard limit head pitch degrees
const MAX_ROLL = 15                 // hard limit head roll degrees
const SOFT_YAW = 15                 // soft warning threshold
const SOFT_PITCH = 13               // soft warning threshold
const SOFT_ROLL = 10                // soft warning threshold
const MIN_BRIGHTNESS = 80           // 0-255
const MAX_BRIGHTNESS = 220
const STABILITY_THRESHOLD = 0.025   // max inter-frame face center movement
const VALID_FRAMES_REQUIRED = 5     // valid frames before countdown
const COUNTDOWN_SECONDS = 3
const BEST_FRAME_BUFFER = 15
const ANGLE_SMOOTHING = 0.35        // EMA factor for yaw/pitch (dampens flicker)
const COUNTDOWN_GRACE_FRAMES = 3    // invalid frames tolerated before cancelling countdown

// Guidance texts (Turkish)
const GUIDANCE: Record<string, string> = {
  searching: 'Yüzünüzü kameraya gösterin',
  notCentered: 'Yüzünüzü ortalayın',
  tooFar: 'Biraz yaklaşın',
  tooClose: 'Biraz uzaklaşın',
  badAngle: 'Başınızı düz tutun',
  softAngle: 'Başınızı biraz düzeltin',
  darkLight: 'Işık yetersiz, aydınlık bir alana geçin',
  brightLight: 'Çok parlak, ışığı azaltın',
  unstable: 'Sabit kalın',
  ready: 'Mükemmel! Sabit kalın...',
  capturing: 'Fotoğraf çekiliyor...',
}

// Near-valid guidance (1 condition missing — manual capture allowed)
const NEAR_VALID_GUIDANCE: Record<string, string> = {
  notCentered: 'Fotoğraf çekilebilir, ancak yüzünüzü ortalamaya çalışın',
  tooFar: 'Fotoğraf çekilebilir, ancak biraz daha yaklaşın',
  tooClose: 'Fotoğraf çekilebilir, ancak biraz uzaklaşın',
  badAngle: 'Fotoğraf çekilebilir, ancak başınızı düz tutun',
  darkLight: 'Işık koşulları iyileştirilebilir, fotoğraf çekilebilir',
  brightLight: 'Işık koşulları iyileştirilebilir, fotoğraf çekilebilir',
  unstable: 'Daha stabil durursanız sonuçlar daha doğru olur',
}

/* ─── Helpers ───────────────────────────────────────────────── */
function hexToRGBA(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function lerpBox(a: FaceBBox, b: FaceBBox, t: number): FaceBBox {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) }
}

function computeFaceBBox(landmarks: any[]): FaceBBox {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x
    if (lm.x > maxX) maxX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.y > maxY) maxY = lm.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function expandBBox(box: FaceBBox, margin: number, videoAspect: number): FaceBBox {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let w = box.w * (1 + margin * 2)
  let h = box.h * (1 + margin * 2)
  const targetAspect = VIEWPORT_ASPECT
  const currentAspect = (w * videoAspect) / h
  if (currentAspect > targetAspect) h = (w * videoAspect) / targetAspect
  else w = (h * targetAspect) / videoAspect
  let x = Math.max(0, cx - w / 2)
  let y = Math.max(0, cy - h / 2)
  if (x + w > 1) x = Math.max(0, 1 - w)
  if (y + h > 1) y = Math.max(0, 1 - h)
  w = Math.min(w, 1 - x); h = Math.min(h, 1 - y)
  return { x, y, w, h }
}

/** Estimate head yaw from nose-cheek asymmetry (arcsin-based for better degree mapping) */
function estimateYaw(landmarks: any[]): number {
  const noseTip = landmarks[1]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  if (!noseTip || !leftCheek || !rightCheek) return 0
  const leftDist = Math.abs(noseTip.x - leftCheek.x)
  const rightDist = Math.abs(noseTip.x - rightCheek.x)
  const totalWidth = leftDist + rightDist
  if (totalWidth < 0.001) return 0
  // asymmetry: 0 = perfectly centered, ±1 = fully to one side
  const asymmetry = (leftDist - rightDist) / totalWidth
  // arcsin maps asymmetry to degrees more accurately than linear scaling
  // clamp to avoid NaN from floating-point noise
  return Math.asin(Math.max(-1, Math.min(1, asymmetry))) * (180 / Math.PI) * 1.4
}

/**
 * Estimate head pitch using inner-eye-corners as a stable reference.
 * Ratio of (eye-line to nose-tip) vs (nose-tip to chin) is more stable
 * than forehead-to-nose, because forehead landmark (10) shifts with hair/head shape.
 */
function estimatePitch(landmarks: any[]): number {
  const noseTip = landmarks[1]
  const leftInnerEye = landmarks[133]
  const rightInnerEye = landmarks[362]
  const chinBottom = landmarks[152]
  if (!noseTip || !leftInnerEye || !rightInnerEye || !chinBottom) return 0
  const eyeMidY = (leftInnerEye.y + rightInnerEye.y) / 2
  const eyeToNose = noseTip.y - eyeMidY
  const noseToChin = chinBottom.y - noseTip.y
  if (noseToChin < 0.001) return 0
  const ratio = eyeToNose / noseToChin
  // Neutral ratio is ~0.65-0.75 for most faces. Center on 0.70.
  // Positive = looking down, negative = looking up
  return (ratio - 0.70) * 70
}

/** Estimate head roll from eye-line tilt */
function estimateRoll(landmarks: any[]): number {
  const leftEyeOuter = landmarks[33]
  const rightEyeOuter = landmarks[263]
  if (!leftEyeOuter || !rightEyeOuter) return 0
  const dx = rightEyeOuter.x - leftEyeOuter.x
  const dy = rightEyeOuter.y - leftEyeOuter.y
  if (Math.abs(dx) < 0.001) return 0
  return Math.atan2(dy, dx) * (180 / Math.PI)
}

/** Estimate average brightness from canvas image data */
function estimateBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const sampleSize = 100
  const stepX = Math.max(1, Math.floor(w / sampleSize))
  const stepY = Math.max(1, Math.floor(h / sampleSize))
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  let sum = 0, count = 0
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const i = (y * w + x) * 4
      sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      count++
    }
  }
  return count > 0 ? sum / count : 128
}

/* ─── Component ─────────────────────────────────────────────── */
export function FaceMeshCamera({ onCapture, onClose, autoConfirm = false }: FaceMeshCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const meshCanvasRef = useRef<HTMLCanvasElement>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const faceMeshRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const handleResultsRef = useRef<(r: any) => void>(() => {})

  // UI state
  const [phase, setPhase] = useState<Phase>('loading')
  const [guidance, setGuidance] = useState(GUIDANCE.searching)
  const [validation, setValidation] = useState<ValidationState>({
    centered: false, sizeOk: false, angleOk: false, lightOk: false, stable: false, allPass: false,
  })
  const [countdown, setCountdown] = useState(0)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [showFlash, setShowFlash] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [fps, setFps] = useState(0)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [nearValid, setNearValid] = useState(false)

  // Hot-path refs (no re-renders)
  const phaseRef = useRef<Phase>('loading')
  const fpsFramesRef = useRef(0)
  const fpsLastRef = useRef(0) // initialized in effect
  const faceDetectedRef = useRef(false)

  // Face lock + crop
  const lockCountRef = useRef(0)
  const unlockCountRef = useRef(0)
  const faceLockedRef = useRef(false)
  const currentCropRef = useRef<FaceBBox>({ x: 0, y: 0, w: 1, h: 1 })
  const targetCropRef = useRef<FaceBBox>({ x: 0, y: 0, w: 1, h: 1 })

  // Validation state (refs for hot-path)
  const validationRef = useRef<ValidationState>({
    centered: false, sizeOk: false, angleOk: false, lightOk: false, stable: false, allPass: false,
  })
  const validFrameCountRef = useRef(0)
  const prevFaceCenterRef = useRef<{ x: number; y: number } | null>(null)
  const smoothedYawRef = useRef(0)
  const smoothedPitchRef = useRef(0)
  const smoothedRollRef = useRef(0)
  const countdownGraceRef = useRef(0)
  const guidanceRef = useRef(GUIDANCE.searching)

  // Countdown
  const countdownRef = useRef(0)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Near-valid tracking (4/5 checks pass → manual capture allowed)
  const nearValidRef = useRef(false)
  const nearValidMissingRef = useRef<string | null>(null)
  const captureMetaRef = useRef<CaptureMetadata>({ confidence: 'high', missingCheck: null })

  // Best frame buffer
  const bestFramesRef = useRef<ScoredFrame[]>([])

  // Sync phase ref
  const setPhaseSync = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  /* ── Periodic UI sync (4 Hz for responsive guidance) ── */
  useEffect(() => {
    const iv = setInterval(() => {
      setValidation({ ...validationRef.current })
      setGuidance(guidanceRef.current)
      setNearValid(nearValidRef.current)
      const crop = currentCropRef.current
      setZoomLevel(crop.w > 0.01 ? Math.round((1 / crop.w) * 10) / 10 : 1)
    }, 250)
    return () => clearInterval(iv)
  }, [])

  /* ── Countdown logic ── */
  const startCountdown = useCallback(() => {
    if (countdownTimerRef.current) return // already running
    countdownRef.current = COUNTDOWN_SECONDS
    setCountdown(COUNTDOWN_SECONDS)
    guidanceRef.current = GUIDANCE.ready

    countdownTimerRef.current = setInterval(() => {
      countdownRef.current--
      setCountdown(countdownRef.current)

      if (countdownRef.current <= 0) {
        // Countdown complete — auto capture
        cancelCountdown() // eslint-disable-line react-hooks/immutability -- forward ref safe in timer callback
        guidanceRef.current = GUIDANCE.capturing
        setGuidance(GUIDANCE.capturing)
        doAutoCapture() // eslint-disable-line react-hooks/immutability -- forward ref safe in timer callback
      }
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    countdownRef.current = 0
    setCountdown(0)
  }, [])

  /* ── Auto capture (best frame from buffer) ── */
  const doAutoCapture = useCallback(() => {
    const video = videoRef.current
    const capCanvas = captureCanvasRef.current
    if (!video || !capCanvas) return

    // Pick best scored frame, or capture live if buffer empty
    const best = bestFramesRef.current.sort((a, b) => b.score - a.score)[0]

    if (best) {
      setCapturedImage(best.dataUrl)
    } else {
      // Fallback: capture current frame
      const crop = currentCropRef.current
      const vw = video.videoWidth, vh = video.videoHeight
      const sx = crop.x * vw, sy = crop.y * vh, sw = crop.w * vw, sh = crop.h * vh
      const outW = Math.min(Math.round(sw), 1280)
      const outH = Math.min(Math.round(sh), 1280)
      capCanvas.width = outW; capCanvas.height = outH
      const ctx = capCanvas.getContext('2d')!
      ctx.save(); ctx.translate(outW, 0); ctx.scale(-1, 1)
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
      ctx.restore()
      setCapturedImage(capCanvas.toDataURL('image/jpeg', 0.92))
    }

    setShowFlash(true)
    setTimeout(() => setShowFlash(false), 400)
    captureMetaRef.current = { confidence: 'high', missingCheck: null }
    bestFramesRef.current = []

    // Auto-confirm: skip preview, call onCapture immediately
    const capturedUrl = best ? best.dataUrl : capCanvas.toDataURL('image/jpeg', 0.92)
    if (autoConfirm) {
      setPhaseSync('captured')
      // Small delay for flash animation, then auto-advance
      setTimeout(() => onCapture(capturedUrl, captureMetaRef.current), 500)
    } else {
      setPhaseSync('captured')
    }
  }, [setPhaseSync, autoConfirm, onCapture])

  /* ── Score and buffer a frame during countdown ── */
  const bufferFrame = useCallback((v: ValidationState, brightness: number) => {
    const video = videoRef.current
    const capCanvas = captureCanvasRef.current
    if (!video || !capCanvas) return

    const crop = currentCropRef.current
    const vw = video.videoWidth, vh = video.videoHeight
    const sx = crop.x * vw, sy = crop.y * vh, sw = crop.w * vw, sh = crop.h * vh
    const outW = Math.min(Math.round(sw), 1024)
    const outH = Math.min(Math.round(sh), 1024)
    capCanvas.width = outW; capCanvas.height = outH
    const ctx = capCanvas.getContext('2d')!
    ctx.save(); ctx.translate(outW, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
    ctx.restore()

    // Score: center + size + angle + light + stability (all boolean → 0 or 1, weighted)
    let score = 0
    if (v.centered) score += 25
    if (v.sizeOk) score += 20
    if (v.angleOk) score += 20
    if (v.lightOk) score += 15
    if (v.stable) score += 20
    // Bonus for ideal brightness
    const brightnessDelta = Math.abs(brightness - 150)
    score += Math.max(0, 10 - brightnessDelta / 10)

    const buf = bestFramesRef.current
    buf.push({ dataUrl: capCanvas.toDataURL('image/jpeg', 0.92), score, timestamp: Date.now() })
    if (buf.length > BEST_FRAME_BUFFER) buf.shift()
  }, [])

  /* ── Results handler (hot path) ── */
  useEffect(() => {
    handleResultsRef.current = (results: any) => {
      if (phaseRef.current === 'captured' || phaseRef.current === 'error') return

      // FPS
      fpsFramesRef.current++
      const now = performance.now()
      if (now - fpsLastRef.current >= 1000) {
        setFps(fpsFramesRef.current)
        fpsFramesRef.current = 0
        fpsLastRef.current = now
      }

      const video = videoRef.current
      const meshCanvas = meshCanvasRef.current
      const cropCanvas = cropCanvasRef.current
      if (!video || !meshCanvas || !cropCanvas) return
      const meshCtx = meshCanvas.getContext('2d')
      const cropCtx = cropCanvas.getContext('2d')
      if (!meshCtx || !cropCtx) return

      if (meshCanvas.width !== video.videoWidth || meshCanvas.height !== video.videoHeight) {
        meshCanvas.width = video.videoWidth
        meshCanvas.height = video.videoHeight
      }
      meshCtx.clearRect(0, 0, meshCanvas.width, meshCanvas.height)

      const hasFace = results.multiFaceLandmarks?.length > 0
      const landmarks = hasFace ? results.multiFaceLandmarks[0] : null

      // ── No face ──
      if (!hasFace || !landmarks) {
        faceDetectedRef.current = false
        unlockCountRef.current = Math.min(unlockCountRef.current + 1, UNLOCK_FRAMES)
        lockCountRef.current = 0
        if (unlockCountRef.current >= UNLOCK_FRAMES) {
          faceLockedRef.current = false
          targetCropRef.current = { x: 0, y: 0, w: 1, h: 1 }
        }
        validFrameCountRef.current = 0
        prevFaceCenterRef.current = null
        smoothedYawRef.current = 0
        smoothedPitchRef.current = 0
        smoothedRollRef.current = 0
        countdownGraceRef.current = 0
        validationRef.current = { centered: false, sizeOk: false, angleOk: false, lightOk: false, stable: false, allPass: false }
        guidanceRef.current = GUIDANCE.searching

        if (phaseRef.current !== 'loading' && phaseRef.current !== 'initializing') {
          setPhaseSync('detecting')
        }
        // Cancel countdown if running
        if (countdownRef.current > 0) cancelCountdown()

        // Still render crop canvas (zooming out smoothly)
        renderCropCanvas(video, meshCanvas, cropCanvas, cropCtx)
        return
      }

      // ── Face detected ──
      faceDetectedRef.current = true
      lockCountRef.current = Math.min(lockCountRef.current + 1, LOCK_FRAMES)
      unlockCountRef.current = 0
      if (lockCountRef.current >= LOCK_FRAMES) faceLockedRef.current = true

      // Compute crop
      const rawBox = computeFaceBBox(landmarks)
      const videoAspect = video.videoWidth / video.videoHeight
      targetCropRef.current = expandBBox(rawBox, FACE_MARGIN, videoAspect)

      // ── Validation checks ──
      const faceCx = rawBox.x + rawBox.w / 2
      const faceCy = rawBox.y + rawBox.h / 2
      const centered = Math.abs(faceCx - 0.5) < CENTER_TOLERANCE && Math.abs(faceCy - 0.5) < CENTER_TOLERANCE
      const faceRatio = rawBox.w
      const sizeOk = faceRatio >= MIN_FACE_RATIO && faceRatio <= MAX_FACE_RATIO
      const rawYaw = estimateYaw(landmarks)
      const rawPitch = estimatePitch(landmarks)
      const rawRoll = estimateRoll(landmarks)
      smoothedYawRef.current = smoothedYawRef.current * (1 - ANGLE_SMOOTHING) + rawYaw * ANGLE_SMOOTHING
      smoothedPitchRef.current = smoothedPitchRef.current * (1 - ANGLE_SMOOTHING) + rawPitch * ANGLE_SMOOTHING
      smoothedRollRef.current = smoothedRollRef.current * (1 - ANGLE_SMOOTHING) + rawRoll * ANGLE_SMOOTHING
      const yaw = Math.abs(smoothedYawRef.current)
      const pitch = Math.abs(smoothedPitchRef.current)
      const roll = Math.abs(smoothedRollRef.current)
      // Hard fail: beyond hard limits — reject frame
      const angleOk = yaw < MAX_YAW && pitch < MAX_PITCH && roll < MAX_ROLL
      // Soft warning: within hard limits but past soft thresholds — pass but show guidance
      const angleSoft = yaw >= SOFT_YAW || pitch >= SOFT_PITCH || roll >= SOFT_ROLL

      // Brightness (sample from crop canvas after render)
      // We'll compute after drawing, but use previous frame's brightness for this check
      let lightOk = validationRef.current.lightOk // carry forward, update below

      // Stability
      let stable = false
      if (prevFaceCenterRef.current) {
        const dx = Math.abs(faceCx - prevFaceCenterRef.current.x)
        const dy = Math.abs(faceCy - prevFaceCenterRef.current.y)
        stable = dx < STABILITY_THRESHOLD && dy < STABILITY_THRESHOLD
      }
      prevFaceCenterRef.current = { x: faceCx, y: faceCy }

      const allPass = centered && sizeOk && angleOk && lightOk && stable
      validationRef.current = { centered, sizeOk, angleOk, lightOk, stable, allPass }

      // Near-valid detection: exactly 1 condition failing → manual capture allowed
      const passCount = [centered, sizeOk, angleOk, lightOk, stable].filter(Boolean).length
      const isNearValid = passCount >= 4 && !allPass
      nearValidRef.current = isNearValid

      if (isNearValid) {
        // Identify the single missing check for targeted guidance
        if (!centered) nearValidMissingRef.current = 'notCentered'
        else if (!sizeOk) nearValidMissingRef.current = faceRatio < MIN_FACE_RATIO ? 'tooFar' : 'tooClose'
        else if (!angleOk) nearValidMissingRef.current = 'badAngle'
        else if (!lightOk) nearValidMissingRef.current = 'darkLight'
        else if (!stable) nearValidMissingRef.current = 'unstable'
      } else {
        nearValidMissingRef.current = null
      }

      // Guidance text (priority order — softer when near-valid)
      if (isNearValid && nearValidMissingRef.current) {
        guidanceRef.current = NEAR_VALID_GUIDANCE[nearValidMissingRef.current] || GUIDANCE.ready
      } else if (!centered) guidanceRef.current = GUIDANCE.notCentered
      else if (faceRatio < MIN_FACE_RATIO) guidanceRef.current = GUIDANCE.tooFar
      else if (faceRatio > MAX_FACE_RATIO) guidanceRef.current = GUIDANCE.tooClose
      else if (!angleOk) guidanceRef.current = GUIDANCE.badAngle
      else if (!lightOk) guidanceRef.current = validationRef.current.lightOk ? GUIDANCE.unstable : GUIDANCE.darkLight
      else if (!stable) guidanceRef.current = GUIDANCE.unstable
      else if (angleSoft) guidanceRef.current = GUIDANCE.softAngle
      else guidanceRef.current = countdownRef.current > 0 ? GUIDANCE.capturing : GUIDANCE.ready

      // Valid frame counting
      if (allPass) {
        validFrameCountRef.current++
        countdownGraceRef.current = 0
      } else {
        validFrameCountRef.current = Math.max(0, validFrameCountRef.current - 1) // gentle decay
        if (countdownRef.current > 0) {
          countdownGraceRef.current++
          if (countdownGraceRef.current >= COUNTDOWN_GRACE_FRAMES) {
            cancelCountdown()
            countdownGraceRef.current = 0
          }
        }
      }

      // Phase transitions
      if (phaseRef.current === 'detecting' || phaseRef.current === 'tracking' || phaseRef.current === 'validating') {
        if (!allPass) {
          setPhaseSync(faceLockedRef.current ? 'tracking' : 'detecting')
        } else if (validFrameCountRef.current >= VALID_FRAMES_REQUIRED) {
          if (countdownRef.current === 0) {
            setPhaseSync('countdown')
            startCountdown()
          }
        } else {
          setPhaseSync('validating')
        }
      }

      // Determine mesh color based on validation
      const meshColor = allPass ? COLOR_READY : COLOR_TRACKING

      // Draw mesh on full-res hidden canvas
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_TESSELATION, {
        color: hexToRGBA(meshColor, 0.35), lineWidth: LW * 0.7,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_FACE_OVAL, {
        color: hexToRGBA(meshColor, 0.7), lineWidth: LW * 2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_LEFT_EYE, {
        color: hexToRGBA(meshColor, 0.6), lineWidth: LW * 1.2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_RIGHT_EYE, {
        color: hexToRGBA(meshColor, 0.6), lineWidth: LW * 1.2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_LEFT_EYEBROW, {
        color: hexToRGBA(meshColor, 0.55), lineWidth: LW * 1.2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_RIGHT_EYEBROW, {
        color: hexToRGBA(meshColor, 0.55), lineWidth: LW * 1.2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_LIPS, {
        color: hexToRGBA(meshColor, 0.7), lineWidth: LW * 1.2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_LEFT_IRIS, {
        color: hexToRGBA(COLOR_IRIS, 0.7), lineWidth: LW * 2,
      })
      window.drawConnectors(meshCtx, landmarks, window.FACEMESH_RIGHT_IRIS, {
        color: hexToRGBA(COLOR_IRIS, 0.7), lineWidth: LW * 2,
      })

      // Render cropped view
      renderCropCanvas(video, meshCanvas, cropCanvas, cropCtx)

      // Post-render brightness check
      try {
        const brightness = estimateBrightness(cropCtx, cropCanvas.width, cropCanvas.height)
        lightOk = brightness >= MIN_BRIGHTNESS && brightness <= MAX_BRIGHTNESS
        validationRef.current.lightOk = lightOk
        validationRef.current.allPass = centered && sizeOk && angleOk && lightOk && stable
      } catch { /* ignore security errors on some browsers */ }

      // Buffer frames during countdown for best-frame selection
      if (countdownRef.current > 0 && validationRef.current.allPass) {
        bufferFrame(validationRef.current, 150)
      }
    }

    function renderCropCanvas(
      video: HTMLVideoElement,
      meshCanvas: HTMLCanvasElement,
      cropCanvas: HTMLCanvasElement,
      cropCtx: CanvasRenderingContext2D,
    ) {
      const sf = faceLockedRef.current ? SMOOTH_FACTOR : SMOOTH_FACTOR * 0.5
      currentCropRef.current = lerpBox(currentCropRef.current, targetCropRef.current, sf)

      const crop = currentCropRef.current
      const vw = video.videoWidth, vh = video.videoHeight
      const sx = crop.x * vw, sy = crop.y * vh, sw = crop.w * vw, sh = crop.h * vh

      const dpr = window.devicePixelRatio || 1
      const displayW = Math.round(cropCanvas.clientWidth * dpr)
      const displayH = Math.round(cropCanvas.clientHeight * dpr)
      if (cropCanvas.width !== displayW || cropCanvas.height !== displayH) {
        cropCanvas.width = displayW
        cropCanvas.height = displayH
      }

      cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height)

      // Mirrored cropped video
      cropCtx.save()
      cropCtx.translate(cropCanvas.width, 0)
      cropCtx.scale(-1, 1)
      cropCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height)
      cropCtx.restore()

      // Mirrored cropped mesh
      cropCtx.save()
      cropCtx.translate(cropCanvas.width, 0)
      cropCtx.scale(-1, 1)
      cropCtx.drawImage(meshCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height)
      cropCtx.restore()

      // Vignette
      const vigGrad = cropCtx.createRadialGradient(
        cropCanvas.width / 2, cropCanvas.height / 2,
        Math.min(cropCanvas.width, cropCanvas.height) * 0.32,
        cropCanvas.width / 2, cropCanvas.height / 2,
        Math.max(cropCanvas.width, cropCanvas.height) * 0.62,
      )
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)')
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.35)')
      cropCtx.fillStyle = vigGrad
      cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height)
    }
  }, [setPhaseSync, cancelCountdown, startCountdown, bufferFrame])

  /* ── Cleanup ── */
  const cleanup = useCallback(() => {
    cancelCountdown()
    if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    faceMeshRef.current = null
  }, [cancelCountdown])

  /* ── Initialization ── */
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        for (const src of MEDIAPIPE_SCRIPTS) await loadScript(src)
        if (cancelled) return
        setPhaseSync('initializing')

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current!
        video.srcObject = stream
        await new Promise<void>(resolve => { video.onloadedmetadata = () => resolve() })
        if (cancelled) return

        const canvas = meshCanvasRef.current!
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const fm = new window.FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        })
        faceMeshRef.current = fm
        fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 })
        fm.onResults((r: any) => { if (!cancelled) handleResultsRef.current(r) })

        const cam = new window.Camera(video, {
          onFrame: async () => { if (faceMeshRef.current) await faceMeshRef.current.send({ image: video }) },
          width: video.videoWidth, height: video.videoHeight,
        })
        cameraRef.current = cam
        cam.start()
        if (!cancelled) setPhaseSync('detecting')
      } catch (err: any) {
        if (!cancelled) {
          setPhaseSync('error')
          setErrorMsg(err?.message?.includes('Permission')
            ? 'Kamera erişimi reddedildi. Lütfen tarayıcı ayarlarından izin verin.'
            : 'Kamera başlatılamadı. Lütfen tekrar deneyin.')
        }
      }
    }

    init()
    return () => { cancelled = true; cleanup() }
  }, [cleanup, setPhaseSync])

  /* ── Manual capture (enabled when ≥4/5 checks pass) ── */
  const handleManualCapture = useCallback(() => {
    const v = validationRef.current
    const passCount = [v.centered, v.sizeOk, v.angleOk, v.lightOk, v.stable].filter(Boolean).length
    if (passCount < 4) return // safety guard

    const video = videoRef.current
    const capCanvas = captureCanvasRef.current
    if (!video || !capCanvas) return

    setShowFlash(true)
    setTimeout(() => setShowFlash(false), 400)

    const crop = currentCropRef.current
    const vw = video.videoWidth, vh = video.videoHeight
    const sx = crop.x * vw, sy = crop.y * vh, sw = crop.w * vw, sh = crop.h * vh
    const outW = Math.min(Math.round(sw), 1280), outH = Math.min(Math.round(sh), 1280)
    capCanvas.width = outW; capCanvas.height = outH
    const ctx = capCanvas.getContext('2d')!
    ctx.save(); ctx.translate(outW, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)
    ctx.restore()

    // Tag capture confidence based on validation state
    captureMetaRef.current = {
      confidence: v.allPass ? 'high' : 'medium',
      missingCheck: nearValidMissingRef.current,
    }

    setCapturedImage(capCanvas.toDataURL('image/jpeg', 0.92))
    cancelCountdown()
    setPhaseSync('captured')
  }, [cancelCountdown, setPhaseSync])

  const handleRetake = useCallback(() => {
    setCapturedImage(null)
    bestFramesRef.current = []
    validFrameCountRef.current = 0
    setPhaseSync('detecting')
  }, [setPhaseSync])

  const handleConfirm = useCallback(() => {
    if (capturedImage) onCapture(capturedImage, captureMetaRef.current)
  }, [capturedImage, onCapture])

  /* ─── Render ──────────────────────────────────────────────── */
  const isLive = phase === 'detecting' || phase === 'tracking' || phase === 'validating' || phase === 'countdown'
  const isReady = validation.allPass
  const accentColor = isReady ? COLOR_READY : COLOR_TRACKING
  const borderAlpha = isReady ? 0.35 : 0.15

  // Validation progress bar (0-5 checks)
  const checksPassCount = [validation.centered, validation.sizeOk, validation.angleOk, validation.lightOk, validation.stable].filter(Boolean).length

  return (
    <>
      <style>{`
        @keyframes fm-scan{0%,100%{top:15%;opacity:0}10%{opacity:.8}50%{top:80%;opacity:.8}60%{opacity:0}}
        @keyframes fm-flash{0%{opacity:.9}100%{opacity:0}}
        @keyframes fm-pulse{0%,100%{opacity:.4;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
        @keyframes fm-spin{to{transform:rotate(360deg)}}
        @keyframes fm-glow-purple{0%,100%{box-shadow:0 0 20px rgba(160,120,255,0.12)}50%{box-shadow:0 0 35px rgba(160,120,255,0.25)}}
        @keyframes fm-glow-green{0%,100%{box-shadow:0 0 20px rgba(74,230,138,0.15)}50%{box-shadow:0 0 40px rgba(74,230,138,0.35)}}
        @keyframes fm-countdown-pulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:0.8}100%{transform:scale(1);opacity:1}}
        @keyframes fm-ring-fill{from{stroke-dashoffset:283}to{stroke-dashoffset:0}}
      `}</style>

      <div className="relative flex flex-col gap-0">
        {/* Hidden source elements */}
        <video ref={videoRef} autoPlay playsInline muted
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
        <canvas ref={meshCanvasRef}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />

        {/* ── Face-focused viewport ── */}
        <div
          className="relative mx-auto overflow-hidden rounded-t-2xl"
          style={{
            width: '100%', maxWidth: 400,
            aspectRatio: `${VIEWPORT_ASPECT}`,
            background: '#08080D',
            border: `1px solid rgba(${isReady ? '74,230,138' : '160,120,255'},${borderAlpha})`,
            animation: isLive ? (isReady ? 'fm-glow-green 2.5s ease-in-out infinite' : 'fm-glow-purple 3s ease-in-out infinite') : 'none',
            transition: 'border-color 0.6s ease, box-shadow 0.6s ease',
          }}
        >
          <canvas ref={cropCanvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }} />

          {/* Scan corners — color reacts to validation */}
          {isLive && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
              <div className="absolute" style={{ inset: 14 }}>
                {(['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'] as const).map((pos, i) => {
                  const isTop = pos.includes('top')
                  const isLeft = pos.includes('left')
                  return (
                    <div key={i} className={`absolute ${pos} w-5 h-5`} style={{
                      [isTop ? 'borderTop' : 'borderBottom']: `2px solid ${hexToRGBA(accentColor, 0.5)}`,
                      [isLeft ? 'borderLeft' : 'borderRight']: `2px solid ${hexToRGBA(accentColor, 0.5)}`,
                      borderRadius: `${isTop && isLeft ? '4px 0 0 0' : isTop ? '0 4px 0 0' : isLeft ? '0 0 0 4px' : '0 0 4px 0'}`,
                      transition: 'border-color 0.5s ease',
                    }} />
                  )
                })}
              </div>
              {phase === 'detecting' && (
                <div className="absolute" style={{
                  left: '10%', width: '80%', height: 1,
                  background: `linear-gradient(90deg, transparent, ${hexToRGBA(accentColor, 0.4)}, transparent)`,
                  animation: 'fm-scan 4s ease-in-out infinite',
                }} />
              )}
            </div>
          )}

          {/* Guidance text */}
          {isLive && (
            <div className="absolute left-0 right-0 top-4 flex justify-center pointer-events-none" style={{ zIndex: 6 }}>
              <div className="px-4 py-1.5 rounded-full" style={{
                background: 'rgba(10,10,15,0.65)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${hexToRGBA(accentColor, 0.15)}`,
                transition: 'border-color 0.5s ease',
              }}>
                <span className="text-[11px] font-medium tracking-wide" style={{
                  color: isReady ? COLOR_READY : 'rgba(255,255,255,0.7)',
                  transition: 'color 0.5s ease',
                }}>
                  {guidance}
                </span>
              </div>
            </div>
          )}

          {/* Validation indicator chips */}
          {isLive && faceDetectedRef.current && (
            <div className="absolute left-3 bottom-24 flex flex-col gap-1 pointer-events-none" style={{ zIndex: 6 }}>
              {[
                { label: 'Konum', ok: validation.centered },
                { label: 'Mesafe', ok: validation.sizeOk },
                { label: 'Açı', ok: validation.angleOk },
                { label: 'Işık', ok: validation.lightOk },
                { label: 'Stabilite', ok: validation.stable },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-1.5" style={{ opacity: 0.85 }}>
                  <div className="rounded-full" style={{
                    width: 5, height: 5,
                    background: ok ? COLOR_READY : 'rgba(255,255,255,0.2)',
                    boxShadow: ok ? `0 0 6px ${hexToRGBA(COLOR_READY, 0.5)}` : 'none',
                    transition: 'all 0.4s ease',
                  }} />
                  <span className="text-[9px] uppercase tracking-wider" style={{
                    color: ok ? 'rgba(74,230,138,0.8)' : 'rgba(255,255,255,0.3)',
                    transition: 'color 0.4s ease',
                  }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Countdown overlay */}
          {phase === 'countdown' && countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 8 }}>
              <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
                {/* Ring */}
                <svg width="100" height="100" className="absolute" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(74,230,138,0.15)" strokeWidth="3" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke={COLOR_READY} strokeWidth="3"
                    strokeDasharray="283" strokeDashoffset="283" strokeLinecap="round"
                    style={{ animation: `fm-ring-fill ${COUNTDOWN_SECONDS}s linear forwards` }} />
                </svg>
                {/* Number */}
                <span className="text-4xl font-light" style={{
                  color: COLOR_READY,
                  animation: 'fm-countdown-pulse 1s ease-in-out infinite',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {countdown}
                </span>
              </div>
            </div>
          )}

          {/* Zoom + progress indicator (top-right) */}
          {isLive && zoomLevel > 1.2 && (
            <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none" style={{ zIndex: 5 }}>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{
                background: 'rgba(10,10,15,0.6)', backdropFilter: 'blur(8px)',
                border: `1px solid ${hexToRGBA(accentColor, 0.15)}`,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={hexToRGBA(accentColor, 0.7)} strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                <span className="text-[10px] font-medium" style={{ color: hexToRGBA(accentColor, 0.8), fontVariantNumeric: 'tabular-nums' }}>
                  {zoomLevel}x
                </span>
              </div>
              {/* Progress dots */}
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-full" style={{
                    width: 4, height: 4,
                    background: i < checksPassCount ? COLOR_READY : 'rgba(255,255,255,0.15)',
                    transition: 'background 0.4s ease',
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Manual capture button — 3 tiers: disabled (<4 checks), warning (4/5), full (5/5) */}
          {isLive && phase !== 'countdown' && (() => {
            const canManual = checksPassCount >= 4
            const isPerfect = isReady
            const isWarning = nearValid && !isPerfect
            const btnBg = isPerfect ? 'rgba(74,230,138,0.12)'
              : isWarning ? 'rgba(229,168,59,0.08)'
              : 'rgba(255,255,255,0.03)'
            const btnBorder = isPerfect ? hexToRGBA(COLOR_READY, 0.6)
              : isWarning ? `rgba(229,168,59,0.45)`
              : 'rgba(255,255,255,0.12)'
            const innerBg = isPerfect ? 'rgba(74,230,138,0.85)'
              : isWarning ? 'rgba(229,168,59,0.7)'
              : 'rgba(255,255,255,0.15)'
            const ringBorder = isPerfect ? hexToRGBA(COLOR_READY, 0.1)
              : isWarning ? 'rgba(229,168,59,0.1)'
              : 'rgba(255,255,255,0.04)'

            return (
              <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2" style={{ bottom: 14, zIndex: 10 }}>
                <button
                  onClick={canManual ? handleManualCapture : undefined}
                  disabled={!canManual}
                  title={isPerfect ? 'Fotoğraf Çek' : isWarning ? 'Fotoğraf Çek (uyarı ile)' : 'Koşullar yetersiz'}
                  aria-label="Fotoğraf Çek"
                  className="group relative flex items-center justify-center transition-all"
                  style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: btnBg,
                    border: `3px solid ${btnBorder}`,
                    backdropFilter: 'blur(8px)',
                    opacity: canManual ? 1 : 0.3,
                    cursor: canManual ? 'pointer' : 'not-allowed',
                    transform: 'scale(1)',
                    transition: 'all 0.5s ease',
                  }}
                >
                  <div className="absolute rounded-full" style={{ inset: -6, border: `1px solid ${ringBorder}`, transition: 'all 0.5s ease' }} />
                  <div className="rounded-full transition-all" style={{
                    width: 40, height: 40,
                    background: innerBg,
                    transition: 'background 0.5s ease',
                    ...(canManual ? {} : { filter: 'grayscale(0.6)' }),
                  }} />
                  {/* Warning pulse ring for near-valid state */}
                  {isWarning && (
                    <div className="absolute rounded-full" style={{
                      inset: -3,
                      border: '1.5px solid rgba(229,168,59,0.3)',
                      animation: 'fm-pulse 2.5s ease-in-out infinite',
                    }} />
                  )}
                </button>
              </div>
            )
          })()}

          {/* Flash */}
          {showFlash && (
            <div className="absolute inset-0" style={{ background: 'white', zIndex: 25, animation: 'fm-flash 0.4s ease-out forwards' }} />
          )}

          {/* Loading */}
          {(phase === 'loading' || phase === 'initializing') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              style={{ zIndex: 8, background: 'rgba(8,8,13,0.92)', backdropFilter: 'blur(8px)' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '2px solid rgba(160,120,255,0.15)', borderTopColor: '#A078FF',
                animation: 'fm-spin 1s linear infinite',
              }} />
              <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {phase === 'loading' ? 'Face Mesh Yükleniyor...' : 'Kamera Başlatılıyor...'}
              </p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ zIndex: 8 }}>
              <div className="flex items-center justify-center rounded-full" style={{
                width: 60, height: 60, border: '1px solid rgba(232,93,117,0.3)', animation: 'fm-pulse 2s ease-in-out infinite',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(232,93,117,0.7)" strokeWidth="1">
                  <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{errorMsg}</p>
              <button onClick={onClose}
                className="mt-2 px-5 py-2 rounded-full text-[10px] uppercase tracking-[0.15em] transition-all"
                style={{ background: 'rgba(160,120,255,0.1)', border: '1px solid rgba(160,120,255,0.2)', color: 'rgba(255,255,255,0.7)' }}>
                Geri Dön
              </button>
            </div>
          )}

          {/* Captured preview */}
          {phase === 'captured' && capturedImage && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{
                zIndex: 30,
                background: 'radial-gradient(ellipse at center 40%, rgba(14,11,9,0.88) 0%, rgba(6,5,4,0.96) 100%)',
                backdropFilter: 'blur(20px) saturate(120%)',
                animation: 'fm-flash 0.3s ease-out reverse',
              }}
            >
              {/* Photo with glow ring */}
              <div className="relative" style={{ animation: 'countdownPop 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
                {/* Glow halo behind photo */}
                <div
                  className="absolute -inset-3 rounded-2xl"
                  style={{ background: 'radial-gradient(ellipse, rgba(74,230,138,0.12) 0%, transparent 70%)', filter: 'blur(12px)' }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capturedImage}
                  alt="Çekilen fotoğraf"
                  className="relative rounded-2xl"
                  style={{
                    maxWidth: '86%', maxHeight: '56%', marginLeft: 'auto', marginRight: 'auto', display: 'block',
                    border: '1px solid rgba(74,230,138,0.15)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(74,230,138,0.08)',
                  }}
                />
                {/* Success / near-valid badge */}
                {(() => {
                  const isMedium = captureMetaRef.current.confidence === 'medium'
                  const badgeColor = isMedium ? '#E5A83B' : '#4AE3A7'
                  const badgeText = isMedium ? 'Fotoğraf Hazır (Uyarı)' : 'Fotoğraf Hazır'
                  return (
                    <div
                      className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full"
                      style={{
                        background: 'rgba(14,11,9,0.85)', backdropFilter: 'blur(12px)',
                        border: `1px solid ${isMedium ? 'rgba(229,168,59,0.2)' : 'rgba(74,230,138,0.2)'}`,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        animation: 'stageFadeIn 0.3s ease-out 0.2s both',
                      }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: badgeColor, boxShadow: `0 0 6px ${badgeColor}80` }} />
                      <span className="text-[10px] font-medium uppercase tracking-[0.15em]" style={{ color: badgeColor }}>
                        {badgeText}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-8" style={{ animation: 'stageFadeIn 0.3s ease-out 0.3s both' }}>
                <button
                  onClick={handleRetake}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-medium uppercase tracking-[0.12em] transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                  style={{
                    background: 'rgba(248,246,242,0.04)',
                    border: '1px solid rgba(248,246,242,0.12)',
                    color: 'rgba(248,246,242,0.7)',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                  </svg>
                  Tekrar Çek
                </button>
                <button
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-medium uppercase tracking-[0.12em] transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #D6B98C 0%, #C4A35A 100%)',
                    color: '#0E0B09',
                    boxShadow: '0 8px 28px rgba(214,185,140,0.35)',
                    border: 'none',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Bu Fotoğrafı Kullan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Status bar ── */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-b-2xl mx-auto"
          style={{
            width: '100%', maxWidth: 400,
            background: 'linear-gradient(to right, rgba(10,9,14,0.85), rgba(14,12,20,0.85))',
            backdropFilter: 'blur(12px)',
            borderTop: `1px solid ${hexToRGBA(accentColor, 0.1)}`,
            transition: 'border-color 0.5s ease',
          }}
        >
          {/* Left: status dot + label */}
          <div className="flex items-center gap-2.5">
            {/* Live indicator dot */}
            <div className="relative flex items-center justify-center" style={{ width: 14, height: 14 }}>
              {isLive && isReady && (
                <div className="absolute rounded-full" style={{
                  width: 14, height: 14,
                  background: `${COLOR_READY}22`,
                  animation: 'fm-pulse 2s ease-in-out infinite',
                }} />
              )}
              <div className="rounded-full" style={{
                width: 6, height: 6,
                background: isLive ? accentColor : 'rgba(255,255,255,0.18)',
                boxShadow: isLive ? `0 0 8px ${hexToRGBA(accentColor, 0.6)}` : 'none',
                transition: 'all 0.5s ease',
              }} />
            </div>
            <span
              className="text-[10px] font-medium tracking-[0.12em] uppercase"
              style={{ color: isLive ? accentColor : 'rgba(255,255,255,0.4)', transition: 'color 0.5s ease' }}
            >
              {phase === 'loading'      ? 'Yükleniyor'
                : phase === 'initializing' ? 'Başlatılıyor'
                : phase === 'error'        ? 'Hata'
                : phase === 'captured'     ? 'Fotoğraf Hazır'
                : phase === 'countdown'    ? `Çekim ${countdown}s`
                : isReady                  ? 'Hazır ✓'
                : faceDetectedRef.current  ? 'Analiz Ediliyor'
                :                           'Yüz Aranıyor'}
            </span>
          </div>

          {/* Right: validation chips + fps */}
          <div className="flex items-center gap-3">
            {isLive && faceDetectedRef.current && (
              <div className="flex items-center gap-1">
                {[validation.centered, validation.sizeOk, validation.angleOk, validation.lightOk, validation.stable].map((ok, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-400"
                    style={{
                      width: 4, height: 4,
                      background: ok ? COLOR_READY : 'rgba(255,255,255,0.12)',
                      boxShadow: ok ? `0 0 5px ${hexToRGBA(COLOR_READY, 0.5)}` : 'none',
                    }}
                  />
                ))}
              </div>
            )}
            {isLive && (
              <span
                className="text-[10px] tabular-nums"
                style={{ color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}
              >
                {fps}fps
              </span>
            )}
          </div>
        </div>

        <canvas ref={captureCanvasRef} className="hidden" />
      </div>
    </>
  )
}
