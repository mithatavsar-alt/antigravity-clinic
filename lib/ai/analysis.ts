import type { Landmark, AnalysisResult, FaceMetrics } from './types'
import { distance3D, clamp } from './utils'

const L = {
  FACE_LEFT: 234,
  FACE_RIGHT: 454,
  NOSE_TIP: 4,
  CHIN_BOTTOM: 152,
  FOREHEAD_TOP: 10,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 362,
  RIGHT_EYE_INNER: 263,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  NOSE_LEFT: 98,
  NOSE_RIGHT: 327,
} as const

function safe(landmarks: Landmark[], index: number): Landmark | null {
  return landmarks[index] ?? null
}

function requiredLandmarks(
  landmarks: Landmark[],
  indices: number[]
): Landmark[] | null {
  const result: Landmark[] = []
  for (const i of indices) {
    const lm = safe(landmarks, i)
    if (!lm) return null
    result.push(lm)
  }
  return result
}

export function run(landmarks: Landmark[]): AnalysisResult | null {
  if (!landmarks || landmarks.length < 468) return null

  const required = requiredLandmarks(landmarks, [
    L.FACE_LEFT, L.FACE_RIGHT, L.NOSE_TIP, L.CHIN_BOTTOM, L.FOREHEAD_TOP,
    L.LEFT_EYE_OUTER, L.LEFT_EYE_INNER, L.RIGHT_EYE_OUTER, L.RIGHT_EYE_INNER,
    L.MOUTH_LEFT, L.MOUTH_RIGHT, L.NOSE_LEFT, L.NOSE_RIGHT,
  ])
  if (!required) return null

  const [
    faceLeft, faceRight, noseTip, chinBottom, foreheadTop,
    leftEyeOuter, leftEyeInner, rightEyeOuter, rightEyeInner,
    mouthLeft, mouthRight, noseLeft, noseRight
  ] = required

  const faceWidth = distance3D(faceLeft, faceRight)
  const faceHeight = distance3D(foreheadTop, chinBottom)
  const eyeDistance = distance3D(leftEyeOuter, rightEyeOuter)
  const noseWidth = distance3D(noseLeft, noseRight)
  const mouthWidth = distance3D(mouthLeft, mouthRight)

  if (faceWidth === 0 || faceHeight === 0) return null

  const faceRatio = faceHeight / faceWidth
  const eyeDistanceRatio = eyeDistance / faceWidth
  const noseToFaceWidth = noseWidth / faceWidth
  const mouthToNoseWidth = noseWidth > 0 ? mouthWidth / noseWidth : 0

  const noseCenterX = noseTip.x
  const leftEyeX = leftEyeInner.x
  const rightEyeX = rightEyeInner.x
  const leftDist = Math.abs(noseCenterX - leftEyeX)
  const rightDist = Math.abs(rightEyeX - noseCenterX)
  const symmetryRatio = leftDist > 0 && rightDist > 0
    ? (leftDist > rightDist ? rightDist / leftDist : leftDist / rightDist)
    : 1

  const metrics: FaceMetrics = {
    faceRatio: Math.round(faceRatio * 100) / 100,
    eyeDistanceRatio: Math.round(eyeDistanceRatio * 100) / 100,
    noseToFaceWidth: Math.round(noseToFaceWidth * 100) / 100,
    mouthToNoseWidth: Math.round(mouthToNoseWidth * 100) / 100,
    symmetryRatio: Math.round(symmetryRatio * 100) / 100,
  }

  const symmetryScore = clamp(Math.round(symmetryRatio * 100), 10, 100)
  const idealFaceRatio = 1.35
  const proportionDeviation = Math.abs(faceRatio - idealFaceRatio) / idealFaceRatio
  const proportionScore = clamp(Math.round((1 - proportionDeviation) * 100), 10, 100)

  const suggestions: string[] = []

  if (symmetryRatio < 0.85) {
    suggestions.push('Yüz simetrisi standart aralığın altında — simetri odaklı dolgu değerlendirilebilir.')
  }
  if (eyeDistanceRatio < 0.28) {
    suggestions.push('Göz arası mesafe yakın — burun köprüsü estetiği incelenebilir.')
  } else if (eyeDistanceRatio > 0.36) {
    suggestions.push('Göz arası mesafe geniş — orbita çevresi değerlendirmesi önerilebilir.')
  }
  if (noseToFaceWidth > 0.32) {
    suggestions.push('Burun genişliği yüz oranı üzerinde — burun ucu veya kanat düzeltmesi değerlendirilebilir.')
  }
  if (faceRatio < 1.2) {
    suggestions.push('Yüz oranı geniş/kısa görünüm eğiliminde — çene hattı iyileştirme veya alın dolgusu incelenebilir.')
  } else if (faceRatio > 1.5) {
    suggestions.push('Yüz oranı uzun/dar eğilimde — yanak dolgusu veya temporal bölge değerlendirme önerilebilir.')
  }
  if (suggestions.length === 0) {
    suggestions.push('Yüz oranları genel olarak dengeli görünüyor. Detaylı doktor değerlendirmesi ile kişiye özel plan oluşturulabilir.')
  }

  return {
    metrics,
    suggestions,
    scores: { symmetry: symmetryScore, proportion: proportionScore },
  }
}
