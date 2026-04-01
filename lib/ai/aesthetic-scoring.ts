/**
 * Aesthetic Scoring Engine
 *
 * Computes focus areas and cosmetic-support insights from face landmarks.
 * Separates geometry-based analysis from skin-texture analysis.
 * All outputs are presented as "AI-supported pre-assessment" — never diagnosis.
 */

import type { Landmark, FaceMetrics, FocusArea, FocusRegion, SymmetryAnalysis, LipAnalysis } from './types'
import { distance3D, clamp } from './utils'

// ─── Landmark indices (MediaPipe 468 compatible) ────────────

const L = {
  // Face contour
  FACE_LEFT: 234,
  FACE_RIGHT: 454,
  FOREHEAD_TOP: 10,
  CHIN_BOTTOM: 152,

  // Eyes
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 362,
  RIGHT_EYE_INNER: 263,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,

  // Nose
  NOSE_TIP: 4,
  NOSE_LEFT: 98,
  NOSE_RIGHT: 327,
  NOSE_BRIDGE: 6,

  // Mouth
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  UPPER_LIP_TOP: 0,
  LOWER_LIP_BOTTOM: 17,
  UPPER_LIP_INNER: 13,
  LOWER_LIP_INNER: 14,
  UPPER_LIP_LEFT: 78,
  UPPER_LIP_RIGHT: 308,

  // Eyebrows
  LEFT_BROW_OUTER: 46,
  LEFT_BROW_INNER: 107,
  RIGHT_BROW_OUTER: 276,
  RIGHT_BROW_INNER: 336,

  // Cheeks
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,

  // Jawline
  JAW_LEFT: 172,
  JAW_RIGHT: 397,
  JAW_LEFT_MID: 136,
  JAW_RIGHT_MID: 365,

  // Forehead / Glabella
  GLABELLA: 9,
  FOREHEAD_LEFT: 67,
  FOREHEAD_RIGHT: 297,

  // Under-eye
  LEFT_UNDER_EYE: 111,
  RIGHT_UNDER_EYE: 340,

  // Crow's feet area (lateral orbital)
  LEFT_CROW: 130,
  RIGHT_CROW: 359,
} as const

// ─── Focus area computation ────────────────────────────────

function safe(landmarks: Landmark[], index: number): Landmark {
  return landmarks[index] ?? { x: 0, y: 0, z: 0 }
}

export interface AestheticInput {
  landmarks: Landmark[]
  metrics: FaceMetrics
  estimatedAge: number | null
}

/**
 * Compute focus areas based on facial geometry.
 *
 * This does NOT diagnose skin conditions — it identifies geometric
 * regions where aesthetic attention may be relevant based on
 * proportions, symmetry, and age-related structural patterns.
 */
