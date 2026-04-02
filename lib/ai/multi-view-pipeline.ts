/**
 * Multi-View Analysis Pipeline
 *
 * Analyzes 3 captured images (front, left, right) as a coordinated set.
 * Each image is analyzed independently with Face Mesh landmarks, then
 * region-specific measurements are assigned to the most suitable view
 * and fused with confidence weighting.
 *
 * Region ownership:
 * - Front: symmetry, forehead, overall balance, central alignment, lips
 * - Left view: left under-eye, left crow's feet, left nasolabial, left cheek, left jawline
 * - Right view: right under-eye, right crow's feet, right nasolabial, right cheek, right jawline
 *
 * The pipeline does NOT simply average scores — it extracts view-specific
 * measurements and assigns each region to the view that sees it best.
 */

import type { Landmark } from './types'
import type { CalibrationContext, SubScore } from './specialists/types'
import { classifySeverity, normalizeScore, applyAgeModulation, applyQualityPenalty } from './specialists/types'
import {
  extractGrayscaleRegion,
  extractColorRegion,
  sobelEdges,
  sobelLateralBias,
  edgeDensity,
  textureRoughness,
  localContrast,
  meanBrightness,
  dist2D,
  avgDepth,
  angleDeg,
} from './specialists/pixel-utils'

// ─── Types ──────────────────────────────────────────────────

export type ViewKey = 'front' | 'left' | 'right'

export interface ViewAnalysis {
  view: ViewKey
  landmarks: Landmark[]
  image: HTMLImageElement
  quality: ViewQuality
  poseValidation: PoseValidation
}

export interface ViewQuality {
  /** Overall quality 0-1 */
  score: number
  /** Is this view usable? */
  usable: boolean
  /** Reason if not usable */
  issue?: string
  /** Face detection confidence */
  detectionConfidence: number
  /** Landmark count (expected 468) */
  landmarkCount: number
  /** Brightness 0-255 */
  brightness: number
}

export interface PoseValidation {
  /** Is the pose correct for this view? */
  poseCorrect: boolean
  /** Yaw angle in degrees (estimated) */
  yawDeg: number
  /** Pitch angle in degrees (estimated) */
  pitchDeg: number
  /** Roll/tilt angle in degrees */
  tiltDeg: number
  /** Raw nose offset for yaw estimation */
  noseOffset: number
}

export interface MultiViewRegion {
  key: string
  label: string
  icon: string
  /** Which view owns this region */
  sourceView: ViewKey
  /** Score 0-100 */
  score: number
  /** Confidence 0-100 */
  confidence: number
  severity: 'minimal' | 'hafif' | 'orta' | 'belirgin'
  observation: string
  isPositive: boolean
  consultationNote?: string
  subScores: SubScore[]
}

/** Per-view structured summary for display */
export interface ViewSummary {
  view: ViewKey
  label: string
  qualityScore: number
  usable: boolean
  issue?: string
  poseCorrect: boolean
  visibleRegionCount: number
  limitations: string[]
  narrative: string
}

/** Bilateral comparison of matched left/right regions */
export interface BilateralComparison {
  regionBase: string        // e.g. "crow_feet", "under_eye"
  label: string
  leftScore: number
  rightScore: number
  leftConfidence: number
  rightConfidence: number
  asymmetryDelta: number    // abs(left - right)
  asymmetryLevel: 'symmetrical' | 'mild_asymmetry' | 'notable_asymmetry'
  note: string
}

/** Confidence note explaining a finding's evidence basis */
export interface ConfidenceNote {
  region: string
  label: string
  level: 'high' | 'medium' | 'low'
  explanation: string
}

/** Synthesis section for the final report */
export interface MultiViewSynthesis {
  /** Top positive findings */
  strongestAreas: { region: string; label: string; score: number; note: string }[]
  /** Top improvement potentials */
  improvementAreas: { region: string; label: string; score: number; note: string }[]
  /** Bilateral asymmetry comparisons */
  bilateralComparisons: BilateralComparison[]
  /** Per-region confidence notes */
  confidenceNotes: ConfidenceNote[]
  /** Overall narrative for the combined analysis */
  overallNarrative: string
}

export interface MultiViewResult {
  /** Per-view quality and validation */
  views: ViewAnalysis[]
  /** Per-view structured summaries for display */
  viewSummaries: ViewSummary[]
  /** Views that need recapture */
  recaptureNeeded: ViewKey[]
  /** Global fused score 0-100 */
  globalScore: number
  /** Global confidence 0-100 */
  globalConfidence: number
  /** Left-side observations (from left view) */
  leftRegions: MultiViewRegion[]
  /** Right-side observations (from right view) */
  rightRegions: MultiViewRegion[]
  /** Central/symmetric observations (from front view) */
  centralRegions: MultiViewRegion[]
  /** All regions flat for easy iteration */
  allRegions: MultiViewRegion[]
  /** Priority regions needing attention */
  priorityRegions: string[]
  /** Multi-view synthesis with cross-view analysis */
  synthesis: MultiViewSynthesis
  /** Timestamp */
  analyzedAt: number
}

// ─── Landmark Indices ───────────────────────────────────────

// Crow's feet ROI
const CROW_LEFT = [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25]
const CROW_RIGHT = [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255]

// Under-eye ROI
const UNDER_EYE_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const UNDER_EYE_RIGHT = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

// Cheek ROI
const CHEEK_LEFT = [116, 117, 118, 119, 120, 121, 128, 245, 193, 55, 65, 52, 53]
const CHEEK_RIGHT = [345, 346, 347, 348, 349, 350, 357, 465, 417, 285, 295, 282, 283]

// Jawline
const JAWLINE_LEFT = [234, 127, 162, 21, 54, 103, 67, 109]
const JAWLINE_RIGHT = [338, 297, 332, 284, 251, 389, 356, 454]

