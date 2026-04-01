import type { Landmark } from './types'

export interface FaceGuideStatus {
  lighting: 'ok' | 'too_dark' | 'too_bright' | 'shadow'
  angle: 'ok' | 'tilt' | 'look_left' | 'look_right' | 'look_up' | 'look_down'
  distance: 'ok' | 'too_close' | 'too_far'
  centering: 'ok' | 'off_center'
  eyesVisible: boolean
  foreheadVisible: boolean
  faceDetected: boolean
  allOk: boolean
  mainMessage: string
  /** How many of the 4 core checks (distance, angle, lighting, forehead) pass: 0–4 */
  validCount: number
  /** Continuous frame quality score 0–1 for auto-capture */
  qualityScore: number
  /** Sub-scores breakdown */
  qualityBreakdown: {
    distance: number
    alignment: number
    lighting: number
    sharpness: number
    stability: number
  }
  /** Face height as fraction of frame (0–1) for UI display */
  faceHeightRatio: number
  /** Face lock state — true when face has been reliably detected for several frames */
  faceLocked: boolean
  /** Debug info for overlay */
  debug: FaceDebugInfo
}

export interface FaceDebugInfo {
  faceSizePct: number
  centerOffsetX: number
  centerOffsetY: number
  tiltDeg: number
  yawDeg: number
  pitchDeg: number
  noseOffset: number
  targetAngle: string
  brightness: number
  lockFrames: number
  unlockFrames: number
  rejectionReason: string | null
  boundingBox: { x: number; y: number; w: number; h: number } | null
}

// ─── Face lock system ──────────────────────────────────────
// Prevents rapid lock/unlock flicker by requiring several consecutive
// detection frames before locking and several missing frames before unlocking.

const LOCK_FRAMES_REQUIRED = 4      // consecutive detections to lock
const UNLOCK_FRAMES_REQUIRED = 8    // consecutive misses to unlock
const DETECTION_BUFFER_SIZE = 12    // rolling buffer of recent detections

interface DetectionEntry {
  landmarks: Landmark[]
  box: { cx: number; cy: number; w: number; h: number }
  confidence: number
  time: number
}

let detectionBuffer: DetectionEntry[] = []
let consecutiveDetections = 0
let consecutiveMisses = 0
let faceLocked = false
let lastValidBox: { cx: number; cy: number; w: number; h: number } | null = null

export function isFaceLocked(): boolean {
  return faceLocked
}

/** Push a successful detection into the buffer */
export function pushDetection(landmarks: Landmark[], confidence: number): void {
  const forehead = landmarks[10]
  const chin = landmarks[152]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  if (!forehead || !chin || !leftCheek || !rightCheek) return

  const cx = (leftCheek.x + rightCheek.x) / 2
  const cy = (forehead.y + chin.y) / 2
  const w = Math.abs(rightCheek.x - leftCheek.x)
  const h = Math.abs(chin.y - forehead.y)

  const entry: DetectionEntry = { landmarks, box: { cx, cy, w, h }, confidence, time: performance.now() }
  detectionBuffer.push(entry)
  if (detectionBuffer.length > DETECTION_BUFFER_SIZE) {
    detectionBuffer = detectionBuffer.slice(-DETECTION_BUFFER_SIZE)
  }

  consecutiveDetections++
  consecutiveMisses = 0
  lastValidBox = { cx, cy, w, h }

  if (!faceLocked && consecutiveDetections >= LOCK_FRAMES_REQUIRED) {
    faceLocked = true
  }
}

/** Signal a missed detection frame */
export function pushMiss(): void {
  consecutiveMisses++
  consecutiveDetections = 0

  if (faceLocked && consecutiveMisses >= UNLOCK_FRAMES_REQUIRED) {
    faceLocked = false
    detectionBuffer = []
    lastValidBox = null
  }
}

/** Get averaged bounding box from recent detections for stability */
export function getSmoothedBox(): { cx: number; cy: number; w: number; h: number } | null {
  if (detectionBuffer.length === 0) return lastValidBox
  const recent = detectionBuffer.slice(-6)
  const cx = recent.reduce((s, e) => s + e.box.cx, 0) / recent.length
  const cy = recent.reduce((s, e) => s + e.box.cy, 0) / recent.length
  const w = recent.reduce((s, e) => s + e.box.w, 0) / recent.length
  const h = recent.reduce((s, e) => s + e.box.h, 0) / recent.length
  return { cx, cy, w, h }
}

