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
}

// ─── Wrinkle / skin-line analysis types ─────────────────────

export type WrinkleRegion = 'forehead' | 'glabella' | 'crow_feet_left' | 'crow_feet_right'

export type WrinkleLevel = 'low' | 'medium' | 'high'

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
}

export interface WrinkleAnalysisResult {
  regions: WrinkleRegionResult[]
  /** Overall wrinkle score 0–100 (weighted average) */
  overallScore: number
  /** Overall classification */
  overallLevel: WrinkleLevel
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