// Lips / perioral
const UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
const LOWER_LIP = [146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
const LIP_LEFT_CORNER = 61
const LIP_RIGHT_CORNER = 291

// Nose bridge for depth reference
const NOSE_BRIDGE_DEPTH = [6, 168, 197, 195]

// Geometric reference
const CHEEKBONE_LEFT = 234
const CHEEKBONE_RIGHT = 454
const JAW_LEFT = 172
const JAW_RIGHT = 397
const CHIN_BOTTOM = 152
const FOREHEAD_TOP = 10
const NOSE_TIP = 4
const NOSE_BRIDGE = 6
const L_EYE_OUTER = 33
const R_EYE_OUTER = 362
const L_BROW_OUTER = 46
const R_BROW_OUTER = 276
const L_CHEEK_UPPER = 116
const R_CHEEK_UPPER = 345

// ─── Pose Validation ────────────────────────────────────────

function validatePose(landmarks: Landmark[], expectedView: ViewKey): PoseValidation {
  const noseTip = landmarks[NOSE_TIP]
  const noseBridge = landmarks[NOSE_BRIDGE]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  const leftEyeTop = landmarks[159]
  const rightEyeTop = landmarks[386]

  const faceWidth = Math.abs(rightCheek.x - leftCheek.x) || 0.01
  const noseOffset = (noseTip.x - noseBridge.x) / faceWidth

  // Eye-line tilt for roll estimation
  const eyeDx = Math.abs(leftEyeTop.x - rightEyeTop.x)
  const eyeDy = Math.abs(leftEyeTop.y - rightEyeTop.y)
  const tiltRatio = eyeDx > 0.01 ? eyeDy / eyeDx : 0

  // Pitch estimation
  const eyeMidY = (leftEyeTop.y + rightEyeTop.y) / 2
  const chin = landmarks[CHIN_BOTTOM]
  const faceHeight = Math.abs(chin.y - landmarks[FOREHEAD_TOP].y) || 0.01
  const eyeChinMid = (eyeMidY + chin.y) / 2
  const pitchOffset = (noseTip.y - eyeChinMid) / faceHeight

  const yawDeg = Math.round(Math.atan(noseOffset) * (180 / Math.PI) * 10) / 10
  const pitchDeg = Math.round(Math.atan(pitchOffset) * (180 / Math.PI) * 10) / 10
  const tiltDeg = Math.round(Math.atan(tiltRatio) * (180 / Math.PI) * 10) / 10

  // Pose correctness check
  // Convention (raw non-mirrored image coordinates):
  //   noseOffset > 0 → nose right of bridge → user turned head LEFT → shows RIGHT cheek
  //   noseOffset < 0 → nose left of bridge  → user turned head RIGHT → shows LEFT cheek
  // "left" view = show left cheek = noseOffset NEGATIVE
  // "right" view = show right cheek = noseOffset POSITIVE
  let poseCorrect = false
  if (expectedView === 'front') {
    poseCorrect = Math.abs(noseOffset) < 0.12 && Math.abs(pitchOffset) < 0.15 && tiltRatio < 0.087
  } else if (expectedView === 'left') {
    poseCorrect = noseOffset < -0.10 && noseOffset > -0.50
  } else if (expectedView === 'right') {
    poseCorrect = noseOffset > 0.10 && noseOffset < 0.50
  }

  return { poseCorrect, yawDeg, pitchDeg, tiltDeg, noseOffset }
}

// ─── View Quality Assessment ────────────────────────────────

function assessViewQuality(
  landmarks: Landmark[],
  image: HTMLImageElement,
  detectionConfidence: number,
): ViewQuality {
  // Canvas for brightness measurement
  const canvas = document.createElement('canvas')
  const w = image.naturalWidth || image.width
  const h = image.naturalHeight || image.height
  canvas.width = Math.min(w, 320)
  canvas.height = Math.min(h, 320)
  const ctx = canvas.getContext('2d')

  let brightness = 128
  if (ctx) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    const pixels = canvas.width * canvas.height
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    }
    brightness = sum / pixels
  }

  const landmarkCount = landmarks.length
  const hasEnoughLandmarks = landmarkCount >= 468

  // Quality score
  let score = 0
  if (hasEnoughLandmarks) {
    const brightScore = brightness >= 55 && brightness <= 225
      ? (brightness >= 90 && brightness <= 180 ? 1 : 0.7)
      : 0.3
    const confScore = Math.min(1, detectionConfidence / 0.8)
    score = brightScore * 0.4 + confScore * 0.6
  }

  const usable = hasEnoughLandmarks && score >= 0.3
  const issue = !hasEnoughLandmarks
    ? 'Yüz algılanamadı'
    : brightness < 55 ? 'Görüntü çok karanlık'
    : brightness > 225 ? 'Görüntü çok parlak'
    : score < 0.3 ? 'Düşük algılama kalitesi'
    : undefined

  return { score, usable, issue, detectionConfidence, landmarkCount, brightness }
}

// ─── Region Extraction Functions ────────────────────────────

/**
 * Analyze crow's feet from the view that sees them best.
 * Left view → left crow's feet, Right view → right crow's feet.
 */
function analyzeCrowFeet(
  view: ViewAnalysis,
  side: 'left' | 'right',
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image
  const indices = side === 'left' ? CROW_LEFT : CROW_RIGHT

  const region = extractGrayscaleRegion(img, lm, indices)
  let score = 0
  let confidence = 40
  const subScores: SubScore[] = []

  if (region) {
    // Edge density (lateral bias for radial wrinkle lines)
    const edges = sobelLateralBias(region.data, region.width, region.height)
    const density = edgeDensity(edges, region.width, region.height)

    score = normalizeScore(density, 0.02, 0.25)
    score = applyAgeModulation(score, calibration.estimatedAge, 0.7)
    confidence = applyQualityPenalty(70, view.quality.score * 100, 0.8)

    // Texture roughness
    const roughness = textureRoughness(region.data)
    const texScore = normalizeScore(roughness, 0.1, 0.8)

    subScores.push(
      { key: 'edge_density', label: 'Çizgi Yoğunluğu', score, weight: 0.6, confidence },
      { key: 'texture', label: 'Doku Pürüzlülüğü', score: texScore, weight: 0.4, confidence: confidence * 0.9 },
    )

    // Weighted combination
    score = Math.round(score * 0.6 + texScore * 0.4)
  }

  // Corner angle geometry
  const brow = lm[side === 'left' ? L_BROW_OUTER : R_BROW_OUTER]
  const eye = lm[side === 'left' ? L_EYE_OUTER : R_EYE_OUTER]
  const cheek = lm[side === 'left' ? L_CHEEK_UPPER : R_CHEEK_UPPER]
  if (brow && eye && cheek) {
    const angle = angleDeg(brow, eye, cheek)
    if (!isNaN(angle)) {
      const deviation = Math.abs(160 - angle)
      const angleScore = normalizeScore(deviation, 0, 30)
      subScores.push({ key: 'corner_angle', label: 'Göz Köşe Açısı', score: angleScore, weight: 0.2, confidence: 65 })
      score = Math.round(score * 0.75 + angleScore * 0.25)
    }
  }

  const severity = classifySeverity(score)
  const isPositive = score < 15
  const sideLabel = side === 'left' ? 'Sol' : 'Sağ'

  return {
    key: `crow_feet_${side}`,
    label: `${sideLabel} Göz Çevresi`,
    icon: '◎',
    sourceView: view.view,
    score,
    confidence,
    severity,
    observation: isPositive
      ? `${sideLabel} göz çevresinde belirgin kaz ayağı çizgisi gözlemlenmemiştir.`
      : score >= 55
        ? `${sideLabel} göz çevresinde belirgin mimik çizgileri tespit edilmiştir.`
        : score >= 35
          ? `${sideLabel} göz çevresinde orta düzeyde mimik çizgisi gözlemlenmiştir.`
          : `${sideLabel} göz çevresinde hafif düzeyde çizgi izleri tespit edilmiştir.`,
    isPositive,
    consultationNote: !isPositive && score >= 25 ? `${sideLabel} göz çevresi mimik çizgileri değerlendirilebilir.` : undefined,
    subScores,
  }
}