export function resetFaceLock(): void {
  detectionBuffer = []
  consecutiveDetections = 0
  consecutiveMisses = 0
  faceLocked = false
  lastValidBox = null
}

// Key MediaPipe FaceMesh landmark indices
const LM = {
  FOREHEAD: 10,
  CHIN: 152,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  NOSE_TIP: 1,
  NOSE_BRIDGE: 6,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 362,
  RIGHT_EYE_INNER: 263,
} as const

export const NO_FACE_STATUS: FaceGuideStatus = {
  lighting: 'ok',
  angle: 'ok',
  distance: 'too_far',
  centering: 'off_center',
  eyesVisible: false,
  foreheadVisible: false,
  faceDetected: false,
  allOk: false,
  mainMessage: 'Yüzünüzü çerçevenin içine yerleştirin',
  validCount: 0,
  qualityScore: 0,
  qualityBreakdown: { distance: 0, alignment: 0, lighting: 0, sharpness: 0, stability: 0 },
  faceHeightRatio: 0,
  faceLocked: false,
  debug: {
    faceSizePct: 0, centerOffsetX: 0, centerOffsetY: 0,
    tiltDeg: 0, yawDeg: 0, pitchDeg: 0, noseOffset: 0, targetAngle: 'front',
    brightness: 0, lockFrames: 0, unlockFrames: 0, rejectionReason: null, boundingBox: null,
  },
}

// ─── Stability tracker ──────────────────────────────────────

let positionHistory: Array<{ cx: number; cy: number; area: number; time: number }> = []

function trackStability(cx: number, cy: number, area: number): number {
  const now = performance.now()
  positionHistory.push({ cx, cy, area, time: now })

  // Keep only recent history (last ~1.5s)
  const cutoff = now - 1500
  positionHistory = positionHistory.filter((p) => p.time > cutoff)

  if (positionHistory.length < 3) return 0

  // Calculate movement variance across recent frames
  let totalMovement = 0
  for (let i = 1; i < positionHistory.length; i++) {
    const prev = positionHistory[i - 1]
    const curr = positionHistory[i]
    const dx = curr.cx - prev.cx
    const dy = curr.cy - prev.cy
    const da = curr.area - prev.area
    totalMovement += Math.sqrt(dx * dx + dy * dy) + Math.abs(da) * 2
  }
  const avgMovement = totalMovement / (positionHistory.length - 1)

  // Map movement to stability score: 0 movement = 1.0, high movement = 0.0
  // avgMovement < 0.005 = very stable, > 0.04 = too much movement
  if (avgMovement < 0.003) return 1.0
  if (avgMovement > 0.05) return 0.0
  return 1.0 - (avgMovement - 0.003) / (0.05 - 0.003)
}

export function resetStability(): void {
  positionHistory = []
}

// ─── Sharpness estimation ───────────────────────────────────

let lastSharpness = 0.5

/**
 * Estimate image sharpness using Laplacian variance on a small sample.
 * Call this with the brightness canvas context for efficiency.
 */
export function estimateSharpness(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || video.videoWidth === 0) return lastSharpness

  const size = 48
  canvas.width = size
  canvas.height = size

  // Sample center region of face
  const sx = Math.max(0, (video.videoWidth - size * 6) / 2)
  const sy = Math.max(0, (video.videoHeight - size * 6) / 2)
  const sw = Math.min(size * 6, video.videoWidth)
  const sh = Math.min(size * 6, video.videoHeight)

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data

  // Convert to grayscale and compute Laplacian variance
  const gray = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3
  }

  let lapSum = 0
  let lapSumSq = 0
  let count = 0
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const lap =
        gray[(y - 1) * size + x] +
        gray[(y + 1) * size + x] +
        gray[y * size + (x - 1)] +
        gray[y * size + (x + 1)] -
        4 * gray[y * size + x]
      lapSum += lap
      lapSumSq += lap * lap
      count++
    }
  }

  const mean = lapSum / count
  const variance = lapSumSq / count - mean * mean

  // Normalize: variance < 50 = blurry, > 500 = sharp
  const sharpness = Math.min(1, Math.max(0, (variance - 50) / 450))

  // Smooth to avoid jitter
  lastSharpness = lastSharpness * 0.4 + sharpness * 0.6
  return lastSharpness
}

