/**
 * Trust-First Analysis Pipeline — Orchestrator
 *
 * Chains all stages together:
 * 1. INPUT QUALITY GATE (critical blocker)
 * 2. FACE DETECTION & LANDMARK EXTRACTION (upstream — already done)
 * 3. REGION-BASED ANALYSIS (upstream — wrinkle + aesthetic scoring)
 * 4. MULTI-LAYER VALIDATION
 * 5. CONFIDENCE ENGINE
 * 6. YOUNG FACE GUARD
 * 7. DECISION FILTER (show / hide / soft)
 * 8. OUTPUT GENERATOR (trust-first language)
 *
 * The raw analysis (steps 2–3) is performed by the existing modules.
 * This orchestrator wraps the raw results with the trust pipeline (steps 4–8).
 */

import type { Landmark, EnhancedAnalysisResult } from '../types'
import type {
  TrustGatedResult,
  PipelineConfig,
  QualityGateResult,
  ValidatedMetric,
} from './types'
import { DEFAULT_PIPELINE_CONFIG } from './types'
import type { WrinkleRegionResult, FocusArea } from '../types'
import { runQualityGate } from './quality-gate'
import {
  deriveYoungFaceProfile,
  validateWrinkleRegion,
  validateFocusArea,
  validateAgeEstimation,
  validateSymmetry,
  validateSkinTexture,
  validateLipAnalysis,
} from './confidence-engine'
import { applyDecisionFilter } from './decision-filter'
import { generateObservations } from './observation-engine'
import { generateTrustSummary, generateStrongFeatures, generateLimitedAreasText, generateRegionConfidences } from './trust-output'
import { classifyImageQuality } from './system-prompt'

export { DEFAULT_PIPELINE_CONFIG } from './types'
export type { TrustGatedResult, PipelineConfig, QualityGateResult, ValidatedMetric, StructuredObservation } from './types'
export type { FilteredResults } from './decision-filter'
export {
  generateDisclaimer,
  confidenceBandLabel,
  generateLimitedAreasText,
  generateStrongFeatures,
  generateRegionConfidences,
} from './trust-output'
export { classifyImageQuality, STRICT_RULES, TONE, CORE_PRINCIPLE } from './system-prompt'
export type { ImageQualityLevel, QualityClassification } from './system-prompt'

/**
 * Run the trust-first pipeline on raw analysis results.
 *
 * This is called AFTER the existing analysis pipeline completes.
 * It wraps the raw results with confidence scoring, multi-layer
 * validation, young face protection, and decision filtering.
 *
 * POST-CAPTURE RULE: Since capture now enforces strict quality gates,
 * any captured photo has already passed minimum quality. The pipeline
 * NEVER blocks post-capture — it downgrades to 'degrade' with warnings.
 *
 * @param rawAnalysis - The EnhancedAnalysisResult from the existing pipeline
 * @param landmarks - Detected landmarks (for expression checks)
 * @param image - Source image (for quality gate)
 * @param config - Pipeline configuration (optional, uses defaults)
 */
