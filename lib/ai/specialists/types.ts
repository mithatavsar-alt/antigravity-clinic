/**
 * Specialist Module Types — Shared Infrastructure
 *
 * Defines the contract for all 5 specialist facial analysis modules.
 * Each module: extracts features → calibrates → produces a RegionAssessment.
 *
 * Architecture:
 *   Feature Extraction Layer → Calibration Layer → Fusion Layer
 *
 * Ready for future ONNX model integration: FeatureVector is a typed
 * numeric array that can be fed to a local inference model.
 */

import type { Landmark, WrinkleRegionResult } from '../types'
import type { YoungFaceProfile, QualityGateResult } from '../pipeline/types'

// ─── Feature Extraction ────────────────────────────────────

/** Typed numeric feature vector — future ONNX-ready */
export interface FeatureVector {
  /** Feature name → value pairs */
  values: Record<string, number>
  /** Which extraction methods produced these features */
  sources: FeatureSource[]
  /** Extraction timestamp (for debugging) */
  extractedAt: number
}

export type FeatureSource =
  | 'landmark_geometry'    // distances, angles, ratios from 468 landmarks
  | 'sobel_edge_density'   // Sobel edge detection on ROI
  | 'texture_analysis'     // CLAHE-enhanced texture metrics
  | 'depth_z_coordinate'   // z-depth from landmark data
  | 'color_channel'        // color analysis (brightness, contrast, uniformity)
  | 'contour_tracing'      // contour definition metrics
  | 'symmetry_comparison'  // left-right symmetry comparison
  | 'horizontal_line'      // horizontal line detection (forehead etc.)

// ─── Calibration ───────────────────────────────────────────

export interface CalibrationContext {
  /** Estimated age (null if unavailable) */
  estimatedAge: number | null
  /** Young face profile from trust pipeline */
  youngFaceProfile: YoungFaceProfile
  /** Quality gate result */
  qualityGate: QualityGateResult
  /** Image quality score 0–100 */
  qualityScore: number
  /** Capture confidence from face guide */
  captureConfidence: 'high' | 'medium' | 'low'
  /** Whether smoothing/beauty filter was detected */
  smoothingDetected: boolean
  /** Gender for gender-specific calibration (null if unknown) */
  gender: string | null
}

/** Per-feature calibration config */
export interface FeatureCalibration {
  /** Base weight for this feature (0–1, sum should be ~1.0 per module) */
  weight: number
  /** Age modulation: how much age affects this feature's score */
  ageModulation: number
  /** Quality sensitivity: how much image quality affects confidence */
  qualitySensitivity: number
  /** Minimum raw value to consider non-zero */
  minThreshold: number
  /** Maximum raw value (for normalization) */
  maxThreshold: number
}

// ─── Region Assessment (per-module output) ─────────────────

export interface RegionAssessment {
  /** Module identifier */
  moduleKey: SpecialistModuleKey
  /** Turkish display name */
  displayName: string
  /** Icon for UI */
  icon: string
  /** Overall region score 0–100 (higher = more concern) */
  score: number
  /** Confidence in this assessment 0–100 */
  confidence: number
  /** Severity classification */
  severity: 'minimal' | 'hafif' | 'orta' | 'belirgin'
  /** Sub-scores for individual features within the region */
  subScores: SubScore[]
  /** Primary observation text (Turkish, consultation tone) */
  observation: string
  /** Whether this is a positive (strength) observation */
  isPositive: boolean
  /** Consultation relevance note (Turkish) */
  consultationNote?: string
  /** Raw feature vector (for debug / future ONNX) */
  features: FeatureVector
  /** Data sources that contributed to this assessment */
  dataSources: FeatureSource[]
  /** Whether this region had sufficient data for analysis */
  evaluable: boolean
  /** Limitation reason if not fully evaluable */
  limitation?: string
}

export interface SubScore {
  /** Feature name */
  key: string
  /** Turkish label */
  label: string
  /** Score 0–100 */
  score: number
  /** Weight in parent module score */
  weight: number
  /** Confidence 0–100 */
  confidence: number
}

// ─── Specialist Module Interface ───────────────────────────

export type SpecialistModuleKey =
  | 'crow_feet'
  | 'under_eye'
  | 'lips_perioral'
  | 'cheek_volume'
  | 'chin_contour'

/**
 * Every specialist module implements this interface.
 *
 * The analyze() method receives:
 * - landmarks: 468 MediaPipe landmarks
 * - imageSource: the captured image (for pixel-level analysis)
 * - calibration: age, quality, and context for score adjustment
 * - wrinkleData: existing wrinkle analysis (reused, not recomputed)
 *
 * Returns a RegionAssessment with calibrated score and confidence.
 */
export interface SpecialistModule {
  /** Module key */
  key: SpecialistModuleKey
  /** Turkish display name */
  displayName: string
  /** Icon */
  icon: string

  /** Run full analysis pipeline for this region */
  analyze(
    landmarks: Landmark[],
    imageSource: HTMLCanvasElement | HTMLImageElement,
    calibration: CalibrationContext,
    wrinkleData?: WrinkleRegionResult[],
  ): RegionAssessment
}

// ─── Fusion Result ─────────────────────────────────────────

export interface FusionResult {
  /** All region assessments from specialist modules */
  assessments: RegionAssessment[]
  /** Overall face score 0–100 (weighted average) */
  overallScore: number
  /** Overall confidence 0–100 */
  overallConfidence: number
  /** Top priority regions (sorted by score × confidence) */
  priorityRegions: SpecialistModuleKey[]
  /** Fusion timestamp */
  analyzedAt: number
}

// ─── Severity Classification ──────────────────────────────

export function classifySeverity(score: number): RegionAssessment['severity'] {
  if (score >= 55) return 'belirgin'
  if (score >= 35) return 'orta'
  if (score >= 15) return 'hafif'
  return 'minimal'
}

// ─── Score Normalization ──────────────────────────────────

/** Normalize a raw value to 0–100 given min/max thresholds */
export function normalizeScore(raw: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.round(Math.max(0, Math.min(100, ((raw - min) / (max - min)) * 100)))
}

/** Apply age modulation to a score */
export function applyAgeModulation(
  score: number,
  estimatedAge: number | null,
  modulation: number,
): number {
  if (estimatedAge === null || modulation === 0) return score

  // Young faces: suppress scores (wrinkles less expected)
  // Mature faces: scores are more expected, less suppression
  if (estimatedAge < 30) {
    const factor = 1 - modulation * 0.4 // up to 40% suppression for young
    return Math.round(score * factor)
  }
  if (estimatedAge < 40) {
    const factor = 1 - modulation * 0.15 // up to 15% suppression for mid-age
    return Math.round(score * factor)
  }
  // 40+: no suppression, slight boost for age-related features
  if (estimatedAge >= 50) {
    const factor = 1 + modulation * 0.1 // up to 10% boost
    return Math.round(Math.min(100, score * factor))
  }
  return score
}

/** Apply quality-based confidence penalty */
export function applyQualityPenalty(
  confidence: number,
  qualityScore: number,
  sensitivity: number,
): number {
  // High quality (80+): no penalty
  // Medium quality (50-80): mild penalty based on sensitivity
  // Low quality (<50): significant penalty
  if (qualityScore >= 80) return confidence
  const deficit = (80 - qualityScore) / 80 // 0–1
  const penalty = deficit * sensitivity * 40 // max 40pt penalty at sensitivity=1
  return Math.round(Math.max(5, confidence - penalty))
}
