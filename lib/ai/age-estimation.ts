/**
 * Multi-Signal Age Estimation
 *
 * Combines wrinkle analysis, geometry, skin texture signals,
 * and the AI model's raw age estimate into a confidence-weighted
 * age range rather than a single fake-precise number.
 *
 * All outputs are framed as "ön değerlendirme" — never clinical diagnosis.
 */

import type {
  AgeEstimation,
  AgeDriver,
  AgeConfidence,
  WrinkleAnalysisResult,
  ImageQualityAssessment,
  SkinTextureProfile,
  FaceMetrics,
} from './types'
import { clamp } from './utils'

interface AgeEstimationInput {
  /** Raw model age estimate (from Human engine) */
  modelAge: number | null
  /** Wrinkle analysis results */
  wrinkles: WrinkleAnalysisResult | null
  /** Image quality assessment */
  imageQuality: ImageQualityAssessment | null
  /** Skin texture profile */
  skinTexture: SkinTextureProfile | null
  /** Face geometry metrics */
  metrics: FaceMetrics | null
  /** Detection confidence 0–1 */
  detectionConfidence: number
}

/**
 * Estimate age from multiple signals.
 * Returns a range, confidence level, and contributing drivers.
 */
export function estimateAge(input: AgeEstimationInput): AgeEstimation | null {
  const { modelAge, wrinkles, imageQuality, skinTexture, detectionConfidence } = input

  // Need at least the model age to produce anything
  if (modelAge == null || modelAge < 10 || modelAge > 95) return null

  const signals: { age: number; weight: number; driver: AgeDriver }[] = []

  // ── Signal 1: Model age (strongest baseline) ──
  signals.push({
    age: modelAge,
    weight: 0.40,
    driver: {
      signal: 'model_estimate',
      label: 'AI Model Tahmini',
      weight: 0.40,
      description: 'Yapay zeka modelinin genel yüz yapısı analizi',
    },
  })

  // ── Signal 2: Forehead wrinkles ──
  if (wrinkles) {
    const foreheadRegion = wrinkles.regions.find(r => r.region === 'forehead')
    if (foreheadRegion && foreheadRegion.confidence > 0.3) {
      const foreheadAge = wrinkleScoreToAge(foreheadRegion.score, 'forehead')
      signals.push({
        age: foreheadAge,
        weight: 0.12 * foreheadRegion.confidence,
        driver: {
          signal: 'forehead_lines',
          label: 'Alın Çizgileri',
          weight: 0.12,
          description: scoreToDescription(foreheadRegion.score, 'Alın bölgesinde', 'çizgi belirginliği'),
        },
      })
    }

    // ── Signal 3: Crow's feet ──
    const crowLeft = wrinkles.regions.find(r => r.region === 'crow_feet_left')
    const crowRight = wrinkles.regions.find(r => r.region === 'crow_feet_right')
    const crowScore = avgScore(crowLeft, crowRight)
    const crowConf = avgConfidence(crowLeft, crowRight)
    if (crowScore > 0 && crowConf > 0.3) {
      const crowAge = wrinkleScoreToAge(crowScore, 'crow_feet')
      signals.push({
        age: crowAge,
        weight: 0.12 * crowConf,
        driver: {
          signal: 'crow_feet',
          label: 'Kaz Ayağı',
          weight: 0.12,
          description: scoreToDescription(crowScore, 'Göz kenarlarında', 'kaz ayağı yoğunluğu'),
        },
      })
    }

    // ── Signal 4: Under-eye texture ──
    const underL = wrinkles.regions.find(r => r.region === 'under_eye_left')
    const underR = wrinkles.regions.find(r => r.region === 'under_eye_right')
    const underScore = avgScore(underL, underR)
    const underConf = avgConfidence(underL, underR)
    if (underScore > 0 && underConf > 0.3) {
      const underAge = wrinkleScoreToAge(underScore, 'under_eye')
      signals.push({
        age: underAge,
        weight: 0.10 * underConf,
        driver: {
          signal: 'under_eye_texture',
          label: 'Göz Altı Dokusu',
          weight: 0.10,
          description: scoreToDescription(underScore, 'Göz altı bölgesinde', 'doku değişimi'),
        },
      })
    }

    // ── Signal 5: Nasolabial depth ──
    const nasoL = wrinkles.regions.find(r => r.region === 'nasolabial_left')
    const nasoR = wrinkles.regions.find(r => r.region === 'nasolabial_right')
    const nasoScore = avgScore(nasoL, nasoR)
    const nasoConf = avgConfidence(nasoL, nasoR)
    if (nasoScore > 0 && nasoConf > 0.3) {
      const nasoAge = wrinkleScoreToAge(nasoScore, 'nasolabial')
      signals.push({
        age: nasoAge,
        weight: 0.08 * nasoConf,
        driver: {
          signal: 'nasolabial_depth',
          label: 'Nazolabial Derinlik',
          weight: 0.08,
          description: scoreToDescription(nasoScore, 'Nazolabial bölgede', 'kıvrım derinliği'),
        },
      })
    }
  }

  // ── Signal 6: Skin texture smoothness ──
  if (skinTexture && skinTexture.confidence > 0.3) {
    // Lower smoothness → older appearance
    const textureAge = 25 + (100 - skinTexture.smoothness) * 0.35
    signals.push({
      age: clamp(textureAge, 20, 70),
      weight: 0.10 * skinTexture.confidence,
      driver: {
        signal: 'skin_texture',
        label: 'Cilt Dokusu',
        weight: 0.10,
        description: skinTexture.smoothness >= 70
          ? 'Cilt dokusu pürüzsüz görünüyor'
          : skinTexture.smoothness >= 45
            ? 'Cilt dokusunda hafif tekstür değişimi mevcut'
            : 'Cilt dokusunda belirgin tekstür farkları gözlemlendi',
      },
    })
  }

  // ── Signal 7: Jawline definition ──
  if (wrinkles) {
    const jawRegion = wrinkles.regions.find(r => r.region === 'jawline')
    if (jawRegion && jawRegion.confidence > 0.3) {
      const jawAge = wrinkleScoreToAge(jawRegion.score, 'jawline')
      signals.push({
        age: jawAge,
        weight: 0.08 * jawRegion.confidence,
        driver: {
          signal: 'jawline_definition',
          label: 'Çene Hattı Tanımı',
          weight: 0.08,
          description: scoreToDescription(jawRegion.score, 'Çene hattında', 'yumuşama belirtileri'),
        },
      })
    }
  }

  // ── Weighted average ──
  let weightedSum = 0
  let totalWeight = 0
  for (const s of signals) {
    weightedSum += s.age * s.weight
    totalWeight += s.weight
  }

  if (totalWeight === 0) return null

  const pointEstimate = Math.round(weightedSum / totalWeight)

  // ── Confidence ──
  const signalCount = signals.length
  const qualityFactor = imageQuality ? imageQuality.overallScore / 100 : 0.5
  const confidenceScore = clamp(
    (signalCount / 7) * 0.4 +
    qualityFactor * 0.3 +
    detectionConfidence * 0.3,
    0, 1
  )

  const confidence: AgeConfidence =
    confidenceScore >= 0.7 ? 'high' :
    confidenceScore >= 0.45 ? 'medium' : 'low'

  // ── Range: wider when less confident ──
  const halfRange = confidence === 'high' ? 2 : confidence === 'medium' ? 4 : 6
  const estimatedRange: [number, number] = [
    Math.max(18, pointEstimate - halfRange),
    Math.min(85, pointEstimate + halfRange),
  ]

  // ── Caveat ──
  let caveat: string | null = null
  if (confidence === 'low') {
    caveat = 'Bu yaş tahmini sınırlı veri ile oluşturulmuştur — referans niteliğindedir.'
  } else if (imageQuality && !imageQuality.sufficient) {
    caveat = 'Görüntü kalitesi sınırlı olduğu için yaş tahmini yaklaşık değerlendirmedir.'
  }

  // Sort drivers by weight descending
  const drivers = signals
    .map(s => s.driver)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)

  return {
    estimatedRange,
    pointEstimate,
    confidence,
    confidenceScore,
    drivers,
    caveat,
  }
}

