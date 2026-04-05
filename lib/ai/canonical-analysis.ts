import type { CaptureManifest } from '@/types/capture'
import type {
  CanonicalAnalysisPayload,
  CanonicalRegionEvidence,
  OverallReliabilityBand,
} from '@/types/analysis'

export const CANONICAL_ANALYSIS_VERSION = '1.0.0' as const
/** Payload envelope schema version */
export const CANONICAL_PAYLOAD_SCHEMA_VERSION = '2.0.0' as const
/** Analysis logic schema version */
export const CANONICAL_ANALYSIS_SCHEMA_VERSION = '2.0.0' as const
/** Detection model identifier — bump when switching face detection backend */
export const CANONICAL_MODEL_VERSION = 'human-v1' as const
/** Scoring rule set — bump when observation/scoring logic changes */
export const CANONICAL_RULE_VERSION = 'trust-v1' as const
/** Threshold profile — bump when quality gate / suppression thresholds change */
export const CANONICAL_THRESHOLD_PROFILE = 'production-v1' as const

function clampScore(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** Generate a unique analysis run ID (timestamp + random suffix) */
export function generateAnalysisRunId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `ar_${ts}_${rand}`
}

export function deriveOverallReliabilityBand(
  reportConfidence: number,
  evidenceCoverageScore: number,
  recaptureRecommended: boolean,
): OverallReliabilityBand {
  if (recaptureRecommended || reportConfidence < 40 || evidenceCoverageScore < 35) return 'limited'
  if (reportConfidence >= 75 && evidenceCoverageScore >= 70) return 'high'
  if (reportConfidence >= 58 && evidenceCoverageScore >= 52) return 'medium'
  return 'low'
}

export interface BuildCanonicalAnalysisPayloadArgs {
  leadId: string
  analysisRunId: string
  captureManifest?: CaptureManifest | null
  captureQualityScore?: number
  analysisInputQualityScore?: number
  reportConfidence?: number
  evidenceCoverageScore?: number
  overallReliabilityBand?: OverallReliabilityBand
  suppressionCount?: number
  limitedRegionsCount?: number
  qualityGateVerdict?: 'pass' | 'degrade' | 'block'
  recaptureRecommended?: boolean
  recaptureViews?: string[]
  temporalViewSupport?: Partial<Record<string, { frameCount: number; confidence: number }>>
  /** Per-region evidence from the region reliability engine */
  regionEvidence?: CanonicalRegionEvidence[]
}

export function buildCanonicalAnalysisPayload({
  leadId,
  analysisRunId,
  captureManifest,
  captureQualityScore,
  analysisInputQualityScore,
  reportConfidence,
  evidenceCoverageScore,
  overallReliabilityBand,
  suppressionCount,
  limitedRegionsCount,
  qualityGateVerdict,
  recaptureRecommended,
  recaptureViews,
  temporalViewSupport,
  regionEvidence,
}: BuildCanonicalAnalysisPayloadArgs): CanonicalAnalysisPayload {
  const manifestViews = captureManifest?.views ?? []

  return {
    payload_schema_version: CANONICAL_PAYLOAD_SCHEMA_VERSION,
    analysis_schema_version: CANONICAL_ANALYSIS_SCHEMA_VERSION,
    analysis_run_id: analysisRunId,
    analysis_authority: 'client-local',
    version: CANONICAL_ANALYSIS_VERSION,
    manifest_schema_version: captureManifest?.schema_version ?? 'legacy',
    model_version: CANONICAL_MODEL_VERSION,
    rule_version: CANONICAL_RULE_VERSION,
    threshold_profile: CANONICAL_THRESHOLD_PROFILE,
    generated_at: new Date().toISOString(),
    lead_id: leadId,
    capture_session_id: captureManifest?.session_id,
    mode: captureManifest?.mode ?? 'single',
    capture_views: manifestViews.map((view) => ({
      view: view.view,
      accepted_frame_count: view.accepted_frame_count,
      rejected_frame_count: view.rejected_frame_count,
      capture_verdict: view.capture_verdict,
      recapture_required: view.recapture_required,
      acceptance_score: view.acceptance_score,
      quality_band: view.quality_band,
      representative_frame_id: view.representative_frame_id,
      median_pose: view.median_pose,
      pose_variance: view.pose_variance,
      temporal_frame_count: temporalViewSupport?.[view.view]?.frameCount,
      temporal_confidence: temporalViewSupport?.[view.view]?.confidence,
      brightness_summary: { min: view.brightness.min, median: view.brightness.median, max: view.brightness.max },
      sharpness_summary: { min: view.sharpness.min, median: view.sharpness.median, max: view.sharpness.max },
      centering_drift: view.centering_drift,
      rejection_histogram: view.rejected_reasons.length > 0 ? view.rejected_reasons : undefined,
      region_visibility: view.region_visibility,
    })),
    capture_quality_score: clampScore(captureQualityScore),
    analysis_input_quality_score: clampScore(analysisInputQualityScore),
    report_confidence: clampScore(reportConfidence),
    evidence_coverage_score: clampScore(evidenceCoverageScore),
    overall_reliability_band: overallReliabilityBand,
    suppression_count: suppressionCount,
    limited_regions_count: limitedRegionsCount,
    quality_gate_verdict: qualityGateVerdict,
    recapture_recommended: recaptureRecommended,
    recapture_views: recaptureViews,
    region_evidence: regionEvidence,
    liveness_required: captureManifest?.liveness_required,
    liveness_passed: captureManifest?.liveness_passed,
    liveness_status: captureManifest?.liveness_status,
    liveness_confidence: captureManifest?.liveness_confidence != null
      ? Math.round(captureManifest.liveness_confidence * 100)
      : undefined,
    liveness_signals: captureManifest?.liveness_signals,
    liveness_incomplete_reason: captureManifest?.liveness_incomplete_reason ?? undefined,
    liveness_schema_version: captureManifest?.liveness_schema_version ?? undefined,
  }
}