// ─── Shadow detection ──────────────────────────────────────

let lastShadowScore = 0

/**
 * Detect shadows on face by comparing brightness of left vs right halves.
 * Returns a 0–1 score: 0 = heavy shadow, 1 = uniform lighting.
 * Must be called after calculateBrightness (reuses the same canvas context).
 */
export function detectShadow(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  landmarks: Landmark[]
): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || video.videoWidth === 0 || landmarks.length < 468) return lastShadowScore

  const size = 48
  canvas.width = size
  canvas.height = size

  // Face bounding box from landmarks
  const forehead = landmarks[10]
  const chin = landmarks[152]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]

  const fx = Math.min(leftCheek.x, rightCheek.x) * video.videoWidth
  const fy = forehead.y * video.videoHeight
  const fw = Math.abs(rightCheek.x - leftCheek.x) * video.videoWidth
  const fh = Math.abs(chin.y - forehead.y) * video.videoHeight

  if (fw < 20 || fh < 20) return lastShadowScore

  ctx.drawImage(video, fx, fy, fw, fh, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data

  // Split face into left half and right half, compute avg brightness
  let leftSum = 0, leftCount = 0
  let rightSum = 0, rightCount = 0
  let topSum = 0, topCount = 0
  let bottomSum = 0, bottomCount = 0

  const midX = size / 2
  const midY = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3

      if (x < midX) { leftSum += lum; leftCount++ }
      else { rightSum += lum; rightCount++ }
      if (y < midY) { topSum += lum; topCount++ }
      else { bottomSum += lum; bottomCount++ }
    }
  }

  const leftAvg = leftCount > 0 ? leftSum / leftCount : 128
  const rightAvg = rightCount > 0 ? rightSum / rightCount : 128
  const topAvg = topCount > 0 ? topSum / topCount : 128
  const bottomAvg = bottomCount > 0 ? bottomSum / bottomCount : 128

  // Check asymmetry: large difference = shadow present
  const maxBrightness = Math.max(leftAvg, rightAvg, topAvg, bottomAvg)
  const lrRatio = maxBrightness > 0 ? Math.abs(leftAvg - rightAvg) / maxBrightness : 0
  const tbRatio = maxBrightness > 0 ? Math.abs(topAvg - bottomAvg) / maxBrightness : 0
  const maxRatio = Math.max(lrRatio, tbRatio)

  // Ratio < 0.15 = uniform, > 0.35 = heavy shadow
  const uniformity = Math.max(0, Math.min(1, 1 - (maxRatio - 0.15) / 0.20))

  lastShadowScore = lastShadowScore * 0.3 + uniformity * 0.7
  return lastShadowScore
}

// ─── Landmark smoothing ─────────────────────────────────────
const SMOOTHING = 0.35 // 0 = no smoothing, 1 = fully frozen
let smoothedLandmarks: Landmark[] | null = null

export function smoothLandmarks(raw: Landmark[]): Landmark[] {
  if (!smoothedLandmarks || smoothedLandmarks.length !== raw.length) {
    smoothedLandmarks = raw.map((l) => ({ ...l }))
    return smoothedLandmarks
  }
  for (let i = 0; i < raw.length; i++) {
    smoothedLandmarks[i] = {
      x: smoothedLandmarks[i].x * SMOOTHING + raw[i].x * (1 - SMOOTHING),
      y: smoothedLandmarks[i].y * SMOOTHING + raw[i].y * (1 - SMOOTHING),
      z: smoothedLandmarks[i].z * SMOOTHING + raw[i].z * (1 - SMOOTHING),
    }
  }
  return smoothedLandmarks
}

export function resetSmoothing(): void {
  smoothedLandmarks = null
}

// ─── Face connections for mesh overlay ───────────────────────
// Subset of FACEMESH_TESSELATION for a clean, premium look
// Face contour + eyes + eyebrows + nose + lips
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
]
export const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33]
export const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362]
export const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
export const RIGHT_EYEBROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
export const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2]
export const UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
export const LOWER_LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]

