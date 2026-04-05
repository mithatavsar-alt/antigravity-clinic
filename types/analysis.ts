import type {
  CaptureManifestSchemaVersion,
  CaptureLivenessSignals,
  CapturePoseSummary,
  CapturePoseVariance,
  CaptureViewKey,
  LivenessStatus,
  LivenessSchemaVersion,
} from './capture'

export type OverallReliabilityBand = 'high' | 'medium' | 'low' | 'limited'

/** Current schema version for the canonical analysis payload envelope */
export type CanonicalPayloadSchemaVersion = '2.0.0'
/** Current schema version for the analysis logic within the payload */
export type CanonicalAnalysisSchemaVersion = '2.0.0'

export interface CanonicalAnalysisViewInput {
  view: CaptureViewKey
  accepted_frame_count: number
  rejected_frame_count: number
  capture_verdict: 'accepted' | 'recapture_required' | 'rejected'
  recapture_required: boolean
  acceptance_score: number
  quality_band: 'high' | 'usable' | 'weak' | 'reject'
  representative_frame_id?: string
  median_pose?: CapturePoseSummary
  pose_variance?: CapturePoseVariance
  temporal_frame_count?: number
  temporal_confidence?: number
  /** Per-view metric summaries (min/median/max from capture frames) */
  brightness_summary?: CanonicalMetricSummary
  sharpness_summary?: CanonicalMetricSummary
  centering_drift?: number
  /** Top rejection reasons for this view's rejected frames */
  rejection_histogram?: Array<{ reason: string; count: number }>
  /** Per-region visibility scores from this view */
  region_visibility?: CanonicalRegionVisibility
}

/** Compact min/median/max summary for a single capture metric */
export interface CanonicalMetricSummary {
  min: number
  median: number
  max: number
}

/** Per-region visibility from a single view (0–1 each) */
export interface CanonicalRegionVisibility {
  forehead: number
  periocular: number
  nasolabial: number
  jawline: number
  lips: number
}

/** Per-region evidence summary carried in the canonical payload */
export interface CanonicalRegionEvidence {
  region: string
  confidence: number
  band: 'high' | 'moderate' | 'low' | 'insufficient'
  contributing_views: CaptureViewKey[]
  sufficient: boolean
  /** Evidence factors that produced this confidence */
  evidence_factors?: {
    view_authority: number
    roi_completeness: number
    local_sharpness: number
    local_exposure: number
    pose_fit: number
    temporal_stability: number
    occlusion_factor: number
    capped_by_rule: string | null
  }
}

export interface CanonicalAnalysisPayload {
  /** Payload envelope schema version */
  payload_schema_version: CanonicalPayloadSchemaVersion
  /** Analysis logic schema version */
  analysis_schema_version: CanonicalAnalysisSchemaVersion
  /** Unique identifier for this analysis run */
  analysis_run_id: string
  /** Where the analysis was executed */
  analysis_authority: 'client-local' | 'server-authoritative'
  version: '1.0.0'
  manifest_schema_version: CaptureManifestSchemaVersion | 'legacy'
  /** Detection model identifier (e.g. 'human-v1') */
  model_version: string
  /** Scoring/observation rule set version */
  rule_version: string
  /** Active threshold profile for quality gates and suppression */
  threshold_profile: string
  generated_at: string
  lead_id: string
  capture_session_id?: string
  mode: 'single' | 'multi'
  capture_views: CanonicalAnalysisViewInput[]
  capture_quality_score?: number
  analysis_input_quality_score?: number
  report_confidence?: number
  evidence_coverage_score?: number
  overall_reliability_band?: OverallReliabilityBand
  suppression_count?: number
  limited_regions_count?: number
  quality_gate_verdict?: 'pass' | 'degrade' | 'block'
  recapture_recommended?: boolean
  recapture_views?: string[]
  /** Per-region evidence summaries for audit and backend handoff */
  region_evidence?: CanonicalRegionEvidence[]
  liveness_required?: boolean
  liveness_passed?: boolean
  liveness_status?: LivenessStatus
  liveness_confidence?: number
  liveness_signals?: CaptureLivenessSignals
  /** Reason liveness was incomplete (null if passed) */
  liveness_incomplete_reason?: string | null
  /** Liveness signal schema version */
  liveness_schema_version?: LivenessSchemaVersion
}