/**
 * Analyze under-eye from the angled view that sees it best.
 */
function analyzeUnderEye(
  view: ViewAnalysis,
  side: 'left' | 'right',
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image
  const indices = side === 'left' ? UNDER_EYE_LEFT : UNDER_EYE_RIGHT

  const grayRegion = extractGrayscaleRegion(img, lm, indices)
  const colorRegion = extractColorRegion(img, lm, indices)
  let score = 0
  let confidence = 40
  const subScores: SubScore[] = []

  if (grayRegion) {
    // Texture analysis
    const roughness = textureRoughness(grayRegion.data)
    const contrast = localContrast(grayRegion.data, grayRegion.width, grayRegion.height)
    const texScore = normalizeScore(roughness * 0.5 + contrast * 0.5, 0.05, 0.5)

    subScores.push({ key: 'texture', label: 'Doku Analizi', score: texScore, weight: 0.35, confidence: 60 })
    score = texScore
  }

  // Dark circle detection via luminance comparison
  if (colorRegion && grayRegion) {
    const underEyeBrightness = meanBrightness(grayRegion.data)
    // Compare to cheek brightness as reference
    const cheekIndices = side === 'left' ? CHEEK_LEFT.slice(0, 6) : CHEEK_RIGHT.slice(0, 6)
    const cheekRegion = extractGrayscaleRegion(img, lm, cheekIndices)
    if (cheekRegion) {
      const cheekBrightness = meanBrightness(cheekRegion.data)
      const delta = Math.max(0, cheekBrightness - underEyeBrightness)
      const darkCircleScore = normalizeScore(delta, 5, 40)
      subScores.push({ key: 'dark_circle', label: 'Koyu Halka', score: darkCircleScore, weight: 0.35, confidence: 55 })
      score = Math.round(score * 0.5 + darkCircleScore * 0.5)
    }
  }

  // Z-depth tear trough
  const innerEye = side === 'left' ? 133 : 362
  const cheekTop = side === 'left' ? 116 : 345
  const tearTrough = side === 'left' ? 145 : 374
  if (lm[innerEye] && lm[cheekTop] && lm[tearTrough]) {
    const troughDepth = Math.abs(lm[tearTrough].z - (lm[innerEye].z + lm[cheekTop].z) / 2)
    const depthScore = normalizeScore(troughDepth, 0.002, 0.02)
    subScores.push({ key: 'tear_trough', label: 'Gözyaşı Çukuru', score: depthScore, weight: 0.30, confidence: 55 })
    score = Math.round(score * 0.65 + depthScore * 0.35)
  }

  score = applyAgeModulation(score, calibration.estimatedAge, 0.6)
  confidence = applyQualityPenalty(60, view.quality.score * 100, 0.5)

  const severity = classifySeverity(score)
  const isPositive = score < 15
  const sideLabel = side === 'left' ? 'Sol' : 'Sağ'

  return {
    key: `under_eye_${side}`,
    label: `${sideLabel} Göz Altı`,
    icon: '◈',
    sourceView: view.view,
    score,
    confidence,
    severity,
    observation: isPositive
      ? `${sideLabel} göz altı bölgesinde belirgin doku kaybı gözlemlenmemiştir.`
      : score >= 55
        ? `${sideLabel} göz altı bölgesinde belirgin doku değişimi ve koyu halka tespit edilmiştir.`
        : score >= 35
          ? `${sideLabel} göz altında orta düzeyde değişiklik gözlemlenmiştir.`
          : `${sideLabel} göz altında hafif düzeyde değişiklik izleri tespit edilmiştir.`,
    isPositive,
    consultationNote: !isPositive && score >= 25 ? `${sideLabel} göz altı doku değişimi değerlendirilebilir.` : undefined,
    subScores,
  }
}

/**
 * Analyze nasolabial fold from the angled view.
 */
function analyzeNasolabial(
  view: ViewAnalysis,
  side: 'left' | 'right',
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image

  // Nasolabial fold: nose wing to cheek surface distance + texture
  const noseWing = side === 'left' ? 98 : 327
  const cheekSurface = side === 'left' ? 117 : 346

  let score = 0
  let confidence = 45
  const subScores: SubScore[] = []

  if (lm[noseWing] && lm[cheekSurface]) {
    // Geometric fold distance
    const foldDist = dist2D(lm[noseWing], lm[cheekSurface])
    // Normalized to face width
    const faceWidth = Math.abs(lm[454].x - lm[234].x) || 0.01
    const normalizedDist = foldDist / faceWidth

    const distScore = normalizeScore(normalizedDist * 10, 0, 3)
    subScores.push({ key: 'fold_depth', label: 'Çizgi Derinliği', score: distScore, weight: 0.5, confidence: 55 })
    score = distScore
  }

  // Texture around nasolabial area
  const nasoIndices = side === 'left'
    ? [98, 117, 118, 119, 120, 55, 65, 52]
    : [327, 346, 347, 348, 349, 285, 295, 282]
  const nasoRegion = extractGrayscaleRegion(img, lm, nasoIndices)
  if (nasoRegion) {
    const roughness = textureRoughness(nasoRegion.data)
    const edges = sobelEdges(nasoRegion.data, nasoRegion.width, nasoRegion.height)
    const density = edgeDensity(edges, nasoRegion.width, nasoRegion.height)
    const texScore = normalizeScore(roughness * 0.5 + density * 0.5, 0.03, 0.3)
    subScores.push({ key: 'texture', label: 'Doku Analizi', score: texScore, weight: 0.5, confidence: 55 })
    score = Math.round(score * 0.5 + texScore * 0.5)
  }

  score = applyAgeModulation(score, calibration.estimatedAge, 0.7)
  confidence = applyQualityPenalty(55, view.quality.score * 100, 0.4)

  const severity = classifySeverity(score)
  const isPositive = score < 15
  const sideLabel = side === 'left' ? 'Sol' : 'Sağ'

  return {
    key: `nasolabial_${side}`,
    label: `${sideLabel} Nazolabial`,
    icon: '⌒',
    sourceView: view.view,
    score,
    confidence,
    severity,
    observation: isPositive
      ? `${sideLabel} nazolabial bölgede belirgin çizgi tespit edilmemiştir.`
      : score >= 55
        ? `${sideLabel} nazolabial çizgide belirgin derinlik tespit edilmiştir.`
        : score >= 35
          ? `${sideLabel} nazolabial alanda orta düzeyde çizgi gözlemlenmiştir.`
          : `${sideLabel} nazolabial alanda hafif çizgi izleri tespit edilmiştir.`,
    isPositive,
    subScores,
  }
}