// ─── Extended landmark groups (full-face coverage) ──────────
// Jawline: full chin-to-ear contour (bottom half of face oval)
export const JAWLINE = [
  234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332,
  284, 251, 389, 356, 454,
]
// Forehead zone: hairline-adjacent + upper face landmarks
export const FOREHEAD_ZONE = [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109, 10]
// Temple regions (left / right)
export const LEFT_TEMPLE = [54, 103, 67, 109, 10, 151, 108, 69, 104, 68]
export const RIGHT_TEMPLE = [338, 297, 332, 284, 251, 389, 298, 333, 299, 337]
// Under-eye zones (for wrinkle / dark circle analysis)
export const LEFT_UNDER_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 243, 112, 26, 22, 23, 24, 110, 25]
export const RIGHT_UNDER_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 463, 341, 256, 252, 253, 254, 339, 255]
// Nasolabial fold markers (smile lines)
export const LEFT_NASOLABIAL = [92, 165, 167, 164, 393, 391, 322]
export const RIGHT_NASOLABIAL = [206, 205, 36, 142, 126, 217, 174]

// ─── Face evaluation (STRICT ENFORCEMENT) ────────────────────
//
// Distance: face height must be 60–90% of frame (ideal 70–85%)
// Angle: yaw ±10°, pitch ±10°, roll ±5° (approximated from landmarks)
// Lighting: brightness + shadow uniformity check
// Forehead: must be fully visible in frame
//
/** Target angle for multi-angle capture */
export type TargetAngle = 'front' | 'left' | 'right'

