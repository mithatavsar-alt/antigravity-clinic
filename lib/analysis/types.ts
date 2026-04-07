/**
 * Face Region Segmentation Engine — Type Definitions
 *
 * Provides types for face masking, region segmentation, quality gating,
 * skin confidence mapping, feature extraction, scoring, and explainability.
 *
 * All landmark coordinates are normalized 0-1 relative to image dimensions.
 * The face mesh uses 468 landmarks (MediaPipe compatible).
 */

import type { Landmark } from '../ai/types'
import type { CaptureView, ConfidenceBand } from '../ai/pipeline/types'

// Re-export for convenience
export type { Landmark, CaptureView, ConfidenceBand }

// ─── Geometry Primitives ──────────────────────────────────

export interface Point2D {
  x: number
  y: number
}

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Polygon {
  vertices: Point2D[]
}

// ─── Face Mask ────────────────────────────────────────────

export interface FaceMaskResult {
  outerPolygon: Polygon
  exclusions: ExclusionZone[]
  foreheadExtension: Polygon | null
  faceBBox: BBox
  reliable: boolean
  unreliableReason?: string
}

export type ExclusionZoneId =
  | 'left_eye'
  | 'right_eye'
  | 'lips_interior'
  | 'left_nostril'
  | 'right_nostril'

export interface ExclusionZone {
  id: ExclusionZoneId
  polygon: Polygon
}

// ─── Regions (18 regions) ─────────────────────────────────

export type RegionSide = 'left' | 'right' | 'center'

export type RegionGroup =
  | 'forehead'
  | 'eye_area'
  | 'mid_face'
  | 'lower_face'
  | 'symmetry'

export type AnalysisRegionId =
  | 'forehead'
  | 'forehead_left'
  | 'forehead_right'
  | 'glabella'
  | 'under_eye_left'
  | 'under_eye_right'
  | 'crow_feet_left'
  | 'crow_feet_right'
  | 'nose_surface'
  | 'nasolabial_left'
  | 'nasolabial_right'
  | 'perioral'
  | 'cheek_left'
  | 'cheek_right'
  | 'chin'
  | 'jawline_left'
  | 'jawline_right'
  | 'symmetry_zone'

export interface RegionDefinition {
  id: AnalysisRegionId
  label: string
  landmarkIndices: number[]
  side: RegionSide
  group: RegionGroup
  weight: number
  minAreaThreshold: number
  minConfidenceThreshold: number
  enabled: boolean
}

export interface ComputedRegion {
  definition: RegionDefinition
  polygon: Polygon
  bbox: BBox
  area: number
  usable: boolean
  visibility: RegionVisibility
}

// ─── Quality / Visibility ─────────────────────────────────

export type VisibilityStatus = 'visible' | 'partially_visible' | 'not_visible'

export type UsabilityStatus = 'usable' | 'not_usable'

export type RegionReasonCode =
  | 'low_light'
  | 'overexposed'
  | 'blurred'
  | 'occluded'
  | 'out_of_frame'
  | 'side_not_visible'
  | 'poor_landmarks'
  | 'low_resolution'
  | 'insufficient_area'
  | 'low_confidence'
  | 'face_mask_excluded'

export interface RegionVisibility {
  status: VisibilityStatus
  usability: UsabilityStatus
  confidence: number
  reasonCodes: RegionReasonCode[]
}

export interface RegionQualityGate {
  regionId: AnalysisRegionId
  visibility: RegionVisibility
  proceed: boolean
  skipReason?: string
}

export interface GlobalQualityGateSummary {
  totalRegions: number
  usableRegions: number
  skippedRegions: number
  regionGates: RegionQualityGate[]
  imageUsable: boolean
  imageQualityScore: number
  globalReasonCodes: RegionReasonCode[]
}

// ─── Skin Confidence ──────────────────────────────────────

