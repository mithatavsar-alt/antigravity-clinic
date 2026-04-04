import type {
  CaptureManifestSchemaVersion,
  CaptureLivenessSignals,
  CapturePoseSummary,
  CapturePoseVariance,
  CaptureViewKey,
  LivenessStatus,
} from './capture'

export type OverallReliabilityBand = 'high' | 'medium' | 'low' | 'limited'

export interface CanonicalAnalysisViewInput {
  view: CaptureViewKey
  accepted_frame_count: number
  capture_verdict: 'accepted' | 'recapture_required' | 'rejected'
  recapture_required: boolean
  acceptance_score: number
  quality_band: 'high' | 'usable' | 'weak' | 'reject'
  representative_frame_id?: string
  median_pose?: CapturePoseSummary
  pose_variance?: CapturePoseVariance
  temporal_frame_count?: number
  temporal_confidence?: number
}

export interface CanonicalAnalysisPayload {
  version: '1.0.0'
  manifest_schema_version: CaptureManifestSchemaVersion | 'legacy'
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
  liveness_required?: boolean
  liveness_passed?: boolean
  liveness_status?: LivenessStatus
  liveness_confidence?: number
  liveness_signals?: CaptureLivenessSignals
}