// ─── Helpers ────────────────────────────────────────────────

function wrinkleScoreToAge(score: number, region: string): number {
  // Map wrinkle scores (0–100) to approximate age indicators
  // Different regions have different age-wrinkle relationships
  const baseAge: Record<string, number> = {
    forehead: 28,
    crow_feet: 30,
    under_eye: 27,
    nasolabial: 32,
    jawline: 35,
  }

  const ageRange: Record<string, number> = {
    forehead: 35,
    crow_feet: 30,
    under_eye: 30,
    nasolabial: 28,
    jawline: 25,
  }

  const base = baseAge[region] ?? 30
  const range = ageRange[region] ?? 30

  return clamp(Math.round(base + (score / 100) * range), 18, 80)
}

function avgScore(
  a: { score: number; confidence: number } | undefined,
  b: { score: number; confidence: number } | undefined,
): number {
  if (a && b) return (a.score + b.score) / 2
  if (a) return a.score
  if (b) return b.score
  return 0
}

function avgConfidence(
  a: { confidence: number } | undefined,
  b: { confidence: number } | undefined,
): number {
  if (a && b) return (a.confidence + b.confidence) / 2
  if (a) return a.confidence
  if (b) return b.confidence
  return 0
}

function scoreToDescription(score: number, prefix: string, descriptor: string): string {
  if (score >= 55) return `${prefix} belirgin ${descriptor} gözlemlendi`
  if (score >= 30) return `${prefix} hafif ${descriptor} mevcut`
  return `${prefix} minimal ${descriptor} tespit edildi`
}