/**
 * Analyze cheek volume from the angled view that reveals depth.
 */
function analyzeCheekVolume(
  view: ViewAnalysis,
  side: 'left' | 'right',
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image
  const cheekIndices = side === 'left' ? CHEEK_LEFT : CHEEK_RIGHT
  const depthIndices = side === 'left' ? [116, 117, 118, 119, 120, 121] : [345, 346, 347, 348, 349, 350]

  let score = 0
  let confidence = 45
  const subScores: SubScore[] = []

  // Z-depth volume support
  const cheekZ = avgDepth(lm, depthIndices)
  const noseZ = avgDepth(lm, NOSE_BRIDGE_DEPTH)
  const volumeGap = Math.abs(noseZ - cheekZ)

  const volumeScore = normalizeScore(volumeGap, 0.002, 0.02)
  subScores.push({ key: 'volume', label: 'Hacim Desteği', score: volumeScore, weight: 0.4, confidence: 55 })
  score = volumeScore

  // Cheek texture
  const cheekRegion = extractGrayscaleRegion(img, lm, cheekIndices)
  if (cheekRegion) {
    const roughness = textureRoughness(cheekRegion.data)
    const contrast = localContrast(cheekRegion.data, cheekRegion.width, cheekRegion.height)
    const texScore = normalizeScore(roughness * 0.6 + contrast * 0.4, 0.05, 0.5)
    subScores.push({ key: 'texture', label: 'Cilt Dokusu', score: texScore, weight: 0.3, confidence: 55 })
    score = Math.round(score * 0.6 + texScore * 0.4)
  }

  // Mid-face ratio (cheekbone vs jaw width)
  const cheekL = lm[CHEEKBONE_LEFT]
  const cheekR = lm[CHEEKBONE_RIGHT]
  const jawL = lm[JAW_LEFT]
  const jawR = lm[JAW_RIGHT]
  if (cheekL && cheekR && jawL && jawR) {
    const cheekWidth = dist2D(cheekL, cheekR)
    const jawWidth = dist2D(jawL, jawR)
    const ratio = jawWidth > 0 ? cheekWidth / jawWidth : 1
    const deviation = Math.max(0, 1.05 - ratio) * 100
    const ratioScore = normalizeScore(deviation, 0, 30)
    subScores.push({ key: 'midface_ratio', label: 'Orta Yüz Oranı', score: ratioScore, weight: 0.3, confidence: 60 })
    score = Math.round(score * 0.7 + ratioScore * 0.3)
  }

  score = applyAgeModulation(score, calibration.estimatedAge, 0.6)
  confidence = applyQualityPenalty(55, view.quality.score * 100, 0.3)

  const severity = classifySeverity(score)
  const isPositive = score < 15
  const sideLabel = side === 'left' ? 'Sol' : 'Sağ'

  return {
    key: `cheek_${side}`,
    label: `${sideLabel} Yanak`,
    icon: '△',
    sourceView: view.view,
    score,
    confidence,
    severity,
    observation: isPositive
      ? `${sideLabel} yanak bölgesinde yeterli hacim desteği korunmuş görünmektedir.`
      : score >= 55
        ? `${sideLabel} yanak bölgesinde belirgin hacim değişimi gözlemlenmiştir.`
        : score >= 35
          ? `${sideLabel} yanakta orta düzeyde değişiklik tespit edilmiştir.`
          : `${sideLabel} yanakta hafif düzeyde değişiklik izleri gözlemlenmiştir.`,
    isPositive,
    subScores,
  }
}

/**
 * Analyze jawline from the angled view that reveals contour.
 */
function analyzeJawline(
  view: ViewAnalysis,
  side: 'left' | 'right',
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image
  const jawIndices = side === 'left' ? JAWLINE_LEFT : JAWLINE_RIGHT

  let score = 0
  let confidence = 45
  const subScores: SubScore[] = []

  // Edge definition along jawline contour
  const jawRegion = extractGrayscaleRegion(img, lm, jawIndices, 6)
  if (jawRegion) {
    const edges = sobelEdges(jawRegion.data, jawRegion.width, jawRegion.height)
    const density = edgeDensity(edges, jawRegion.width, jawRegion.height)
    const roughness = textureRoughness(jawRegion.data)

    // Low edge density = loss of definition, high roughness = texture changes
    const inverseDensity = Math.max(0, 0.15 - density)
    const defMetric = inverseDensity * 0.6 + roughness * 0.4
    const defScore = normalizeScore(defMetric, 0.02, 0.18)
    subScores.push({ key: 'definition', label: 'Çene Hattı Netliği', score: defScore, weight: 0.5, confidence: 60 })
    score = defScore
  }

  // Jawline angle (mandibular angle)
  const chin = lm[CHIN_BOTTOM]
  const jawPoint = lm[side === 'left' ? JAW_LEFT : JAW_RIGHT]
  const facePoint = lm[side === 'left' ? 234 : 454]
  if (chin && jawPoint && facePoint) {
    const jawAngle = angleDeg(facePoint, jawPoint, chin)
    if (!isNaN(jawAngle)) {
      const deviation = Math.abs(120 - jawAngle)
      const angleScore = normalizeScore(deviation, 0, 25)
      subScores.push({ key: 'jaw_angle', label: 'Çene Açısı', score: angleScore, weight: 0.3, confidence: 60 })
      score = Math.round(score * 0.6 + angleScore * 0.4)
    }
  }

  // Z-depth symmetry check
  const jawDepthIndices = side === 'left' ? [172, 136, 150] : [397, 365, 379]
  const jawZ = avgDepth(lm, jawDepthIndices)
  const noseZ = avgDepth(lm, NOSE_BRIDGE_DEPTH)
  const depthGap = Math.abs(noseZ - jawZ)
  const depthScore = normalizeScore(depthGap, 0, 0.02)
  subScores.push({ key: 'depth', label: 'Derinlik Profili', score: depthScore, weight: 0.2, confidence: 50 })
  score = Math.round(score * 0.8 + depthScore * 0.2)

  score = applyAgeModulation(score, calibration.estimatedAge, 0.5)
  confidence = applyQualityPenalty(55, view.quality.score * 100, 0.4)

  const severity = classifySeverity(score)
  const isPositive = score < 15
  const sideLabel = side === 'left' ? 'Sol' : 'Sağ'

  return {
    key: `jawline_${side}`,
    label: `${sideLabel} Çene Hattı`,
    icon: '⬡',
    sourceView: view.view,
    score,
    confidence,
    severity,
    observation: isPositive
      ? `${sideLabel} çene hattı net ve konturu iyi tanımlanmıştır.`
      : score >= 55
        ? `${sideLabel} çene hattında belirgin kontur kaybı tespit edilmiştir.`
        : score >= 35
          ? `${sideLabel} çene hattında orta düzeyde değişiklik gözlemlenmiştir.`
          : `${sideLabel} çene hattında hafif düzeyde değişiklik izleri tespit edilmiştir.`,
    isPositive,
    consultationNote: !isPositive && score >= 25 ? `${sideLabel} çene hattı konturu klinik değerlendirmede ele alınabilir.` : undefined,
    subScores,
  }
}

