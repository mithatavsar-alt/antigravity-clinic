import type { CaptureManifest } from '@/types/capture'
import type { CanonicalAnalysisPayload, OverallReliabilityBand } from '@/types/analysis'

export const CANONICAL_ANALYSIS_VERSION = '1.0.0' as const

function clampScore(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
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

interface BuildCanonicalAnalysisPayloadArgs {
  leadId: string
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
}

export function buildCanonicalAnalysisPayload({
  leadId,
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
}: BuildCanonicalAnalysisPayloadArgs): CanonicalAnalysisPayload {
  const manifestViews = captureManifest?.views ?? []

  return {
    version: CANONICAL_ANALYSIS_VERSION,
    manifest_schema_version: captureManifest?.schema_version ?? 'legacy',
    generated_at: new Date().toISOString(),
    lead_id: leadId,
    capture_session_id: captureManifest?.session_id,
    mode: captureManifest?.mode ?? 'single',
    capture_views: manifestViews.map((view) => ({
      view: view.view,
      accepted_frame_count: view.accepted_frame_count,
      capture_verdict: view.capture_verdict,
      recapture_required: view.recapture_required,
      acceptance_score: view.acceptance_score,
      quality_band: view.quality_band,
      representative_frame_id: view.representative_frame_id,
      median_pose: view.median_pose,
      pose_variance: view.pose_variance,
      temporal_frame_count: temporalViewSupport?.[view.view]?.frameCount,
      temporal_confidence: temporalViewSupport?.[view.view]?.confidence,
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
    liveness_required: captureManifest?.liveness_required,
    liveness_passed: captureManifest?.liveness_passed,
    liveness_status: captureManifest?.liveness_status,
    liveness_confidence: captureManifest?.liveness_confidence != null
      ? Math.round(captureManifest.liveness_confidence * 100)
      : undefined,
    liveness_signals: captureManifest?.liveness_signals,
  }
}