export type SkinRejectReason =
  | 'hair_intrusion'
  | 'specular_highlight'
  | 'deep_shadow'
  | 'overexposed'
  | 'strong_blur'
  | 'edge_noise'
  | 'out_of_skin_tone'
  | 'beard_noise'

export interface SkinConfidenceCell {
  row: number
  col: number
  confidence: number
  isLikelySkin: boolean
  rejectReasons: SkinRejectReason[]
}

export interface SkinConfidenceMap {
  cells: SkinConfidenceCell[][]
  gridRows: number
  gridCols: number
  cellWidth: number
  cellHeight: number
  overallSkinConfidence: number
  usableSkinRatio: number
}

export interface RegionSkinConfidence {
  regionId: AnalysisRegionId
  usableSkinRatio: number
  averageSkinConfidence: number
  reductionFactors: { reason: SkinRejectReason; severity: number }[]
}

// ─── Features ─────────────────────────────────────────────

export interface RegionFeatures {
  regionId: AnalysisRegionId
  wrinkleDensity: number
  textureRoughness: number
  contrastIrregularity: number
  toneUniformity: number
  meanBrightness: number
  asymmetryEstimate: number | null
  skinConfidenceFactor: number
  usableSkinRatio: number
  confidence: number
}

// ─── Scoring ──────────────────────────────────────────────

export type SeverityLevel = 'minimal' | 'mild' | 'moderate' | 'notable'

export interface RegionScore {
  regionId: AnalysisRegionId
  label: string
  score: number
  confidence: number
  severity: SeverityLevel
  summaryLabel: string
  drivers: string[]
  features: RegionFeatures
  sourceViews: CaptureView[]
}

export interface GroupScore {
  group: RegionGroup
  label: string
  score: number
  confidence: number
  regionScores: RegionScore[]
}

export interface ScoreSummary {
  overallScore: number
  overallConfidence: number
  usableRegionsCount: number
  skippedRegionsCount: number
  groupScores: GroupScore[]
  regionScores: RegionScore[]
  topConcerns: RegionScore[]
  strongestAreas: RegionScore[]
  cautionFlags: string[]
}

// ─── Explainability ───────────────────────────────────────

export interface RegionExplanation {
  regionId: AnalysisRegionId
  label: string
  explanation: string
  visualDrivers: string[]
  confidenceLevel: 'high' | 'medium' | 'low'
  evidenceBasis: 'direct' | 'indirect' | 'insufficient'
}

// ─── Multi-view ───────────────────────────────────────────

export interface RegionViewContribution {
  regionId: AnalysisRegionId
  sourceView: CaptureView
  fusionConfidence: number
  consistencyNotes: string[]
}

// ─── Final Output Contract (for UI) ──────────────────────

export interface AnalysisOutput {
  timestamp: string
  qualityGate: GlobalQualityGateSummary
  faceMask: FaceMaskResult
  skinConfidence: SkinConfidenceMap | null
  regions: ComputedRegion[]
  scores: ScoreSummary
  explanations: RegionExplanation[]
  viewContributions: RegionViewContribution[]
  confidenceSummary: ConfidenceUISummary
}

export interface ConfidenceUISummary {
  band: ConfidenceBand
  patientMessage: string
  showInsufficientWarning: boolean
  insufficientRegions: AnalysisRegionId[]
}

// ─── Debug ────────────────────────────────────────────────

export interface DebugConfig {
  enabled: boolean
  showFaceMask: boolean
  showRegionPolygons: boolean
  showExclusionZones: boolean
  showRegionLabels: boolean
  showSkippedRegions: boolean
  showVisibilityReasons: boolean
  showRawMetrics: boolean
  showScoreContributions: boolean
  showSkinConfidenceHeatmap: boolean
}

export const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  enabled: false,
  showFaceMask: true,
  showRegionPolygons: true,
  showExclusionZones: true,
  showRegionLabels: true,
  showSkippedRegions: true,
  showVisibilityReasons: true,
  showRawMetrics: true,
  showScoreContributions: true,
  showSkinConfidenceHeatmap: true,
}