// ─── Front View Analysis (Central Regions) ──────────────────

function analyzeSymmetry(
  view: ViewAnalysis,
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks

  let score = 0
  let confidence = 55
  const subScores: SubScore[] = []

  // Left-right face width symmetry
  const noseTip = lm[NOSE_TIP]
  const leftCheek = lm[234]
  const rightCheek = lm[454]
  const leftDist = Math.abs(noseTip.x - leftCheek.x)
  const rightDist = Math.abs(rightCheek.x - noseTip.x)
  const maxDist = Math.max(leftDist, rightDist, 0.001)
  const widthAsym = Math.abs(leftDist - rightDist) / maxDist

  const symScore = normalizeScore(widthAsym, 0, 0.25)
  subScores.push({ key: 'width_symmetry', label: 'Genişlik Simetrisi', score: symScore, weight: 0.3, confidence: 65 })
  score = symScore

  // Eye symmetry
  const lEyeTop = lm[159]
  const lEyeBottom = lm[145]
  const rEyeTop = lm[386]
  const rEyeBottom = lm[374]
  const leftEAR = Math.abs(lEyeTop.y - lEyeBottom.y)
  const rightEAR = Math.abs(rEyeTop.y - rEyeBottom.y)
  const earMax = Math.max(leftEAR, rightEAR, 0.001)
  const eyeAsym = Math.abs(leftEAR - rightEAR) / earMax
  const eyeSymScore = normalizeScore(eyeAsym, 0, 0.3)
  subScores.push({ key: 'eye_symmetry', label: 'Göz Simetrisi', score: eyeSymScore, weight: 0.25, confidence: 60 })
  score = Math.round(score * 0.55 + eyeSymScore * 0.45)

  // Lip symmetry
  const lipL = lm[LIP_LEFT_CORNER]
  const lipR = lm[LIP_RIGHT_CORNER]
  const lipCenter = lm[0]
  if (lipL && lipR && lipCenter) {
    const lipLeftDist = dist2D(lipCenter, lipL)
    const lipRightDist = dist2D(lipCenter, lipR)
    const lipMax = Math.max(lipLeftDist, lipRightDist, 0.001)
    const lipAsym = Math.abs(lipLeftDist - lipRightDist) / lipMax
    const lipSymScore = normalizeScore(lipAsym, 0, 0.25)
    subScores.push({ key: 'lip_symmetry', label: 'Dudak Simetrisi', score: lipSymScore, weight: 0.2, confidence: 55 })
    score = Math.round(score * 0.7 + lipSymScore * 0.3)
  }

  // Z-depth symmetry
  const leftZ = avgDepth(lm, [116, 117, 118, 119, 120, 121])
  const rightZ = avgDepth(lm, [345, 346, 347, 348, 349, 350])
  const zMax = Math.max(Math.abs(leftZ), Math.abs(rightZ), 0.001)
  const zAsym = Math.abs(leftZ - rightZ) / zMax
  const zSymScore = normalizeScore(zAsym, 0, 0.35)
  subScores.push({ key: 'depth_symmetry', label: 'Derinlik Simetrisi', score: zSymScore, weight: 0.25, confidence: 50 })
  score = Math.round(score * 0.75 + zSymScore * 0.25)
  score = applyAgeModulation(score, calibration.estimatedAge, 0.2)
  confidence = applyQualityPenalty(60, view.quality.score * 100, 0.3)

  const severity = classifySeverity(score)
  const isPositive = score < 15

  return {
    key: 'symmetry',
    label: 'Yüz Simetrisi',
    icon: '⬡',
    sourceView: 'front',
    score,
    confidence,
    severity,
    observation: isPositive
      ? 'Yüz simetrisi dengeli ve uyumlu görünmektedir.'
      : score >= 55
        ? 'Yüz simetrisinde belirgin farklılık tespit edilmiştir.'
        : score >= 35
          ? 'Yüz simetrisinde orta düzeyde farklılık gözlemlenmiştir.'
          : 'Yüz simetrisinde hafif düzeyde farklılık izleri tespit edilmiştir.',
    isPositive,
    subScores,
  }
}

