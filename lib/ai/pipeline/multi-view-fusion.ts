/**
 * Multi-View Fusion Engine
 *
 * Produces FusedFindings by merging evidence from front, left, and right views.
 *
 * PRINCIPLES:
 * - NOT a blind average. Weighted by view quality, view authority, and agreement.
 * - Multiple views agreeing → increased confidence.
 * - Single weak view → limited confidence.
 * - Conflicting views → reduced confidence.
 * - Missing primary view → profile-related confidence drops.
 * - Each fused finding knows exactly which views contributed.
 *
 * This engine does NOT replace the existing wrinkle or focus area analysis.
 * It runs alongside them and provides a reliability layer that the confidence
 * engine uses to gate outputs.
 */

import type {
  CaptureView,
  ViewQualityProfile,
  RegionReliability,
  FusedFinding,
  MultiViewContext,
  ReliabilityRegion,
  ConfidenceBand,
} from './types'
import { toConfidenceBand } from './types'
import { computeRegionReliabilities } from './region-reliability'
import { getViewWeight, WRINKLE_TO_RELIABILITY, isProfileDependent } from './view-roles'
import { clamp } from '../utils'

/** Score evidence from a single view for a single region */
interface ViewEvidence {
  view: CaptureView
  /** Raw score from this view's analysis (0–100) */
  score: number
  /** Quality of this view (0–1) */
  quality: number
  /** Authority weight for this region from this view (0–1) */
  weight: number
}

/** Turkish labels for fused finding regions */
const FUSED_LABELS: Record<string, string> = {
  forehead: 'Alın Bölgesi',
  glabella: 'Kaş Arası',
  crow_feet_left: 'Sol Kaz Ayağı',
  crow_feet_right: 'Sağ Kaz Ayağı',
  under_eye_left: 'Sol Göz Altı',
  under_eye_right: 'Sağ Göz Altı',
  nasolabial_left: 'Sol Nazolabial',
  nasolabial_right: 'Sağ Nazolabial',
  cheek_left: 'Sol Yanak',
  cheek_right: 'Sağ Yanak',
  jawline: 'Çene Hattı',
  lips: 'Dudak Bölgesi',
  chin: 'Çene',
  profile_left: 'Sol Profil',
  profile_right: 'Sağ Profil',
}

/**
 * Build the complete multi-view context.
 *
 * @param viewQualities - Per-view quality profiles
 * @param viewScores - Per-view, per-region raw scores (from wrinkle + multi-view analysis)
 */
export function buildMultiViewContext(
  viewQualities: ViewQualityProfile[],
  viewScores: Map<string, ViewEvidence[]>,
): MultiViewContext {
  const capturedViews = viewQualities
    .filter(v => v.usable)
    .map(v => v.view)

  const regionReliabilities = computeRegionReliabilities(viewQualities)

  const fusedFindings = fuseFindings(viewQualities, viewScores, regionReliabilities)

  return {
    viewQualities,
    regionReliabilities,
    capturedViews,
    isMultiView: capturedViews.length >= 2,
    fusedFindings,
  }
}

/**
 * Fuse findings from multiple views into confidence-weighted results.
 */
function fuseFindings(
  viewQualities: ViewQualityProfile[],
  viewScores: Map<string, ViewEvidence[]>,
  regionReliabilities: RegionReliability[],
): FusedFinding[] {
  const findings: FusedFinding[] = []
  const viewQualityMap = new Map<CaptureView, ViewQualityProfile>()
  for (const vq of viewQualities) viewQualityMap.set(vq.view, vq)

  for (const [regionKey, evidences] of viewScores) {
    if (evidences.length === 0) continue

    const finding = fuseSingleRegion(regionKey, evidences, regionReliabilities, viewQualityMap)
    if (finding) findings.push(finding)
  }

  return findings
}

