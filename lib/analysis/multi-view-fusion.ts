/**
 * Multi-View Fusion Adapter
 *
 * Thin adapter that maps existing pipeline multi-view data
 * to the new region-based format (AnalysisRegionId).
 */

import type { AnalysisRegionId, RegionViewContribution, RegionScore } from './types'
import type {
  CaptureView,
  MultiViewContext,
  ReliabilityRegion,
  RegionReliability,
} from '../ai/pipeline/types'

// ─── Internal Constants ──────────────────────────────────

/** Which view is primary (authoritative) for each analysis region */
const PRIMARY_VIEW_MAP: Record<AnalysisRegionId, CaptureView> = {
  forehead: 'front',
  forehead_left: 'front',
  forehead_right: 'front',
  glabella: 'front',
  under_eye_left: 'front',
  under_eye_right: 'front',
  perioral: 'front',
  chin: 'front',
  symmetry_zone: 'front',
  nose_surface: 'front',
  crow_feet_left: 'left',
  nasolabial_left: 'left',
  cheek_left: 'left',
  jawline_left: 'left',
  crow_feet_right: 'right',
  nasolabial_right: 'right',
  cheek_right: 'right',
  jawline_right: 'right',
}

/** Maps our 18 analysis regions to the pipeline's 16 ReliabilityRegion keys */
const REGION_TO_RELIABILITY: Partial<Record<AnalysisRegionId, ReliabilityRegion>> = {
  forehead: 'forehead',
  forehead_left: 'forehead',
  forehead_right: 'forehead',
  glabella: 'glabella',
  under_eye_left: 'under_eye_left',
  under_eye_right: 'under_eye_right',
  crow_feet_left: 'periocular_left',
  crow_feet_right: 'periocular_right',
  nasolabial_left: 'nasolabial_left',
  nasolabial_right: 'nasolabial_right',
  perioral: 'lips',
  cheek_left: 'cheek_left',
  cheek_right: 'cheek_right',
  chin: 'chin',
  jawline_left: 'jawline_left',
  jawline_right: 'jawline_right',
  // nose_surface — no mapping (undefined)
  // symmetry_zone — no mapping (undefined)
}

// ─── Helpers ─────────────────────────────────────────────

function findReliability(
  regionId: AnalysisRegionId,
  ctx: MultiViewContext,
): RegionReliability | undefined {
  const reliabilityKey = REGION_TO_RELIABILITY[regionId]
  if (!reliabilityKey) return undefined
  return ctx.regionReliabilities.find((r) => r.region === reliabilityKey)
}

// ─── Exported Functions ──────────────────────────────────

/**
 * Compute per-region view contribution metadata for the UI.
 *
 * For each RegionScore, determines which view contributed most,
 * the fusion confidence, and consistency notes across views.
 */
export function computeViewContributions(
  regionScores: RegionScore[],
  multiViewContext: MultiViewContext | null | undefined,
): RegionViewContribution[] {
  return regionScores.map((rs) => {
    // Single-view fallback
    if (!multiViewContext || !multiViewContext.isMultiView) {
      return {
        regionId: rs.regionId,
        sourceView: PRIMARY_VIEW_MAP[rs.regionId],
        fusionConfidence: rs.confidence,
        consistencyNotes: [],
      }
    }

    const reliability = findReliability(rs.regionId, multiViewContext)

    // No reliability data available for this region
    if (!reliability) {
      return {
        regionId: rs.regionId,
        sourceView: PRIMARY_VIEW_MAP[rs.regionId],
        fusionConfidence: rs.confidence,
        consistencyNotes: [],
      }
    }

    // Find the best contributing view by confidence
    let bestView: CaptureView = PRIMARY_VIEW_MAP[rs.regionId]
    let bestConfidence = 0

    for (const vb of reliability.viewBreakdown) {
      if (vb.confidence > bestConfidence) {
        bestConfidence = vb.confidence
        bestView = vb.view
      }
    }

    // Consistency check: if multiple views have confidence > 0.1,
    // compare max-min gap
    const consistencyNotes: string[] = []
    const significantViews = reliability.viewBreakdown.filter(
      (vb) => vb.confidence > 0.1,
    )

    if (significantViews.length > 1) {
      const confidences = significantViews.map((vb) => vb.confidence)
      const gap = Math.max(...confidences) - Math.min(...confidences)
      if (gap > 0.3) {
        consistencyNotes.push(
          'Görünümler arası belirgin kalite farkı mevcut',
        )
      } else {
        consistencyNotes.push('Görünümler arası tutarlılık iyi')
      }
    }

    return {
      regionId: rs.regionId,
      sourceView: bestView,
      fusionConfidence: reliability.confidence,
      consistencyNotes,
    }
  })
}

/**
 * Enhance region scores with multi-view reliability data.
 *
 * For each score, if multi-view reliability data exists for the
 * mapped region, boost confidence to max(original, reliability)
 * and update sourceViews from reliability contributing views.
 *
 * Returns scores unchanged if no multi-view context is available.
 */
export function enhanceScoresWithMultiView(
  regionScores: RegionScore[],
  multiViewContext: MultiViewContext | null | undefined,
): RegionScore[] {
  if (!multiViewContext || !multiViewContext.isMultiView) {
    return regionScores
  }

  return regionScores.map((rs) => {
    const reliability = findReliability(rs.regionId, multiViewContext)

    if (!reliability) {
      return rs
    }

    const enhancedConfidence = Math.max(rs.confidence, reliability.confidence)

    return {
      ...rs,
      confidence: enhancedConfidence,
      sourceViews:
        reliability.contributingViews.length > 0
          ? reliability.contributingViews
          : rs.sourceViews,
    }
  })
}