function analyzeLips(
  view: ViewAnalysis,
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image

  let score = 0
  let confidence = 45
  const subScores: SubScore[] = []

  // Lip contour edge definition
  const upperRegion = extractGrayscaleRegion(img, lm, UPPER_LIP)
  const lowerRegion = extractGrayscaleRegion(img, lm, LOWER_LIP)

  if (upperRegion && lowerRegion) {
    const upperEdges = sobelEdges(upperRegion.data, upperRegion.width, upperRegion.height)
    const lowerEdges = sobelEdges(lowerRegion.data, lowerRegion.width, lowerRegion.height)
    const upperDensity = edgeDensity(upperEdges, upperRegion.width, upperRegion.height)
    const lowerDensity = edgeDensity(lowerEdges, lowerRegion.width, lowerRegion.height)

    // Low edge density at lip border = less definition
    const avgDensity = (upperDensity + lowerDensity) / 2
    const inverseDef = Math.max(0, 0.12 - avgDensity)
    const contourScore = normalizeScore(inverseDef, 0.01, 0.10)
    subScores.push({ key: 'contour', label: 'Kontur Netliği', score: contourScore, weight: 0.35, confidence: 55 })
    score = contourScore
  }

  // Lip volume ratio (upper:lower)
  const upperMid = lm[0] // Upper lip center
  const lowerMid = lm[17] // Lower lip center
  const upperBorder = lm[13] // Upper vermilion border
  const lowerBorder = lm[14] // Lower vermilion border
  if (upperMid && lowerMid && upperBorder && lowerBorder) {
    const upperHeight = Math.abs(upperBorder.y - upperMid.y)
    const lowerHeight = Math.abs(lowerMid.y - lowerBorder.y)
    // Ideal ratio: lower lip ~1.5x upper lip
    const ratio = lowerHeight > 0 ? upperHeight / lowerHeight : 0.67
    const deviation = Math.abs(ratio - 0.67) * 100
    const volScore = normalizeScore(deviation, 0, 40)
    subScores.push({ key: 'volume_ratio', label: 'Hacim Dengesi', score: volScore, weight: 0.35, confidence: 55 })
    score = Math.round(score * 0.5 + volScore * 0.5)
  }

  // Perioral texture
  const perioralIndices = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 146, 91, 181, 84, 17, 314, 405, 321, 375]
  const perioralRegion = extractGrayscaleRegion(img, lm, perioralIndices, 8)
  if (perioralRegion) {
    const roughness = textureRoughness(perioralRegion.data)
    const texScore = normalizeScore(roughness, 0.05, 0.5)
    subScores.push({ key: 'perioral_texture', label: 'Perioral Doku', score: texScore, weight: 0.30, confidence: 50 })
    score = Math.round(score * 0.65 + texScore * 0.35)
  }

  score = applyAgeModulation(score, calibration.estimatedAge, 0.5)
  confidence = applyQualityPenalty(55, view.quality.score * 100, 0.4)

  const severity = classifySeverity(score)
  const isPositive = score < 15

  return {
    key: 'lips',
    label: 'Dudak & Perioral',
    icon: '◇',
    sourceView: 'front',
    score,
    confidence,
    severity,
    observation: isPositive
      ? 'Dudak konturu belirgin ve hacim dengesi uyumludur.'
      : score >= 55
        ? 'Dudak bölgesinde belirgin kontur kaybı ve hacim değişimi tespit edilmiştir.'
        : score >= 35
          ? 'Dudak alanında orta düzeyde değişiklik gözlemlenmiştir.'
          : 'Dudak alanında hafif düzeyde değişiklik izleri tespit edilmiştir.',
    isPositive,
    consultationNote: !isPositive && score >= 25 ? 'Dudak hacim dengesi ve kontur netliği değerlendirilebilir.' : undefined,
    subScores,
  }
}

function analyzeForehead(
  view: ViewAnalysis,
  calibration: CalibrationContext,
): MultiViewRegion {
  const lm = view.landmarks
  const img = view.image

  let score = 0
  let confidence = 45
  const subScores: SubScore[] = []

  // Forehead texture analysis
  const foreheadIndices = [10, 67, 109, 338, 297, 21, 54, 103, 284, 251]
  const fhRegion = extractGrayscaleRegion(img, lm, foreheadIndices, 8)
  if (fhRegion) {
    const roughness = textureRoughness(fhRegion.data)
    const contrast = localContrast(fhRegion.data, fhRegion.width, fhRegion.height)
    const edges = sobelEdges(fhRegion.data, fhRegion.width, fhRegion.height)
    const density = edgeDensity(edges, fhRegion.width, fhRegion.height)

    // Forehead wrinkle lines (horizontal)
    const lineScore = normalizeScore(density, 0.02, 0.20)
    const texScore = normalizeScore(roughness * 0.5 + contrast * 0.5, 0.05, 0.5)

    subScores.push(
      { key: 'lines', label: 'Alın Çizgileri', score: lineScore, weight: 0.5, confidence: 60 },
      { key: 'texture', label: 'Cilt Dokusu', score: texScore, weight: 0.3, confidence: 55 },
    )
    score = Math.round(lineScore * 0.6 + texScore * 0.4)
  }

  // Brow position / proportion
  const foreheadTop = lm[FOREHEAD_TOP]
  const chin = lm[CHIN_BOTTOM]
  const noseTip = lm[NOSE_TIP]
  if (foreheadTop && chin && noseTip) {
    const faceHeight = dist2D(foreheadTop, chin)
    const foreheadHeight = dist2D(foreheadTop, noseTip)
    const ratio = faceHeight > 0 ? foreheadHeight / faceHeight : 0.33
    const deviation = Math.abs(ratio - 0.33) * 100
    const propScore = normalizeScore(deviation, 0, 20)
    subScores.push({ key: 'proportion', label: 'Alın Oranı', score: propScore, weight: 0.2, confidence: 65 })
    score = Math.round(score * 0.8 + propScore * 0.2)
  }

  score = applyAgeModulation(score, calibration.estimatedAge, 0.5)
  confidence = applyQualityPenalty(55, view.quality.score * 100, 0.5)

  const severity = classifySeverity(score)
  const isPositive = score < 15

  return {
    key: 'forehead',
    label: 'Alın Bölgesi',
    icon: '⌂',
    sourceView: 'front',
    score,
    confidence,
    severity,
    observation: isPositive
      ? 'Alın bölgesinde belirgin çizgi tespit edilmemiştir, cilt dokusu korunmuştur.'
      : score >= 55
        ? 'Alın bölgesinde belirgin mimik çizgileri ve doku değişimi gözlemlenmiştir.'
        : score >= 35
          ? 'Alın bölgesinde orta düzeyde mimik çizgisi tespit edilmiştir.'
          : 'Alın bölgesinde hafif düzeyde çizgi izleri gözlemlenmiştir.',
    isPositive,
    consultationNote: !isPositive && score >= 25 ? 'Alın çizgileri klinik değerlendirmede ele alınabilir.' : undefined,
    subScores,
  }
}

// ─── Synthesis Helpers ──────────────────────────────────────

const VIEW_LABELS: Record<ViewKey, string> = { front: 'Ön Görünüm', left: 'Sol Yüz', right: 'Sağ Yüz' }

