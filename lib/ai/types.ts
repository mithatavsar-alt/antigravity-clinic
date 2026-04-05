export interface Landmark {
  x: number
  y: number
  z: number
}

export interface FaceMetrics {
  faceRatio: number
  eyeDistanceRatio: number
  noseToFaceWidth: number
  mouthToNoseWidth: number
  symmetryRatio: number
}

export interface AnalysisResult {
  metrics: FaceMetrics
  suggestions: string[]
  scores: {
    symmetry: number
    proportion: number
  }
}

// ─── Enhanced analysis types (Human engine) ─────────────────

export interface FocusArea {
  /** Region key for i18n and doctor mapping */
  region: FocusRegion
  /** Display label (Turkish) */
  label: string
  /** 0–100 relevance score (higher = more attention needed) */
  score: number
  /** Short insight text for the patient */
  insight: string
  /** Whether doctor review is specifically recommended for this zone */
  doctorReviewRecommended: boolean
}

export type FocusRegion =
  | 'forehead_glabella'
  | 'crow_feet'
  | 'under_eye'
  | 'mid_face'
  | 'lip_chin_jawline'
  | 'nasolabial'
  | 'nose'

export interface EnhancedAnalysisResult {
  /** Geometry-based analysis (same as before) */
  geometry: AnalysisResult
  /** Estimated age from model (null if unavailable) */
  estimatedAge: number | null
  /** Estimated gender from model (null if unavailable) */
  gender: string | null
  /** Gender detection confidence 0–1 */
  genderConfidence: number
  /** Focus areas with cosmetic-support insights */
  focusAreas: FocusArea[]
  /** Suggested doctor-review zones (subset of focusAreas with high scores) */
  suggestedZones: FocusRegion[]
  /** Detection confidence 0–1 */
  confidence: number
  /** Quality score 0–100 (image + detection quality) */
  qualityScore: number
  /** Wrinkle / skin-line analysis (null if analysis failed) */
  wrinkleAnalysis: WrinkleAnalysisResult | null
  /** Engine that produced this result */
  engine: 'human' | 'facemesh-legacy'
  /** Image quality assessment (null if not computed) */
  imageQuality: ImageQualityAssessment | null
  /** Multi-signal age estimation (null if not available) */
  ageEstimation: AgeEstimation | null
  /** Skin texture profile (null if not computed) */
  skinTexture: SkinTextureProfile | null
  /** Detailed symmetry analysis (null if not computed) */
  symmetryAnalysis: SymmetryAnalysis | null
  /** Lip structure analysis (null if not computed) */
  lipAnalysis: LipAnalysis | null
  /** Whether primary landmarks came from temporal aggregate or single frame */
  landmarkSourceMode: 'temporal_aggregate' | 'single_frame'
  /** Number of frames used for temporal aggregation (1 = single frame) */
  temporalFrameCount: number
  /** Temporal confidence 0-1 (0 = no temporal data, 1 = strong multi-frame support) */
  temporalConfidence: number
}

// ─── Wrinkle / skin-line analysis types ─────────────────────

export type WrinkleRegion =
  | 'forehead'
  | 'glabella'
  | 'crow_feet_left'
  | 'crow_feet_right'
  | 'under_eye_left'
  | 'under_eye_right'
  | 'nasolabial_left'
  | 'nasolabial_right'
  | 'marionette_left'
  | 'marionette_right'
  | 'cheek_left'
  | 'cheek_right'
  | 'jawline'

export type WrinkleLevel = 'minimal' | 'low' | 'medium' | 'high'

export interface WrinkleRegionResult {
  region: WrinkleRegion
  /** Display label (Turkish) */
  label: string
  /** Raw edge density 0–1 (edge pixels / total pixels in region) */
  density: number
  /** Normalized score 0–100 */
  score: number
  /** Classification based on density + age */
  level: WrinkleLevel
  /** Patient-facing insight text */
  insight: string
  /** Confidence in the measurement 0–1 (low = unreliable region quality) */
  confidence: number
  /** Whether detection is texture-backed (true) or inferred/suppressed (false) */
  detected: boolean
  /** Strength of image evidence supporting this result: 'strong' | 'moderate' | 'weak' | 'insufficient' */
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'insufficient'
}

export interface WrinkleAnalysisResult {
  regions: WrinkleRegionResult[]
  /** Overall wrinkle score 0–100 (weighted average) */
  overallScore: number
  /** Overall classification */
  overallLevel: WrinkleLevel
}

// ─── Image quality assessment ───────────────────────────────

