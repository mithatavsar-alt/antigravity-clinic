/**
 * Face Region Segmentation & Scoring Engine — Public API
 *
 * Single entry point: runRegionAnalysis()
 * Orchestrates: mask → regions → quality gates → skin confidence →
 *               features → scores → multi-view → explanations
 *
 * This module is client-side only (uses Canvas/Image APIs).
 * Must be dynamically imported to avoid SSR issues.
 */

import type { Landmark } from '../ai/types'
import type { ImageQualityAssessment } from '../ai/types'
import type { CaptureView, MultiViewContext, ConfidenceBand } from '../ai/pipeline/types'
import type {
  AnalysisOutput,
  ConfidenceUISummary,
  AnalysisRegionId,
  SkinConfidenceMap,
  RegionSkinConfidence,
} from './types'
import { CONFIDENCE_LEVELS } from './constants'
import { buildFaceMask } from './face-mask'
import { computeRegions } from './face-regions'
import { runRegionQualityGates } from './quality-gates'
import { computeSkinConfidenceMap, getRegionSkinConfidence } from './skin-confidence'
import { extractAllRegionFeatures, applySkinConfidence } from './feature-extractors'
import { computeScores } from './scoring-engine'
import { generateExplanations } from './explainability'
import { computeViewContributions, enhanceScoresWithMultiView } from './multi-view-fusion'

// ─── Re-exports for consumer convenience ─────────────────

export type {
  AnalysisOutput,
  AnalysisRegionId,
  RegionScore,
  GroupScore,
  ScoreSummary,
  RegionExplanation,
  FaceMaskResult,
  ComputedRegion,
  GlobalQualityGateSummary,
  RegionQualityGate,
  RegionFeatures,
  ConfidenceUISummary,
  RegionViewContribution,
  Point2D,
  Polygon,
  BBox,
  SkinConfidenceMap,
  SkinConfidenceCell,
  RegionSkinConfidence,
  DebugConfig,
  RegionVisibility,
  SeverityLevel,
  RegionGroup,
  RegionSide,
} from './types'

export { DEFAULT_DEBUG_CONFIG } from './types'
export { drawDebugOverlay } from './debug-draw'
export { buildFaceMask, pointInPolygon, clipCanvasToFaceMask, buildPixelMask, polygonBBox, polygonArea } from './face-mask'
export { computeRegions, getRegion, getPairedRegionId, getRegionsByGroup } from './face-regions'
export { runRegionQualityGates, isRegionUsable } from './quality-gates'
export { computeSkinConfidenceMap, getRegionSkinConfidence } from './skin-confidence'
export { extractAllRegionFeatures, applySkinConfidence } from './feature-extractors'
export { scoreRegion, scoreSymmetry, computeScores } from './scoring-engine'
export { generateExplanations } from './explainability'
export { computeViewContributions, enhanceScoresWithMultiView } from './multi-view-fusion'

// ─── Confidence Summary Builder ───────────────────────────

function buildConfidenceSummary(
  overallConfidence: number,
  skippedRegions: AnalysisRegionId[],
): ConfidenceUISummary {
  let band: ConfidenceBand
  let patientMessage: string

  if (overallConfidence >= CONFIDENCE_LEVELS.high) {
    band = 'high'
    patientMessage = 'Analiz yüksek güvenilirlikle tamamlanmıştır.'
  } else if (overallConfidence >= CONFIDENCE_LEVELS.medium) {
    band = 'moderate'
    patientMessage = 'Analiz tamamlanmıştır. Bazı bölgelerde görüntü koşulları sınırlı kalabilir.'
  } else if (overallConfidence >= 0.20) {
    band = 'low'
    patientMessage = 'Görüntü koşulları nedeniyle analiz sınırlı güvenilirlikle tamamlanmıştır. Daha iyi sonuçlar için yeniden çekim önerilir.'
  } else {
    band = 'insufficient'
    patientMessage = 'Görüntü koşulları yeterli analiz için uygun değildir. Yeniden çekim yapılması önerilir.'
  }

  return {
    band,
    patientMessage,
    showInsufficientWarning: skippedRegions.length > 3,
    insufficientRegions: skippedRegions,
  }
}

