/**
 * Region-Level Reliability Map — Evidence-Based (Phase 4)
 *
 * Computes per-region confidence from ROI-local evidence:
 *
 *   region_confidence = primary_view_authority
 *                     × roi_completeness
 *                     × local_sharpness
 *                     × local_exposure
 *                     × pose_fit
 *                     × temporal_stability
 *                     × occlusion_factor
 *
 * No factor is faked. If data is missing, the factor defaults to a
 * conservative value (not 1.0) so the absence of evidence lowers confidence.
 *
 * Special regional rules enforce additional constraints:
 * - Forehead: requires high sharpness (wrinkle-critical)
 * - Eye area: requires both eyes measurable for bilateral claims
 * - Nasolabial: requires side view authority for depth claims
 * - Jawline: pose-sensitive, requires low yaw variance
 * - Lips: expression-sensitive, requires temporal stability
 * - Symmetry: requires both sides at comparable quality
 */

import type {
  CaptureView,
  ViewQualityProfile,
  RegionReliability,
  RegionViewReliability,
  ReliabilityRegion,
  ConfidenceBand,
  RegionEvidenceFactors,
  ROILocalQualitySummary,
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

// ─── Conservative defaults when evidence is missing ────────
// These are NOT 1.0 — missing data = lower confidence

const DEFAULT_ROI_COMPLETENESS = 0.5
const DEFAULT_LOCAL_SHARPNESS = 0.4
const DEFAULT_LOCAL_EXPOSURE = 0.5
const DEFAULT_TEMPORAL_STABILITY = 0.35 // single-frame penalty
const DEFAULT_OCCLUSION_FACTOR = 0.7    // assume some risk

// ─── Regional rule thresholds ──────────────────────────────

/** Forehead: wrinkle analysis needs crisp texture */
const FOREHEAD_MIN_SHARPNESS = 0.25

/** Eye area: bilateral claims need both sides measurable */
const EYE_BILATERAL_MAX_DIFF = 0.30

/** Nasolabial: depth claims need side view or high frontal quality */
const NASOLABIAL_FRONTAL_CAP = 0.55

/** Jawline: pose-sensitive — high yaw variance kills confidence */
const JAWLINE_POSEFIT_MIN = 0.35

/** Lips: expression-sensitive — needs temporal stability */
const LIPS_TEMPORAL_MIN = 0.30

/**
 * Find the ROI quality for a region from a view's ROI measurements.
 */
function findROIQuality(
  vq: ViewQualityProfile,
  region: ReliabilityRegion,
): ROILocalQualitySummary | undefined {
  return vq.roiQualities?.find(r => r.region === region)
}

/**
 * Get temporal stability for a region from a view.
 * Maps reliability regions to temporal stability keys.
 */
function getTemporalStability(
  vq: ViewQualityProfile,
  region: ReliabilityRegion,
): number {
  const stab = vq.temporalRegionStability
  if (!stab) return DEFAULT_TEMPORAL_STABILITY

  // Map reliability regions to temporal aggregation region keys
  const mapping: Partial<Record<ReliabilityRegion, string>> = {
    forehead: 'forehead',
    glabella: 'forehead',
    periocular_left: 'periocular',
    periocular_right: 'periocular',
    under_eye_left: 'periocular',
    under_eye_right: 'periocular',
    cheek_left: 'nasolabial',
    cheek_right: 'nasolabial',
    nasolabial_left: 'nasolabial',
    nasolabial_right: 'nasolabial',
    lips: 'lips',
    chin: 'jawline',
    jawline_left: 'jawline',
    jawline_right: 'jawline',
    profile_left: 'jawline',
    profile_right: 'jawline',
  }

  const key = mapping[region]
  if (!key || stab[key] == null) return DEFAULT_TEMPORAL_STABILITY
  return stab[key]
}

/**
 * Estimate occlusion factor from landmark completeness and quality flags.
 * Lower completeness = higher occlusion risk.
 */
function estimateOcclusionFactor(
  roiQ: ROILocalQualitySummary | undefined,
): number {
  if (!roiQ || !roiQ.measurable) return DEFAULT_OCCLUSION_FACTOR

  // Completeness directly maps: all landmarks visible = low occlusion
  const completenessContrib = clamp(roiQ.completeness, 0, 1)

  // Very low sharpness in a measurable ROI can indicate partial occlusion (hair, hand)
  const sharpnessHint = roiQ.sharpness < 0.10 ? 0.7 : 1.0

  return clamp(completenessContrib * sharpnessHint, 0, 1)
}

/**
 * Compute evidence-based confidence for a single region from a single view.
 */
function computeViewRegionConfidence(
  region: ReliabilityRegion,
  vq: ViewQualityProfile,
): { confidence: number; factors: RegionEvidenceFactors } {
  const authority = getViewAuthority(region, vq.view)
  const authorityWeight = VIEW_AUTHORITY_WEIGHT[authority]

  if (authorityWeight === 0 || !vq.usable) {
    return {
      confidence: 0,
      factors: {
        viewAuthority: authorityWeight,
        roiCompleteness: 0,
        localSharpness: 0,
        localExposure: 0,
        poseFit: 0,
        temporalStability: 0,
        occlusionFactor: 0,
        cappedByRule: null,
      },
    }
  }

  const roiQ = findROIQuality(vq, region)

  // Extract evidence factors — use measured values when available, else conservative defaults
  const roiCompleteness = roiQ?.measurable ? roiQ.completeness : DEFAULT_ROI_COMPLETENESS
  const localSharpness = roiQ?.measurable ? roiQ.sharpness : DEFAULT_LOCAL_SHARPNESS
  const localExposure = roiQ?.measurable ? roiQ.exposure : DEFAULT_LOCAL_EXPOSURE
  const poseFit = vq.factors.posefit
  const temporalStability = getTemporalStability(vq, region)
  const occlusionFactor = estimateOcclusionFactor(roiQ)

  // Core formula: multiplicative — each weak factor pulls down the whole
  const rawConfidence = authorityWeight
    * clamp(roiCompleteness, 0.1, 1)
    * clamp(localSharpness * 1.5, 0.15, 1)  // sharpness is critical, boost range
    * clamp(localExposure, 0.2, 1)
    * clamp(poseFit, 0.15, 1)
    * clamp(temporalStability * 0.6 + 0.4, 0.4, 1) // temporal: 40% floor (single-frame shouldn't be zero)
    * clamp(occlusionFactor, 0.2, 1)

  return {
    confidence: clamp(rawConfidence, 0, 1),
    factors: {
      viewAuthority: authorityWeight,
      roiCompleteness,
      localSharpness,
      localExposure,
      poseFit,
      temporalStability,
      occlusionFactor,
      cappedByRule: null,
    },
  }
}

// ─── Regional rules ────────────────────────────────────────

type RegionalRule = (
  region: ReliabilityRegion,
  confidence: number,
  factors: RegionEvidenceFactors,
  allReliabilities: Map<ReliabilityRegion, { confidence: number; factors: RegionEvidenceFactors }>,
) => { confidence: number; cappedByRule: string | null }

/**
 * Forehead: wrinkle-critical region, needs high local sharpness.
 * Without crisp texture, wrinkle analysis is unreliable.
 */
const foreheadRule: RegionalRule = (_region, confidence, factors) => {
  if (factors.localSharpness < FOREHEAD_MIN_SHARPNESS) {
    const penalty = factors.localSharpness / FOREHEAD_MIN_SHARPNESS
    return {
      confidence: confidence * penalty,
      cappedByRule: 'forehead_low_sharpness',
    }
  }
  return { confidence, cappedByRule: null }
}

/**
 * Eye area: bilateral claims require both sides to be measurable.
 * A large quality gap between left and right caps the weaker side.
 */
const eyeBilateralRule: RegionalRule = (region, confidence, _factors, all) => {
  const otherSide = region.includes('left')
    ? region.replace('left', 'right') as ReliabilityRegion
    : region.replace('right', 'left') as ReliabilityRegion

  const other = all.get(otherSide)
  if (!other) return { confidence, cappedByRule: null }

  const diff = Math.abs(confidence - other.confidence)
  if (diff > EYE_BILATERAL_MAX_DIFF) {
    // Cap the stronger side to reduce misleading asymmetry claims
    const cappedConf = Math.min(confidence, other.confidence + EYE_BILATERAL_MAX_DIFF)
    if (cappedConf < confidence) {
      return { confidence: cappedConf, cappedByRule: 'bilateral_quality_gap' }
    }
  }
  return { confidence, cappedByRule: null }
}

/**
 * Nasolabial: depth claims need side view or very high frontal quality.
 * Front view alone caps confidence since nasolabial fold depth is profile-dependent.
 */
const nasolabialRule: RegionalRule = (region, confidence, factors) => {
  // If primary view authority < 0.5 (frontal-only), cap confidence
  if (factors.viewAuthority < 0.6) {
    const capped = Math.min(confidence, NASOLABIAL_FRONTAL_CAP)
    if (capped < confidence) {
      return { confidence: capped, cappedByRule: 'nasolabial_no_profile' }
    }
  }
  return { confidence, cappedByRule: null }
}

/**
 * Jawline: pose-sensitive — yaw variance kills confidence.
 * Head rotation makes jawline contour unreliable.
 */
const jawlineRule: RegionalRule = (_region, confidence, factors) => {
  if (factors.poseFit < JAWLINE_POSEFIT_MIN) {
    const penalty = factors.poseFit / JAWLINE_POSEFIT_MIN
    return {
      confidence: confidence * clamp(penalty, 0.3, 1),
      cappedByRule: 'jawline_pose_unstable',
    }
  }
  return { confidence, cappedByRule: null }
}

/**
 * Lips: expression-sensitive — moving lips produce unreliable analysis.
 */
const lipsRule: RegionalRule = (_region, confidence, factors) => {
  if (factors.temporalStability < LIPS_TEMPORAL_MIN) {
    const penalty = factors.temporalStability / LIPS_TEMPORAL_MIN
    return {
      confidence: confidence * clamp(penalty, 0.3, 1),
      cappedByRule: 'lips_expression_movement',
    }
  }
  return { confidence, cappedByRule: null }
}

/** Map regions to their applicable rules */
const REGIONAL_RULES: Partial<Record<ReliabilityRegion, RegionalRule[]>> = {
  forehead: [foreheadRule],
  glabella: [foreheadRule], // glabella is part of forehead zone
  periocular_left: [eyeBilateralRule],
  periocular_right: [eyeBilateralRule],
  under_eye_left: [eyeBilateralRule],
  under_eye_right: [eyeBilateralRule],
  nasolabial_left: [nasolabialRule],
  nasolabial_right: [nasolabialRule],
  jawline_left: [jawlineRule],
  jawline_right: [jawlineRule],
  lips: [lipsRule],
}

/**
 * Compute reliability for all regions given captured view qualities.
 *
 * Phase 4 upgrade: uses ROI-local quality factors and regional rules
 * instead of shallow global view quality.
 */
export function computeRegionReliabilities(
  viewQualities: ViewQualityProfile[],
): RegionReliability[] {
  const viewMap = new Map<CaptureView, ViewQualityProfile>()
  for (const vq of viewQualities) {
    viewMap.set(vq.view, vq)
  }

  // First pass: compute raw confidence per region (best across views)
  const rawResults = new Map<ReliabilityRegion, { confidence: number; factors: RegionEvidenceFactors; breakdown: RegionViewReliability[]; views: CaptureView[] }>()

  for (const role of VIEW_ROLES) {
    const region = role.region
    const viewBreakdown: RegionViewReliability[] = []
    let bestConfidence = 0
    let bestFactors: RegionEvidenceFactors | null = null
    const contributingViews: CaptureView[] = []

    for (const view of ['front', 'left', 'right'] as CaptureView[]) {
      const authority = getViewAuthority(region, view)
      const authorityWeight = VIEW_AUTHORITY_WEIGHT[authority]

      if (authorityWeight === 0) continue

      const vq = viewMap.get(view)

      if (!vq || !vq.usable) {
        viewBreakdown.push({
          region,
          view,
          visibility: 0,
          confidence: 0,
          isAuthoritative: authority === 'primary',
        })
        continue
      }

      const { confidence, factors } = computeViewRegionConfidence(region, vq)

      viewBreakdown.push({
        region,
        view,
        visibility: confidence,
        confidence,
        isAuthoritative: authority === 'primary',
      })

      if (confidence > 0.05) {
        contributingViews.push(view)
      }

      // Keep the best view's confidence as the primary signal
      if (confidence > bestConfidence) {
        bestConfidence = confidence
        bestFactors = factors
      }
    }

    rawResults.set(region, {
      confidence: bestConfidence,
      factors: bestFactors ?? {
        viewAuthority: 0,
        roiCompleteness: 0,
        localSharpness: 0,
        localExposure: 0,
        poseFit: 0,
        temporalStability: 0,
        occlusionFactor: 0,
        cappedByRule: null,
      },
      breakdown: viewBreakdown,
      views: contributingViews,
    })
  }

  // Second pass: apply regional rules (may reference other regions)
  const results: RegionReliability[] = []

  for (const role of VIEW_ROLES) {
    const region = role.region
    const raw = rawResults.get(region)!
    let finalConfidence = raw.confidence
    const finalFactors = { ...raw.factors }
    let appliedRule: string | null = null

    const rules = REGIONAL_RULES[region]
    if (rules) {
      for (const rule of rules) {
        const result = rule(region, finalConfidence, finalFactors, rawResults)
        if (result.cappedByRule) {
          finalConfidence = result.confidence
          appliedRule = result.cappedByRule
          finalFactors.cappedByRule = appliedRule
        }
      }
    }

    // Profile-dependent regions lose significant confidence without side views
    const primaryViews = getPrimaryViews(region)
    const hasPrimaryView = primaryViews.some(pv => {
      const vq = viewMap.get(pv)
      return vq != null && vq.usable
    })
    const profilePenalized = isProfileDependent(region) && !hasPrimaryView

    if (profilePenalized) {
      finalConfidence = Math.min(finalConfidence, 0.30)
      if (!appliedRule) {
        appliedRule = 'profile_view_missing'
        finalFactors.cappedByRule = appliedRule
      }
    }

    const band: ConfidenceBand = toConfidenceBand(Math.round(finalConfidence * 100))
    const sufficient = finalConfidence >= 0.20

    // Build insufficiency reason
    let insufficientReason: string | undefined
    if (!sufficient) {
      if (raw.views.length === 0) {
        insufficientReason = `${REGION_LABELS[region]} için uygun görüntü mevcut değil`
      } else if (profilePenalized) {
        insufficientReason = `${REGION_LABELS[region]} profil görüntüsü olmadan güvenilir değerlendirilemez`
      } else if (appliedRule === 'forehead_low_sharpness') {
        insufficientReason = `${REGION_LABELS[region]} bölgesinde görüntü netliği yetersiz`
      } else if (appliedRule === 'jawline_pose_unstable') {
        insufficientReason = `${REGION_LABELS[region]} baş açısı nedeniyle güvenilir değerlendirilemedi`
      } else if (appliedRule === 'lips_expression_movement') {
        insufficientReason = `${REGION_LABELS[region]} ifade hareketi nedeniyle güvenilir değerlendirilemedi`
      } else {
        insufficientReason = `${REGION_LABELS[region]} için görüntü kalitesi yetersiz`
      }
    }

    results.push({
      region,
      label: REGION_LABELS[region],
      visibility: finalConfidence,
      confidence: finalConfidence,
      band,
      contributingViews: raw.views,
      viewBreakdown: raw.breakdown,
      sufficient,
      insufficientReason,
      evidenceFactors: finalFactors,
    })
  }

  return results
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
