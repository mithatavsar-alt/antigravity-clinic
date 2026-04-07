/**
 * Face Region Segmentation Engine — Quality Gates
 *
 * Per-region quality gates with visibility assessment and Turkish reason codes.
 * Determines which regions are usable for analysis based on image quality,
 * landmark availability, and viewing angle.
 */

import type {
  AnalysisRegionId,
  ComputedRegion,
  GlobalQualityGateSummary,
  RegionQualityGate,
  RegionReasonCode,
  RegionVisibility,
} from '../analysis/types'
import type { ImageQualityAssessment, Landmark } from '../ai/types'
import { QUALITY_THRESHOLDS } from '../analysis/constants'

// ─── Turkish Reason Labels ──────────────────────────────

const REASON_LABELS: Record<RegionReasonCode, string> = {
  low_light: 'yetersiz aydınlatma',
  overexposed: 'aşırı parlaklık',
  blurred: 'bulanıklık',
  occluded: 'kapatılmış',
  out_of_frame: 'çerçeve dışı',
  side_not_visible: 'bu açıdan görünmüyor',
  poor_landmarks: 'referans noktalar yetersiz',
  low_resolution: 'düşük çözünürlük',
  insufficient_area: 'bölge çok küçük',
  low_confidence: 'güvenilirlik yetersiz',
  face_mask_excluded: 'yüz alanı dışında',
}

const BLOCKING_CODES = new Set<RegionReasonCode>([
  'low_light',
  'overexposed',
  'blurred',
  'low_resolution',
  'poor_landmarks',
])

// ─── Helpers ────────────────────────────────────────────

function isLandmarkValid(lm: Landmark): boolean {
  return lm.x !== 0 || lm.y !== 0
}

function collectGlobalReasonCodes(
  imageQuality: ImageQualityAssessment,
): RegionReasonCode[] {
  const codes: RegionReasonCode[] = []

  if (imageQuality.brightness < QUALITY_THRESHOLDS.minBrightness) {
    codes.push('low_light')
  }
  if (imageQuality.brightness > QUALITY_THRESHOLDS.maxBrightness) {
    codes.push('overexposed')
  }
  if (imageQuality.sharpness < QUALITY_THRESHOLDS.minSharpness) {
    codes.push('blurred')
  }
  if (imageQuality.resolution < 0.3) {
    codes.push('low_resolution')
  }

  return codes
}

function evaluateRegion(
  region: ComputedRegion,
  imageQuality: ImageQualityAssessment,
  landmarks: Landmark[],
  globalCodes: RegionReasonCode[],
): RegionQualityGate {
  const { definition } = region

  // If region is already not usable from geometry, keep existing visibility
  if (!region.usable) {
    return {
      regionId: definition.id,
      visibility: region.visibility,
      proceed: false,
      skipReason: buildSkipReason(
        definition.label,
        region.visibility.reasonCodes,
      ),
    }
  }

  // Symmetry zone (virtual) — let it through if enabled
  if (definition.group === 'symmetry') {
    const visibility: RegionVisibility = {
      status: definition.enabled ? 'visible' : 'not_visible',
      usability: definition.enabled ? 'usable' : 'not_usable',
      confidence: definition.enabled ? 1.0 : 0,
      reasonCodes: [],
    }
    return {
      regionId: definition.id,
      visibility,
      proceed: definition.enabled,
    }
  }

  // Collect reason codes for this region
  const reasonCodes: RegionReasonCode[] = [...globalCodes]
  let confidence = 1.0

  // Check side visibility
  if (
    imageQuality.angleDeviation > 0.2 &&
    (definition.side === 'left' || definition.side === 'right')
  ) {
    reasonCodes.push('side_not_visible')
  }

  // Check landmark quality within region
  const regionLandmarks = definition.landmarkIndices
    .filter((idx) => idx < landmarks.length)
    .map((idx) => landmarks[idx])

  if (regionLandmarks.length > 0) {
    const validCount = regionLandmarks.filter(isLandmarkValid).length
    const ratio = validCount / regionLandmarks.length

    if (ratio < 0.6) {
      reasonCodes.push('poor_landmarks')
    }

    // Reduce confidence proportionally to landmark ratio
    confidence *= ratio
  }

  // Apply confidence reductions
  for (const code of reasonCodes) {
    if (BLOCKING_CODES.has(code)) {
      confidence *= 0.3
    } else if (code === 'side_not_visible') {
      confidence *= 0.6
    }
  }

  // Clamp confidence
  confidence = Math.max(0, Math.min(1, confidence))

  // Determine blocking
  const hasBlockingIssue = reasonCodes.some((c) => BLOCKING_CODES.has(c))
  const usable =
    confidence >= definition.minConfidenceThreshold && !hasBlockingIssue

  // Determine visibility status
  let status: RegionVisibility['status'] = 'visible'
  if (!usable) {
    status = 'not_visible'
  } else if (reasonCodes.length > 0) {
    status = 'partially_visible'
  }

  const visibility: RegionVisibility = {
    status,
    usability: usable ? 'usable' : 'not_usable',
    confidence,
    reasonCodes,
  }

  const gate: RegionQualityGate = {
    regionId: definition.id,
    visibility,
    proceed: usable,
  }

  if (!usable) {
    gate.skipReason = buildSkipReason(definition.label, reasonCodes)
  }

  return gate
}

// ─── Public API ─────────────────────────────────────────

/**
 * Run quality gates for all computed regions.
 * Returns a global summary with per-region gate results.
 */
export function runRegionQualityGates(
  regions: ComputedRegion[],
  imageQuality: ImageQualityAssessment,
  landmarks: Landmark[],
): GlobalQualityGateSummary {
  const globalCodes = collectGlobalReasonCodes(imageQuality)

  const regionGates = regions.map((region) =>
    evaluateRegion(region, imageQuality, landmarks, globalCodes),
  )

  const usableCount = regionGates.filter((g) => g.proceed).length
  const skippedCount = regionGates.filter((g) => !g.proceed).length

  return {
    totalRegions: regions.length,
    usableRegions: usableCount,
    skippedRegions: skippedCount,
    regionGates,
    imageUsable: usableCount >= 3,
    imageQualityScore: imageQuality.overallScore,
    globalReasonCodes: globalCodes,
  }
}

/**
 * Check whether a specific region passed quality gates.
 */
export function isRegionUsable(
  gates: GlobalQualityGateSummary,
  regionId: AnalysisRegionId,
): boolean {
  const gate = gates.regionGates.find((g) => g.regionId === regionId)
  return gate?.proceed ?? false
}

/**
 * Build a Turkish skip-reason string for a region.
 *
 * Format: "{regionLabel}: {reasons} nedeniyle değerlendirilemedi."
 */
export function buildSkipReason(
  regionLabel: string,
  codes: RegionReasonCode[],
): string {
  if (codes.length === 0) {
    return `${regionLabel}: bilinmeyen neden nedeniyle değerlendirilemedi.`
  }

  const reasons = codes.map((c) => REASON_LABELS[c]).join(', ')
  return `${regionLabel}: ${reasons} nedeniyle değerlendirilemedi.`
}
