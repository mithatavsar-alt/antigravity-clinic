/**
 * CrowFeetModule — Specialist for lateral orbital wrinkle assessment
 *
 * Analyzes crow's feet (kaz ayağı) using:
 * 1. Landmark geometry: orbital contour angles, eye corner spread
 * 2. Sobel lateral-bias edge density on crow's feet ROI
 * 3. Horizontal line continuity in the lateral orbital zone
 * 4. Left-right symmetry comparison
 *
 * Reuses wrinkle data from the main pipeline when available,
 * adds geometric analysis layer on top.
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
  sobelLateralBias,
  edgeDensity,
  textureRoughness,
  angleDeg,
} from './pixel-utils'

// ─── Landmark indices ──────────────────────────────────────

const CROW_LEFT = [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25]
const CROW_RIGHT = [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255]

// Key geometric landmarks
const L_EYE_OUTER = 33
const R_EYE_OUTER = 362
const L_BROW_OUTER = 46
const R_BROW_OUTER = 276
const L_CHEEK_UPPER = 116
const R_CHEEK_UPPER = 345

// ─── Feature calibration ──────────────────────────────────

const CALIBRATION = {
  edgeDensity: { weight: 0.35, ageModulation: 0.7, qualitySensitivity: 0.8, minThreshold: 0.02, maxThreshold: 0.25 },
  texture: { weight: 0.20, ageModulation: 0.5, qualitySensitivity: 0.6, minThreshold: 0.1, maxThreshold: 0.8 },
  cornerAngle: { weight: 0.20, ageModulation: 0.3, qualitySensitivity: 0.2, minThreshold: 0, maxThreshold: 30 },
  asymmetry: { weight: 0.15, ageModulation: 0.1, qualitySensitivity: 0.3, minThreshold: 0, maxThreshold: 0.4 },
  wrinkleReuse: { weight: 0.10, ageModulation: 0.0, qualitySensitivity: 0.0, minThreshold: 0, maxThreshold: 100 },
}

// ─── Module Implementation ─────────────────────────────────

export const CrowFeetModule: SpecialistModule = {
  key: 'crow_feet',
  displayName: 'Göz Çevresi / Kaz Ayağı',
  icon: '◎',

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

    // ── 1. Edge density via lateral-bias Sobel ──
    const leftRegion = extractGrayscaleRegion(imageSource, landmarks, CROW_LEFT)
    const rightRegion = extractGrayscaleRegion(imageSource, landmarks, CROW_RIGHT)

    let edgeDensityScore = 0
    let edgeConfidence = 50

    if (leftRegion && rightRegion) {
      const leftEdges = sobelLateralBias(leftRegion.data, leftRegion.width, leftRegion.height)
      const rightEdges = sobelLateralBias(rightRegion.data, rightRegion.width, rightRegion.height)
      const leftDensity = edgeDensity(leftEdges, leftRegion.width, leftRegion.height)
      const rightDensity = edgeDensity(rightEdges, rightRegion.width, rightRegion.height)
      const avgDensity = (leftDensity + rightDensity) / 2

      features.values.edge_density_left = leftDensity
      features.values.edge_density_right = rightDensity
      features.values.edge_density_avg = avgDensity
      features.sources.push('sobel_edge_density')

      edgeDensityScore = normalizeScore(avgDensity, CALIBRATION.edgeDensity.minThreshold, CALIBRATION.edgeDensity.maxThreshold)
      edgeDensityScore = applyAgeModulation(edgeDensityScore, calibration.estimatedAge, CALIBRATION.edgeDensity.ageModulation)
      edgeConfidence = applyQualityPenalty(75, calibration.qualityScore, CALIBRATION.edgeDensity.qualitySensitivity)
    }

    subScores.push({ key: 'edge_density', label: 'Çizgi Yoğunluğu', score: edgeDensityScore, weight: CALIBRATION.edgeDensity.weight, confidence: edgeConfidence })
    weightedScore += edgeDensityScore * CALIBRATION.edgeDensity.weight
    totalWeight += CALIBRATION.edgeDensity.weight
    confidenceSum += edgeConfidence; confidenceCount++

    // ── 2. Texture roughness ──
    let textureScore = 0
    let textureConfidence = 50

    if (leftRegion && rightRegion) {
      const leftRough = textureRoughness(leftRegion.data)
      const rightRough = textureRoughness(rightRegion.data)
      const avgRough = (leftRough + rightRough) / 2

      features.values.texture_roughness_left = leftRough
      features.values.texture_roughness_right = rightRough
      features.sources.push('texture_analysis')

      textureScore = normalizeScore(avgRough, CALIBRATION.texture.minThreshold, CALIBRATION.texture.maxThreshold)
      textureScore = applyAgeModulation(textureScore, calibration.estimatedAge, CALIBRATION.texture.ageModulation)
      textureConfidence = applyQualityPenalty(70, calibration.qualityScore, CALIBRATION.texture.qualitySensitivity)
    }

    subScores.push({ key: 'texture', label: 'Doku Pürüzlülüğü', score: textureScore, weight: CALIBRATION.texture.weight, confidence: textureConfidence })
    weightedScore += textureScore * CALIBRATION.texture.weight
    totalWeight += CALIBRATION.texture.weight
    confidenceSum += textureConfidence; confidenceCount++

    // ── 3. Corner angle geometry ──
    // Angle between brow-outer → eye-outer → cheek-upper
    // Wider angle = less taut skin = more crow's feet potential
    let cornerScore = 0
    const cornerConfidence = 65

    const lBrow = landmarks[L_BROW_OUTER]
    const lEye = landmarks[L_EYE_OUTER]
    const lCheek = landmarks[L_CHEEK_UPPER]
    const rBrow = landmarks[R_BROW_OUTER]
    const rEye = landmarks[R_EYE_OUTER]
    const rCheek = landmarks[R_CHEEK_UPPER]

    if (lBrow && lEye && lCheek && rBrow && rEye && rCheek) {
      const leftAngle = angleDeg(lBrow, lEye, lCheek)
      const rightAngle = angleDeg(rBrow, rEye, rCheek)

      if (!isNaN(leftAngle) && !isNaN(rightAngle)) {
        const leftDeviation = Math.abs(160 - leftAngle)
        const rightDeviation = Math.abs(160 - rightAngle)
        const avgDeviation = (leftDeviation + rightDeviation) / 2

        features.values.corner_angle_left = leftAngle
        features.values.corner_angle_right = rightAngle
        features.values.corner_deviation = avgDeviation
        features.sources.push('landmark_geometry')

        cornerScore = normalizeScore(avgDeviation, CALIBRATION.cornerAngle.minThreshold, CALIBRATION.cornerAngle.maxThreshold)
        cornerScore = applyAgeModulation(cornerScore, calibration.estimatedAge, CALIBRATION.cornerAngle.ageModulation)
      }
    }

    subScores.push({ key: 'corner_angle', label: 'Göz Köşe Geometrisi', score: cornerScore, weight: CALIBRATION.cornerAngle.weight, confidence: cornerConfidence })
    weightedScore += cornerScore * CALIBRATION.cornerAngle.weight
    totalWeight += CALIBRATION.cornerAngle.weight
    confidenceSum += cornerConfidence; confidenceCount++

    // ── 4. Left-right asymmetry ──
    let asymmetryScore = 0
    let asymmetryConfidence = 60

    if (features.values.edge_density_left !== undefined && features.values.edge_density_right !== undefined) {
      const maxDensity = Math.max(features.values.edge_density_left, features.values.edge_density_right, 0.001)
      const asymmetry = Math.abs(features.values.edge_density_left - features.values.edge_density_right) / maxDensity

      features.values.density_asymmetry = asymmetry
      features.sources.push('symmetry_comparison')

      asymmetryScore = normalizeScore(asymmetry, CALIBRATION.asymmetry.minThreshold, CALIBRATION.asymmetry.maxThreshold)
      asymmetryConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.asymmetry.qualitySensitivity)
    }

    subScores.push({ key: 'asymmetry', label: 'Sol-Sağ Asimetri', score: asymmetryScore, weight: CALIBRATION.asymmetry.weight, confidence: asymmetryConfidence })
    weightedScore += asymmetryScore * CALIBRATION.asymmetry.weight
    totalWeight += CALIBRATION.asymmetry.weight
    confidenceSum += asymmetryConfidence; confidenceCount++

    // ── 5. Reuse existing wrinkle data ──
    let wrinkleReuseScore = 0
    if (wrinkleData) {
      const crowLeft = wrinkleData.find(r => r.region === 'crow_feet_left')
      const crowRight = wrinkleData.find(r => r.region === 'crow_feet_right')
      if (crowLeft && crowRight) {
        wrinkleReuseScore = Math.round((crowLeft.score + crowRight.score) / 2)
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
    const severity = classifySeverity(finalScore)
    const isPositive = finalScore < 15

    // Smoothing detection penalty
    const adjustedConfidence = calibration.smoothingDetected
      ? Math.round(confidence * 0.6)
      : confidence

    const observation = generateObservation(finalScore, isPositive, calibration.smoothingDetected)
    const consultationNote = !isPositive && finalScore >= 25 && adjustedConfidence >= 35
      ? 'Göz çevresi mimik çizgileri klinik değerlendirmede öncelikli incelenebilir.'
      : undefined

    return {
      moduleKey: 'crow_feet',
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
      limitation: (!leftRegion && !rightRegion) ? 'Göz çevresi bölgesi yeterince görünür değil.' : undefined,
    }
  },
}

// ─── Observation Text Generator ────────────────────────────

function generateObservation(score: number, isPositive: boolean, smoothing: boolean): string {
  if (smoothing) {
    return 'Görüntüde yumuşatma filtresi tespit edildi — göz çevresi değerlendirmesi sınırlı güvenilirlikte.'
  }
  if (isPositive) {
    return 'Göz çevresi bölgesinde belirgin kaz ayağı çizgisi gözlemlenmemiştir. Cilt tonusu korunmuş görünmektedir.'
  }
  if (score >= 55) {
    return 'Göz çevresi lateralinde belirgin mimik çizgileri tespit edilmiştir. Çizgi derinliği ve dağılımı klinik inceleme kapsamında değerlendirilebilir.'
  }
  if (score >= 35) {
    return 'Göz çevresinde orta düzeyde mimik çizgisi aktivitesi gözlemlenmiştir. Çizgi yapısı henüz ince ancak doku değişimi başlamış olabilir.'
  }
  return 'Göz çevresinde hafif düzeyde çizgi izleri tespit edilmiştir. Erken dönem mimik çizgisi oluşumu değerlendirilebilir.'
}
