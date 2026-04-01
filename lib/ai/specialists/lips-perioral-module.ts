/**
 * LipsPerioralModule — Specialist for lip and perioral area assessment
 *
 * Analyzes:
 * 1. Lip contour definition via edge detection
 * 2. Upper-to-lower lip volume ratio (landmark geometry)
 * 3. Lip symmetry (left-right corner balance)
 * 4. Marionette line depth (wrinkle reuse + geometry)
 * 5. Perioral texture (fine lines around mouth)
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
  dist3D,
} from './pixel-utils'

// ─── Landmark indices ──────────────────────────────────────

const LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
const PERIORAL = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
  0, 267, 269, 270, 409, 37, 39, 40, 185,
]
// Key lip landmarks
const UPPER_LIP_TOP = 0
const LOWER_LIP_BOTTOM = 17
const UPPER_LIP_INNER = 13
const LOWER_LIP_INNER = 14
const MOUTH_LEFT = 61
const MOUTH_RIGHT = 291
const NOSE_TIP = 4
const CHIN = 152

// ─── Feature calibration ──────────────────────────────────

const CALIBRATION = {
  contourDefinition: { weight: 0.25, ageModulation: 0.3, qualitySensitivity: 0.7, minThreshold: 0.03, maxThreshold: 0.20 },
  volumeRatio: { weight: 0.20, ageModulation: 0.4, qualitySensitivity: 0.2, minThreshold: 0, maxThreshold: 50 },
  symmetry: { weight: 0.15, ageModulation: 0.1, qualitySensitivity: 0.2, minThreshold: 0, maxThreshold: 0.3 },
  marionette: { weight: 0.25, ageModulation: 0.7, qualitySensitivity: 0.4, minThreshold: 0, maxThreshold: 100 },
  perioralTexture: { weight: 0.15, ageModulation: 0.5, qualitySensitivity: 0.6, minThreshold: 0.05, maxThreshold: 0.55 },
}

// ─── Module Implementation ─────────────────────────────────

export const LipsPerioralModule: SpecialistModule = {
  key: 'lips_perioral',
  displayName: 'Dudak & Perioral Alan',
  icon: '◇',

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

    // ── 1. Contour definition (edge sharpness at lip border) ──
    const lipRegion = extractGrayscaleRegion(imageSource, landmarks, LIP_OUTER, 6)
    let contourScore = 0
    let contourConfidence = 50

    if (lipRegion) {
      const edges = sobelEdges(lipRegion.data, lipRegion.width, lipRegion.height)
      const density = edgeDensity(edges, lipRegion.width, lipRegion.height)

      features.values.lip_edge_density = density
      features.sources.push('sobel_edge_density')

      // Higher edge density at lip border = better definition
      // For lips, we invert: LOW density = concern (poor definition)
      const inverseDensity = Math.max(0, CALIBRATION.contourDefinition.maxThreshold - density)
      contourScore = normalizeScore(inverseDensity, 0, CALIBRATION.contourDefinition.maxThreshold - CALIBRATION.contourDefinition.minThreshold)
      contourScore = applyAgeModulation(contourScore, calibration.estimatedAge, CALIBRATION.contourDefinition.ageModulation)
      contourConfidence = applyQualityPenalty(70, calibration.qualityScore, CALIBRATION.contourDefinition.qualitySensitivity)
    }

    subScores.push({ key: 'contour', label: 'Dudak Kontur Netliği', score: contourScore, weight: CALIBRATION.contourDefinition.weight, confidence: contourConfidence })
    weightedScore += contourScore * CALIBRATION.contourDefinition.weight
    totalWeight += CALIBRATION.contourDefinition.weight
    confidenceSum += contourConfidence; confidenceCount++

    // ── 2. Volume ratio (upper:lower lip) ──
    let volumeScore = 0
    const volumeConfidence = 65

    const upperTop = landmarks[UPPER_LIP_TOP]
    const upperInner = landmarks[UPPER_LIP_INNER]
    const lowerInner = landmarks[LOWER_LIP_INNER]
    const lowerBottom = landmarks[LOWER_LIP_BOTTOM]

    if (upperTop && upperInner && lowerInner && lowerBottom) {
      const upperHeight = dist2D(upperTop, upperInner)
      const lowerHeight = dist2D(lowerInner, lowerBottom)

      // Ideal ratio is ~1:1.6 (lower slightly fuller)
      const ratio = upperHeight > 0 ? lowerHeight / upperHeight : 1
      const idealDeviation = Math.abs(ratio - 1.6)

      features.values.lip_upper_height = upperHeight
      features.values.lip_lower_height = lowerHeight
      features.values.lip_ratio = ratio
      features.values.lip_ratio_deviation = idealDeviation
      features.sources.push('landmark_geometry')

      // Also check total lip height relative to nose-chin distance
      const noseTip = landmarks[NOSE_TIP]
      const chin = landmarks[CHIN]
      if (noseTip && chin) {
        const noseToChin = dist2D(noseTip, chin)
        const totalLipHeight = upperHeight + lowerHeight
        const lipProportion = noseToChin > 0 ? totalLipHeight / noseToChin : 0
        features.values.lip_proportion = lipProportion

        // Low proportion suggests volume loss. Ideal ~0.25-0.35
        const proportionDeviation = lipProportion < 0.25 ? (0.25 - lipProportion) * 200 : 0
        volumeScore = normalizeScore(idealDeviation * 100 + proportionDeviation, CALIBRATION.volumeRatio.minThreshold, CALIBRATION.volumeRatio.maxThreshold)
      } else {
        volumeScore = normalizeScore(idealDeviation * 100, CALIBRATION.volumeRatio.minThreshold, CALIBRATION.volumeRatio.maxThreshold)
      }

      volumeScore = applyAgeModulation(volumeScore, calibration.estimatedAge, CALIBRATION.volumeRatio.ageModulation)
    }

    subScores.push({ key: 'volume_ratio', label: 'Hacim Dengesi', score: volumeScore, weight: CALIBRATION.volumeRatio.weight, confidence: volumeConfidence })
    weightedScore += volumeScore * CALIBRATION.volumeRatio.weight
    totalWeight += CALIBRATION.volumeRatio.weight
    confidenceSum += volumeConfidence; confidenceCount++

    // ── 3. Lip symmetry (left vs right corner) ──
    let symScore = 0
    const symConfidence = 65

    const mouthLeft = landmarks[MOUTH_LEFT]
    const mouthRight = landmarks[MOUTH_RIGHT]

    if (mouthLeft && mouthRight && upperTop) {
      // Vertical asymmetry of mouth corners
      const yDelta = Math.abs(mouthLeft.y - mouthRight.y)
      // Horizontal balance from center
      const centerX = upperTop.x
      const leftDist = Math.abs(mouthLeft.x - centerX)
      const rightDist = Math.abs(mouthRight.x - centerX)
      const hAsymmetry = Math.abs(leftDist - rightDist) / Math.max(leftDist, rightDist, 0.001)

      const totalAsymmetry = yDelta + hAsymmetry * 0.5
      features.values.lip_y_asymmetry = yDelta
      features.values.lip_h_asymmetry = hAsymmetry
      features.sources.push('symmetry_comparison')

      symScore = normalizeScore(totalAsymmetry, CALIBRATION.symmetry.minThreshold, CALIBRATION.symmetry.maxThreshold)
      symScore = applyAgeModulation(symScore, calibration.estimatedAge, CALIBRATION.symmetry.ageModulation)
    }

    subScores.push({ key: 'symmetry', label: 'Dudak Simetrisi', score: symScore, weight: CALIBRATION.symmetry.weight, confidence: symConfidence })
    weightedScore += symScore * CALIBRATION.symmetry.weight
    totalWeight += CALIBRATION.symmetry.weight
    confidenceSum += symConfidence; confidenceCount++

    // ── 4. Marionette lines (wrinkle data + geometry) ──
    let marionetteScore = 0
    let marionetteConfidence = 55

    if (wrinkleData) {
      const mLeft = wrinkleData.find(r => r.region === 'marionette_left')
      const mRight = wrinkleData.find(r => r.region === 'marionette_right')
      if (mLeft && mRight) {
        marionetteScore = Math.round((mLeft.score + mRight.score) / 2)
        marionetteConfidence = Math.round((mLeft.confidence + mRight.confidence) / 2 * 100)
        features.values.marionette_wrinkle_score = marionetteScore
      }
    }

    // Supplement with geometric depth at mouth corners
    if (mouthLeft && mouthRight) {
      const jawLeft = landmarks[172]
      const jawRight = landmarks[397]
      if (jawLeft && jawRight) {
        const leftDrop = dist3D(mouthLeft, jawLeft)
        const rightDrop = dist3D(mouthRight, jawRight)
        features.values.marionette_drop = (leftDrop + rightDrop) / 2
      }
    }

    marionetteScore = applyAgeModulation(marionetteScore, calibration.estimatedAge, CALIBRATION.marionette.ageModulation)

    subScores.push({ key: 'marionette', label: 'Marionette Çizgileri', score: marionetteScore, weight: CALIBRATION.marionette.weight, confidence: marionetteConfidence })
    weightedScore += marionetteScore * CALIBRATION.marionette.weight
    totalWeight += CALIBRATION.marionette.weight
    confidenceSum += marionetteConfidence; confidenceCount++

    // ── 5. Perioral texture ──
    const perioralRegion = extractGrayscaleRegion(imageSource, landmarks, PERIORAL, 4)
    let perioralScore = 0
    let perioralConfidence = 50

    if (perioralRegion) {
      const roughness = textureRoughness(perioralRegion.data)
      features.values.perioral_roughness = roughness
      features.sources.push('texture_analysis')

      perioralScore = normalizeScore(roughness, CALIBRATION.perioralTexture.minThreshold, CALIBRATION.perioralTexture.maxThreshold)
      perioralScore = applyAgeModulation(perioralScore, calibration.estimatedAge, CALIBRATION.perioralTexture.ageModulation)
      perioralConfidence = applyQualityPenalty(65, calibration.qualityScore, CALIBRATION.perioralTexture.qualitySensitivity)
    }

    subScores.push({ key: 'perioral_texture', label: 'Perioral Doku', score: perioralScore, weight: CALIBRATION.perioralTexture.weight, confidence: perioralConfidence })
    weightedScore += perioralScore * CALIBRATION.perioralTexture.weight
    totalWeight += CALIBRATION.perioralTexture.weight
    confidenceSum += perioralConfidence; confidenceCount++

    // ── Aggregate ──
    const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
    const confidence = confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : 0
    const adjustedConfidence = calibration.smoothingDetected ? Math.round(confidence * 0.6) : confidence
    const severity = classifySeverity(finalScore)
    const isPositive = finalScore < 15

    const observation = generateObservation(finalScore, isPositive, contourScore, marionetteScore, calibration.smoothingDetected)
    const consultationNote = !isPositive && finalScore >= 25 && adjustedConfidence >= 35
      ? 'Dudak hacim dengesi ve çevre kontur netliği klinik görüşmede ele alınabilir.'
      : undefined

    return {
      moduleKey: 'lips_perioral',
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
      evaluable: lipRegion !== null,
      limitation: !lipRegion ? 'Dudak bölgesi yeterince görünür değil.' : undefined,
    }
  },
}

// ─── Observation Text ──────────────────────────────────────

function generateObservation(score: number, isPositive: boolean, contourScore: number, marionetteScore: number, smoothing: boolean): string {
  if (smoothing) {
    return 'Görüntüde yumuşatma filtresi tespit edildi — dudak ve perioral bölge değerlendirmesi sınırlı güvenilirlikte.'
  }
  if (isPositive) {
    return 'Dudak konturu net ve hacim dengesi korunmuş görünmektedir. Perioral bölgede belirgin çizgi oluşumu gözlemlenmemiştir.'
  }
  if (score >= 55) {
    if (marionetteScore >= 40) {
      return 'Dudak çevresinde belirgin kontur kaybı ve marionette çizgi oluşumu tespit edilmiştir. Hacim ve çizgi değerlendirmesi birlikte önerilir.'
    }
    return 'Dudak bölgesinde belirgin hacim veya kontur değişikliği gözlemlenmiştir. Detaylı klinik inceleme önerilir.'
  }
  if (score >= 35) {
    if (contourScore >= 30) {
      return 'Dudak konturunda hafif netlik kaybı gözlemlenmiştir. Perioral bölgede ince çizgi oluşumu başlangıç aşamasında olabilir.'
    }
    return 'Dudak bölgesinde orta düzeyde değişiklik tespit edilmiştir. Hacim dengesi ve kontur netliği değerlendirilebilir.'
  }
  return 'Dudak bölgesinde hafif düzeyde değişiklik izleri gözlemlenmiştir. Koruyucu bakım değerlendirmesi yapılabilir.'
}
