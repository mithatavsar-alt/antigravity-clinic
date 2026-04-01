/**
 * UnderEyeModule — Specialist for infraorbital assessment
 *
 * Analyzes under-eye area using:
 * 1. Z-depth: tear trough depth from landmark z-coordinates
 * 2. Texture roughness: skin quality in infraorbital zone
 * 3. Color analysis: dark circle detection via luminance delta
 * 4. Volume assessment: cheek-to-undereye transition geometry
 * 5. Existing wrinkle data reuse
 */

import type { Landmark, WrinkleRegionResult } from '../types'
import type { SpecialistModule, RegionAssessment, CalibrationContext, FeatureVector, SubScore } from './types'
import {
  classifySeverity,
  normalizeScore,
  applyAgeModulation,
  applyQualityPenalty,
} from './types'
import {
  extractGrayscaleRegion,
  extractColorRegion,
  textureRoughness,
  meanBrightness,
  avgDepth,
  dist2D,
} from './pixel-utils'

// ─── Landmark indices ──────────────────────────────────────

const UNDER_EYE_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 243, 112, 26, 22, 23, 24, 110, 25]
const UNDER_EYE_RIGHT = [362, 382, 381, 380, 374, 373, 390, 249, 263, 463, 341, 256, 252, 253, 254, 339, 255]

// Tear trough depth landmarks
const TEAR_TROUGH_LEFT = [111, 117, 118, 119, 120]
const TEAR_TROUGH_RIGHT = [340, 346, 347, 348, 349]

// Cheek reference (for luminance comparison)
const CHEEK_LEFT = [116, 117, 118, 119, 120, 121, 128, 245]
const CHEEK_RIGHT = [345, 346, 347, 348, 349, 350, 357, 465]

// Eye landmarks for geometry
const L_EYE_BOTTOM = 145
const R_EYE_BOTTOM = 374
const L_CHEEK = 116
const R_CHEEK = 345
// ─── Feature calibration ──────────────────────────────────

const CALIBRATION = {
  tearTroughDepth: { weight: 0.25, ageModulation: 0.5, qualitySensitivity: 0.3, minThreshold: 0.003, maxThreshold: 0.025 },
  textureRoughness: { weight: 0.20, ageModulation: 0.4, qualitySensitivity: 0.7, minThreshold: 0.08, maxThreshold: 0.65 },
  darkCircle: { weight: 0.25, ageModulation: 0.2, qualitySensitivity: 0.5, minThreshold: 5, maxThreshold: 45 },
  volumeTransition: { weight: 0.20, ageModulation: 0.6, qualitySensitivity: 0.3, minThreshold: 0.005, maxThreshold: 0.04 },
  wrinkleReuse: { weight: 0.10, ageModulation: 0.0, qualitySensitivity: 0.0, minThreshold: 0, maxThreshold: 100 },
}

// ─── Module Implementation ─────────────────────────────────

