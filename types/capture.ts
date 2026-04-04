export type CaptureViewKey = 'front' | 'left' | 'right'

export type CaptureQualityBand = 'high' | 'usable' | 'weak' | 'reject'
export type CaptureVerdict = 'accepted' | 'recapture_required' | 'rejected'
export type CaptureManifestSchemaVersion = '2.0.0'
export type LivenessStatus = 'not_required' | 'not_started' | 'in_progress' | 'passed' | 'incomplete' | 'failed'
export type LivenessStepKey = 'front' | 'blink' | 'left_turn' | 'right_turn'

export interface CapturePoseSummary {
  yaw: number
  pitch: number
  roll: number
}

export interface CapturePoseVariance {
  yaw: number
  pitch: number
  roll: number
}

export interface CaptureMetricSummary {
  min: number
  median: number
  max: number
  variance?: number
}

export interface CaptureRegionVisibility {
  forehead: number
  periocular: number
  nasolabial: number
  jawline: number
  lips: number
}

export interface CaptureLivenessSignals {
  front_steady_observed?: boolean
  blink_detected?: boolean
  left_turn_observed?: boolean
  right_turn_observed?: boolean
  blink_count?: number
  baseline_eye_openness?: number
  min_eye_openness?: number
  max_eye_openness?: number
  yaw_left_peak?: number
  yaw_right_peak?: number
  motion_consistency?: number
  step_confidence?: Partial<Record<LivenessStepKey, number>>
}

export interface CaptureLivenessStep {
  key: LivenessStepKey
  observed: boolean
  confidence: number
  observed_at?: number
  detail?: string
}

export interface CaptureFrameMetrics {
  frameId: string
  view: CaptureViewKey
  timestamp: number
  accepted: boolean
  qualityScore: number
  acceptanceScore: number
  pose: CapturePoseSummary
  brightness: number
  shadow: number
  sharpness: number
  stability: number
  centering: number
  faceSize: number
  completeness: number
  occlusion: number
  landmarkJitter?: number
  eyeOpenness?: number
  regionVisibility: CaptureRegionVisibility
  rejectionReason?: string
  guidance?: string
  dataUrl?: string
}

export interface CaptureViewManifest {
  view: CaptureViewKey
  captured: boolean
  quality_score: number
  acceptance_score: number
  quality_band: CaptureQualityBand
  capture_verdict: CaptureVerdict
  recapture_required: boolean
  accepted_frame_ids: string[]
  accepted_frame_count: number
  rejected_frame_count: number
  rejected_reasons: Array<{ reason: string; count: number }>
  guidance_history: string[]
  representative_frame_id?: string
  median_pose?: CapturePoseSummary
  pose_variance?: CapturePoseVariance
  hold_duration_ms?: number
  countdown_resets?: number
  landmark_jitter?: number
  blink_detected?: boolean
  brightness: CaptureMetricSummary
  shadow: CaptureMetricSummary
  sharpness: CaptureMetricSummary
  centering_drift: number
  stability: number
  completeness: number
  occlusion: number
  region_visibility: CaptureRegionVisibility
  occlusion_indicators?: string[]
  liveness_signals?: Partial<CaptureLivenessSignals>
}

export interface CaptureManifest {
  schema_version: CaptureManifestSchemaVersion
  session_id: string
  mode: 'single' | 'multi'
  captured_at: string
  completed_at: string
  device_info?: string
  browser_info?: string
  liveness_required: boolean
  liveness_passed: boolean
  liveness_status: LivenessStatus
  liveness_confidence: number
  liveness_signals?: CaptureLivenessSignals
  liveness_steps?: CaptureLivenessStep[]
  frames: CaptureFrameMetrics[]
  views: CaptureViewManifest[]
  selected_keyframes: Partial<Record<CaptureViewKey, string>>
  acceptance_history: Array<{
    view: CaptureViewKey
    verdict: 'accept' | 'reject' | 'reset'
    reason: string
    timestamp: number
  }>
}
