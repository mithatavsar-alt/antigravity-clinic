/**
 * Scoring Engine — Weighted, confidence-aware scoring for facial analysis
 *
 * Score per region → groups → overall.
 * Confidence compresses uncertain scores toward 50 (neutral).
 * Missing regions never silently become zero.
 * Scores rounded to nearest SCORE_ROUNDING for human readability.
 */

import type {
  AnalysisRegionId,
  RegionFeatures,
  RegionScore,
  GroupScore,
  ScoreSummary,
  SeverityLevel,
  RegionGroup,
  ComputedRegion,
  GlobalQualityGateSummary,
} from './types'

import type { CaptureView } from '../ai/pipeline/types'

import {
  REGION_DEFINITIONS,
  GROUP_LABELS,
  GROUP_WEIGHTS,
  SEVERITY_THRESHOLDS,
  SCORE_ROUNDING,
  PAIRED_REGIONS,
} from './constants'

// ─── Internal Helpers (not exported) ─────────────────────

function roundScore(score: number): number {
  return Math.round(score / SCORE_ROUNDING) * SCORE_ROUNDING
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function classifySeverity(score: number): SeverityLevel {
  if (score >= SEVERITY_THRESHOLDS.minimal) return 'minimal'
  if (score >= SEVERITY_THRESHOLDS.mild) return 'mild'
  if (score >= SEVERITY_THRESHOLDS.moderate) return 'moderate'
  return 'notable'
}

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  minimal: 'Minimal',
  mild: 'Hafif',
  moderate: 'Orta',
  notable: 'Belirgin',
}

/** Feature weights by region group */
const FEATURE_WEIGHTS: Record<
  string,
  { wrinkle: number; roughness: number; contrast: number; uniformity: number }
> = {
  forehead: { wrinkle: 0.45, roughness: 0.25, contrast: 0.15, uniformity: 0.15 },
  eye_area: { wrinkle: 0.40, roughness: 0.20, contrast: 0.25, uniformity: 0.15 },
  mid_face: { wrinkle: 0.35, roughness: 0.20, contrast: 0.20, uniformity: 0.25 },
  lower_face: { wrinkle: 0.30, roughness: 0.25, contrast: 0.20, uniformity: 0.25 },
  default: { wrinkle: 0.35, roughness: 0.25, contrast: 0.20, uniformity: 0.20 },
}

// ─── Exported Functions ──────────────────────────────────

/**
 * Score a single region from its extracted features.
 */
export function scoreRegion(
  regionId: AnalysisRegionId,
  features: RegionFeatures,
  sourceViews: CaptureView[] = ['front'],
): RegionScore {
  const def = REGION_DEFINITIONS[regionId]
  const weights = FEATURE_WEIGHTS[def.group] ?? FEATURE_WEIGHTS.default

  // Convert features to concern signals (0 = no concern, 1 = max concern)
  const wrinkleConcern = clamp(features.wrinkleDensity * 2.5, 0, 1)
  const roughnessConcern = clamp(features.textureRoughness, 0, 1)
  const contrastConcern = clamp(features.contrastIrregularity * 1.5, 0, 1)
  const uniformityConcern = clamp(1 - features.toneUniformity, 0, 1)

  // Weighted concern → raw score
  const weightedConcern =
    wrinkleConcern * weights.wrinkle +
    roughnessConcern * weights.roughness +
    contrastConcern * weights.contrast +
    uniformityConcern * weights.uniformity

  const rawScore = clamp(100 - weightedConcern * 100, 0, 100)

  // Confidence adjustment — poor confidence compresses toward 50
  const effectiveConfidence =
    features.confidence * features.skinConfidenceFactor * features.usableSkinRatio
  const adjustedScore = rawScore * effectiveConfidence + 50 * (1 - effectiveConfidence)

  const finalScore = roundScore(adjustedScore)
  const severity = classifySeverity(finalScore)

  // Build driver list (Turkish)
  const drivers: string[] = []
  if (wrinkleConcern > 0.3) drivers.push('çizgi yoğunluğu')
  if (roughnessConcern > 0.4) drivers.push('doku pürüzlülüğü')
  if (contrastConcern > 0.3) drivers.push('kontrast düzensizliği')
  if (uniformityConcern > 0.3) drivers.push('ton farklılığı')
  if (features.asymmetryEstimate !== null && features.asymmetryEstimate > 0.2) {
    drivers.push('sol-sağ asimetri')
  }

  const summaryLabel = `${def.label}: ${SEVERITY_LABELS[severity]}`

  return {
    regionId,
    label: def.label,
    score: finalScore,
    confidence: effectiveConfidence,
    severity,
    summaryLabel,
    drivers,
    features,
    sourceViews,
  }
}