export const UnderEyeModule: SpecialistModule = {
  key: 'under_eye',
  displayName: 'Göz Altı Bölgesi',
  icon: '◈',

  analyze(
    landmarks: Landmark[],
    imageSource: HTMLCanvasElement | HTMLImageElement,
    calibration: CalibrationContext,
    wrinkleData?: WrinkleRegionResult[],
  ): RegionAssessment {
    const features: FeatureVector = { values: {}, sources: [], extractedAt: Date.now() }
    const subScores: SubScore[] = []
    let totalWeight = 0
    let weightedScore = 0
    let confidenceSum = 0
    let confidenceCount = 0

    // ── 1. Tear trough depth (z-coordinate analysis) ──
    const leftTroughDepth = avgDepth(landmarks, TEAR_TROUGH_LEFT)
    const rightTroughDepth = avgDepth(landmarks, TEAR_TROUGH_RIGHT)
    const leftCheekDepth = avgDepth(landmarks, CHEEK_LEFT.slice(0, 4))
    const rightCheekDepth = avgDepth(landmarks, CHEEK_RIGHT.slice(0, 4))

    const leftDelta = Math.abs(leftTroughDepth - leftCheekDepth)
    const rightDelta = Math.abs(rightTroughDepth - rightCheekDepth)
    const avgDepthDelta = (leftDelta + rightDelta) / 2

    features.values.tear_trough_depth_left = leftDelta
    features.values.tear_trough_depth_right = rightDelta
    features.values.tear_trough_avg = avgDepthDelta
    features.sources.push('depth_z_coordinate')

    let depthScore = normalizeScore(avgDepthDelta, CALIBRATION.tearTroughDepth.minThreshold, CALIBRATION.tearTroughDepth.maxThreshold)
    depthScore = applyAgeModulation(depthScore, calibration.estimatedAge, CALIBRATION.tearTroughDepth.ageModulation)
    const depthConfidence = applyQualityPenalty(70, calibration.qualityScore, CALIBRATION.tearTroughDepth.qualitySensitivity)

    subScores.push({ key: 'tear_trough', label: 'Gözyaşı Çukuru Derinliği', score: depthScore, weight: CALIBRATION.tearTroughDepth.weight, confidence: depthConfidence })
    weightedScore += depthScore * CALIBRATION.tearTroughDepth.weight
    totalWeight += CALIBRATION.tearTroughDepth.weight
    confidenceSum += depthConfidence; confidenceCount++

    // ── 2. Texture roughness ──
    const leftRegion = extractGrayscaleRegion(imageSource, landmarks, UNDER_EYE_LEFT)
    const rightRegion = extractGrayscaleRegion(imageSource, landmarks, UNDER_EYE_RIGHT)

    let texScore = 0
    let texConfidence = 50

    if (leftRegion && rightRegion) {
      const leftRough = textureRoughness(leftRegion.data)
      const rightRough = textureRoughness(rightRegion.data)
      const avgRough = (leftRough + rightRough) / 2

      features.values.texture_roughness = avgRough
      features.sources.push('texture_analysis')

      texScore = normalizeScore(avgRough, CALIBRATION.textureRoughness.minThreshold, CALIBRATION.textureRoughness.maxThreshold)
      texScore = applyAgeModulation(texScore, calibration.estimatedAge, CALIBRATION.textureRoughness.ageModulation)
      texConfidence = applyQualityPenalty(70, calibration.qualityScore, CALIBRATION.textureRoughness.qualitySensitivity)
    }

    subScores.push({ key: 'texture', label: 'Doku Kalitesi', score: texScore, weight: CALIBRATION.textureRoughness.weight, confidence: texConfidence })
    weightedScore += texScore * CALIBRATION.textureRoughness.weight
    totalWeight += CALIBRATION.textureRoughness.weight
    confidenceSum += texConfidence; confidenceCount++

    // ── 3. Dark circle detection (luminance delta) ──
    let darkCircleScore = 0
    let darkConfidence = 50

    const leftColor = extractColorRegion(imageSource, landmarks, UNDER_EYE_LEFT)
    const cheekColor = extractColorRegion(imageSource, landmarks, CHEEK_LEFT)

    if (leftRegion && leftColor && cheekColor) {
      const underEyeBrightness = meanBrightness(leftRegion.data)
      // Compute cheek brightness from color region
      const cheekGray = new Uint8ClampedArray(cheekColor.width * cheekColor.height)
      for (let i = 0; i < cheekGray.length; i++) {
        cheekGray[i] = Math.round(0.299 * cheekColor.r[i] + 0.587 * cheekColor.g[i] + 0.114 * cheekColor.b[i])
      }
      const cheekBrightness = meanBrightness(cheekGray)

      const luminanceDelta = Math.max(0, cheekBrightness - underEyeBrightness)
      features.values.dark_circle_delta = luminanceDelta
      features.values.under_eye_brightness = underEyeBrightness
      features.values.cheek_brightness = cheekBrightness
      features.sources.push('color_channel')

      darkCircleScore = normalizeScore(luminanceDelta, CALIBRATION.darkCircle.minThreshold, CALIBRATION.darkCircle.maxThreshold)
      darkCircleScore = applyAgeModulation(darkCircleScore, calibration.estimatedAge, CALIBRATION.darkCircle.ageModulation)
      darkConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.darkCircle.qualitySensitivity)
    }

    subScores.push({ key: 'dark_circle', label: 'Koyu Halka', score: darkCircleScore, weight: CALIBRATION.darkCircle.weight, confidence: darkConfidence })
    weightedScore += darkCircleScore * CALIBRATION.darkCircle.weight
    totalWeight += CALIBRATION.darkCircle.weight
    confidenceSum += darkConfidence; confidenceCount++

    // ── 4. Volume transition (eye bottom → cheek distance vs depth) ──
    let volumeScore = 0
    let volumeConfidence = 60

    const lEyeBottom = landmarks[L_EYE_BOTTOM]
    const rEyeBottom = landmarks[R_EYE_BOTTOM]
    const lCheekLm = landmarks[L_CHEEK]
    const rCheekLm = landmarks[R_CHEEK]

    if (lEyeBottom && rEyeBottom && lCheekLm && rCheekLm) {
      const leftTransition = dist2D(lEyeBottom, lCheekLm)
      const rightTransition = dist2D(rEyeBottom, rCheekLm)
      const avgTransition = (leftTransition + rightTransition) / 2

      // Combine distance with depth delta for volume loss assessment
      const volumeMetric = avgTransition * avgDepthDelta * 10 // Scale factor
      features.values.volume_transition = avgTransition
      features.values.volume_metric = volumeMetric
      features.sources.push('landmark_geometry')

      volumeScore = normalizeScore(volumeMetric, CALIBRATION.volumeTransition.minThreshold, CALIBRATION.volumeTransition.maxThreshold)
      volumeScore = applyAgeModulation(volumeScore, calibration.estimatedAge, CALIBRATION.volumeTransition.ageModulation)
      volumeConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.volumeTransition.qualitySensitivity)
    }

    subScores.push({ key: 'volume', label: 'Hacim Kaybı', score: volumeScore, weight: CALIBRATION.volumeTransition.weight, confidence: volumeConfidence })
    weightedScore += volumeScore * CALIBRATION.volumeTransition.weight
    totalWeight += CALIBRATION.volumeTransition.weight
    confidenceSum += volumeConfidence; confidenceCount++

    // ── 5. Wrinkle data reuse ──
    let wrinkleReuseScore = 0
    if (wrinkleData) {
      const ueLeft = wrinkleData.find(r => r.region === 'under_eye_left')
      const ueRight = wrinkleData.find(r => r.region === 'under_eye_right')
      if (ueLeft && ueRight) {
        wrinkleReuseScore = Math.round((ueLeft.score + ueRight.score) / 2)
        features.values.wrinkle_pipeline_score = wrinkleReuseScore
      }
    }

    subScores.push({ key: 'wrinkle_reuse', label: 'Kırışıklık Verisi', score: wrinkleReuseScore, weight: CALIBRATION.wrinkleReuse.weight, confidence: 80 })
    weightedScore += wrinkleReuseScore * CALIBRATION.wrinkleReuse.weight
    totalWeight += CALIBRATION.wrinkleReuse.weight
    confidenceSum += 80; confidenceCount++

    // ── Aggregate ──
    const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
    const confidence = confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : 0
    const adjustedConfidence = calibration.smoothingDetected ? Math.round(confidence * 0.6) : confidence
    const severity = classifySeverity(finalScore)
    const isPositive = finalScore < 15

    const observation = generateObservation(finalScore, isPositive, darkCircleScore, calibration.smoothingDetected)
    const consultationNote = !isPositive && finalScore >= 25 && adjustedConfidence >= 35
      ? 'Göz altı doku değişimi ve yorgunluk görünümü için uzman değerlendirmesi önerilir.'
      : undefined

    return {
      moduleKey: 'under_eye',
      displayName: this.displayName,
      icon: this.icon,
      score: finalScore,
      confidence: adjustedConfidence,
      severity,
      subScores,
      observation,
      isPositive,
      consultationNote,
      features,
      dataSources: features.sources,
      evaluable: leftRegion !== null || rightRegion !== null,
      limitation: (!leftRegion && !rightRegion) ? 'Göz altı bölgesi yeterince görünür değil.' : undefined,
    }
  },
}