export function runTrustPipeline(
  rawAnalysis: EnhancedAnalysisResult,
  landmarks: Landmark[],
  image: HTMLImageElement | HTMLCanvasElement,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): TrustGatedResult {
  // ═══════════════════════════════════════════════════════════
  // STAGE 1: QUALITY GATE
  // ═══════════════════════════════════════════════════════════

  const rawQualityGate = runQualityGate(
    landmarks,
    rawAnalysis.confidence,
    image,
    config,
  )

  // POST-CAPTURE SAFETY: Never block after capture.
  // If the quality gate wants to block, downgrade to 'degrade' instead.
  // The pre-capture gate already filtered out truly unusable frames.
  // Messages are always soft — never "Analiz yapılamadı" or blocking language.
  const qualityGate: QualityGateResult = rawQualityGate.verdict === 'block'
    ? {
        ...rawQualityGate,
        verdict: 'degrade' as const,
        blockMessage: undefined,
        degradeMessage: 'Bazı alanlarda doğruluk sınırlı olabilir.',
      }
    : rawQualityGate

  // Classify image quality (high / medium / low)
  const qualityClassification = classifyImageQuality(qualityGate.verdict, qualityGate.score)

  // POST-CAPTURE: Never return blocked result. Always proceed with analysis.

  // ═══════════════════════════════════════════════════════════
  // STAGE 2: YOUNG FACE GUARD
  // ═══════════════════════════════════════════════════════════

  const youngFaceProfile = deriveYoungFaceProfile(
    rawAnalysis.estimatedAge,
    rawAnalysis.ageEstimation,
    rawAnalysis.skinTexture,
    config,
  )

  // ═══════════════════════════════════════════════════════════
  // STAGE 3: MULTI-LAYER VALIDATION + CONFIDENCE SCORING
  // ═══════════════════════════════════════════════════════════

  // Validate each wrinkle region independently
  const wrinkleMetrics: ValidatedMetric<WrinkleRegionResult>[] = []
  if (rawAnalysis.wrinkleAnalysis) {
    for (const region of rawAnalysis.wrinkleAnalysis.regions) {
      const validated = validateWrinkleRegion(
        region,
        landmarks,
        qualityGate,
        youngFaceProfile,
        config,
      )
      wrinkleMetrics.push(validated)
    }
  }

  // Validate each focus area
  const focusAreaMetrics: ValidatedMetric<FocusArea>[] = []
  for (const area of rawAnalysis.focusAreas) {
    const validated = validateFocusArea(
      area,
      wrinkleMetrics,
      qualityGate,
      youngFaceProfile,
      config,
    )
    focusAreaMetrics.push(validated)
  }

  // Validate age estimation (STRICT)
  const ageMetric = validateAgeEstimation(
    rawAnalysis.ageEstimation,
    qualityGate,
    config,
  )

  // Validate symmetry (HIGH RELIABILITY)
  const symmetryMetric = validateSymmetry(
    rawAnalysis.symmetryAnalysis,
    qualityGate,
  )

  // Validate skin texture
  const skinTextureMetric = validateSkinTexture(
    rawAnalysis.skinTexture,
    qualityGate,
    youngFaceProfile,
  )

  // Validate lip analysis
  const lipMetric = validateLipAnalysis(
    rawAnalysis.lipAnalysis,
    qualityGate,
    youngFaceProfile,
  )

  // ═══════════════════════════════════════════════════════════
  // STAGE 3.5: STRUCTURED OBSERVATIONS (14 areas)
  // ═══════════════════════════════════════════════════════════

  const observations = generateObservations(
    wrinkleMetrics,
    focusAreaMetrics,
    symmetryMetric,
    skinTextureMetric,
    lipMetric,
    youngFaceProfile,
    qualityGate,
  )

  // ═══════════════════════════════════════════════════════════
  // STAGE 4: DECISION FILTER (FINAL GATE)
  // ═══════════════════════════════════════════════════════════

  const filtered = applyDecisionFilter(
    wrinkleMetrics,
    focusAreaMetrics,
    ageMetric,
    symmetryMetric,
    skinTextureMetric,
    lipMetric,
    youngFaceProfile,
    config,
    observations,
  )

  // ═══════════════════════════════════════════════════════════
  // STAGE 5: TRUST-FIRST OUTPUT
  // ═══════════════════════════════════════════════════════════

  const patientSummary = generateTrustSummary(
    filtered,
    qualityGate,
    youngFaceProfile,
  )

  // Strong features (positive observations) — system prompt section 2
  const strongFeatures = generateStrongFeatures(filtered, youngFaceProfile)

  // Limited areas (what cannot be evaluated) — system prompt section 4
  const limitedAreasText = generateLimitedAreasText(filtered, qualityGate)

  // Per-region confidence assessments (forehead, crow_feet, under_eye, lips)
  const regionConfidences = generateRegionConfidences(
    focusAreaMetrics,
    wrinkleMetrics,
    lipMetric,
  )

  // ── Overall confidence ──
  const allConfidences = [
    ...wrinkleMetrics.map(w => w.confidence),
    ...focusAreaMetrics.map(f => f.confidence),
    ...(ageMetric ? [ageMetric.confidence] : []),
    ...(symmetryMetric ? [symmetryMetric.confidence] : []),
    ...(skinTextureMetric ? [skinTextureMetric.confidence] : []),
    ...(lipMetric ? [lipMetric.confidence] : []),
  ]

  const overallConfidence = allConfidences.length > 0
    ? Math.round(allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length)
    : 0

  return {
    qualityGate,
    qualityLevel: qualityClassification.level,
    youngFaceProfile,
    rawAnalysis,
    wrinkleMetrics,
    focusAreaMetrics,
    ageMetric,
    symmetryMetric,
    skinTextureMetric,
    lipMetric,
    regionConfidences,
    patientSummary,
    strongFeatures,
    limitedAreasText,
    findings: filtered.findings,
    focusLabels: filtered.focusLabels,
    observations,
    overallConfidence,
    suppressedCount: filtered.totalSuppressed,
    softCount: filtered.totalSoft,
  }
}

