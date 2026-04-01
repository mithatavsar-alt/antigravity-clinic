/**
 * ChinContourModule — Specialist for chin and lower face contour assessment
 *
 * Analyzes:
 * 1. Jawline definition: contour smoothness via edge detection
 * 2. Chin proportion: chin length relative to face height
 * 3. Lower face contour: jawline angle and transition
 * 4. Jawline symmetry: left vs right jawline balance
 * 5. Existing jawline wrinkle data reuse
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
  sobelEdges,
  edgeDensity,
  textureRoughness,
  dist2D,
  angleDeg,
  avgDepth,
} from './pixel-utils'

// ─── Landmark indices ──────────────────────────────────────

const JAWLINE_FULL = [234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454]
// Key landmarks
const CHIN_BOTTOM = 152
const FOREHEAD_TOP = 10
const NOSE_TIP = 4
const FACE_LEFT = 234
const FACE_RIGHT = 454
const JAW_LEFT = 172
const JAW_RIGHT = 397
const JAW_LEFT_MID = 136
const JAW_RIGHT_MID = 365
// ─── Feature calibration ──────────────────────────────────

const CALIBRATION = {
  jawlineDefinition: { weight: 0.30, ageModulation: 0.5, qualitySensitivity: 0.6, minThreshold: 0.02, maxThreshold: 0.18 },
  chinProportion: { weight: 0.15, ageModulation: 0.2, qualitySensitivity: 0.2, minThreshold: 0, maxThreshold: 25 },
  jawlineAngle: { weight: 0.20, ageModulation: 0.4, qualitySensitivity: 0.3, minThreshold: 0, maxThreshold: 25 },
  jawlineSymmetry: { weight: 0.15, ageModulation: 0.1, qualitySensitivity: 0.3, minThreshold: 0, maxThreshold: 0.3 },
  wrinkleReuse: { weight: 0.20, ageModulation: 0.0, qualitySensitivity: 0.0, minThreshold: 0, maxThreshold: 100 },
}

// ─── Module Implementation ─────────────────────────────────

export const ChinContourModule: SpecialistModule = {
  key: 'chin_contour',
  displayName: 'Çene & Alt Yüz Hattı',
  icon: '⬡',

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

    // ── 1. Jawline definition (edge sharpness along contour) ──
    const jawRegion = extractGrayscaleRegion(imageSource, landmarks, JAWLINE_FULL, 6)
    let jawDefScore = 0
    let jawDefConfidence = 50

    if (jawRegion) {
      const edges = sobelEdges(jawRegion.data, jawRegion.width, jawRegion.height)
      const density = edgeDensity(edges, jawRegion.width, jawRegion.height)
      const roughness = textureRoughness(jawRegion.data)

      features.values.jawline_edge_density = density
      features.values.jawline_roughness = roughness
      features.sources.push('sobel_edge_density')

      // For jawline: LOW edge density along contour = loss of definition
      // But HIGH roughness = skin texture changes
      // Combine: lack of definition + texture degradation
      const inverseDensity = Math.max(0, 0.15 - density)
      const defMetric = inverseDensity * 0.6 + roughness * 0.4

      jawDefScore = normalizeScore(defMetric, CALIBRATION.jawlineDefinition.minThreshold, CALIBRATION.jawlineDefinition.maxThreshold)
      jawDefScore = applyAgeModulation(jawDefScore, calibration.estimatedAge, CALIBRATION.jawlineDefinition.ageModulation)
      jawDefConfidence = applyQualityPenalty(70, calibration.qualityScore, CALIBRATION.jawlineDefinition.qualitySensitivity)
    }

    subScores.push({ key: 'jawline_definition', label: 'Çene Hattı Netliği', score: jawDefScore, weight: CALIBRATION.jawlineDefinition.weight, confidence: jawDefConfidence })
    weightedScore += jawDefScore * CALIBRATION.jawlineDefinition.weight
    totalWeight += CALIBRATION.jawlineDefinition.weight
    confidenceSum += jawDefConfidence; confidenceCount++

    // ── 2. Chin proportion ──
    let chinPropScore = 0
    const chinPropConfidence = 65

    const chinBottom = landmarks[CHIN_BOTTOM]
    const foreheadTop = landmarks[FOREHEAD_TOP]
    const noseTip = landmarks[NOSE_TIP]

    if (chinBottom && foreheadTop && noseTip) {
      const faceHeight = dist2D(foreheadTop, chinBottom)
      const chinLength = dist2D(noseTip, chinBottom)

      // Ideal chin:face ratio ~0.33 (lower third)
      const ratio = faceHeight > 0 ? chinLength / faceHeight : 0.33
      const deviation = Math.abs(ratio - 0.33) * 100

      features.values.face_height = faceHeight
      features.values.chin_length = chinLength
      features.values.chin_ratio = ratio
      features.values.chin_ratio_deviation = deviation
      features.sources.push('landmark_geometry')

      chinPropScore = normalizeScore(deviation, CALIBRATION.chinProportion.minThreshold, CALIBRATION.chinProportion.maxThreshold)
      chinPropScore = applyAgeModulation(chinPropScore, calibration.estimatedAge, CALIBRATION.chinProportion.ageModulation)
    }

    subScores.push({ key: 'chin_proportion', label: 'Çene Oranı', score: chinPropScore, weight: CALIBRATION.chinProportion.weight, confidence: chinPropConfidence })
    weightedScore += chinPropScore * CALIBRATION.chinProportion.weight
    totalWeight += CALIBRATION.chinProportion.weight
    confidenceSum += chinPropConfidence; confidenceCount++

    // ── 3. Jawline angle (mandibular angle) ──
    let angleScore = 0
    const angleConfidence = 60

    const jawL = landmarks[JAW_LEFT]
    const jawR = landmarks[JAW_RIGHT]
    const jawLMid = landmarks[JAW_LEFT_MID]
    const jawRMid = landmarks[JAW_RIGHT_MID]

    if (jawL && jawR && chinBottom && jawLMid && jawRMid) {
      const leftAngle = angleDeg(landmarks[FACE_LEFT] || jawL, jawL, chinBottom)
      const rightAngle = angleDeg(landmarks[FACE_RIGHT] || jawR, jawR, chinBottom)

      if (!isNaN(leftAngle) && !isNaN(rightAngle)) {
        const leftDeviation = Math.abs(120 - leftAngle)
        const rightDeviation = Math.abs(120 - rightAngle)
        const avgDeviation = (leftDeviation + rightDeviation) / 2

        features.values.jaw_angle_left = leftAngle
        features.values.jaw_angle_right = rightAngle
        features.values.jaw_angle_deviation = avgDeviation

        angleScore = normalizeScore(avgDeviation, CALIBRATION.jawlineAngle.minThreshold, CALIBRATION.jawlineAngle.maxThreshold)
        angleScore = applyAgeModulation(angleScore, calibration.estimatedAge, CALIBRATION.jawlineAngle.ageModulation)
      }
    }

    subScores.push({ key: 'jawline_angle', label: 'Alt Yüz Açısı', score: angleScore, weight: CALIBRATION.jawlineAngle.weight, confidence: angleConfidence })
    weightedScore += angleScore * CALIBRATION.jawlineAngle.weight
    totalWeight += CALIBRATION.jawlineAngle.weight
    confidenceSum += angleConfidence; confidenceCount++

    // ── 4. Jawline symmetry ──
    let symScore = 0
    let symConfidence = 60

    if (jawL && jawR && chinBottom) {
      const leftDist = dist2D(chinBottom, jawL)
      const rightDist = dist2D(chinBottom, jawR)
      const maxDist = Math.max(leftDist, rightDist, 0.001)
      const asymmetry = Math.abs(leftDist - rightDist) / maxDist

      // Also check z-depth symmetry
      const leftJawZ = avgDepth(landmarks, [172, 136, 150])
      const rightJawZ = avgDepth(landmarks, [397, 365, 379])
      const maxZ = Math.max(Math.abs(leftJawZ), Math.abs(rightJawZ), 0.001)
      const zAsymmetry = Math.abs(leftJawZ - rightJawZ) / maxZ

      const totalAsym = asymmetry * 0.6 + zAsymmetry * 0.4
      features.values.jaw_distance_asymmetry = asymmetry
      features.values.jaw_depth_asymmetry = zAsymmetry
      features.sources.push('symmetry_comparison')

      symScore = normalizeScore(totalAsym, CALIBRATION.jawlineSymmetry.minThreshold, CALIBRATION.jawlineSymmetry.maxThreshold)
      symScore = applyAgeModulation(symScore, calibration.estimatedAge, CALIBRATION.jawlineSymmetry.ageModulation)
      symConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.jawlineSymmetry.qualitySensitivity)
    }

    subScores.push({ key: 'jawline_symmetry', label: 'Çene Simetrisi', score: symScore, weight: CALIBRATION.jawlineSymmetry.weight, confidence: symConfidence })
    weightedScore += symScore * CALIBRATION.jawlineSymmetry.weight
    totalWeight += CALIBRATION.jawlineSymmetry.weight
    confidenceSum += symConfidence; confidenceCount++

    // ── 5. Jawline wrinkle data reuse ──
    let wrinkleReuseScore = 0
    if (wrinkleData) {
      const jawline = wrinkleData.find(r => r.region === 'jawline')
      if (jawline) {
        wrinkleReuseScore = jawline.score
        features.values.jawline_wrinkle_score = wrinkleReuseScore
      }
    }

    wrinkleReuseScore = applyAgeModulation(wrinkleReuseScore, calibration.estimatedAge, CALIBRATION.wrinkleReuse.ageModulation)

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

    const observation = generateObservation(finalScore, isPositive, jawDefScore, calibration.smoothingDetected)
    const consultationNote = !isPositive && finalScore >= 25 && adjustedConfidence >= 35
      ? 'Alt yüz konturu ve çene hattı netliği klinik değerlendirmede ele alınabilir.'
      : undefined

    return {
      moduleKey: 'chin_contour',
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
      evaluable: jawRegion !== null,
      limitation: !jawRegion ? 'Çene hattı bölgesi yeterince görünür değil.' : undefined,
    }
  },
}

// ─── Observation Text ──────────────────────────────────────

function generateObservation(score: number, isPositive: boolean, jawDefScore: number, smoothing: boolean): string {
  if (smoothing) {
    return 'Görüntüde yumuşatma filtresi tespit edildi — çene ve alt yüz değerlendirmesi sınırlı güvenilirlikte.'
  }
  if (isPositive) {
    return 'Çene hattı net ve alt yüz konturu dengeli görünmektedir. Mandibular hat iyi tanımlanmıştır.'
  }
  if (score >= 55) {
    if (jawDefScore >= 40) {
      return 'Alt yüz hattında belirgin kontur kaybı ve çene tanımında azalma tespit edilmiştir. Çene hattı netleştirme değerlendirmesi önerilir.'
    }
    return 'Çene ve alt yüz bölgesinde belirgin değişiklik gözlemlenmiştir. Kontur ve hacim dengesi klinik incelemede ele alınabilir.'
  }
  if (score >= 35) {
    return 'Alt yüz hattında orta düzeyde değişiklik tespit edilmiştir. Çene konturu ve orantı değerlendirmesi yapılabilir.'
  }
  return 'Alt yüz hattında hafif düzeyde değişiklik izleri gözlemlenmiştir. Erken değerlendirme önerilir.'
}
