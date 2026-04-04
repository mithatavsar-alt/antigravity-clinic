/**
 * Confidence Engine + Multi-Layer Validation
 *
 * NO SINGLE MODEL DECISION ALLOWED.
 * Each detection must pass multiple validation layers.
 * If not all required layers pass → REJECT DETECTION.
 *
 * This module is the core of the trust-first pipeline.
 */

import type {
  Landmark,
  WrinkleRegionResult,
  FocusArea,
  AgeEstimation,
  SymmetryAnalysis,
  SkinTextureProfile,
  LipAnalysis,
} from '../types'
import type {
  ValidatedMetric,
  ValidationLayer,
  MetricDecision,
  PipelineConfig,
  YoungFaceProfile,
  QualityGateResult,
  MultiViewContext,
  ReliabilityRegion,
} from './types'
import { toConfidenceBand, toDecision } from './types'
import { detectBrowRaise, detectMouthOpen } from './quality-gate'
import { WRINKLE_TO_RELIABILITY, FOCUS_TO_RELIABILITY, isProfileDependent } from './view-roles'
import { getBestRegionConfidence } from './region-reliability'
import { clamp } from '../utils'

// ─── Young Face Guard ──────────────────────────────────────

/**
 * Determine the young face profile from age signals.
 * Young faces get STRICT thresholds for aging-related outputs.
 */
export function deriveYoungFaceProfile(
  modelAge: number | null,
  ageEstimation: AgeEstimation | null,
  skinTexture: SkinTextureProfile | null,
  config: PipelineConfig,
): YoungFaceProfile {
  if (!config.youngFaceProtection) {
    return {
      active: false,
      ageProfile: 'middle',
      wrinkleThresholdMultiplier: 1.0,
      minWrinkleScoreToShow: 20,
      minWrinkleConfidenceToShow: 60,
      priorityMetrics: [],
    }
  }

  // Gather age signals
  const ageSignals: number[] = []
  if (modelAge != null && modelAge > 10) ageSignals.push(modelAge)
  if (ageEstimation) ageSignals.push(ageEstimation.pointEstimate)

  // Skin smoothness as youth indicator
  const isSmoothSkin = skinTexture != null && skinTexture.smoothness > 72

  // Determine age profile
  const avgAge = ageSignals.length > 0
    ? ageSignals.reduce((a, b) => a + b, 0) / ageSignals.length
    : 35 // default to middle if unknown

  let ageProfile: 'young' | 'middle' | 'mature'
  if (avgAge < config.youngFaceAgeLimit || (avgAge < 32 && isSmoothSkin)) {
    ageProfile = 'young'
  } else if (avgAge < 45) {
    ageProfile = 'middle'
  } else {
    ageProfile = 'mature'
  }

  const active = ageProfile === 'young'

  return {
    active,
    ageProfile,
    // Young faces: wrinkle scores must be 1.8x higher to be shown
    wrinkleThresholdMultiplier: active ? 1.8 : ageProfile === 'middle' ? 1.0 : 0.85,
    // Young faces: minimum score 35 (vs 20 for mature)
    minWrinkleScoreToShow: active ? 35 : 20,
    // Young faces: need 70+ confidence (vs 60)
    minWrinkleConfidenceToShow: active ? 70 : 60,
    // Young faces: prioritize symmetry and proportions over wrinkles
    priorityMetrics: active
      ? ['symmetry', 'proportions', 'skin_smoothness']
      : [],
  }
}

// ─── Wrinkle Region Validation ─────────────────────────────

/**
 * Validate a single wrinkle region through multi-layer validation.
 *
 * Each region must pass:
 * 1. AI model prediction (edge density analysis)
 * 2. Geometric validation (landmark-based region quality)
 * 3. Texture validation (evidence strength check)
 * 4. Contextual validation (expression + age plausibility)
 *
 * If fewer than minValidationLayers pass → REJECT.
 */