export function computeFocusAreas(input: AestheticInput): FocusArea[] {
  const { landmarks, metrics, estimatedAge } = input
  const areas: FocusArea[] = []

  const age = estimatedAge ?? 35
  // Softer age curve: 0 at 25, peaks at 0.65 by 55+ (not 1.0)
  // This prevents age from dominating scores
  const ageFactor = clamp((age - 25) / 45, 0, 0.65)

  // Cross-signal: symmetry ratio influences all scores slightly
  // Poor symmetry adds noise to geometric measurements
  const symPenalty = metrics.symmetryRatio < 0.90 ? (1 - metrics.symmetryRatio) * 12 : 0

  // ── Shared measurements ──
  const faceHeight = Math.abs(safe(landmarks, L.FOREHEAD_TOP).y - safe(landmarks, L.CHIN_BOTTOM).y)
  const faceWidth = distance3D(safe(landmarks, L.FACE_LEFT), safe(landmarks, L.FACE_RIGHT))
  const noseTip = safe(landmarks, L.NOSE_TIP)

  // ── 1. Forehead / Glabella ──
  const foreheadHeight = Math.abs(safe(landmarks, L.FOREHEAD_TOP).y - safe(landmarks, L.NOSE_BRIDGE).y)
  const foreheadRatio = faceHeight > 0 ? foreheadHeight / faceHeight : 0.33

  const glabella = safe(landmarks, L.GLABELLA)
  const leftBrowInner = safe(landmarks, L.LEFT_BROW_INNER)
  const rightBrowInner = safe(landmarks, L.RIGHT_BROW_INNER)
  const browGap = distance3D(leftBrowInner, rightBrowInner)
  const glabellaAsymmetry = Math.abs(
    distance3D(glabella, leftBrowInner) - distance3D(glabella, rightBrowInner)
  ) / (browGap || 0.01)

  // Brow position relative to eyes (higher = more expressive / aging indicator)
  const leftBrowHeight = Math.abs(safe(landmarks, L.LEFT_BROW_OUTER).y - safe(landmarks, L.LEFT_EYE_TOP).y)
  const rightBrowHeight = Math.abs(safe(landmarks, L.RIGHT_BROW_OUTER).y - safe(landmarks, L.RIGHT_EYE_TOP).y)
  const browHeightVariance = Math.abs(leftBrowHeight - rightBrowHeight) / (faceHeight || 0.01)

  // Forehead: ratio deviation is primary signal, brow variance is secondary
  const foreheadScore = clamp(
    Math.round(
      (Math.abs(foreheadRatio - 0.33) * 85) +
      (glabellaAsymmetry * 30) +
      (browHeightVariance * 65) +
      (ageFactor * 18) +
      symPenalty * 0.3
    ),
    8, 88
  )

  areas.push({
    region: 'forehead_glabella',
    label: 'Alın / Glabella',
    score: foreheadScore,
    insight: foreheadScore > 55
      ? 'Alın bölgesinde orantısal farklılık ve mimik aktivitesi izleri gözlenmektedir.'
      : foreheadScore > 35
        ? 'Alın bölgesinde hafif orantısal farklılık mevcut; genel görünüm dengeli.'
        : 'Alın oranları dengeli ve uyumlu görünmektedir.',
    doctorReviewRecommended: foreheadScore > 55,
  })

  // ── 2. Crow's Feet (Kaz Ayağı) ──
  const leftCrow = safe(landmarks, L.LEFT_CROW)
  const rightCrow = safe(landmarks, L.RIGHT_CROW)
  const leftEyeOuter = safe(landmarks, L.LEFT_EYE_OUTER)
  const rightEyeOuter = safe(landmarks, L.RIGHT_EYE_OUTER)

  const leftCrowDist = distance3D(leftCrow, leftEyeOuter)
  const rightCrowDist = distance3D(rightCrow, rightEyeOuter)
  const crowAsymmetry = Math.abs(leftCrowDist - rightCrowDist) / (Math.max(leftCrowDist, rightCrowDist) || 0.01)

  // Orbital width: wider orbits often show more crow's feet
  const leftOrbitalWidth = distance3D(safe(landmarks, L.LEFT_EYE_INNER), leftEyeOuter)
  const rightOrbitalWidth = distance3D(safe(landmarks, L.RIGHT_EYE_INNER), rightEyeOuter)
  const orbitalAsymmetry = Math.abs(leftOrbitalWidth - rightOrbitalWidth) / (Math.max(leftOrbitalWidth, rightOrbitalWidth) || 0.01)

  // Crow's feet: age is the dominant factor here
  const crowScore = clamp(
    Math.round(
      (ageFactor * 38) +
      (crowAsymmetry * 22) +
      (orbitalAsymmetry * 18) +
      symPenalty * 0.2 +
      5
    ),
    8, 88
  )

  areas.push({
    region: 'crow_feet',
    label: 'Kaz Ayağı',
    score: crowScore,
    insight: crowScore > 55
      ? 'Göz kenarında yapısal değişim belirtileri gözlenmektedir.'
      : crowScore > 35
        ? 'Göz çevresi hafif asimetri içermekte; belirgin bulgu sınırlı.'
        : 'Göz kenarı bölgesi dengeli ve uyumlu görünmektedir.',
    doctorReviewRecommended: crowScore > 50,
  })

  // ── 3. Under-Eye (Göz Altı) ──
  const leftUnderEye = safe(landmarks, L.LEFT_UNDER_EYE)
  const rightUnderEye = safe(landmarks, L.RIGHT_UNDER_EYE)
  const leftEyeBottom = safe(landmarks, L.LEFT_EYE_BOTTOM)
  const rightEyeBottom = safe(landmarks, L.RIGHT_EYE_BOTTOM)

  const leftUnderDist = Math.abs(leftUnderEye.y - leftEyeBottom.y)
  const rightUnderDist = Math.abs(rightUnderEye.y - rightEyeBottom.y)
  const underEyeAsymmetry = Math.abs(leftUnderDist - rightUnderDist) / (Math.max(leftUnderDist, rightUnderDist) || 0.01)

  // Under-eye depth (z-coordinate hollowing indicator)
  const avgUnderEyeDepth = (leftUnderEye.z + rightUnderEye.z) / 2
  const depthFactor = clamp(Math.abs(avgUnderEyeDepth) * 35, 0, 20)

  // Under-eye to cheek transition smoothness
  const leftCheek = safe(landmarks, L.LEFT_CHEEK)
  const rightCheek = safe(landmarks, L.RIGHT_CHEEK)
  const leftTransition = Math.abs(leftUnderEye.y - leftCheek.y) / (faceHeight || 0.01)
  const rightTransition = Math.abs(rightUnderEye.y - rightCheek.y) / (faceHeight || 0.01)
  const transitionVariance = Math.abs(leftTransition - rightTransition) * 80

  // Under-eye: depth and transition are primary (freshness indicators)
  const underEyeScore = clamp(
    Math.round(
      (ageFactor * 20) +
      (underEyeAsymmetry * 18) +
      depthFactor * 1.2 +
      transitionVariance * 1.1 +
      symPenalty * 0.25 +
      6
    ),
    8, 88
  )

  areas.push({
    region: 'under_eye',
    label: 'Göz Altı',
    score: underEyeScore,
    insight: underEyeScore > 55
      ? 'Göz altı bölgesinde hacim ve geçiş farklılığı gözlenmektedir.'
      : underEyeScore > 35
        ? 'Göz altı bölgesinde hafif yapısal farklılık mevcut; genel görünüm uyumlu.'
        : 'Göz altı bölgesi dengeli ve dinlenmiş görünmektedir.',
    doctorReviewRecommended: underEyeScore > 50,
  })

  // ── 4. Mid-Face Volume Balance (Yanak / Orta Yüz) ──
  const leftCheekDist = distance3D(leftCheek, noseTip)
  const rightCheekDist = distance3D(rightCheek, noseTip)
  const midFaceAsymmetry = Math.abs(leftCheekDist - rightCheekDist) / (Math.max(leftCheekDist, rightCheekDist) || 0.01)

  const midFaceWidth = distance3D(leftCheek, rightCheek)
  const midFaceRatio = faceWidth > 0 ? midFaceWidth / faceWidth : 1

  // Cheek height relative to face (volume indicator)
  const leftCheekHeight = Math.abs(leftCheek.y - safe(landmarks, L.LEFT_EYE_BOTTOM).y) / (faceHeight || 0.01)
  const rightCheekHeight = Math.abs(rightCheek.y - safe(landmarks, L.RIGHT_EYE_BOTTOM).y) / (faceHeight || 0.01)
  const cheekHeightBalance = Math.abs(leftCheekHeight - rightCheekHeight) * 50

  // Mid-face: volume asymmetry is primary, age is secondary
  const midFaceScore = clamp(
    Math.round(
      (midFaceAsymmetry * 38) +
      (Math.abs(midFaceRatio - 0.85) * 35) +
      cheekHeightBalance * 1.1 +
      (ageFactor * 14) +
      symPenalty * 0.35
    ),
    8, 88
  )

  areas.push({
    region: 'mid_face',
    label: 'Orta Yüz / Yanak',
    score: midFaceScore,
    insight: midFaceScore > 55
      ? 'Orta yüz bölgesinde hacim dengesi farklılığı gözlenmektedir.'
      : midFaceScore > 35
        ? 'Orta yüz hacminde hafif asimetri mevcut; belirgin düzeyde değil.'
        : 'Orta yüz hacim dengesi uyumlu ve dengeli görünmektedir.',
    doctorReviewRecommended: midFaceScore > 50,
  })

  // ── 5. Lip / Chin / Jawline Balance ──
  const mouthLeft = safe(landmarks, L.MOUTH_LEFT)
  const mouthRight = safe(landmarks, L.MOUTH_RIGHT)
  const upperLip = safe(landmarks, L.UPPER_LIP_TOP)
  const lowerLip = safe(landmarks, L.LOWER_LIP_BOTTOM)
  const chinBottom = safe(landmarks, L.CHIN_BOTTOM)

  const lipHeight = Math.abs(upperLip.y - lowerLip.y)
  const chinLength = Math.abs(lowerLip.y - chinBottom.y)
  const lipToFace = faceHeight > 0 ? lipHeight / faceHeight : 0.05
  const chinToFace = faceHeight > 0 ? chinLength / faceHeight : 0.15

  const jawLeft = safe(landmarks, L.JAW_LEFT)
  const jawRight = safe(landmarks, L.JAW_RIGHT)
  const jawLeftDist = distance3D(jawLeft, chinBottom)
  const jawRightDist = distance3D(jawRight, chinBottom)
  const jawAsymmetry = Math.abs(jawLeftDist - jawRightDist) / (Math.max(jawLeftDist, jawRightDist) || 0.01)

  // Jaw angle sharpness (more defined jaw = lower score)
  const jawLeftMid = safe(landmarks, L.JAW_LEFT_MID)
  const jawRightMid = safe(landmarks, L.JAW_RIGHT_MID)
  const jawAngleLeft = Math.abs(jawLeftMid.y - jawLeft.y) / (faceHeight || 0.01)
  const jawAngleRight = Math.abs(jawRightMid.y - jawRight.y) / (faceHeight || 0.01)
  const jawDefinition = Math.abs(jawAngleLeft - jawAngleRight) * 40

  // Lower face: jaw definition and proportions are primary
  const lipChinScore = clamp(
    Math.round(
      (Math.abs(lipToFace - 0.06) * 90) +
      (Math.abs(chinToFace - 0.18) * 55) +
      (jawAsymmetry * 35) +
      jawDefinition * 1.15 +
      (ageFactor * 10)
    ),
    8, 88
  )

  areas.push({
    region: 'lip_chin_jawline',
    label: 'Dudak / Çene / Jawline',
    score: lipChinScore,
    insight: lipChinScore > 55
      ? 'Alt yüz bölgesinde orantısal farklılık ve kontur değişimi gözlenmektedir.'
      : lipChinScore > 35
        ? 'Alt yüz oranlarında hafif farklılık mevcut; genel denge korunmuş.'
        : 'Alt yüz oranları dengeli ve tanımlı görünmektedir.',
    doctorReviewRecommended: lipChinScore > 50,
  })

  // ── 6. Nasolabial ──
  const noseLeft = safe(landmarks, L.NOSE_LEFT)
  const noseRight = safe(landmarks, L.NOSE_RIGHT)
  const nasolabialLeft = distance3D(noseLeft, mouthLeft)
  const nasolabialRight = distance3D(noseRight, mouthRight)
  const nasolabialAsymmetry = Math.abs(nasolabialLeft - nasolabialRight) / (Math.max(nasolabialLeft, nasolabialRight) || 0.01)

  // Nasolabial depth indicator from z-coordinates
  const nlDepthLeft = Math.abs(noseLeft.z - mouthLeft.z)
  const nlDepthRight = Math.abs(noseRight.z - mouthRight.z)
  const nlDepthScore = (nlDepthLeft + nlDepthRight) * 25

  // Nasolabial: depth and age are the dominant signals
  const nasolabialScore = clamp(
    Math.round(
      (nasolabialAsymmetry * 28) +
      nlDepthScore * 1.15 +
      (ageFactor * 28) +
      symPenalty * 0.2 +
      6
    ),
    8, 88
  )

  areas.push({
    region: 'nasolabial',
    label: 'Nazolabial',
    score: nasolabialScore,
    insight: nasolabialScore > 55
      ? 'Nazolabial bölgede belirginlik artışı gözlenmektedir.'
      : nasolabialScore > 35
        ? 'Nazolabial bölgede hafif kıvrım mevcut; yaş grubuyla uyumlu.'
        : 'Nazolabial bölge dengeli ve yumuşak geçişli görünmektedir.',
    doctorReviewRecommended: nasolabialScore > 55,
  })

  // ── 7. Nose ──
  // More balanced scoring: ratio deviation + symmetry + bridge alignment
  const noseBridge = safe(landmarks, L.NOSE_BRIDGE)
  const noseDeviation = faceWidth > 0.01
    ? Math.abs(noseTip.x - (safe(landmarks, L.FACE_LEFT).x + safe(landmarks, L.FACE_RIGHT).x) / 2) / faceWidth
    : 0
  const bridgeDeviation = faceWidth > 0.01
    ? Math.abs(noseBridge.x - (safe(landmarks, L.FACE_LEFT).x + safe(landmarks, L.FACE_RIGHT).x) / 2) / faceWidth
    : 0

  // Nose: deviation and ratio are the only real signals (age-independent)
  const noseScore = clamp(
    Math.round(
      (Math.abs(metrics.noseToFaceWidth - 0.25) * 115) +
      (noseDeviation * 85) +
      (bridgeDeviation * 45) +
      (metrics.symmetryRatio < 0.92 ? 10 : 0)
    ),
    8, 88
  )

  areas.push({
    region: 'nose',
    label: 'Burun',
    score: noseScore,
    insight: noseScore > 55
      ? 'Burun oranlarında yüz geneline göre farklılık gözlenmektedir.'
      : noseScore > 35
        ? 'Burun oranlarında hafif farklılık mevcut; yüz dengesiyle uyumlu.'
        : 'Burun oranları yüz geneli ile uyumlu ve dengeli görünmektedir.',
    doctorReviewRecommended: noseScore > 55,
  })

  // Sort by score descending (most attention needed first)
  areas.sort((a, b) => b.score - a.score)

  return areas
}