function fuseSingleRegion(
  regionKey: string,
  evidences: ViewEvidence[],
  regionReliabilities: RegionReliability[],
  viewQualityMap: Map<CaptureView, ViewQualityProfile>,
): FusedFinding | null {
  // Filter to usable evidences
  const usable = evidences.filter(e => {
    const vq = viewQualityMap.get(e.view)
    return vq != null && vq.usable && e.weight > 0
  })

  if (usable.length === 0) return null

  // ── Weighted fusion (NOT blind average) ──
  // Weight = view quality × authority weight
  let totalWeightedScore = 0
  let totalWeight = 0
  const viewScores: FusedFinding['viewScores'] = []
  const contributingViews: CaptureView[] = []

  for (const e of usable) {
    const vq = viewQualityMap.get(e.view)!
    const effectiveWeight = e.weight * vq.quality
    totalWeightedScore += e.score * effectiveWeight
    totalWeight += effectiveWeight
    viewScores.push({ view: e.view, score: e.score, weight: effectiveWeight })
    contributingViews.push(e.view)
  }

  const fusedScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0

  // ── Multi-view agreement analysis ──
  const agreement = computeAgreement(usable)

  // ── Confidence scoring ──
  // Base confidence from region reliability
  const reliabilityRegions = WRINKLE_TO_RELIABILITY[regionKey] ?? []
  let regionConfidence = 0
  for (const rr of reliabilityRegions) {
    const rel = regionReliabilities.find(r => r.region === rr)
    if (rel && rel.confidence > regionConfidence) regionConfidence = rel.confidence
  }

  // Agreement bonus/penalty
  let confidenceScore = regionConfidence * 100
  if (agreement.type === 'agree') {
    confidenceScore = Math.min(100, confidenceScore + agreement.strength * 15)
  } else if (agreement.type === 'conflict') {
    confidenceScore = Math.max(0, confidenceScore - agreement.strength * 25)
  }
  // Single weak view penalty
  if (usable.length === 1 && usable[0].weight < 0.5) {
    confidenceScore = Math.min(confidenceScore, 40)
  }

  // Profile-dependent region without primary view penalty
  for (const rr of reliabilityRegions) {
    if (isProfileDependent(rr)) {
      const hasPrimary = usable.some(e => getViewWeight(rr, e.view) >= 1.0)
      if (!hasPrimary) {
        confidenceScore = Math.min(confidenceScore, 30)
      }
    }
  }

  confidenceScore = clamp(Math.round(confidenceScore), 0, 100)
  const confidence: ConfidenceBand = toConfidenceBand(confidenceScore)

  // ── Intensity classification ──
  const intensity = classifyIntensity(fusedScore)

  // ── Evidence summary ──
  const evidenceSummary = buildEvidenceSummary(contributingViews, agreement)
  const confidenceWeakeners = buildWeakeners(usable, agreement, reliabilityRegions, regionReliabilities)

  return {
    region: regionKey,
    label: FUSED_LABELS[regionKey] ?? regionKey,
    intensity,
    confidence,
    confidenceScore,
    contributingViews,
    evidenceSummary,
    confidenceWeakeners,
    viewScores,
    multiViewAgreement: agreement.type === 'agree' && usable.length >= 2,
  }
}

// ─── Agreement Analysis ───────────────────────────────────

interface AgreementResult {
  type: 'agree' | 'conflict' | 'single'
  strength: number // 0–1
}

function computeAgreement(evidences: ViewEvidence[]): AgreementResult {
  if (evidences.length < 2) return { type: 'single', strength: 0 }

  // Compare scores pairwise
  const scores = evidences.map(e => e.score)
  const maxDelta = Math.max(...scores) - Math.min(...scores)

  // Agreement: all scores within 20 points of each other
  if (maxDelta <= 20) {
    return { type: 'agree', strength: clamp(1 - maxDelta / 20, 0, 1) }
  }

  // Conflict: scores diverge significantly (>35 points)
  if (maxDelta > 35) {
    return { type: 'conflict', strength: clamp((maxDelta - 35) / 30, 0, 1) }
  }

  // Moderate disagreement — slight agreement
  return { type: 'agree', strength: 0.3 }
}

// ─── Intensity Classification ─────────────────────────────

function classifyIntensity(score: number): FusedFinding['intensity'] {
  if (score >= 55) return 'notable'
  if (score >= 30) return 'moderate'
  if (score >= 12) return 'mild'
  return 'none'
}

// ─── Evidence Summary Builders ────────────────────────────

const VIEW_LABEL: Record<CaptureView, string> = {
  front: 'ön görüntü',
  left: 'sol profil',
  right: 'sağ profil',
}

function buildEvidenceSummary(
  views: CaptureView[],
  agreement: AgreementResult,
): string {
  const viewNames = views.map(v => VIEW_LABEL[v]).join(' ve ')

  if (views.length === 1) {
    return `Yalnızca ${viewNames} ile desteklenmektedir.`
  }

  if (agreement.type === 'agree') {
    return `${viewNames} tarafından tutarlı şekilde desteklenmektedir.`
  }

  if (agreement.type === 'conflict') {
    return `${viewNames} arasında farklılık gözlenmiştir — güven düzeyi sınırlıdır.`
  }

  return `${viewNames} ile değerlendirilmiştir.`
}

function buildWeakeners(
  evidences: ViewEvidence[],
  agreement: AgreementResult,
  reliabilityRegions: ReliabilityRegion[],
  regionReliabilities: RegionReliability[],
): string[] {
  const weakeners: string[] = []

  // Single view
  if (evidences.length === 1) {
    weakeners.push('Tek görüntü ile sınırlı değerlendirme')
  }

  // Conflict
  if (agreement.type === 'conflict') {
    weakeners.push('Görüntüler arası tutarsızlık')
  }

  // Weak view quality
  const weakViews = evidences.filter(e => e.quality < 0.5)
  if (weakViews.length > 0 && weakViews.length === evidences.length) {
    weakeners.push('Düşük görüntü kalitesi')
  }

  // Missing primary view for profile regions
  for (const rr of reliabilityRegions) {
    const rel = regionReliabilities.find(r => r.region === rr)
    if (rel && !rel.sufficient) {
      weakeners.push(rel.insufficientReason ?? 'Yetersiz bölge görünürlüğü')
      break
    }
  }

  return weakeners
}

/**
 * Build a single-view context for fallback when only front view exists.
 * All side-dependent regions get reduced confidence.
 */
export function buildSingleViewContext(
  frontQuality: ViewQualityProfile,
): MultiViewContext {
  const viewQualities = [frontQuality]
  const regionReliabilities = computeRegionReliabilities(viewQualities)

  return {
    viewQualities,
    regionReliabilities,
    capturedViews: ['front'],
    isMultiView: false,
    fusedFindings: [], // No fusion possible with single view
  }
}