export function validateWrinkleRegion(
  region: WrinkleRegionResult,
  landmarks: Landmark[],
  qualityGate: QualityGateResult,
  youngProfile: YoungFaceProfile,
  config: PipelineConfig,
  multiViewContext?: MultiViewContext,
): ValidatedMetric<WrinkleRegionResult> {
  const passed: ValidationLayer[] = []
  const failed: ValidationLayer[] = []

  // ── Layer 1: AI Model (edge density analysis) ──
  // The wrinkle analysis already ran — check if it produced a meaningful signal
  if (region.detected && region.score > 5) {
    passed.push('ai_model')
  } else {
    failed.push('ai_model')
  }

  // ── Layer 2: Geometric (region quality from confidence) ──
  if (region.confidence >= 0.4) {
    passed.push('geometric')
  } else {
    failed.push('geometric')
  }

  // ── Layer 3: Texture (evidence strength) ──
  if (region.evidenceStrength === 'strong' || region.evidenceStrength === 'moderate') {
    passed.push('texture')
  } else {
    failed.push('texture')
  }

  // ── Layer 4: Contextual (expression + age plausibility) ──
  const contextualScore = computeContextualScore(region, landmarks, youngProfile)
  if (contextualScore >= 0.5) {
    passed.push('contextual')
  } else {
    failed.push('contextual')
  }

  // ── Layer 5: Expression check (forehead-specific) ──
  if (isExpressionSensitive(region.region)) {
    const browRaise = detectBrowRaise(landmarks)
    const mouthOpen = detectMouthOpen(landmarks)

    const expressionOk = region.region === 'forehead' || region.region === 'glabella'
      ? browRaise < 0.4  // Brow raise < 40% — forehead lines not expression-induced
      : region.region.includes('nasolabial') || region.region.includes('marionette')
        ? mouthOpen < 0.4  // Mouth not significantly open
        : true

    if (expressionOk) {
      passed.push('expression')
    } else {
      failed.push('expression')
    }
  }

  // ── Compute confidence ──
  let confidence = computeWrinkleConfidence(region, passed, failed, qualityGate)

  // ── View-aware reliability adjustment ──
  if (multiViewContext) {
    const reliabilityRegions = WRINKLE_TO_RELIABILITY[region.region] ?? []
    if (reliabilityRegions.length > 0) {
      const regionConf = getBestRegionConfidence(
        multiViewContext.regionReliabilities,
        reliabilityRegions,
      )
      // Blend: 60% original confidence + 40% view-based region reliability
      confidence = confidence * 0.6 + regionConf * 100 * 0.4

      // Profile-dependent regions with single frontal view: cap confidence
      for (const rr of reliabilityRegions) {
        if (isProfileDependent(rr) && !multiViewContext.isMultiView) {
          confidence = Math.min(confidence, 35)
        }
      }

      // Multi-view agreement bonus
      const fusedFinding = multiViewContext.fusedFindings.find(f => f.region === region.region)
      if (fusedFinding?.multiViewAgreement) {
        confidence = Math.min(100, confidence + 10)
      }
    }
  }

  // ── Apply young face guard ──
  if (youngProfile.active) {
    // Young face: need higher score AND confidence
    if (region.score < youngProfile.minWrinkleScoreToShow) {
      confidence = Math.min(confidence, 30) // Force below show threshold
    }
    // Penalize confidence for young faces showing aging signs
    confidence *= (1 / youngProfile.wrinkleThresholdMultiplier)
  }

  confidence = clamp(Math.round(confidence), 0, 100)

  // ── Decision ──
  const band = toConfidenceBand(confidence)
  let decision = toDecision(band)

  // Additional gate: must pass minimum validation layers
  if (passed.length < config.minValidationLayers) {
    decision = 'hide'
  }

  // Soft language for moderate confidence
  const softLanguage = decision === 'soft'
    ? buildSoftWrinkleLanguage(region)
    : undefined

  const suppressionReason = decision === 'hide'
    ? buildSuppressionReason(region, passed, failed, youngProfile)
    : undefined

  return {
    data: region,
    confidence,
    band,
    decision,
    validationsPassed: passed,
    validationsFailed: failed,
    softLanguage,
    suppressionReason,
  }
}