function buildViewSummaries(views: ViewAnalysis[], regionsByView: Record<ViewKey, MultiViewRegion[]>): ViewSummary[] {
  return views.map(v => {
    const regions = regionsByView[v.view] ?? []
    const limitations: string[] = []
    if (!v.quality.usable) limitations.push('Görüntü kalitesi yetersiz — bu açı analizi sınırlıdır')
    else {
      if (v.quality.brightness < 70) limitations.push('Düşük aydınlatma analiz hassasiyetini azaltmış olabilir')
      if (v.quality.brightness > 200) limitations.push('Yüksek parlaklık detay kaybına yol açmış olabilir')
      if (!v.poseValidation.poseCorrect) limitations.push('Poz hedeflenen açıyla tam örtüşmemiştir')
    }

    const qualityScore = Math.round(v.quality.score * 100)
    const qLabel = qualityScore >= 70 ? 'iyi' : qualityScore >= 40 ? 'kabul edilebilir' : 'sınırlı'
    const regionCount = regions.filter(r => r.confidence >= 30).length

    let narrative: string
    if (!v.quality.usable) {
      narrative = `${VIEW_LABELS[v.view]} görüntüsü analiz için yeterli kaliteye sahip değildir.`
    } else if (regionCount === 0) {
      narrative = `${VIEW_LABELS[v.view]} görüntüsünden değerlendirilebilir bölge tespit edilememiştir.`
    } else {
      narrative = `${VIEW_LABELS[v.view]} görüntüsü ${qLabel} kalitede — ${regionCount} bölge değerlendirilmiştir.`
    }

    return {
      view: v.view,
      label: VIEW_LABELS[v.view],
      qualityScore,
      usable: v.quality.usable,
      issue: v.quality.issue,
      poseCorrect: v.poseValidation.poseCorrect,
      visibleRegionCount: regionCount,
      limitations,
      narrative,
    }
  })
}

/** Match left/right region pairs and compute asymmetry */
function buildBilateralComparisons(
  leftRegions: MultiViewRegion[],
  rightRegions: MultiViewRegion[],
): BilateralComparison[] {
  const PAIRS: { base: string; label: string }[] = [
    { base: 'crow_feet', label: 'Göz Çevresi' },
    { base: 'under_eye', label: 'Göz Altı' },
    { base: 'nasolabial', label: 'Nazolabial' },
    { base: 'cheek', label: 'Yanak' },
    { base: 'jawline', label: 'Çene Hattı' },
  ]

  const results: BilateralComparison[] = []
  for (const { base, label } of PAIRS) {
    const left = leftRegions.find(r => r.key === `${base}_left`)
    const right = rightRegions.find(r => r.key === `${base}_right`)
    if (!left || !right) continue
    // Only compare if both have meaningful confidence
    if (left.confidence < 25 || right.confidence < 25) continue

    const delta = Math.abs(left.score - right.score)
    const asymmetryLevel: BilateralComparison['asymmetryLevel'] =
      delta >= 20 ? 'notable_asymmetry' : delta >= 10 ? 'mild_asymmetry' : 'symmetrical'

    let note: string
    if (asymmetryLevel === 'symmetrical') {
      note = `${label} bölgesinde sol-sağ dengesi korunmuş görünmektedir.`
    } else if (asymmetryLevel === 'mild_asymmetry') {
      const higher = left.score > right.score ? 'sol' : 'sağ'
      note = `${label} bölgesinde ${higher} tarafta hafif farklılık gözlemlenmiştir.`
    } else {
      const higher = left.score > right.score ? 'sol' : 'sağ'
      note = `${label} bölgesinde ${higher} tarafta belirgin farklılık tespit edilmiştir — klinik değerlendirme önerilir.`
    }

    results.push({
      regionBase: base,
      label,
      leftScore: left.score,
      rightScore: right.score,
      leftConfidence: left.confidence,
      rightConfidence: right.confidence,
      asymmetryDelta: delta,
      asymmetryLevel,
      note,
    })
  }
  return results
}

/** Build confidence notes explaining each region's evidence basis */
function buildConfidenceNotes(allRegions: MultiViewRegion[], views: ViewAnalysis[]): ConfidenceNote[] {
  return allRegions.map(r => {
    const sourceView = views.find(v => v.view === r.sourceView)
    const viewLabel = VIEW_LABELS[r.sourceView]

    let level: ConfidenceNote['level']
    let explanation: string

    if (r.confidence >= 60 && sourceView?.poseValidation.poseCorrect) {
      level = 'high'
      explanation = `${r.label} — ${viewLabel} üzerinden yüksek güvenilirlikle değerlendirilmiştir.`
    } else if (r.confidence >= 35) {
      level = 'medium'
      const reasons: string[] = []
      if (!sourceView?.poseValidation.poseCorrect) reasons.push('poz hedeften hafif sapma')
      if (sourceView && sourceView.quality.score < 0.6) reasons.push('görüntü kalitesi orta düzeyde')
      explanation = `${r.label} — ${viewLabel} üzerinden değerlendirilmiştir${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}.`
    } else {
      level = 'low'
      explanation = `${r.label} — sınırlı görünürlük nedeniyle düşük güvenilirlikle değerlendirilmiştir.`
    }

    return { region: r.key, label: r.label, level, explanation }
  })
}

/** Generate the overall premium narrative */
function buildOverallNarrative(
  allRegions: MultiViewRegion[],
  viewSummaries: ViewSummary[],
  bilaterals: BilateralComparison[],
  globalScore: number,
  globalConfidence: number,
): string {
  const usableCount = viewSummaries.filter(v => v.usable).length
  const regionCount = allRegions.length
  const notableAsymmetries = bilaterals.filter(b => b.asymmetryLevel === 'notable_asymmetry')

  const parts: string[] = []

  // Opening
  if (usableCount === 3) {
    parts.push('Üç açıdan (ön, sol, sağ) elde edilen görüntüler analiz edilmiştir.')
  } else if (usableCount === 2) {
    parts.push(`İki açıdan elde edilen görüntüler analiz edilmiştir — bir görünüm sınırlı kalitededir.`)
  } else {
    parts.push('Analiz sınırlı sayıda kullanılabilir görüntüyle gerçekleştirilmiştir.')
  }

  // Region count
  parts.push(`Toplamda ${regionCount} bölge değerlendirilmiştir.`)

  // Bilateral
  if (notableAsymmetries.length > 0) {
    const labels = notableAsymmetries.map(a => a.label.toLowerCase()).join(', ')
    parts.push(`Sol-sağ karşılaştırmada ${labels} bölge${notableAsymmetries.length > 1 ? 'lerinde' : 'sinde'} belirgin farklılık gözlemlenmiştir.`)
  } else if (bilaterals.length > 0) {
    parts.push('Sol-sağ karşılaştırmada genel denge korunmuş görünmektedir.')
  }

  // Confidence
  if (globalConfidence >= 65) {
    parts.push('Genel analiz güvenilirliği yüksektir.')
  } else if (globalConfidence >= 40) {
    parts.push('Genel analiz güvenilirliği orta düzeydedir — bazı bulgular görüntü kalitesinden etkilenmiş olabilir.')
  } else {
    parts.push('Görüntü kalitesi nedeniyle bazı bulgular sınırlı güvenilirlikle sunulmaktadır.')
  }

  return parts.join(' ')
}