/**
 * Build a minimal result when quality gate blocks analysis.
 * NOTE: Post-capture, this is never reached since block is
 * downgraded to degrade. Kept as safety net with soft language.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildBlockedResult(
  qualityGate: QualityGateResult,
  qualityLevel: 'high' | 'medium' | 'low',
  rawAnalysis: EnhancedAnalysisResult,
): TrustGatedResult {
  return {
    qualityGate,
    qualityLevel,
    youngFaceProfile: {
      active: false,
      ageProfile: 'middle',
      wrinkleThresholdMultiplier: 1.0,
      minWrinkleScoreToShow: 20,
      minWrinkleConfidenceToShow: 60,
      priorityMetrics: [],
    },
    rawAnalysis,
    wrinkleMetrics: [],
    focusAreaMetrics: [],
    ageMetric: null,
    symmetryMetric: null,
    skinTextureMetric: null,
    lipMetric: null,
    regionConfidences: [
      { region: 'forehead', label: 'Alın', confidence: 'low', evaluable: false, limitation: 'Sınırlı değerlendirme' },
      { region: 'crow_feet', label: 'Kaz Ayağı', confidence: 'low', evaluable: false, limitation: 'Sınırlı değerlendirme' },
      { region: 'under_eye', label: 'Göz Altı', confidence: 'low', evaluable: false, limitation: 'Sınırlı değerlendirme' },
      { region: 'lips', label: 'Dudak', confidence: 'low', evaluable: false, limitation: 'Sınırlı değerlendirme' },
    ],
    patientSummary: 'Analiz tamamlandı, ancak bazı alanlarda doğruluk sınırlı olabilir. Sonuçlar klinik değerlendirme yerine geçmez.',
    strongFeatures: [],
    limitedAreasText: 'Bazı bölgelerde güvenilir analiz yapılamamıştır.',
    findings: [{
      text: 'Analiz tamamlandı, ancak bazı alanlarda doğruluk sınırlı olabilir.',
      region: 'quality',
      band: 'low',
      isSoft: true,
    }],
    focusLabels: [],
    observations: [],
    overallConfidence: 0,
    suppressedCount: 0,
    softCount: 0,
  }
}

// ─── Utility: Check if analysis was blocked ────────────────
// POST-CAPTURE RULE: This should never return true after the pipeline
// refactor, since block is always downgraded to degrade. Kept for
// backwards compatibility with any code that checks it.

export function isAnalysisBlocked(result: TrustGatedResult): boolean {
  return result.qualityGate.verdict === 'block'
}

// ─── Utility: Get quality caveat for UI ────────────────────

export function getQualityCaveatText(result: TrustGatedResult): string | null {
  // Post-capture: only soft warnings. Never "Analiz yapılamadı" or blocking language.
  if (result.qualityGate.verdict === 'degrade') {
    // Sanitize: strip any legacy blocking phrases that may leak through
    const raw = result.qualityGate.degradeMessage ?? 'Bazı alanlarda doğruluk sınırlı olabilir.'
    return raw
      .replace(/^Analiz yapılamadı[^.]*\.\s*/gi, '')
      .replace(/^Yüz tam olarak görüntülenemedi[^.]*\.\s*/gi, '')
      .replace(/^Yüz açısı çok yüksek[^.]*\.\s*/gi, '')
      .trim() || null
  }
  if (result.suppressedCount > 3) {
    return 'Bazı bölgelerde sınırlı veri nedeniyle değerlendirme yapılamamıştır.'
  }
  return null
}
