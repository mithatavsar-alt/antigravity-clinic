/**
 * CheekVolumeModule — Specialist for mid-face support assessment
 *
 * Analyzes:
 * 1. Cheek contour: z-depth distribution and support geometry
 * 2. Nasolabial fold depth: wrinkle data + geometric depth
 * 3. Mid-face triangle: ratio of cheekbone to jawline width
 * 4. Skin texture: pore/texture analysis on cheek surface
 * 5. Left-right volume symmetry
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
  textureRoughness,
  localContrast,
  avgDepth,
  dist2D,
} from './pixel-utils'

// ─── Landmark indices ──────────────────────────────────────

const CHEEK_LEFT = [116, 117, 118, 119, 120, 121, 128, 245, 193, 55, 65, 52, 53]
const CHEEK_RIGHT = [345, 346, 347, 348, 349, 350, 357, 465, 417, 285, 295, 282, 283]
// Geometric reference points
const CHEEKBONE_LEFT = 234
const CHEEKBONE_RIGHT = 454
const JAW_LEFT = 172
const JAW_RIGHT = 397

// Depth sampling points
const CHEEK_DEPTH_LEFT = [116, 117, 118, 119, 120, 121]
const CHEEK_DEPTH_RIGHT = [345, 346, 347, 348, 349, 350]
const NOSE_BRIDGE_DEPTH = [6, 168, 197, 195]

// ─── Feature calibration ──────────────────────────────────

const CALIBRATION = {
  volumeSupport: { weight: 0.25, ageModulation: 0.6, qualitySensitivity: 0.3, minThreshold: 0.002, maxThreshold: 0.02 },
  nasolabialDepth: { weight: 0.30, ageModulation: 0.7, qualitySensitivity: 0.4, minThreshold: 0, maxThreshold: 100 },
  midFaceRatio: { weight: 0.15, ageModulation: 0.4, qualitySensitivity: 0.2, minThreshold: 0, maxThreshold: 30 },
  skinTexture: { weight: 0.15, ageModulation: 0.3, qualitySensitivity: 0.7, minThreshold: 0.05, maxThreshold: 0.5 },
  volumeAsymmetry: { weight: 0.15, ageModulation: 0.1, qualitySensitivity: 0.3, minThreshold: 0, maxThreshold: 0.35 },
}

// ─── Module Implementation ─────────────────────────────────

export const CheekVolumeModule: SpecialistModule = {
  key: 'cheek_volume',
  displayName: 'Yanak & Orta Yüz',
  icon: '△',

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

    // ── 1. Volume support (z-depth profile) ──
    const leftCheekZ = avgDepth(landmarks, CHEEK_DEPTH_LEFT)
    const rightCheekZ = avgDepth(landmarks, CHEEK_DEPTH_RIGHT)
    const noseZ = avgDepth(landmarks, NOSE_BRIDGE_DEPTH)

    // Cheeks should project forward relative to nose bridge plane
    // Greater difference (cheek behind nose) = less volume support
    const leftVolumeGap = Math.abs(noseZ - leftCheekZ)
    const rightVolumeGap = Math.abs(noseZ - rightCheekZ)
    const avgVolumeGap = (leftVolumeGap + rightVolumeGap) / 2

    features.values.cheek_depth_left = leftCheekZ
    features.values.cheek_depth_right = rightCheekZ
    features.values.nose_depth = noseZ
    features.values.volume_gap = avgVolumeGap
    features.sources.push('depth_z_coordinate')

    let volumeScore = normalizeScore(avgVolumeGap, CALIBRATION.volumeSupport.minThreshold, CALIBRATION.volumeSupport.maxThreshold)
    volumeScore = applyAgeModulation(volumeScore, calibration.estimatedAge, CALIBRATION.volumeSupport.ageModulation)
    const volumeConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.volumeSupport.qualitySensitivity)

    subScores.push({ key: 'volume_support', label: 'Hacim Desteği', score: volumeScore, weight: CALIBRATION.volumeSupport.weight, confidence: volumeConfidence })
    weightedScore += volumeScore * CALIBRATION.volumeSupport.weight
    totalWeight += CALIBRATION.volumeSupport.weight
    confidenceSum += volumeConfidence; confidenceCount++

    // ── 2. Nasolabial fold depth (wrinkle + geometry) ──
    let nasolabialScore = 0
    let nasolabialConfidence = 55

    if (wrinkleData) {
      const nlLeft = wrinkleData.find(r => r.region === 'nasolabial_left')
      const nlRight = wrinkleData.find(r => r.region === 'nasolabial_right')
      if (nlLeft && nlRight) {
        nasolabialScore = Math.round((nlLeft.score + nlRight.score) / 2)
        nasolabialConfidence = Math.round(((nlLeft.confidence + nlRight.confidence) / 2) * 100)
        features.values.nasolabial_wrinkle_score = nasolabialScore
      }
    }

    // Supplement: geometric distance from nose-wing to cheek surface
    const noseLeft = landmarks[98]
    const noseRight = landmarks[327]
    const cheekSurfaceLeft = landmarks[117]
    const cheekSurfaceRight = landmarks[346]

    if (noseLeft && cheekSurfaceLeft && noseRight && cheekSurfaceRight) {
      const leftFoldDist = dist2D(noseLeft, cheekSurfaceLeft)
      const rightFoldDist = dist2D(noseRight, cheekSurfaceRight)
      features.values.nasolabial_fold_dist = (leftFoldDist + rightFoldDist) / 2
      features.sources.push('landmark_geometry')
    }

    nasolabialScore = applyAgeModulation(nasolabialScore, calibration.estimatedAge, CALIBRATION.nasolabialDepth.ageModulation)

    subScores.push({ key: 'nasolabial', label: 'Nazolabial Çizgi', score: nasolabialScore, weight: CALIBRATION.nasolabialDepth.weight, confidence: nasolabialConfidence })
    weightedScore += nasolabialScore * CALIBRATION.nasolabialDepth.weight
    totalWeight += CALIBRATION.nasolabialDepth.weight
    confidenceSum += nasolabialConfidence; confidenceCount++

    // ── 3. Mid-face triangle ratio ──
    let midFaceScore = 0
    const midFaceConfidence = 60

    const cheekL = landmarks[CHEEKBONE_LEFT]
    const cheekR = landmarks[CHEEKBONE_RIGHT]
    const jawL = landmarks[JAW_LEFT]
    const jawR = landmarks[JAW_RIGHT]

    if (cheekL && cheekR && jawL && jawR) {
      const cheekWidth = dist2D(cheekL, cheekR)
      const jawWidth = dist2D(jawL, jawR)

      // Ideal: cheek slightly wider than jaw (inverted triangle)
      // cheek/jaw ratio > 1.0 = good support, < 1.0 = volume loss
      const ratio = jawWidth > 0 ? cheekWidth / jawWidth : 1
      const deviation = Math.max(0, 1.05 - ratio) * 100 // How much below ideal

      features.values.cheek_width = cheekWidth
      features.values.jaw_width = jawWidth
      features.values.midface_ratio = ratio

      midFaceScore = normalizeScore(deviation, CALIBRATION.midFaceRatio.minThreshold, CALIBRATION.midFaceRatio.maxThreshold)
      midFaceScore = applyAgeModulation(midFaceScore, calibration.estimatedAge, CALIBRATION.midFaceRatio.ageModulation)
    }

    subScores.push({ key: 'midface_ratio', label: 'Orta Yüz Oranı', score: midFaceScore, weight: CALIBRATION.midFaceRatio.weight, confidence: midFaceConfidence })
    weightedScore += midFaceScore * CALIBRATION.midFaceRatio.weight
    totalWeight += CALIBRATION.midFaceRatio.weight
    confidenceSum += midFaceConfidence; confidenceCount++

    // ── 4. Skin texture on cheek surface ──
    const leftCheekRegion = extractGrayscaleRegion(imageSource, landmarks, CHEEK_LEFT)
    const rightCheekRegion = extractGrayscaleRegion(imageSource, landmarks, CHEEK_RIGHT)

    let textureScore = 0
    let textureConfidence = 50

    if (leftCheekRegion && rightCheekRegion) {
      const leftRough = textureRoughness(leftCheekRegion.data)
      const rightRough = textureRoughness(rightCheekRegion.data)
      const leftContrast = localContrast(leftCheekRegion.data, leftCheekRegion.width, leftCheekRegion.height)
      const rightContrast = localContrast(rightCheekRegion.data, rightCheekRegion.width, rightCheekRegion.height)

      const avgRough = (leftRough + rightRough) / 2
      const avgContrast = (leftContrast + rightContrast) / 2

      features.values.cheek_roughness = avgRough
      features.values.cheek_local_contrast = avgContrast
      features.sources.push('texture_analysis')

      // Combine roughness and contrast (both indicate texture quality)
      const combinedTexture = avgRough * 0.6 + avgContrast * 0.4
      textureScore = normalizeScore(combinedTexture, CALIBRATION.skinTexture.minThreshold, CALIBRATION.skinTexture.maxThreshold)
      textureScore = applyAgeModulation(textureScore, calibration.estimatedAge, CALIBRATION.skinTexture.ageModulation)
      textureConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.skinTexture.qualitySensitivity)
    }

    subScores.push({ key: 'skin_texture', label: 'Cilt Dokusu', score: textureScore, weight: CALIBRATION.skinTexture.weight, confidence: textureConfidence })
    weightedScore += textureScore * CALIBRATION.skinTexture.weight
    totalWeight += CALIBRATION.skinTexture.weight
    confidenceSum += textureConfidence; confidenceCount++

    // ── 5. Volume asymmetry ──
    let asymScore = 0
    let asymConfidence = 60

    const leftZ = leftCheekZ
    const rightZ = rightCheekZ
    const maxZ = Math.max(Math.abs(leftZ), Math.abs(rightZ), 0.001)
    const depthAsymmetry = Math.abs(leftZ - rightZ) / maxZ

    features.values.volume_asymmetry = depthAsymmetry
    features.sources.push('symmetry_comparison')

    asymScore = normalizeScore(depthAsymmetry, CALIBRATION.volumeAsymmetry.minThreshold, CALIBRATION.volumeAsymmetry.maxThreshold)
    asymScore = applyAgeModulation(asymScore, calibration.estimatedAge, CALIBRATION.volumeAsymmetry.ageModulation)
    asymConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.volumeAsymmetry.qualitySensitivity)

    subScores.push({ key: 'volume_asymmetry', label: 'Hacim Asimetrisi', score: asymScore, weight: CALIBRATION.volumeAsymmetry.weight, confidence: asymConfidence })
    weightedScore += asymScore * CALIBRATION.volumeAsymmetry.weight
    totalWeight += CALIBRATION.volumeAsymmetry.weight
    confidenceSum += asymConfidence; confidenceCount++

    // ── Aggregate ──
    const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
    const confidence = confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : 0
    const adjustedConfidence = calibration.smoothingDetected ? Math.round(confidence * 0.6) : confidence
    const severity = classifySeverity(finalScore)
    const isPositive = finalScore < 15

    const observation = generateObservation(finalScore, isPositive, nasolabialScore, calibration.smoothingDetected)
    const consultationNote = !isPositive && finalScore >= 25 && adjustedConfidence >= 35
      ? 'Yanak desteği ve nazolabial çizgi derinliği uzman incelemesinde değerlendirilebilir.'
      : undefined

    return {
      moduleKey: 'cheek_volume',
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
      evaluable: leftCheekRegion !== null || rightCheekRegion !== null,
      limitation: (!leftCheekRegion && !rightCheekRegion) ? 'Yanak bölgesi yeterince görünür değil.' : undefined,
    }
  },
}

// ─── Observation Text ──────────────────────────────────────

function generateObservation(score: number, isPositive: boolean, nasolabialScore: number, smoothing: boolean): string {
  if (smoothing) {
    return 'Görüntüde yumuşatma filtresi tespit edildi — yanak ve orta yüz değerlendirmesi sınırlı güvenilirlikte.'
  }
  if (isPositive) {
    return 'Yanak bölgesinde yeterli hacim desteği ve cilt dokusu korunmuş görünmektedir. Orta yüz dengesi olumlu izlenim vermektedir.'
  }
  if (score >= 55) {
    if (nasolabialScore >= 40) {
      return 'Orta yüzde hacim kaybı belirtileri ve belirgin nazolabial çizgi derinliği tespit edilmiştir. Hacim desteği değerlendirmesi önerilir.'
    }
    return 'Yanak bölgesinde belirgin hacim değişimi ve cilt doku kaybı gözlemlenmiştir. Orta yüz desteği klinik incelemede ele alınabilir.'
  }
  if (score >= 35) {
    return 'Yanak bölgesinde orta düzeyde değişiklik tespit edilmiştir. Nazolabial çizgi derinliği ve hacim dengesi değerlendirilebilir.'
  }
  return 'Yanak bölgesinde hafif düzeyde değişiklik izleri gözlemlenmiştir. Koruyucu değerlendirme yapılabilir.'
}