export type QualityFlag = 'low_light' | 'overexposed' | 'blurry' | 'low_resolution' | 'strong_angle' | 'unstable' | 'partial_face' | 'smoothing_detected'

export interface ImageQualityAssessment {
  /** Overall quality score 0–100 */
  overallScore: number
  /** Whether quality is sufficient for reliable analysis */
  sufficient: boolean
  /** Specific quality issues detected */
  flags: QualityFlag[]
  /** Brightness 0–1 (mean luminance) */
  brightness: number
  /** Contrast 0–1 (luminance std dev normalized) */
  contrast: number
  /** Sharpness 0–1 (Laplacian variance normalized) */
  sharpness: number
  /** Resolution factor 0–1 (min dimension / 720) */
  resolution: number
  /** Face angle deviation from frontal 0–1 (0 = perfect frontal) */
  angleDeviation: number
  /** Landmark detection confidence 0–1 */
  detectionConfidence: number
}

// ─── Multi-signal age estimation ────────────────────────────

export type AgeConfidence = 'low' | 'medium' | 'high'

export interface AgeDriver {
  /** Signal name (e.g., 'forehead_lines', 'skin_texture') */
  signal: string
  /** Display label (Turkish) */
  label: string
  /** How much this signal contributed (0–1) */
  weight: number
  /** Short Turkish explanation */
  description: string
}

export interface AgeEstimation {
  /** Estimated age range [min, max] */
  estimatedRange: [number, number]
  /** Single best estimate (midpoint, adjusted) */
  pointEstimate: number
  /** Confidence level */
  confidence: AgeConfidence
  /** Confidence score 0–1 */
  confidenceScore: number
  /** Signals that drove the estimation, sorted by weight */
  drivers: AgeDriver[]
  /** Warning text if quality is low (Turkish) */
  caveat: string | null
}

// ─── Skin texture profile ───────────────────────────────────

export interface SkinTextureProfile {
  /** Overall skin uniformity 0–100 (higher = more uniform) */
  uniformity: number
  /** Overall smoothness 0–100 */
  smoothness: number
  /** Average texture roughness across regions 0–1 */
  roughness: number
  /** Confidence in texture measurements 0–1 */
  confidence: number
}

// ─── Symmetry analysis ──────────────────────────────────────

export interface SymmetryAnalysis {
  /** Overall symmetry score 0–100 */
  overallScore: number
  /** Left-right eye area symmetry 0–1 */
  eyeSymmetry: number
  /** Left-right cheek symmetry 0–1 */
  cheekSymmetry: number
  /** Left-right jaw symmetry 0–1 */
  jawSymmetry: number
  /** Nose deviation from midline 0–1 (0 = centered) */
  noseDeviation: number
}

// ─── Lip analysis ──────────────────────────────────────────

export type LipVolume = 'low' | 'balanced' | 'full'
export type LipSymmetry = 'symmetrical' | 'slight_asymmetry' | 'unclear'
export type LipContour = 'well_defined' | 'soft' | 'unclear'
export type LipSurface = 'smooth' | 'mildly_dry' | 'unclear'

export interface LipAnalysis {
  /** Volume assessment */
  volume: LipVolume
  /** Symmetry assessment */
  symmetry: LipSymmetry
  /** Contour definition */
  contour: LipContour
  /** Surface condition */
  surface: LipSurface
  /** Whether lip structure could be evaluated reliably */
  evaluable: boolean
  /** Reason if not evaluable */
  limitationReason: string | null
  /** Measurement confidence 0–1 */
  confidence: number
}

// ─── Per-region confidence (used by trust pipeline output) ──

export type AnalysisRegionKey =
  | 'forehead'
  | 'crow_feet'
  | 'under_eye'
  | 'lips'

export interface RegionConfidence {
  region: AnalysisRegionKey
  /** Turkish display label */
  label: string
  /** Confidence: high / medium / low */
  confidence: 'high' | 'medium' | 'low'
  /** Whether this region was evaluable at all */
  evaluable: boolean
  /** If not evaluable or low confidence, reason why */
  limitation: string | null
}

// ─── Error types ────────────────────────────────────────────

export type FaceMeshErrorCode = 'INIT_TIMEOUT' | 'NO_FACE_DETECTED' | 'MISSING_LANDMARK' | 'MODEL_LOAD_FAILED'

export class FaceMeshError extends Error {
  code: FaceMeshErrorCode
  constructor(code: FaceMeshErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'FaceMeshError'
  }
}