// ─── Observation Text ──────────────────────────────────────

function generateObservation(score: number, isPositive: boolean, darkCircleScore: number, smoothing: boolean): string {
  if (smoothing) {
    return 'Görüntüde yumuşatma filtresi tespit edildi — göz altı değerlendirmesi sınırlı güvenilirlikte.'
  }
  if (isPositive) {
    return 'Göz altı bölgesinde belirgin hacim kaybı veya koyu halka gözlemlenmemiştir. Bölge dinlenmiş ve sağlıklı görünmektedir.'
  }
  if (score >= 55) {
    if (darkCircleScore >= 40) {
      return 'Göz altı bölgesinde belirgin koyu halka ve doku değişimi tespit edilmiştir. Hacim kaybı ve pigmentasyon birlikte değerlendirilebilir.'
    }
    return 'Göz altı bölgesinde belirgin doku değişimi ve olası hacim kaybı gözlemlenmiştir. Gözyaşı çukuru derinliği klinik inceleme önerilir.'
  }
  if (score >= 35) {
    return 'Göz altı bölgesinde orta düzeyde değişiklik tespit edilmiştir. Hafif koyu halka veya erken dönem hacim değişimi görülebilir.'
  }
  return 'Göz altı bölgesinde hafif düzeyde değişiklik izleri tespit edilmiştir. Erken önlem değerlendirmesi yapılabilir.'
}
