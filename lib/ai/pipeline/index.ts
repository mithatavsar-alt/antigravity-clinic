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
} from './confidence-engine'
import { applyDecisionFilter } from './decision-filter'
import { generateTrustSummary } from './trust-output'

export { DEFAULT_PIPELINE_CONFIG } from './types'
export type { TrustGatedResult, PipelineConfig, QualityGateResult, ValidatedMetric } from './types'
export type { FilteredResults } from './decision-filter'
export { generateDisclaimer, confidenceBandLabel } from './trust-output'

/**
 * Run the trust-first pipeline on raw analysis results.
 *
 * This is called AFTER the existing analysis pipeline completes.
 * It wraps the raw results with confidence scoring, multi-layer
 * validation, young face protection, and decision filtering.
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

  const qualityGate = runQualityGate(
    landmarks,
    rawAnalysis.confidence,
    image,
    config,
  )

  // If blocked → return minimal result with block message
  if (qualityGate.verdict === 'block' && config.strictQualityGate) {
    return buildBlockedResult(qualityGate, rawAnalysis)
  }

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

  // ═══════════════════════════════════════════════════════════
  // STAGE 4: DECISION FILTER (FINAL GATE)
  // ═══════════════════════════════════════════════════════════

  const filtered = applyDecisionFilter(
    wrinkleMetrics,
    focusAreaMetrics,
    ageMetric,
    symmetryMetric,
    skinTextureMetric,
    youngFaceProfile,
    config,
  )

  // ═══════════════════════════════════════════════════════════
  // STAGE 5: TRUST-FIRST OUTPUT
  // ═══════════════════════════════════════════════════════════

  const patientSummary = generateTrustSummary(
    filtered,
    qualityGate,
    youngFaceProfile,
  )

  // ── Overall confidence ──
  const allConfidences = [
    ...wrinkleMetrics.map(w => w.confidence),
    ...focusAreaMetrics.map(f => f.confidence),
    ...(ageMetric ? [ageMetric.confidence] : []),
    ...(symmetryMetric ? [symmetryMetric.confidence] : []),
    ...(skinTextureMetric ? [skinTextureMetric.confidence] : []),
  ]

  const overallConfidence = allConfidences.length > 0
    ? Math.round(allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length)
    : 0

  return {
    qualityGate,
    youngFaceProfile,
    rawAnalysis,
    wrinkleMetrics,
    focusAreaMetrics,
    ageMetric,
    symmetryMetric,
    skinTextureMetric,
    patientSummary,
    findings: filtered.findings,
    focusLabels: filtered.focusLabels,
    overallConfidence,
    suppressedCount: filtered.totalSuppressed,
    softCount: filtered.totalSoft,
  }
}

/**
 * Build a minimal result when quality gate blocks analysis.
 */
function buildBlockedResult(
  qualityGate: QualityGateResult,
  rawAnalysis: EnhancedAnalysisResult,
): TrustGatedResult {
  return {
    qualityGate,
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
    patientSummary: qualityGate.blockMessage ?? 'Analiz için görüntü uygun değil.',
    findings: [{
      text: qualityGate.blockMessage ?? 'Analiz için görüntü uygun değil. Lütfen tekrar deneyin.',
      region: 'quality',
      band: 'insufficient',
      isSoft: false,
    }],
    focusLabels: [],
    overallConfidence: 0,
    suppressedCount: 0,
    softCount: 0,
  }
}

// ─── Utility: Check if analysis was blocked ────────────────

export function isAnalysisBlocked(result: TrustGatedResult): boolean {
  return result.qualityGate.verdict === 'block'
}

// ─── Utility: Get quality caveat for UI ────────────────────

export function getQualityCaveatText(result: TrustGatedResult): string | null {
  if (result.qualityGate.verdict === 'block') {
    return result.qualityGate.blockMessage ?? null
  }
  if (result.qualityGate.verdict === 'degrade') {
    return result.qualityGate.degradeMessage ?? null
  }
  if (result.suppressedCount > 3) {
    return 'Bu değerlendirme sınırlı veri içerir — bazı bölgeler güvenilir analiz için yeterli değildir.'
  }
  return null
}