export function evaluateFaceGuide(
  landmarks: Landmark[],
  brightness: number,
  shadowScore = 1, // 0 = heavy shadow, 1 = uniform (passed from caller)
  targetAngle: TargetAngle = 'front',
): FaceGuideStatus {
  if (!landmarks || landmarks.length < 468) return NO_FACE_STATUS

  const forehead = landmarks[LM.FOREHEAD]
  const chin = landmarks[LM.CHIN]
  const leftCheek = landmarks[LM.LEFT_CHEEK]
  const rightCheek = landmarks[LM.RIGHT_CHEEK]
  const noseTip = landmarks[LM.NOSE_TIP]
  const noseBridge = landmarks[LM.NOSE_BRIDGE]
  const leftEyeTop = landmarks[LM.LEFT_EYE_TOP]
  const leftEyeBottom = landmarks[LM.LEFT_EYE_BOTTOM]
  const rightEyeTop = landmarks[LM.RIGHT_EYE_TOP]
  const rightEyeBottom = landmarks[LM.RIGHT_EYE_BOTTOM]

  // Face dimensions (normalized 0-1)
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2
  const faceCenterY = (forehead.y + chin.y) / 2
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x)
  const faceHeight = Math.abs(chin.y - forehead.y)
  const faceArea = faceWidth * faceHeight

  // ── 1. DISTANCE — face height ratio (target 60–90%, ideal 70–85%) ──
  const faceHeightRatio = faceHeight // already normalized 0-1
  let distance: FaceGuideStatus['distance'] = 'ok'
  if (faceHeightRatio < 0.38) distance = 'too_far'      // < 38% → too far (relaxed from 60% for usability with oval guide)
  else if (faceHeightRatio > 0.80) distance = 'too_close' // > 80% → too close

  // ── 2. CENTERING ──
  const offsetX = Math.abs(faceCenterX - 0.5)
  const offsetY = Math.abs(faceCenterY - 0.45)
  // Relax centering for angled captures — face naturally shifts when turning
  const centerThresholdX = targetAngle === 'front' ? 0.08 : 0.14
  const centerThresholdY = targetAngle === 'front' ? 0.08 : 0.10
  const centering: FaceGuideStatus['centering'] =
    (offsetX > centerThresholdX || offsetY > centerThresholdY) ? 'off_center' : 'ok'

  // ── 3. HEAD POSE (stricter: ≈±10° yaw/pitch, ±5° roll) ──
  // Roll (head tilt): eye line angle
  const eyeDx = Math.abs(leftEyeTop.x - rightEyeTop.x)
  const eyeDy = Math.abs(leftEyeTop.y - rightEyeTop.y)
  const tiltRatio = eyeDx > 0.01 ? eyeDy / eyeDx : 0
  // tan(5°) ≈ 0.087 — strict roll threshold
  const ROLL_THRESHOLD = 0.087

  // Yaw: nose offset from bridge, relative to face width
  const noseOffset = (noseTip.x - noseBridge.x) / (faceWidth || 0.01)
  // ≈±10° yaw threshold (narrower than previous 0.18)
  const YAW_THRESHOLD = 0.12

  // Pitch: nose tip vertical position relative to eye-chin midline
  const eyeMidY = (leftEyeTop.y + rightEyeTop.y) / 2
  const eyeChinMid = (eyeMidY + chin.y) / 2
  const pitchOffset = (noseTip.y - eyeChinMid) / (faceHeight || 0.01)
  // ≈±10° pitch threshold
  const PITCH_THRESHOLD = 0.15

  // Angle evaluation — target-aware for multi-angle capture
  // For angled captures: accept yaw in the ±15-30° range (noseOffset ±0.18–0.40)
  const ANGLED_MIN = 0.15   // minimum turn required
  const ANGLED_MAX = 0.45   // maximum turn allowed
  const ANGLED_IDEAL = 0.28 // ideal angle (~20°)

  let angle: FaceGuideStatus['angle'] = 'ok'
  if (tiltRatio > ROLL_THRESHOLD) angle = 'tilt'
  else if (targetAngle === 'front') {
    // Standard frontal: must look straight
    if (noseOffset > YAW_THRESHOLD) angle = 'look_left'
    else if (noseOffset < -YAW_THRESHOLD) angle = 'look_right'
    else if (pitchOffset < -PITCH_THRESHOLD) angle = 'look_up'
    else if (pitchOffset > PITCH_THRESHOLD) angle = 'look_down'
  } else if (targetAngle === 'left') {
    // Left profile: nose should point left (positive noseOffset)
    if (noseOffset < ANGLED_MIN) angle = 'look_right'    // not turned enough
    else if (noseOffset > ANGLED_MAX) angle = 'look_left' // turned too far
    else if (pitchOffset < -PITCH_THRESHOLD) angle = 'look_up'
    else if (pitchOffset > PITCH_THRESHOLD) angle = 'look_down'
  } else if (targetAngle === 'right') {
    // Right profile: nose should point right (negative noseOffset)
    if (noseOffset > -ANGLED_MIN) angle = 'look_left'      // not turned enough
    else if (noseOffset < -ANGLED_MAX) angle = 'look_right' // turned too far
    else if (pitchOffset < -PITCH_THRESHOLD) angle = 'look_up'
    else if (pitchOffset > PITCH_THRESHOLD) angle = 'look_down'
  }

  // ── 4. EYES VISIBLE (EAR) ──
  const leftEAR = Math.abs(leftEyeTop.y - leftEyeBottom.y)
  const rightEAR = Math.abs(rightEyeTop.y - rightEyeBottom.y)
  const eyesVisible = leftEAR > 0.008 && rightEAR > 0.008

  // ── 5. FOREHEAD VISIBILITY ──
  // Forehead landmark must be within frame bounds (not cut off at top)
  // and sufficiently above the eye line
  const foreheadY = forehead.y
  const foreheadAboveEyes = eyeMidY - foreheadY
  const foreheadVisible =
    foreheadY > 0.02 &&        // not cut off at top
    foreheadY < 0.40 &&        // reasonable position
    foreheadAboveEyes > 0.04   // meaningful distance above eyes (forehead is showing)

  // ── 6. LIGHTING + SHADOW ──
  let lighting: FaceGuideStatus['lighting'] = 'ok'
  if (brightness < 55) lighting = 'too_dark'
  else if (brightness > 225) lighting = 'too_bright'
  else if (shadowScore < 0.5) lighting = 'shadow'

  // ── Validation count (4 core checks) ──
  const distanceOk = distance === 'ok'
  const angleOk = angle === 'ok'
  const lightingOk = lighting === 'ok'
  const foreheadOk = foreheadVisible
  const validCount =
    (distanceOk ? 1 : 0) +
    (angleOk ? 1 : 0) +
    (lightingOk ? 1 : 0) +
    (foreheadOk ? 1 : 0)

  // For angled captures, forehead may be partially hidden — don't require it
  const foreheadRequired = targetAngle === 'front'
  const allOk =
    centering === 'ok' &&
    distanceOk &&
    angleOk &&
    lightingOk &&
    eyesVisible &&
    (foreheadRequired ? foreheadVisible : true)

  // Main message priority — premium, calm guidance
  let mainMessage = 'Harika, pozisyon uygun'
  if (distance === 'too_far') mainMessage = 'Biraz daha yaklaşın'
  else if (distance === 'too_close') mainMessage = 'Biraz geri çekilin'
  else if (centering === 'off_center') mainMessage = 'Yüzünüzü çerçevenin ortasına getirin'
  else if (angle === 'tilt') mainMessage = 'Başınızı hafifçe düzeltin'
  else if (targetAngle === 'left' && angle === 'look_right') mainMessage = 'Yüzünüzü biraz daha sola çevirin'
  else if (targetAngle === 'left' && angle === 'look_left') mainMessage = 'Çok fazla döndünüz, biraz geri gelin'
  else if (targetAngle === 'right' && angle === 'look_left') mainMessage = 'Yüzünüzü biraz daha sağa çevirin'
  else if (targetAngle === 'right' && angle === 'look_right') mainMessage = 'Çok fazla döndünüz, biraz geri gelin'
  else if (angle === 'look_left' || angle === 'look_right') mainMessage = 'Doğrudan kameraya bakın'
  else if (angle === 'look_up') mainMessage = 'Başınızı hafifçe indirin'
  else if (angle === 'look_down') mainMessage = 'Başınızı hafifçe kaldırın'
  else if (!foreheadVisible) mainMessage = 'Alnınız görünür olsun'
  else if (!eyesVisible) mainMessage = 'Gözleriniz açık ve görünür olmalı'
  else if (lighting === 'too_dark') mainMessage = 'Daha aydınlık bir ortam tercih edin'
  else if (lighting === 'too_bright') mainMessage = 'Işık çok güçlü, hafifçe ayarlayın'
  else if (lighting === 'shadow') mainMessage = 'Yüzünüze eşit ışık düşmeli'

  // ── Continuous quality sub-scores (0–1) ──

  // Distance score: ideal faceHeightRatio 0.50–0.70 (sweet spot)
  let distanceScore = 0
  if (faceHeightRatio >= 0.38 && faceHeightRatio <= 0.80) {
    const ideal = 0.58
    const deviation = Math.abs(faceHeightRatio - ideal) / ideal
    distanceScore = Math.max(0, 1 - deviation * 1.5)
  }

  // Alignment score: roll, yaw, pitch, centering, eyes, forehead
  const tiltScore = Math.max(0, 1 - tiltRatio / ROLL_THRESHOLD)
  // Yaw score — target-aware: frontal rewards center, angled rewards target range
  let yawScore: number
  if (targetAngle === 'front') {
    yawScore = Math.max(0, 1 - Math.abs(noseOffset) / YAW_THRESHOLD)
  } else {
    const targetSign = targetAngle === 'left' ? 1 : -1
    const signedOffset = noseOffset * targetSign // positive when facing correct direction
    if (signedOffset >= ANGLED_MIN && signedOffset <= ANGLED_MAX) {
      // In range: score by proximity to ideal
      yawScore = Math.max(0.5, 1 - Math.abs(signedOffset - ANGLED_IDEAL) / ANGLED_IDEAL)
    } else {
      // Out of range: penalize
      yawScore = Math.max(0, 0.3 - Math.abs(signedOffset - ANGLED_IDEAL) * 0.5)
    }
  }
  const pitchScore = Math.max(0, 1 - Math.abs(pitchOffset) / PITCH_THRESHOLD)
  const centerScore = Math.max(0, 1 - (offsetX + offsetY) / 0.16)
  const eyeScore = eyesVisible ? 1 : 0
  const fhScore = foreheadVisible ? 1 : 0
  // Reduce forehead weight for angled captures, redistribute to yaw
  const fhWeight = foreheadRequired ? 0.15 : 0.05
  const yawWeight = foreheadRequired ? 0.20 : 0.30
  const alignmentScore =
    tiltScore * 0.20 +
    yawScore * yawWeight +
    pitchScore * 0.15 +
    centerScore * 0.20 +
    eyeScore * 0.10 +
    fhScore * fhWeight

  // Lighting score: ideal brightness 90–180 + shadow uniformity
  let lightingScore = 0
  if (brightness >= 55 && brightness <= 225) {
    const idealLow = 90
    const idealHigh = 180
    if (brightness >= idealLow && brightness <= idealHigh) {
      lightingScore = 1
    } else if (brightness < idealLow) {
      lightingScore = (brightness - 55) / (idealLow - 55)
    } else {
      lightingScore = (225 - brightness) / (225 - idealHigh)
    }
    // Penalize shadows
    lightingScore *= Math.max(0.3, shadowScore)
  }

  // Stability score from position history tracker
  const stabilityScore = trackStability(faceCenterX, faceCenterY, faceArea)

  // Sharpness is computed externally and passed via lastSharpness
  const sharpnessScore = lastSharpness

  // Weighted composite quality score
  const qualityScore =
    distanceScore * 0.30 +
    alignmentScore * 0.25 +
    lightingScore * 0.15 +
    sharpnessScore * 0.15 +
    stabilityScore * 0.15

  const qualityBreakdown = {
    distance: distanceScore,
    alignment: alignmentScore,
    lighting: lightingScore,
    sharpness: sharpnessScore,
    stability: stabilityScore,
  }

  // ── Determine capture rejection reason (for debug) ──
  let rejectionReason: string | null = null
  if (!allOk) {
    if (distance !== 'ok') rejectionReason = `distance:${distance}`
    else if (centering !== 'ok') rejectionReason = 'off_center'
    else if (angle !== 'ok') rejectionReason = `angle:${angle}`
    else if (!foreheadVisible) rejectionReason = 'forehead_hidden'
    else if (!eyesVisible) rejectionReason = 'eyes_hidden'
    else if (lighting !== 'ok') rejectionReason = `lighting:${lighting}`
  } else if (qualityScore < 0.85) {
    rejectionReason = `quality:${(qualityScore * 100).toFixed(0)}`
  }

  const debug: FaceDebugInfo = {
    faceSizePct: Math.round(faceHeightRatio * 100),
    centerOffsetX: Math.round(offsetX * 1000) / 1000,
    centerOffsetY: Math.round(offsetY * 1000) / 1000,
    tiltDeg: Math.round(Math.atan(tiltRatio) * (180 / Math.PI) * 10) / 10,
    yawDeg: Math.round(Math.atan(noseOffset) * (180 / Math.PI) * 10) / 10,
    pitchDeg: Math.round(Math.atan(pitchOffset) * (180 / Math.PI) * 10) / 10,
    noseOffset: Math.round(noseOffset * 1000) / 1000,
    targetAngle,
    brightness,
    lockFrames: consecutiveDetections,
    unlockFrames: consecutiveMisses,
    rejectionReason,
    boundingBox: { x: faceCenterX - faceWidth / 2, y: forehead.y, w: faceWidth, h: faceHeight },
  }

  return {
    lighting, angle, distance, centering, eyesVisible, foreheadVisible,
    faceDetected: true, allOk, mainMessage, validCount,
    qualityScore, qualityBreakdown, faceHeightRatio,
    faceLocked,
    debug,
  }
}

/**
 * Sample average brightness from the center region of a video frame.
 */
export function calculateBrightness(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || video.videoWidth === 0) return 128

  const sample = 64
  canvas.width = sample
  canvas.height = sample

  const sx = Math.max(0, (video.videoWidth - sample * 4) / 2)
  const sy = Math.max(0, (video.videoHeight - sample * 4) / 2)
  const sw = Math.min(sample * 4, video.videoWidth)
  const sh = Math.min(sample * 4, video.videoHeight)

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sample, sample)

  const data = ctx.getImageData(0, 0, sample, sample).data
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4 * 16) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3
    count++
  }

  return count > 0 ? sum / count : 128
}