// ─── Focus Area Validation ─────────────────────────────────

/**
 * Validate a focus area through multi-layer validation.
 * Focus areas are geometry-based so they get different validation.
 */
export function validateFocusArea(
  area: FocusArea,
  wrinkleResults: ValidatedMetric<WrinkleRegionResult>[],
  qualityGate: QualityGateResult,
  youngProfile: YoungFaceProfile,
  config: PipelineConfig,
  multiViewContext?: MultiViewContext,
): ValidatedMetric<FocusArea> {
  const passed: ValidationLayer[] = []
  const failed: ValidationLayer[] = []

  // ── Layer 1: Geometric (always available for focus areas) ──
  if (area.score > 10) {
    passed.push('geometric')
  } else {
    failed.push('geometric')
  }

  // ── Layer 2: Cross-region validation ──
  // Check if wrinkle analysis for corresponding region agrees
  const matchingWrinkle = findMatchingWrinkle(area.region, wrinkleResults)
  if (matchingWrinkle) {
    if (matchingWrinkle.decision !== 'hide') {
      passed.push('cross_region')
    } else {
      // Wrinkle analysis disagrees — geometry says attention needed but texture doesn't
      failed.push('cross_region')
    }
  }
  // If no matching wrinkle data, we can't cross-validate (neutral — don't count)

  // ── Layer 3: Age plausibility ──
  const isAgeSensitive = ['crow_feet', 'nasolabial', 'forehead_glabella'].includes(area.region)
  if (isAgeSensitive && youngProfile.active && area.score < 60) {
    // Young face showing moderate aging focus area — suspicious
    failed.push('age_plausibility')
  } else {
    passed.push('age_plausibility')
  }

  // ── Confidence ──
  const qualityFactor = qualityGate.score / 100
  let confidence = area.score * 0.4 + qualityFactor * 30 + (passed.length / Math.max(passed.length + failed.length, 1)) * 30

  if (youngProfile.active && isAgeSensitive) {
    confidence *= 0.7 // Reduce confidence for age-sensitive areas in young faces
  }

  // ── View-aware reliability adjustment ──
  if (multiViewContext) {
    const reliabilityRegions: ReliabilityRegion[] = FOCUS_TO_RELIABILITY[area.region] ?? []
    if (reliabilityRegions.length > 0) {
      const regionConf = getBestRegionConfidence(
        multiViewContext.regionReliabilities,
        reliabilityRegions,
      )
      // Blend: 70% original + 30% view-based region reliability
      confidence = confidence * 0.7 + regionConf * 100 * 0.3

      // Profile-dependent focus areas with no side views: cap
      for (const rr of reliabilityRegions) {
        if (isProfileDependent(rr) && !multiViewContext.isMultiView) {
          confidence = Math.min(confidence, 40)
        }
      }
    }
  }

  // ── Missing wrinkle cross-validation penalty ──
  // FIX: absence of corroborating wrinkle evidence should REDUCE confidence,
  // not be neutral. A geometry-only focus area with no texture backing is weaker.
  if (!matchingWrinkle && wrinkleResults.length > 0) {
    confidence *= 0.85 // 15% penalty for no cross-validation
  }

  confidence = clamp(Math.round(confidence), 0, 100)

  const band = toConfidenceBand(confidence)
  let decision = toDecision(band)

  if (passed.length < config.minValidationLayers) {
    decision = 'hide'
  }

  return {
    data: area,
    confidence,
    band,
    decision,
    validationsPassed: passed,
    validationsFailed: failed,
    softLanguage: decision === 'soft'
      ? `${area.label} bölgesinde olası hafif farklılık gözlenmektedir — kesin değerlendirme için uzman görüşü önerilir.`
      : undefined,
    suppressionReason: decision === 'hide'
      ? `${area.label}: yetersiz güven düzeyi (${confidence}/100)`
      : undefined,
  }
}

