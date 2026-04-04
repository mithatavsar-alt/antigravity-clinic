/**
 * Trust-First Analysis Pipeline — Orchestrator
 *
 * Chains all stages together:
 * 1. INPUT QUALITY GATE (critical blocker)
 * 2. FACE DETECTION & LANDMARK EXTRACTION (upstream — already done)
 * 3. REGION-BASED ANALYSIS (upstream — wrinkle + aesthetic scoring)
 * 4. MULTI-VIEW CONTEXT (view quality + region reliability + fusion)
 * 5. MULTI-LAYER VALIDATION (with view-aware confidence)
 * 6. CONFIDENCE ENGINE
 * 7. YOUNG FACE GUARD
 * 8. DECISION FILTER (show / hide / soft)
 * 9. OUTPUT GENERATOR (trust-first language)
 *
 * The raw analysis (steps 2–3) is performed by the existing modules.
 * This orchestrator wraps the raw results with the trust pipeline (steps 4–9).
 */

import type { Landmark, EnhancedAnalysisResult } from '../types'
import type {
  TrustGatedResult,
  PipelineConfig,
  QualityGateResult,
  ValidatedMetric,
  MultiViewContext,
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
export type { TrustGatedResult, PipelineConfig, QualityGateResult, ValidatedMetric, StructuredObservation, MultiViewContext, FusedFinding } from './types'
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
export { assessViewQuality, assessAllViewQualities } from './view-quality'
export { buildMultiViewContext, buildSingleViewContext } from './multi-view-fusion'
export { computeRegionReliabilities } from './region-reliability'

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
 * @param multiViewContext - Multi-view reliability data (optional)
 * @param isUploadedPhoto - Whether this is an uploaded photo (bypasses capture gate)
 */
export function runTrustPipeline(
  rawAnalysis: EnhancedAnalysisResult,
  landmarks: Landmark[],
  image: HTMLImageElement | HTMLCanvasElement,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
  multiViewContext?: MultiViewContext | null,
  isUploadedPhoto: boolean = false,
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

  // UPLOAD vs CAPTURE distinction:
  // - Captured photos passed real-time quality gates → block is downgraded to degrade
  // - Uploaded photos had NO pre-capture gate → block must be honored
  let qualityGate: QualityGateResult
  if (isUploadedPhoto) {
    // For uploads: respect the quality gate verdict. If it blocks, the pipeline
    // still runs but with severely degraded confidence and strong warnings.
    // True hard blocks (no_face) still produce blocked results.
    const hasHardBlock = rawQualityGate.blockers.includes('no_face')
    if (hasHardBlock) {
      qualityGate = rawQualityGate // Let hard blocks through for uploads
    } else if (rawQualityGate.verdict === 'block') {
      // Soft blocks for uploads: degrade with strong warning
      qualityGate = {
        ...rawQualityGate,
        verdict: 'degrade' as const,
        blockMessage: undefined,
        degradeMessage: 'Yüklenen görüntünün kalitesi bazı bölgelerde güvenilir analizi sınırlamaktadır.',
      }
    } else {
      qualityGate = rawQualityGate
    }
  } else {
    // For captured photos we still honor hard blocks.
    // Capture-time gating reduces risk but cannot repair wrong view, critical ROI loss,
    // severe blur, or extreme exposure issues that slip through.
    qualityGate = rawQualityGate
  }

  // Classify image quality (high / medium / low)
  const qualityClassification = classifyImageQuality(qualityGate.verdict, qualityGate.score)

  // If truly blocked (upload with no face), return minimal result
  if (qualityGate.verdict === 'block') {
    return buildBlockedResult(qualityGate, qualityClassification.level, rawAnalysis)
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
  // (now with view-aware region reliability)
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
        multiViewContext ?? undefined,
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
      multiViewContext ?? undefined,
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
    multiViewContext ?? undefined,
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
  // FIX: Only average SHOWN metrics (not hidden ones which distort the number)
  const shownConfidences = [
    ...wrinkleMetrics.filter(w => w.decision !== 'hide').map(w => w.confidence),
    ...focusAreaMetrics.filter(f => f.decision !== 'hide').map(f => f.confidence),
    ...(ageMetric && ageMetric.decision !== 'hide' ? [ageMetric.confidence] : []),
    ...(symmetryMetric && symmetryMetric.decision !== 'hide' ? [symmetryMetric.confidence] : []),
    ...(skinTextureMetric && skinTextureMetric.decision !== 'hide' ? [skinTextureMetric.confidence] : []),
    ...(lipMetric && lipMetric.decision !== 'hide' ? [lipMetric.confidence] : []),
  ]

  const overallConfidence = shownConfidences.length > 0
    ? Math.round(shownConfidences.reduce((a, b) => a + b, 0) / shownConfidences.length)
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
    multiViewContext: multiViewContext ?? null,
    fusedFindings: multiViewContext?.fusedFindings ?? [],
  }
}

/**
 * Build a minimal result when quality gate blocks analysis.
 * This fires for uploads with no detectable face.
 */
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
    patientSummary: qualityGate.blockMessage ?? 'Analiz tamamlanamadı. Lütfen daha iyi aydınlatma koşullarında yeni bir fotoğraf yükleyin.',
    strongFeatures: [],
    limitedAreasText: 'Yüklenen görüntüde güvenilir analiz yapılamamıştır.',
    findings: [{
      text: qualityGate.blockMessage ?? 'Görüntü kalitesi analiz için yetersizdir.',
      region: 'quality',
      band: 'insufficient',
      isSoft: false,
    }],
    focusLabels: [],
    observations: [],
    overallConfidence: 0,
    suppressedCount: 0,
    softCount: 0,
    multiViewContext: null,
    fusedFindings: [],
  }
}

// ─── Utility: Check if analysis was blocked ────────────────

export function isAnalysisBlocked(result: TrustGatedResult): boolean {
  return result.qualityGate.verdict === 'block'
}

// ─── Utility: Get quality caveat for UI ────────────────────

export function getQualityCaveatText(result: TrustGatedResult): string | null {
  if (result.qualityGate.verdict === 'block') {
    return result.qualityGate.blockMessage ?? 'Görüntü kalitesi analiz için yetersizdir.'
  }
  if (result.qualityGate.verdict === 'degrade') {
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
