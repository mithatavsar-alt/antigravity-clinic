/**
 * Aesthetic Scoring Engine
 *
 * Computes focus areas and cosmetic-support insights from face landmarks.
 * Separates geometry-based analysis from skin-texture analysis.
 * All outputs are presented as "AI-supported pre-assessment" — never diagnosis.
 */

import type { Landmark, FaceMetrics, FocusArea, FocusRegion, SymmetryAnalysis } from './types'
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
  const ageFactor = clamp((age - 25) / 30, 0, 1) // 0 at 25, 1 at 55+

  // ── 1. Forehead / Glabella ──
  const foreheadHeight = Math.abs(safe(landmarks, L.FOREHEAD_TOP).y - safe(landmarks, L.NOSE_BRIDGE).y)
  const faceHeight = Math.abs(safe(landmarks, L.FOREHEAD_TOP).y - safe(landmarks, L.CHIN_BOTTOM).y)
  const foreheadRatio = faceHeight > 0 ? foreheadHeight / faceHeight : 0.33

  // Glabella area symmetry
  const glabella = safe(landmarks, L.GLABELLA)
  const leftBrowInner = safe(landmarks, L.LEFT_BROW_INNER)
  const rightBrowInner = safe(landmarks, L.RIGHT_BROW_INNER)
  const browGap = distance3D(leftBrowInner, rightBrowInner)
  const glabellaAsymmetry = Math.abs(
    distance3D(glabella, leftBrowInner) - distance3D(glabella, rightBrowInner)
  ) / (browGap || 0.01)

  const foreheadScore = clamp(
    Math.round(
      (Math.abs(foreheadRatio - 0.33) * 120) +
      (glabellaAsymmetry * 40) +
      (ageFactor * 20)
    ),
    5, 95
  )

  areas.push({
    region: 'forehead_glabella',
    label: 'Alın / Glabella',
    score: foreheadScore,
    insight: foreheadScore > 50
      ? 'Alın bölgesinde orantısal farklılık gözlenmektedir. İstenirse bu bölge için klinik değerlendirme düşünülebilir.'
      : 'Alın bölgesi oranları dengeli görünmektedir.',
    doctorReviewRecommended: foreheadScore > 60,
  })

  // ── 2. Crow's Feet (Kaz Ayağı) ──
  const leftCrow = safe(landmarks, L.LEFT_CROW)
  const rightCrow = safe(landmarks, L.RIGHT_CROW)
  const leftEyeOuter = safe(landmarks, L.LEFT_EYE_OUTER)
  const rightEyeOuter = safe(landmarks, L.RIGHT_EYE_OUTER)

  const leftCrowDist = distance3D(leftCrow, leftEyeOuter)
  const rightCrowDist = distance3D(rightCrow, rightEyeOuter)
  const crowAsymmetry = Math.abs(leftCrowDist - rightCrowDist) / (Math.max(leftCrowDist, rightCrowDist) || 0.01)

  const crowScore = clamp(
    Math.round((ageFactor * 50) + (crowAsymmetry * 30) + 10),
    5, 95
  )

  areas.push({
    region: 'crow_feet',
    label: 'Kaz Ayağı',
    score: crowScore,
    insight: crowScore > 50
      ? 'Göz kenarı bölgesinde yaşa bağlı yapısal değişim belirtileri gözlenmektedir.'
      : 'Göz kenarı bölgesi geometrik olarak dengeli görünmektedir.',
    doctorReviewRecommended: crowScore > 55,
  })

  // ── 3. Under-Eye (Göz Altı) ──
  const leftUnderEye = safe(landmarks, L.LEFT_UNDER_EYE)
  const rightUnderEye = safe(landmarks, L.RIGHT_UNDER_EYE)
  const leftEyeBottom = safe(landmarks, L.LEFT_EYE_BOTTOM)
  const rightEyeBottom = safe(landmarks, L.RIGHT_EYE_BOTTOM)

  const leftUnderDist = Math.abs(leftUnderEye.y - leftEyeBottom.y)
  const rightUnderDist = Math.abs(rightUnderEye.y - rightEyeBottom.y)
  const underEyeAsymmetry = Math.abs(leftUnderDist - rightUnderDist) / (Math.max(leftUnderDist, rightUnderDist) || 0.01)

  // Under-eye hollowing indicator (depth from z-coordinate)
  const avgUnderEyeDepth = (leftUnderEye.z + rightUnderEye.z) / 2
  const depthFactor = clamp(Math.abs(avgUnderEyeDepth) * 50, 0, 30)

  const underEyeScore = clamp(
    Math.round((ageFactor * 35) + (underEyeAsymmetry * 25) + depthFactor + 10),
    5, 95
  )

  areas.push({
    region: 'under_eye',
    label: 'Göz Altı',
    score: underEyeScore,
    insight: underEyeScore > 50
      ? 'Göz altı bölgesinde hacim değişimi belirtileri gözlenmektedir. İstenirse klinik değerlendirme düşünülebilir.'
      : 'Göz altı bölgesi geometrik açıdan uyumlu görünmektedir.',
    doctorReviewRecommended: underEyeScore > 55,
  })

  // ── 4. Mid-Face Volume Balance (Yanak / Orta Yüz) ──
  const leftCheek = safe(landmarks, L.LEFT_CHEEK)
  const rightCheek = safe(landmarks, L.RIGHT_CHEEK)
  const noseTip = safe(landmarks, L.NOSE_TIP)

  const leftCheekDist = distance3D(leftCheek, noseTip)
  const rightCheekDist = distance3D(rightCheek, noseTip)
  const midFaceAsymmetry = Math.abs(leftCheekDist - rightCheekDist) / (Math.max(leftCheekDist, rightCheekDist) || 0.01)

  const midFaceWidth = distance3D(leftCheek, rightCheek)
  const faceWidth = distance3D(safe(landmarks, L.FACE_LEFT), safe(landmarks, L.FACE_RIGHT))
  const midFaceRatio = faceWidth > 0 ? midFaceWidth / faceWidth : 1

  const midFaceScore = clamp(
    Math.round(
      (midFaceAsymmetry * 50) +
      (Math.abs(midFaceRatio - 0.85) * 60) +
      (ageFactor * 25)
    ),
    5, 95
  )

  areas.push({
    region: 'mid_face',
    label: 'Orta Yüz / Yanak',
    score: midFaceScore,
    insight: midFaceScore > 50
      ? 'Orta yüz bölgesinde hacim dengesi farklılığı gözlenmektedir. İstenirse hacim desteği açısından değerlendirme düşünülebilir.'
      : 'Orta yüz hacim dengesi uyumlu görünmektedir.',
    doctorReviewRecommended: midFaceScore > 55,
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

  // Jawline symmetry
  const jawLeft = safe(landmarks, L.JAW_LEFT)
  const jawRight = safe(landmarks, L.JAW_RIGHT)
  const jawLeftDist = distance3D(jawLeft, chinBottom)
  const jawRightDist = distance3D(jawRight, chinBottom)
  const jawAsymmetry = Math.abs(jawLeftDist - jawRightDist) / (Math.max(jawLeftDist, jawRightDist) || 0.01)

  const lipChinScore = clamp(
    Math.round(
      (Math.abs(lipToFace - 0.06) * 200) +
      (Math.abs(chinToFace - 0.18) * 100) +
      (jawAsymmetry * 40) +
      (ageFactor * 15)
    ),
    5, 95
  )

  areas.push({
    region: 'lip_chin_jawline',
    label: 'Dudak / Çene / Jawline',
    score: lipChinScore,
    insight: lipChinScore > 50
      ? 'Alt yüz bölgesinde orantısal farklılık gözlenmektedir. İstenirse bu bölge için klinik değerlendirme düşünülebilir.'
      : 'Alt yüz oranları dengeli görünmektedir.',
    doctorReviewRecommended: lipChinScore > 55,
  })

  // ── 6. Nasolabial ──
  const noseLeft = safe(landmarks, L.NOSE_LEFT)
  const noseRight = safe(landmarks, L.NOSE_RIGHT)
  const nasolabialLeft = distance3D(noseLeft, mouthLeft)
  const nasolabialRight = distance3D(noseRight, mouthRight)
  const nasolabialAsymmetry = Math.abs(nasolabialLeft - nasolabialRight) / (Math.max(nasolabialLeft, nasolabialRight) || 0.01)

  const nasolabialScore = clamp(
    Math.round((nasolabialAsymmetry * 50) + (ageFactor * 35) + 10),
    5, 95
  )

  areas.push({
    region: 'nasolabial',
    label: 'Nazolabial',
    score: nasolabialScore,
    insight: nasolabialScore > 50
      ? 'Nazolabial bölgede belirginlik artışı gözlenmektedir. İstenirse hacim desteği açısından değerlendirme düşünülebilir.'
      : 'Nazolabial bölge geometrik olarak dengeli görünmektedir.',
    doctorReviewRecommended: nasolabialScore > 60,
  })

  // ── 7. Nose ──
  const noseScore = clamp(
    Math.round(
      (Math.abs(metrics.noseToFaceWidth - 0.25) * 200) +
      (metrics.symmetryRatio < 0.9 ? 20 : 0)
    ),
    5, 95
  )

  areas.push({
    region: 'nose',
    label: 'Burun',
    score: noseScore,
    insight: noseScore > 50
      ? 'Burun oranlarında yüz geneline göre farklılık gözlenmektedir. İstenirse klinik değerlendirme düşünülebilir.'
      : 'Burun oranları yüz geneli ile uyumlu görünmektedir.',
    doctorReviewRecommended: noseScore > 60,
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