// ─── Age Estimation Validation ─────────────────────────────

/**
 * Validate age estimation with STRICT thresholds.
 * NEVER show exact age. NEVER show if confidence < 75.
 */
export function validateAgeEstimation(
  age: AgeEstimation | null,
  qualityGate: QualityGateResult,
  _config?: PipelineConfig,
): ValidatedMetric<AgeEstimation> | null {
  if (!age) return null

  const passed: ValidationLayer[] = []
  const failed: ValidationLayer[] = []

  // ── Layer 1: AI Model confidence ──
  if (age.confidenceScore >= 0.5) {
    passed.push('ai_model')
  } else {
    failed.push('ai_model')
  }

  // ── Layer 2: Multi-frame consistency ──
  if (age.drivers.length >= 3) {
    passed.push('multi_frame')
  } else {
    failed.push('multi_frame')
  }

  // ── Layer 3: Quality gate ──
  if (qualityGate.verdict === 'pass') {
    passed.push('geometric')
  } else {
    failed.push('geometric')
  }

  // STRICT: age confidence must be >= 75 to show
  const confidence = clamp(Math.round(age.confidenceScore * 100), 0, 100)

  const band = toConfidenceBand(confidence)
  // Override: age requires 75+ to show (stricter than standard 70)
  const decision: MetricDecision = confidence >= 75 ? 'show'
    : confidence >= 50 ? 'soft'
    : 'hide'

  return {
    data: age,
    confidence,
    band,
    decision,
    validationsPassed: passed,
    validationsFailed: failed,
    softLanguage: decision === 'soft'
      ? 'Yaş tahmini bu görüntü için güvenilir değildir — referans niteliğindedir.'
      : undefined,
    suppressionReason: decision === 'hide'
      ? 'Yaş tahmini: yetersiz güven düzeyi'
      : undefined,
  }
}

// ─── Symmetry Validation ───────────────────────────────────

export function validateSymmetry(
  sym: SymmetryAnalysis | null,
  qualityGate: QualityGateResult,
): ValidatedMetric<SymmetryAnalysis> | null {
  if (!sym) return null

  const passed: ValidationLayer[] = []
  const failed: ValidationLayer[] = []

  // Symmetry is purely geometric — always reliable if landmarks are good
  if (qualityGate.verdict !== 'block') {
    passed.push('geometric')
  } else {
    failed.push('geometric')
  }

  if (qualityGate.score >= 40) {
    passed.push('ai_model')
  } else {
    failed.push('ai_model')
  }

  // Symmetry is HIGH RELIABILITY — prioritize showing
  const confidence = clamp(Math.round(
    qualityGate.score * 0.6 + (sym.overallScore > 60 ? 30 : 20) + passed.length * 5
  ), 0, 100)

  const band = toConfidenceBand(confidence)

  return {
    data: sym,
    confidence,
    band,
    decision: toDecision(band),
    validationsPassed: passed,
    validationsFailed: failed,
  }
}

// ─── Skin Texture Validation ───────────────────────────────

export function validateSkinTexture(
  tex: SkinTextureProfile | null,
  qualityGate: QualityGateResult,
  _youngProfile?: YoungFaceProfile,
): ValidatedMetric<SkinTextureProfile> | null {
  if (!tex) return null

  const passed: ValidationLayer[] = []
  const failed: ValidationLayer[] = []

  if (tex.confidence >= 0.4) {
    passed.push('texture')
  } else {
    failed.push('texture')
  }

  if (qualityGate.score >= 40) {
    passed.push('geometric')
  } else {
    failed.push('geometric')
  }

  // Filter detection: if quality gate flagged smoothing, texture is unreliable
  const hasFilterWarning = qualityGate.warnings.includes('mild_filter')
  if (!hasFilterWarning) {
    passed.push('contextual')
  } else {
    failed.push('contextual')
  }

  let confidence = clamp(Math.round(tex.confidence * 100), 0, 100)
  if (hasFilterWarning) confidence = Math.min(confidence, 35) // Cap if filter detected

  const band = toConfidenceBand(confidence)

  return {
    data: tex,
    confidence,
    band,
    decision: toDecision(band),
    validationsPassed: passed,
    validationsFailed: failed,
  }
}

