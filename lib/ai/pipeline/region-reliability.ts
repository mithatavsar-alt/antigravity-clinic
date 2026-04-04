/**
 * Region-Level Reliability Map
 *
 * Computes per-region visibility and confidence from captured views.
 *
 * PRINCIPLE: Each region's reliability depends on:
 * 1. Which views were captured
 * 2. Quality of each captured view
 * 3. View authority for that region (from view-roles.ts)
 * 4. Whether the primary view(s) for that region exist and are usable
 *
 * A region with only a weak supporting view should have LOW confidence.
 * A region whose primary view is missing should have LIMITED confidence.
 * A region with a high-quality primary view has HIGH confidence.
 */

import type {
  CaptureView,
  ViewQualityProfile,
  RegionReliability,
  RegionViewReliability,
  ReliabilityRegion,
  ConfidenceBand,
} from './types'
import { toConfidenceBand } from './types'
import {
  VIEW_ROLES,
  getViewAuthority,
  VIEW_AUTHORITY_WEIGHT,
  getPrimaryViews,
  isProfileDependent,
} from './view-roles'
import { clamp } from '../utils'

/** Turkish labels for reliability regions */
const REGION_LABELS: Record<ReliabilityRegion, string> = {
  forehead: 'Alın',
  glabella: 'Kaş Arası',
  periocular_left: 'Sol Göz Çevresi',
  periocular_right: 'Sağ Göz Çevresi',
  under_eye_left: 'Sol Göz Altı',
  under_eye_right: 'Sağ Göz Altı',
  cheek_left: 'Sol Yanak',
  cheek_right: 'Sağ Yanak',
  nasolabial_left: 'Sol Nazolabial',
  nasolabial_right: 'Sağ Nazolabial',
  lips: 'Dudak',
  chin: 'Çene',
  jawline_left: 'Sol Çene Hattı',
  jawline_right: 'Sağ Çene Hattı',
  profile_left: 'Sol Profil',
  profile_right: 'Sağ Profil',
}

/**
 * Compute reliability for all regions given captured view qualities.
 */
export function computeRegionReliabilities(
  viewQualities: ViewQualityProfile[],
): RegionReliability[] {
  const viewMap = new Map<CaptureView, ViewQualityProfile>()
  for (const vq of viewQualities) {
    viewMap.set(vq.view, vq)
  }

  return VIEW_ROLES.map(role => {
    const region = role.region
    const viewBreakdown: RegionViewReliability[] = []
    let totalWeightedVisibility = 0
    let totalWeightedConfidence = 0
    let totalWeight = 0
    const contributingViews: CaptureView[] = []

    for (const view of ['front', 'left', 'right'] as CaptureView[]) {
      const authority = getViewAuthority(region, view)
      const authorityWeight = VIEW_AUTHORITY_WEIGHT[authority]

      if (authorityWeight === 0) continue // This view can't see this region

      const vq = viewMap.get(view)

      if (!vq || !vq.usable) {
        // View not captured or rejected — zero contribution
        viewBreakdown.push({
          region,
          view,
          visibility: 0,
          confidence: 0,
          isAuthoritative: authority === 'primary',
        })
        continue
      }

      // Visibility: how well can this view see this region
      // = view quality × authority weight
      const visibility = vq.quality * authorityWeight

      // Confidence: how much we trust the analysis of this region from this view
      // Factor in sharpness (texture-critical) and posefit (geometry-critical)
      const textureFactor = clamp(vq.factors.sharpness * 1.5, 0, 1)
      const confidence = visibility * 0.5 + textureFactor * 0.3 + vq.factors.landmarkConf * 0.2

      viewBreakdown.push({
        region,
        view,
        visibility,
        confidence,
        isAuthoritative: authority === 'primary',
      })

      if (visibility > 0.05) {
        contributingViews.push(view)
        totalWeightedVisibility += visibility * authorityWeight
        totalWeightedConfidence += confidence * authorityWeight
        totalWeight += authorityWeight
      }
    }

    // Fused region visibility and confidence
    const visibility = totalWeight > 0 ? clamp(totalWeightedVisibility / totalWeight, 0, 1) : 0
    const confidence = totalWeight > 0 ? clamp(totalWeightedConfidence / totalWeight, 0, 1) : 0

    // Check if primary views are available
    const primaryViews = getPrimaryViews(region)
    const hasPrimaryView = primaryViews.some(pv => {
      const vq = viewMap.get(pv)
      return vq != null && vq.usable
    })

    // Profile-dependent regions lose significant confidence without side views
    const profilePenalized = isProfileDependent(region) && !hasPrimaryView

    const finalConfidence = profilePenalized
      ? Math.min(confidence, 0.30) // Cap at 30% for profile regions without side views
      : confidence

    const band: ConfidenceBand = toConfidenceBand(Math.round(finalConfidence * 100))
    const sufficient = finalConfidence >= 0.20

    // Build insufficiency reason
    let insufficientReason: string | undefined
    if (!sufficient) {
      if (contributingViews.length === 0) {
        insufficientReason = `${REGION_LABELS[region]} için uygun görüntü mevcut değil`
      } else if (profilePenalized) {
        insufficientReason = `${REGION_LABELS[region]} profil görüntüsü olmadan güvenilir değerlendirilemez`
      } else {
        insufficientReason = `${REGION_LABELS[region]} için görüntü kalitesi yetersiz`
      }
    }

    return {
      region,
      label: REGION_LABELS[region],
      visibility,
      confidence: finalConfidence,
      band,
      contributingViews,
      viewBreakdown,
      sufficient,
      insufficientReason,
    }
  })
}

/**
 * Get the reliability for a specific region.
 */
export function getRegionReliability(
  reliabilities: RegionReliability[],
  region: ReliabilityRegion,
): RegionReliability | undefined {
  return reliabilities.find(r => r.region === region)
}

/**
 * Get the best available confidence for a set of reliability regions.
 * Used when a wrinkle/focus area maps to multiple reliability regions.
 */
export function getBestRegionConfidence(
  reliabilities: RegionReliability[],
  regions: ReliabilityRegion[],
): number {
  let best = 0
  for (const region of regions) {
    const r = reliabilities.find(rel => rel.region === region)
    if (r && r.confidence > best) best = r.confidence
  }
  return best
}

/**
 * Get the worst confidence across a set of regions.
 * Used for bilateral comparisons where both sides must be reliable.
 */
export function getWorstRegionConfidence(
  reliabilities: RegionReliability[],
  regions: ReliabilityRegion[],
): number {
  let worst = 1
  for (const region of regions) {
    const r = reliabilities.find(rel => rel.region === region)
    if (r && r.confidence < worst) worst = r.confidence
  }
  return worst
}