/**
 * Compute overall quality score from detection confidence and image characteristics.
 */
export function computeQualityScore(
  confidence: number,
  landmarkCount: number,
  imageWidth: number,
  imageHeight: number
): number {
  let score = 0

  // Detection confidence contributes 40%
  score += confidence * 40

  // Landmark completeness contributes 30%
  const completeness = clamp(landmarkCount / 468, 0, 1)
  score += completeness * 30

  // Image resolution contributes 30%
  const minDim = Math.min(imageWidth, imageHeight)
  const resFactor = clamp(minDim / 720, 0, 1)
  score += resFactor * 30

  return clamp(Math.round(score), 0, 100)
}

/**
 * Determine which zones should be flagged for doctor review.
 * Returns regions where score exceeds the threshold.
 */
export function getSuggestedZones(
  focusAreas: FocusArea[],
  threshold = 50
): FocusRegion[] {
  return focusAreas
    .filter((area) => area.score > threshold)
    .map((area) => area.region)
}

// ─── Symmetry analysis ────────────────────────────────────────

/**
 * Compute detailed symmetry analysis from landmarks.
 * Compares left/right pairs for eyes, cheeks, jaw, and nose deviation.
 */
export function computeSymmetryAnalysis(landmarks: Landmark[]): SymmetryAnalysis {
  // Eye symmetry: compare eye openings
  const leftEyeOpen = Math.abs(safe(landmarks, L.LEFT_EYE_TOP).y - safe(landmarks, L.LEFT_EYE_BOTTOM).y)
  const rightEyeOpen = Math.abs(safe(landmarks, L.RIGHT_EYE_TOP).y - safe(landmarks, L.RIGHT_EYE_BOTTOM).y)
  const maxEye = Math.max(leftEyeOpen, rightEyeOpen, 0.001)
  const eyeSymmetry = 1 - Math.abs(leftEyeOpen - rightEyeOpen) / maxEye

  // Cheek symmetry: distance from nose tip to each cheek
  const noseTip = safe(landmarks, L.NOSE_TIP)
  const leftCheekDist = distance3D(safe(landmarks, L.LEFT_CHEEK), noseTip)
  const rightCheekDist = distance3D(safe(landmarks, L.RIGHT_CHEEK), noseTip)
  const maxCheek = Math.max(leftCheekDist, rightCheekDist, 0.001)
  const cheekSymmetry = 1 - Math.abs(leftCheekDist - rightCheekDist) / maxCheek

  // Jaw symmetry: distance from chin to each jaw point
  const chin = safe(landmarks, L.CHIN_BOTTOM)
  const jawLeftDist = distance3D(safe(landmarks, L.JAW_LEFT), chin)
  const jawRightDist = distance3D(safe(landmarks, L.JAW_RIGHT), chin)
  const maxJaw = Math.max(jawLeftDist, jawRightDist, 0.001)
  const jawSymmetry = 1 - Math.abs(jawLeftDist - jawRightDist) / maxJaw

  // Nose deviation from center
  const faceLeft = safe(landmarks, L.FACE_LEFT)
  const faceRight = safe(landmarks, L.FACE_RIGHT)
  const faceCenterX = (faceLeft.x + faceRight.x) / 2
  const faceWidth = Math.abs(faceRight.x - faceLeft.x)
  const noseDeviation = faceWidth > 0.01
    ? Math.abs(noseTip.x - faceCenterX) / faceWidth
    : 0

  // Overall: weighted combination
  const overallScore = clamp(Math.round(
    (eyeSymmetry * 0.3 + cheekSymmetry * 0.25 + jawSymmetry * 0.25 + (1 - noseDeviation * 2) * 0.2) * 100
  ), 0, 100)

  return {
    overallScore,
    eyeSymmetry: clamp(eyeSymmetry, 0, 1),
    cheekSymmetry: clamp(cheekSymmetry, 0, 1),
    jawSymmetry: clamp(jawSymmetry, 0, 1),
    noseDeviation: clamp(noseDeviation, 0, 1),
  }
}