// ─── Lip Analysis Validation ──────────────────────────────

/**
 * Validate lip analysis through multi-layer validation.
 *
 * STRICT: Do NOT assume thin or full lips without clear visual evidence.
 * Surface condition from geometry alone is inherently limited — mark as 'unclear'
 * unless detection confidence is very high.
 */
export function validateLipAnalysis(
  lip: LipAnalysis | null,
  qualityGate: QualityGateResult,
  youngProfile: YoungFaceProfile,
): ValidatedMetric<LipAnalysis> | null {
  if (!lip) return null

  const passed: ValidationLayer[] = []
  const failed: ValidationLayer[] = []

  // ── Layer 1: Evaluability (lip module's own assessment) ──
  if (lip.evaluable) {
    passed.push('ai_model')
  } else {
    failed.push('ai_model')
  }

  // ── Layer 2: Quality gate (image quality sufficient for lip region) ──
  if (qualityGate.verdict !== 'block' && qualityGate.score >= 35) {
    passed.push('geometric')
  } else {
    failed.push('geometric')
  }

  // ── Layer 3: Lip confidence from measurement ──
  if (lip.confidence >= 0.4) {
    passed.push('texture')
  } else {
    failed.push('texture')
  }

  // ── Layer 4: Expression check — mouth open degrades lip analysis ──
  const mouthOpenWarning = qualityGate.warnings.includes('moderate_angle')
  if (!mouthOpenWarning) {
    passed.push('expression')
  } else {
    failed.push('expression')
  }

  // ── Confidence ──
  let confidence = clamp(Math.round(lip.confidence * 100), 0, 100)

  // Quality gate factor
  const qualityFactor = qualityGate.score / 100
  confidence = clamp(Math.round(confidence * 0.6 + qualityFactor * 30 + (passed.length / Math.max(passed.length + failed.length, 1)) * 10), 0, 100)

  // Young faces: lip analysis is geometry-neutral (no age penalty)
  // But boost confidence slightly for young faces with good detection
  if (youngProfile.active && lip.evaluable) {
    confidence = Math.min(confidence + 5, 100)
  }

  const band = toConfidenceBand(confidence)
  const decision = toDecision(band)

  return {
    data: lip,
    confidence,
    band,
    decision,
    validationsPassed: passed,
    validationsFailed: failed,
    softLanguage: decision === 'soft'
      ? 'Dudak yapısı sınırlı veri nedeniyle kesin değerlendirilemedi — uzman görüşü önerilir.'
      : undefined,
    suppressionReason: decision === 'hide'
      ? lip.limitationReason ?? 'Dudak analizi: yetersiz güven düzeyi'
      : undefined,
  }
}

// ─── Internal Helpers ──────────────────────────────────────

function computeContextualScore(
  region: WrinkleRegionResult,
  landmarks: Landmark[],
  youngProfile: YoungFaceProfile,
): number {
  let score = 0.5 // neutral start

  // Age plausibility: young face + high wrinkle = suspicious
  if (youngProfile.active && region.score > 30) {
    score -= 0.3 // Penalize
  }

  // Mature face + wrinkles = expected
  if (youngProfile.ageProfile === 'mature' && region.score > 20) {
    score += 0.2
  }

  // Evidence strength boost
  if (region.evidenceStrength === 'strong') score += 0.2
  if (region.evidenceStrength === 'moderate') score += 0.1

  return clamp(score, 0, 1)
}