/**
 * Compute a symmetry score from paired regions.
 */
export function scoreSymmetry(
  featureMap: Map<AnalysisRegionId, RegionFeatures>,
): RegionScore {
  const asymmetries: number[] = []
  const pairConfidences: number[] = []

  for (const [left, right] of PAIRED_REGIONS) {
    const leftFeatures = featureMap.get(left)
    const rightFeatures = featureMap.get(right)
    if (!leftFeatures || !rightFeatures) continue

    const leftAsym = leftFeatures.asymmetryEstimate
    const rightAsym = rightFeatures.asymmetryEstimate
    // Use whichever is available; average if both exist
    const asym =
      leftAsym !== null && rightAsym !== null
        ? (leftAsym + rightAsym) / 2
        : leftAsym ?? rightAsym
    if (asym !== null) {
      asymmetries.push(asym)
      pairConfidences.push(Math.min(leftFeatures.confidence, rightFeatures.confidence))
    }
  }

  const def = REGION_DEFINITIONS.symmetry_zone
  const dummyFeatures: RegionFeatures = {
    regionId: 'symmetry_zone',
    wrinkleDensity: 0,
    textureRoughness: 0,
    contrastIrregularity: 0,
    toneUniformity: 1,
    meanBrightness: 0,
    asymmetryEstimate: null,
    skinConfidenceFactor: 1,
    usableSkinRatio: 1,
    confidence: 0,
  }

  // No usable pairs
  if (asymmetries.length === 0) {
    return {
      regionId: 'symmetry_zone',
      label: def.label,
      score: 50,
      confidence: 0,
      severity: 'mild',
      summaryLabel: `${def.label}: ${SEVERITY_LABELS.mild}`,
      drivers: ['yeterli bölge çifti mevcut değil'],
      features: dummyFeatures,
      sourceViews: ['front'],
    }
  }

  const avgAsymmetry =
    asymmetries.reduce((sum, v) => sum + v, 0) / asymmetries.length
  const avgConfidence =
    pairConfidences.reduce((sum, v) => sum + v, 0) / pairConfidences.length

  const rawScore = clamp(100 - avgAsymmetry * 150, 0, 100)
  const adjustedScore = rawScore * avgConfidence + 50 * (1 - avgConfidence)
  const finalScore = roundScore(adjustedScore)
  const severity = classifySeverity(finalScore)

  const drivers: string[] = []
  if (avgAsymmetry > 0.15) drivers.push('sol-sağ fark belirgin')
  if (asymmetries.length < 3) drivers.push('sınırlı bölge çifti')

  return {
    regionId: 'symmetry_zone',
    label: def.label,
    score: finalScore,
    confidence: avgConfidence,
    severity,
    summaryLabel: `${def.label}: ${SEVERITY_LABELS[severity]}`,
    drivers,
    features: { ...dummyFeatures, confidence: avgConfidence, asymmetryEstimate: avgAsymmetry },
    sourceViews: ['front'],
  }
}

/**
 * Main entry: compute all scores from feature map → region → group → overall.
 */