function buildSynthesis(
  allRegions: MultiViewRegion[],
  leftRegions: MultiViewRegion[],
  rightRegions: MultiViewRegion[],
  views: ViewAnalysis[],
  viewSummaries: ViewSummary[],
  globalScore: number,
  globalConfidence: number,
): MultiViewSynthesis {
  // Strongest areas: lowest scores = best condition (score < 20 and confidence decent)
  const strongestAreas = allRegions
    .filter(r => r.isPositive && r.confidence >= 30)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map(r => ({
      region: r.key,
      label: r.label,
      score: r.score,
      note: r.observation,
    }))

  // Improvement potential: highest scores = most concern (score >= 25 and confidence decent)
  const improvementAreas = allRegions
    .filter(r => !r.isPositive && r.score >= 25 && r.confidence >= 30)
    .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence))
    .slice(0, 5)
    .map(r => ({
      region: r.key,
      label: r.label,
      score: r.score,
      note: r.consultationNote || r.observation,
    }))

  const bilateralComparisons = buildBilateralComparisons(leftRegions, rightRegions)
  const confidenceNotes = buildConfidenceNotes(allRegions, views)
  const overallNarrative = buildOverallNarrative(allRegions, viewSummaries, bilateralComparisons, globalScore, globalConfidence)

  return { strongestAreas, improvementAreas, bilateralComparisons, confidenceNotes, overallNarrative }
}

// ─── Main Pipeline ──────────────────────────────────────────

export interface MultiViewInput {
  view: ViewKey
  image: HTMLImageElement
  landmarks: Landmark[]
  detectionConfidence: number
}

/**
 * Run the multi-view analysis pipeline.
 *
 * Takes 3 images with their landmarks, validates quality and pose,
 * extracts region-specific measurements from the best view for each region,
 * and fuses results with confidence weighting.
 */
export function runMultiViewPipeline(
  inputs: MultiViewInput[],
  calibration: CalibrationContext,
): MultiViewResult {
  // ── Step 1: Validate each view ──
  const views: ViewAnalysis[] = inputs.map(input => ({
    view: input.view,
    landmarks: input.landmarks,
    image: input.image,
    quality: assessViewQuality(input.landmarks, input.image, input.detectionConfidence),
    poseValidation: validatePose(input.landmarks, input.view),
  }))

  // Check for recapture needs
  const recaptureNeeded: ViewKey[] = []
  for (const v of views) {
    if (!v.quality.usable) {
      recaptureNeeded.push(v.view)
    }
  }

  const frontView = views.find(v => v.view === 'front')
  const leftView = views.find(v => v.view === 'left')
  const rightView = views.find(v => v.view === 'right')

  // ── Step 2: Extract central regions from front view ──
  const centralRegions: MultiViewRegion[] = []
  if (frontView && frontView.quality.usable) {
    centralRegions.push(
      analyzeSymmetry(frontView, calibration),
      analyzeLips(frontView, calibration),
      analyzeForehead(frontView, calibration),
    )
  }

  // ── Step 3: Extract left-side regions from left view ──
  const leftRegions: MultiViewRegion[] = []
  const leftSource = leftView?.quality.usable ? leftView : frontView
  if (leftSource && leftSource.quality.usable) {
    leftRegions.push(
      analyzeCrowFeet(leftSource, 'left', calibration),
      analyzeUnderEye(leftSource, 'left', calibration),
      analyzeNasolabial(leftSource, 'left', calibration),
      analyzeCheekVolume(leftSource, 'left', calibration),
      analyzeJawline(leftSource, 'left', calibration),
    )

    // Penalize confidence if we fell back to front view
    if (leftSource === frontView) {
      for (const r of leftRegions) {
        r.confidence = Math.round(r.confidence * 0.7)
        r.observation += ' (ön görünümden değerlendirildi — sol açı tercih edilir)'
      }
    }
  }

  // ── Step 4: Extract right-side regions from right view ──
  const rightRegions: MultiViewRegion[] = []
  const rightSource = rightView?.quality.usable ? rightView : frontView
  if (rightSource && rightSource.quality.usable) {
    rightRegions.push(
      analyzeCrowFeet(rightSource, 'right', calibration),
      analyzeUnderEye(rightSource, 'right', calibration),
      analyzeNasolabial(rightSource, 'right', calibration),
      analyzeCheekVolume(rightSource, 'right', calibration),
      analyzeJawline(rightSource, 'right', calibration),
    )

    // Penalize confidence if we fell back to front view
    if (rightSource === frontView) {
      for (const r of rightRegions) {
        r.confidence = Math.round(r.confidence * 0.7)
        r.observation += ' (ön görünümden değerlendirildi — sağ açı tercih edilir)'
      }
    }
  }

  // ── Step 5: Fuse results with confidence weighting ──
  const allRegions = [...centralRegions, ...leftRegions, ...rightRegions]

  // Global score: weighted by confidence, not simple average
  let totalConfWeight = 0
  let weightedScore = 0
  for (const r of allRegions) {
    const weight = r.confidence / 100
    weightedScore += r.score * weight
    totalConfWeight += weight
  }
  const globalScore = totalConfWeight > 0 ? Math.round(weightedScore / totalConfWeight) : 0

  // Global confidence: average of all view qualities
  const usableViews = views.filter(v => v.quality.usable)
  const globalConfidence = usableViews.length > 0
    ? Math.round(usableViews.reduce((s, v) => s + v.quality.score * 100, 0) / usableViews.length)
    : 0

  // Priority regions: highest concern first (score * confidence product)
  const priorityRegions = allRegions
    .filter(r => !r.isPositive && r.score >= 20)
    .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence))
    .map(r => r.key)

  // ── Step 6: Build per-view summaries ──
  const regionsByView: Record<ViewKey, MultiViewRegion[]> = { front: [], left: [], right: [] }
  for (const r of allRegions) {
    regionsByView[r.sourceView].push(r)
  }
  const viewSummaries = buildViewSummaries(views, regionsByView)

  // ── Step 7: Build cross-view synthesis ──
  const synthesis = buildSynthesis(allRegions, leftRegions, rightRegions, views, viewSummaries, globalScore, globalConfidence)

  return {
    views,
    viewSummaries,
    recaptureNeeded,
    globalScore,
    globalConfidence,
    leftRegions,
    rightRegions,
    centralRegions,
    allRegions,
    priorityRegions,
    synthesis,
    analyzedAt: Date.now(),
  }
}