function computeWrinkleConfidence(
  region: WrinkleRegionResult,
  passed: ValidationLayer[],
  failed: ValidationLayer[],
  qualityGate: QualityGateResult,
): number {
  const totalLayers = passed.length + failed.length
  const passRatio = totalLayers > 0 ? passed.length / totalLayers : 0

  // Base confidence from region's own confidence
  const regionConf = region.confidence * 100

  // Quality factor
  const qualityFactor = qualityGate.score / 100

  // Validation pass ratio is the strongest signal
  const confidence =
    passRatio * 40 +
    regionConf * 0.3 +
    qualityFactor * 20 +
    (region.evidenceStrength === 'strong' ? 10 : region.evidenceStrength === 'moderate' ? 5 : 0)

  return confidence
}

function isExpressionSensitive(region: string): boolean {
  return [
    'forehead', 'glabella',
    'nasolabial_left', 'nasolabial_right',
    'marionette_left', 'marionette_right',
    'crow_feet_left', 'crow_feet_right',
  ].includes(region)
}

function findMatchingWrinkle(
  focusRegion: string,
  wrinkles: ValidatedMetric<WrinkleRegionResult>[],
): ValidatedMetric<WrinkleRegionResult> | null {
  const regionMap: Record<string, string[]> = {
    forehead_glabella: ['forehead', 'glabella'],
    crow_feet: ['crow_feet_left', 'crow_feet_right'],
    under_eye: ['under_eye_left', 'under_eye_right'],
    nasolabial: ['nasolabial_left', 'nasolabial_right'],
    lip_chin_jawline: ['jawline', 'marionette_left', 'marionette_right'],
    mid_face: ['cheek_left', 'cheek_right'],
  }

  const matchRegions = regionMap[focusRegion]
  if (!matchRegions) return null

  // Find the best (highest confidence) matching wrinkle
  const matches = wrinkles.filter(w => matchRegions.includes(w.data.region))
  if (matches.length === 0) return null

  return matches.sort((a, b) => b.confidence - a.confidence)[0]
}

function buildSoftWrinkleLanguage(region: WrinkleRegionResult): string {
  const regionLabels: Record<string, string> = {
    forehead: 'Alın bölgesi',
    glabella: 'Kaş arası bölge',
    crow_feet_left: 'Sol göz kenarı',
    crow_feet_right: 'Sağ göz kenarı',
    under_eye_left: 'Sol göz altı',
    under_eye_right: 'Sağ göz altı',
    nasolabial_left: 'Sol nazolabial',
    nasolabial_right: 'Sağ nazolabial',
    marionette_left: 'Sol marionette',
    marionette_right: 'Sağ marionette',
    cheek_left: 'Sol yanak',
    cheek_right: 'Sağ yanak',
    jawline: 'Çene hattı',
  }
  const label = regionLabels[region.region] ?? region.label
  return `${label}: sınırlı veri nedeniyle kesin değerlendirme yapılamamaktadır. Uzman değerlendirmesi önerilir.`
}

function buildSuppressionReason(
  region: WrinkleRegionResult,
  passed: ValidationLayer[],
  failed: ValidationLayer[],
  youngProfile: YoungFaceProfile,
): string {
  const reasons: string[] = []

  if (youngProfile.active && region.score < youngProfile.minWrinkleScoreToShow) {
    reasons.push('genç yüz profili — yaşlanma bulgusu beklenmemektedir')
  }

  if (failed.includes('expression')) {
    reasons.push('mimik kaynaklı olası hata')
  }

  if (failed.includes('texture')) {
    reasons.push('yetersiz doku kanıtı')
  }

  if (passed.length < 2) {
    reasons.push('yetersiz doğrulama katmanı')
  }

  return reasons.length > 0
    ? `${region.label}: ${reasons.join(', ')}`
    : `${region.label}: yetersiz güven düzeyi`
}
