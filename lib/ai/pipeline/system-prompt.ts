/**
 * Analysis System Prompt — Trust-First Philosophy
 *
 * This module codifies the analysis engine's behavioral contract.
 * It serves as the single source of truth for:
 * - Image quality classification logic
 * - What the engine is ALLOWED to say vs. what it must NOT
 * - Tone and language rules
 * - Output structure requirements
 *
 * The rules here are enforced by the pipeline modules:
 * - quality-gate.ts enforces quality classification
 * - confidence-engine.ts enforces multi-layer validation
 * - decision-filter.ts enforces show/soft/hide decisions
 * - trust-output.ts enforces tone and language
 *
 * This file is NOT consumed at runtime by an LLM — it is consumed
 * by the deterministic pipeline code. It exists as documentation
 * AND as importable constants that the pipeline references.
 */

// ─── Image Quality Classification ─────────────────────────

/**
 * Three-tier quality classification.
 * Maps to QualityGateVerdict: 'pass' | 'degrade' | 'block'
 */
export type ImageQualityLevel = 'high' | 'medium' | 'low'

export interface QualityClassification {
  level: ImageQualityLevel
  /** Whether full analysis is permitted */
  fullAnalysisAllowed: boolean
  /** Whether confidence warnings must be shown */
  confidenceWarningsRequired: boolean
  /** Whether the system should request a new photo */
  requestNewPhoto: boolean
}

/**
 * Classify image quality into the three-tier system.
 * This wraps the quality gate verdict into the system prompt's classification model.
 */
export function classifyImageQuality(
  verdict: 'pass' | 'degrade' | 'block',
  score: number,
): QualityClassification {
  if (verdict === 'pass' && score >= 60) {
    return {
      level: 'high',
      fullAnalysisAllowed: true,
      confidenceWarningsRequired: false,
      requestNewPhoto: false,
    }
  }

  if (verdict === 'degrade' || (verdict === 'pass' && score < 60)) {
    return {
      level: 'medium',
      fullAnalysisAllowed: false,
      confidenceWarningsRequired: true,
      requestNewPhoto: false,
    }
  }

  // verdict === 'block'
  return {
    level: 'low',
    fullAnalysisAllowed: false,
    confidenceWarningsRequired: true,
    requestNewPhoto: true,
  }
}

// ─── Strict Rules (enforced by pipeline modules) ──────────

/**
 * Rules that the pipeline MUST enforce. Each rule maps to a specific
 * module that implements it.
 *
 * These are documentation constants — they describe what the code does,
 * not what an LLM should do. The actual enforcement is in the pipeline.
 */
export const STRICT_RULES = {
  /**
   * If forehead lines are NOT clearly visible → DO NOT mention forehead wrinkles.
   * Enforced by: confidence-engine.ts → validateWrinkleRegion()
   *   - Requires region.detected && region.score > 5 (ai_model layer)
   *   - Requires region.confidence >= 0.4 (geometric layer)
   *   - Requires evidenceStrength !== 'insufficient' (texture layer)
   */
  NO_INVISIBLE_FOREHEAD_WRINKLES: true,

  /**
   * If skin texture is not clear → DO NOT comment on pores / wrinkles.
   * Enforced by: confidence-engine.ts → validateSkinTexture()
   *   - Caps confidence at 35 if filter detected
   *   - Requires texture confidence >= 0.4
   */
  NO_UNCLEAR_TEXTURE_CLAIMS: true,

  /**
   * If symmetry is not reliable → say "cannot be evaluated reliably".
   * Enforced by: confidence-engine.ts → validateSymmetry()
   *   - Requires quality gate score >= 40
   *   - Returns 'hide' decision if insufficient
   */
  SYMMETRY_RELIABILITY_GATE: true,

  /**
   * NEVER invent imperfections.
   * Enforced by: confidence-engine.ts → multi-layer validation
   *   - Every detection needs minValidationLayers (default: 2) to pass
   *   - Young face guard elevates thresholds 1.8x
   */
  NO_INVENTED_IMPERFECTIONS: true,

  /**
   * NEVER exaggerate findings.
   * Enforced by: trust-output.ts → clinical-but-soft language
   *   - Intensity qualifiers: 'hafif', 'orta düzey', 'belirgin'
   *   - Soft language for moderate confidence
   *   - Max 5 findings cap
   */
  NO_EXAGGERATION: true,

  /**
   * NEVER over-suggest treatments.
   * Enforced by: trust-output.ts + result-generator.ts
   *   - "İstenirse... değerlendirilebilir" (optional framing)
   *   - "Uzman değerlendirmesi önerilir" (defer to expert)
   *   - Never prescriptive, never sales-driven
   */
  NO_AGGRESSIVE_TREATMENT_SUGGESTIONS: true,
} as const

// ─── Tone Rules ───────────────────────────────────────────

/**
 * Language tone guidelines for all patient-facing output.
 * Enforced by: trust-output.ts, decision-filter.ts
 */
export const TONE = {
  /** Professional, minimal, clinical but elegant */
  style: 'clinical-elegant' as const,

  /** Good examples */
  goodExamples: [
    'Alın bölgesi düzgün görünüm sergilemektedir.',
    'Aydınlatma koşulları nedeniyle ince çizgiler güvenilir şekilde değerlendirilememektedir.',
    'Yüz simetrisi dengeli gözlenmektedir.',
    'Belirgin bulgu saptanmadı.',
  ],

  /** Bad examples — NEVER generate these */
  badExamples: [
    'Alın kırışıklıkları mevcut', // claiming invisible wrinkles
    'Botoks önerilir', // too aggressive
    'Ciddi asimetri tespit edildi', // exaggeration
    'Acil tedavi gerekli', // fear-inducing
  ],

  /** The golden rule */
  goldenRule: 'If you are not sure → SAY LESS. Trust comes from restraint, not over-analysis.',
} as const

// ─── Output Structure Rules ───────────────────────────────

/**
 * Required sections in any analysis output.
 * The trust pipeline produces all of these through its stages.
 */
export const OUTPUT_SECTIONS = {
  /** Always required: confidence level with explanation */
  analysisConfidence: true,
  /** Only if clearly visible: strong features */
  strongFeatures: 'only_if_visible',
  /** Only what is clearly seen: observations */
  observableDetails: 'only_if_visible',
  /** Always required: what cannot be evaluated */
  limitedAreas: true,
  /** Only if relevant, indirect tone */
  softRecommendations: 'only_if_relevant',
} as const

// ─── The Final Rule ───────────────────────────────────────

/**
 * The core principle that overrides everything:
 *
 * "NEVER hallucinate. If uncertain → express uncertainty.
 *  If not analyzable → explicitly say so.
 *  False positives are WORSE than missed detections."
 *
 * This is enforced by the entire pipeline architecture:
 * - Quality gate blocks unreliable images
 * - Multi-layer validation rejects single-source detections
 * - Confidence engine scores every metric 0-100
 * - Decision filter hides low-confidence findings
 * - Trust output uses soft language for moderate confidence
 * - Young face guard prevents false aging claims
 */
export const CORE_PRINCIPLE = 'LESS DATA + HIGH TRUST' as const