// ─── Lip Analysis ─────────────────────────────────────────────

/**
 * Compute lip structure analysis from landmarks.
 *
 * Evaluates: volume, symmetry, contour definition, surface condition.
 * Returns `evaluable: false` if landmark quality is insufficient.
 *
 * STRICT: Never assume thin or full lips without clear visual evidence.
 * If measurements are ambiguous → mark as 'unclear'.
 */
export function computeLipAnalysis(landmarks: Landmark[], detectionConfidence: number): LipAnalysis {
  const mouthLeft = safe(landmarks, L.MOUTH_LEFT)
  const mouthRight = safe(landmarks, L.MOUTH_RIGHT)
  const upperLipTop = safe(landmarks, L.UPPER_LIP_TOP)
  const lowerLipBottom = safe(landmarks, L.LOWER_LIP_BOTTOM)
  const upperLipInner = safe(landmarks, L.UPPER_LIP_INNER)
  const lowerLipInner = safe(landmarks, L.LOWER_LIP_INNER)
  const upperLipLeft = safe(landmarks, L.UPPER_LIP_LEFT)
  const upperLipRight = safe(landmarks, L.UPPER_LIP_RIGHT)
  const faceLeft = safe(landmarks, L.FACE_LEFT)
  const faceRight = safe(landmarks, L.FACE_RIGHT)
  const foreheadTop = safe(landmarks, L.FOREHEAD_TOP)
  const chinBottom = safe(landmarks, L.CHIN_BOTTOM)

  // Check if lip landmarks are present and reasonable
  const mouthWidth = distance3D(mouthLeft, mouthRight)
  const faceWidth = distance3D(faceLeft, faceRight)
  const faceHeight = Math.abs(foreheadTop.y - chinBottom.y)

  if (mouthWidth < 0.001 || faceWidth < 0.01 || faceHeight < 0.01 || detectionConfidence < 0.3) {
    return {
      volume: 'low',
      symmetry: 'unclear',
      contour: 'unclear',
      surface: 'unclear',
      evaluable: false,
      limitationReason: 'Dudak bölgesi net olarak tespit edilemedi.',
      confidence: 0,
    }
  }

  // ── Volume: lip height relative to face height ──
  const totalLipHeight = Math.abs(upperLipTop.y - lowerLipBottom.y)
  const upperLipHeight = Math.abs(upperLipTop.y - upperLipInner.y)
  const lowerLipHeight = Math.abs(lowerLipInner.y - lowerLipBottom.y)
  const lipToFaceRatio = totalLipHeight / faceHeight

  let volume: LipAnalysis['volume']
  // Conservative thresholds — only classify with clear evidence
  if (lipToFaceRatio > 0.085) {
    volume = 'full'
  } else if (lipToFaceRatio > 0.05) {
    volume = 'balanced'
  } else {
    volume = 'low'
  }

  // ── Symmetry: compare left/right mouth distances ──
  const noseTip = safe(landmarks, L.NOSE_TIP)
  const leftDist = distance3D(mouthLeft, noseTip)
  const rightDist = distance3D(mouthRight, noseTip)
  const maxDist = Math.max(leftDist, rightDist, 0.001)
  const asymmetryRatio = Math.abs(leftDist - rightDist) / maxDist

  // Also check upper lip left/right height balance
  const leftUpperHeight = Math.abs(upperLipLeft.y - upperLipInner.y)
  const rightUpperHeight = Math.abs(upperLipRight.y - upperLipInner.y)
  const upperMaxH = Math.max(leftUpperHeight, rightUpperHeight, 0.001)
  const upperAsymmetry = Math.abs(leftUpperHeight - rightUpperHeight) / upperMaxH

  const combinedAsymmetry = asymmetryRatio * 0.6 + upperAsymmetry * 0.4

  let symmetry: LipAnalysis['symmetry']
  if (combinedAsymmetry < 0.08) {
    symmetry = 'symmetrical'
  } else if (combinedAsymmetry < 0.2) {
    symmetry = 'slight_asymmetry'
  } else {
    symmetry = 'unclear' // Too asymmetric to classify reliably — could be expression
  }

  // ── Contour: how well-defined the lip border is ──
  // Approximate via vertical separation between outer and inner lip landmarks
  const upperContourGap = Math.abs(upperLipTop.y - upperLipInner.y)
  const lowerContourGap = Math.abs(lowerLipInner.y - lowerLipBottom.y)
  const contourDefinition = (upperContourGap + lowerContourGap) / (faceHeight || 0.01)

  let contour: LipAnalysis['contour']
  if (contourDefinition > 0.03 && detectionConfidence > 0.6) {
    contour = 'well_defined'
  } else if (contourDefinition > 0.015) {
    contour = 'soft'
  } else {
    contour = 'unclear'
  }

  // ── Surface: geometry cannot reliably assess texture ──
  // Only mark as smooth if detection is very high quality, otherwise unclear
  const surface: LipAnalysis['surface'] = detectionConfidence > 0.85 ? 'smooth' : 'unclear'

  // ── Confidence ──
  let confidence = detectionConfidence * 0.5
  // Boost confidence if measurements are internally consistent
  if (upperLipHeight > 0.001 && lowerLipHeight > 0.001) confidence += 0.2
  if (mouthWidth / faceWidth > 0.2 && mouthWidth / faceWidth < 0.7) confidence += 0.15
  // Lip height ratio plausibility
  if (lipToFaceRatio > 0.03 && lipToFaceRatio < 0.15) confidence += 0.15
  confidence = clamp(confidence, 0, 1)

  // If confidence is too low, mark as not evaluable
  if (confidence < 0.35) {
    return {
      volume,
      symmetry: 'unclear',
      contour: 'unclear',
      surface: 'unclear',
      evaluable: false,
      limitationReason: 'Dudak yapısı güvenilir şekilde değerlendirilemedi — görüntü kalitesi veya açı yetersiz.',
      confidence,
    }
  }

  return {
    volume,
    symmetry,
    contour,
    surface,
    evaluable: true,
    limitationReason: null,
    confidence,
  }
}