// ─── Main Entry Point ─────────────────────────────────────

export interface RunRegionAnalysisInput {
  /** Source image or canvas (camera capture or upload) */
  source: HTMLCanvasElement | HTMLImageElement
  /** Detected face landmarks (468-point) */
  landmarks: Landmark[]
  /** Face detection confidence 0–1 */
  confidence: number
  /** Pre-computed image quality assessment (from existing pipeline) */
  imageQuality: ImageQualityAssessment | null
  /** Multi-view context from existing pipeline (null for single-view) */
  multiViewContext?: MultiViewContext | null
  /** Source views */
  sourceViews?: CaptureView[]
  /** Whether to compute skin confidence map (slower but more accurate) */
  enableSkinConfidence?: boolean
}

/**
 * Run the complete region-aware facial analysis pipeline.
 *
 * Orchestration order:
 * 1. Build face mask (polygon + exclusions)
 * 2. Compute regions (clipped to mask)
 * 3. Run per-region quality gates
 * 4. Compute skin confidence map (optional)
 * 5. Extract features for usable regions
 * 6. Apply skin confidence to features
 * 7. Compute scores
 * 8. Enhance scores with multi-view data (if available)
 * 9. Generate explanations
 * 10. Compute view contributions
 * 11. Build final output
 */
export function runRegionAnalysis(input: RunRegionAnalysisInput): AnalysisOutput {
  const {
    source,
    landmarks,
    confidence,
    imageQuality,
    multiViewContext = null,
    sourceViews = ['front'],
    enableSkinConfidence = true,
  } = input

  // 1. Face mask
  const faceMask = buildFaceMask(landmarks, confidence)

  // 2. Compute regions
  const regions = computeRegions(landmarks, faceMask)

  // 3. Quality gates
  // Create a fallback ImageQualityAssessment when null (e.g., assessment failed)
  const effectiveImageQuality: ImageQualityAssessment = imageQuality ?? {
    overallScore: 0,
    sufficient: false,
    flags: [],
    brightness: 0.5,
    contrast: 0.5,
    sharpness: 0.1,
    resolution: 0.5,
    angleDeviation: 0,
    detectionConfidence: confidence,
  }
  const qualityGates = runRegionQualityGates(regions, effectiveImageQuality, landmarks)

  // 4. Skin confidence (optional — can be slow for large images)
  let skinConfidence: SkinConfidenceMap | null = null
  const regionSkinConfidences: RegionSkinConfidence[] = []

  if (enableSkinConfidence && faceMask.reliable) {
    skinConfidence = computeSkinConfidenceMap(source, faceMask)
    // Compute per-region skin confidence
    for (const region of regions) {
      if (region.usable) {
        regionSkinConfidences.push(getRegionSkinConfidence(skinConfidence, region))
      }
    }
  }

  // 5. Feature extraction (skin confidence applied inside if provided)
  const featureMap = extractAllRegionFeatures(
    source, landmarks, regions, qualityGates, regionSkinConfidences.length > 0 ? regionSkinConfidences : undefined,
  )

  // 7. Scoring
  let scores = computeScores(featureMap, regions, qualityGates, sourceViews)

  // 8. Multi-view enhancement
  if (multiViewContext?.isMultiView) {
    scores = {
      ...scores,
      regionScores: enhanceScoresWithMultiView(scores.regionScores, multiViewContext),
    }
  }

  // 9. Explanations
  const explanations = generateExplanations(scores.regionScores)

  // 10. View contributions
  const viewContributions = computeViewContributions(scores.regionScores, multiViewContext ?? null)

  // 11. Confidence summary
  const skippedRegionIds = qualityGates.regionGates
    .filter(g => !g.proceed)
    .map(g => g.regionId)

  const confidenceSummary = buildConfidenceSummary(
    scores.overallConfidence,
    skippedRegionIds,
  )

  return {
    timestamp: new Date().toISOString(),
    qualityGate: qualityGates,
    faceMask,
    skinConfidence,
    regions,
    scores,
    explanations,
    viewContributions,
    confidenceSummary,
  }
}