export function computeScores(
  featureMap: Map<AnalysisRegionId, RegionFeatures>,
  _regions: ComputedRegion[],
  qualityGates: GlobalQualityGateSummary,
  sourceViews: CaptureView[] = ['front'],
): ScoreSummary {
  // 1. Score each region that has features (excluding symmetry_zone)
  const regionScores: RegionScore[] = []
  for (const [regionId, features] of featureMap) {
    if (regionId === 'symmetry_zone') continue
    regionScores.push(scoreRegion(regionId, features, sourceViews))
  }

  // 2. Add symmetry score
  const symmetryScore = scoreSymmetry(featureMap)
  regionScores.push(symmetryScore)

  // 3. Compute group scores
  const groupMap = new Map<RegionGroup, RegionScore[]>()
  for (const rs of regionScores) {
    const def = REGION_DEFINITIONS[rs.regionId]
    const group = def.group
    if (!groupMap.has(group)) groupMap.set(group, [])
    groupMap.get(group)!.push(rs)
  }

  const groupScores: GroupScore[] = []
  for (const [group, scores] of groupMap) {
    let weightSum = 0
    let scoreSum = 0
    for (const rs of scores) {
      const def = REGION_DEFINITIONS[rs.regionId]
      const w = def.weight * rs.confidence
      scoreSum += rs.score * w
      weightSum += w
    }

    const groupScore = weightSum > 0 ? scoreSum / weightSum : 50
    const groupConfidence =
      weightSum > 0
        ? scores.reduce((sum, rs) => sum + rs.confidence, 0) / scores.length
        : 0

    groupScores.push({
      group,
      label: GROUP_LABELS[group],
      score: roundScore(groupScore),
      confidence: groupConfidence,
      regionScores: scores,
    })
  }

  // 4. Compute overall score
  let overallWeightSum = 0
  let overallScoreSum = 0
  for (const gs of groupScores) {
    const w = GROUP_WEIGHTS[gs.group] * gs.confidence
    overallScoreSum += gs.score * w
    overallWeightSum += w
  }

  const overallScore = overallWeightSum > 0 ? roundScore(overallScoreSum / overallWeightSum) : 50
  const overallConfidence =
    overallWeightSum > 0
      ? groupScores.reduce((sum, gs) => sum + gs.confidence * GROUP_WEIGHTS[gs.group], 0) /
        groupScores.reduce((sum, gs) => sum + GROUP_WEIGHTS[gs.group], 0)
      : 0

  // 5. Top concerns & strongest areas (confidence >= 0.3)
  const confident = regionScores.filter((rs) => rs.confidence >= 0.3)
  const sortedAsc = [...confident].sort((a, b) => a.score - b.score)
  const sortedDesc = [...confident].sort((a, b) => b.score - a.score)
  const topConcerns = sortedAsc.slice(0, 3)
  const strongestAreas = sortedDesc.slice(0, 3)

  // 6. Caution flags (Turkish)
  const cautionFlags: string[] = []
  const { usableRegions, skippedRegions } = qualityGates

  if (overallConfidence < 0.4) {
    cautionFlags.push('Genel güvenilirlik düşük — sonuçlar dikkatli yorumlanmalıdır.')
  }
  if (skippedRegions > usableRegions) {
    cautionFlags.push('Analiz edilemeyen bölge sayısı fazla — yeniden çekim önerilir.')
  }

  // Count usable paired regions
  let usablePairCount = 0
  for (const [left, right] of PAIRED_REGIONS) {
    if (featureMap.has(left) && featureMap.has(right)) {
      usablePairCount++
    }
  }
  if (usablePairCount < 2) {
    cautionFlags.push('Simetri değerlendirmesi için yeterli bölge çifti mevcut değil.')
  }

  return {
    overallScore,
    overallConfidence,
    usableRegionsCount: usableRegions,
    skippedRegionsCount: skippedRegions,
    groupScores,
    regionScores,
    topConcerns,
    strongestAreas,
    cautionFlags,
  }
}
