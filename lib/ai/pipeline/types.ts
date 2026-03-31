/**
 * Trust-First Analysis Pipeline — Type Definitions
 *
 * This type system enforces the principle: LESS DATA + HIGH TRUST.
 * Every metric carries confidence, every output carries a decision gate.
 */

import type {
  EnhancedAnalysisResult,
  ImageQualityAssessment,
  WrinkleRegionResult,
  FocusArea,
  AgeEstimation,
  SymmetryAnalysis,
  SkinTextureProfile,
} from '../types'

// ─── Confidence System ─────────────────────────────────────

/** Confidence band for any metric */
export type ConfidenceBand = 'high' | 'moderate' | 'low' | 'insufficient'

/** What to do with a metric based on confidence */
export type MetricDecision = 'show' | 'soft' | 'hide'

/** Maps confidence score (0–100) to a band */
export function toConfidenceBand(score: number): ConfidenceBand {
  if (score >= 70) return 'high'
  if (score >= 40) return 'moderate'
  if (score >= 20) return 'low'
  return 'insufficient'
}

/** Maps confidence band to a UI decision */
export function toDecision(band: ConfidenceBand): MetricDecision {
  switch (band) {
    case 'high': return 'show'
    case 'moderate': return 'soft'
    case 'low': return 'hide'
    case 'insufficient': return 'hide'
  }
}

// ─── Validated Metric Wrapper ──────────────────────────────

/**
 * Every metric that reaches the UI must be wrapped in this.
 * The `decision` field determines visibility.
 */
export interface ValidatedMetric<T> {
  /** The raw data */
  data: T
  /** Confidence score 0–100 */
  confidence: number
  /** Confidence band */
  band: ConfidenceBand
  /** UI visibility decision */
  decision: MetricDecision
  /** Validation layers that passed (for audit) */
  validationsPassed: ValidationLayer[]
  /** Validation layers that failed (for audit) */
  validationsFailed: ValidationLayer[]
  /** If decision is 'soft', this text replaces aggressive claims */
  softLanguage?: string
  /** If decision is 'hide', reason for suppression */
  suppressionReason?: string
}

export type ValidationLayer =
  | 'ai_model'
  | 'geometric'
  | 'texture'
  | 'contextual'
  | 'expression'
  | 'age_plausibility'
  | 'cross_region'
  | 'multi_frame'

// ─── Quality Gate ──────────────────────────────────────────

export type QualityGateVerdict = 'pass' | 'degrade' | 'block'

export interface QualityGateResult {
  /** Final verdict */
  verdict: QualityGateVerdict
  /** Overall quality score 0–100 */
  score: number
  /** Specific blockers that caused rejection */
  blockers: QualityBlocker[]
  /** Warnings that degrade confidence but don't block */
  warnings: QualityWarning[]
  /** Turkish message for the user if blocked */
  blockMessage?: string
  /** Turkish caveat if degraded */
  degradeMessage?: string
  /** Raw image quality data */
  rawAssessment: ImageQualityAssessment | null
}

export type QualityBlocker =
  | 'no_face'
  | 'partial_face'
  | 'extreme_angle'
  | 'too_dark'
  | 'too_bright'
  | 'too_blurry'
  | 'too_low_resolution'
  | 'heavy_filter'

export type QualityWarning =
  | 'moderate_angle'
  | 'low_contrast'
  | 'mild_blur'
  | 'mild_filter'
  | 'uneven_lighting'

// ─── Young Face Guard ──────────────────────────────────────

export interface YoungFaceProfile {
  /** Whether young face protection is active */
  active: boolean
  /** Detected age profile (estimated) */
  ageProfile: 'young' | 'middle' | 'mature'
  /** Multiplier for wrinkle thresholds (higher = stricter) */
  wrinkleThresholdMultiplier: number
  /** Minimum wrinkle score to show (elevated for young faces) */
  minWrinkleScoreToShow: number
  /** Minimum wrinkle confidence to show (elevated for young faces) */
  minWrinkleConfidenceToShow: number
  /** Regions to prioritize instead of wrinkles */
  priorityMetrics: string[]
}

// ─── Pipeline Result ───────────────────────────────────────

export interface TrustGatedResult {
  /** Quality gate result — if blocked, nothing else is populated */
  qualityGate: QualityGateResult
  /** Young face profile — determines threshold adjustments */
  youngFaceProfile: YoungFaceProfile
  /** Raw analysis (always computed if quality gate passes) */
  rawAnalysis: EnhancedAnalysisResult
  /** Validated wrinkle regions — only those that passed multi-layer validation */
  wrinkleMetrics: ValidatedMetric<WrinkleRegionResult>[]
  /** Validated focus areas */
  focusAreaMetrics: ValidatedMetric<FocusArea>[]
  /** Validated age estimation */
  ageMetric: ValidatedMetric<AgeEstimation> | null
  /** Validated symmetry analysis */
  symmetryMetric: ValidatedMetric<SymmetryAnalysis> | null
  /** Validated skin texture */
  skinTextureMetric: ValidatedMetric<SkinTextureProfile> | null
  /** Trust-first patient summary (Turkish) */
  patientSummary: string
  /** Trust-first findings (only shown items) */
  findings: TrustFinding[]
  /** Focus area labels (only shown items) */
  focusLabels: string[]
  /** Overall analysis confidence 0–100 */
  overallConfidence: number
  /** How many metrics were suppressed */
  suppressedCount: number
  /** How many metrics are shown with soft language */
  softCount: number
}

export interface TrustFinding {
  /** Finding text (Turkish, trust-first tone) */
  text: string
  /** Region key */
  region: string
  /** Confidence band */
  band: ConfidenceBand
  /** Whether this is a soft-language finding */
  isSoft: boolean
}

// ─── Pipeline Configuration ────────────────────────────────

export interface PipelineConfig {
  /** Confidence threshold to show a metric (0–100) */
  showThreshold: number
  /** Confidence threshold for soft language (0–100) */
  softThreshold: number
  /** Minimum validation layers that must pass */
  minValidationLayers: number
  /** Whether to enable young face protection */
  youngFaceProtection: boolean
  /** Age below which young face protection activates */
  youngFaceAgeLimit: number
  /** Whether to block on quality gate failure */
  strictQualityGate: boolean
  /** Minimum quality score to proceed */
  minQualityScore: number
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  showThreshold: 70,
  softThreshold: 40,
  minValidationLayers: 2,
  youngFaceProtection: true,
  youngFaceAgeLimit: 28,
  strictQualityGate: true,
  minQualityScore: 40,
}
