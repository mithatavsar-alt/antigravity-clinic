/**
 * Decision Filter (Final Gate before UI)
 *
 * For each metric: IF confidence < threshold → REMOVE FROM OUTPUT
 * System prefers: LESS DATA + HIGH TRUST
 *
 * This module takes all validated metrics and produces the final
 * filtered set that reaches the UI.
 */

import type {
  ValidatedMetric,
  TrustFinding,
  PipelineConfig,
  YoungFaceProfile,
  StructuredObservation,
} from './types'
import { IMPACT_WEIGHT } from './types'
import type {
  WrinkleRegionResult,
  FocusArea,
  AgeEstimation,
  SymmetryAnalysis,
  SkinTextureProfile,
  LipAnalysis,
} from '../types'

// ─── Filter results ────────────────────────────────────────

export interface FilteredResults {
  /** Wrinkle regions that passed the filter */
  shownWrinkles: ValidatedMetric<WrinkleRegionResult>[]
  /** Wrinkle regions shown with soft language */
  softWrinkles: ValidatedMetric<WrinkleRegionResult>[]
  /** Wrinkle regions suppressed */
  hiddenWrinkles: ValidatedMetric<WrinkleRegionResult>[]
  /** Focus areas that passed the filter */
  shownFocusAreas: ValidatedMetric<FocusArea>[]
  /** Focus areas shown with soft language */
  softFocusAreas: ValidatedMetric<FocusArea>[]
  /** Focus areas suppressed */
  hiddenFocusAreas: ValidatedMetric<FocusArea>[]
  /** Age — show, soft, or null (hidden) */
  age: ValidatedMetric<AgeEstimation> | null
  /** Symmetry — show, soft, or null */
  symmetry: ValidatedMetric<SymmetryAnalysis> | null
  /** Skin texture — show, soft, or null */
  skinTexture: ValidatedMetric<SkinTextureProfile> | null
  /** Lip analysis — show, soft, or null */
  lipAnalysis: ValidatedMetric<LipAnalysis> | null
  /** Trust-gated findings for the patient */
  findings: TrustFinding[]
  /** Focus area labels (only for shown/soft items) */
  focusLabels: string[]
  /** Counts */
  totalShown: number
  totalSoft: number
  totalSuppressed: number
}

/**
 * Apply the final decision filter to all validated metrics.
 * This is the LAST gate before data reaches the UI.
 */
export function applyDecisionFilter(
  wrinkles: ValidatedMetric<WrinkleRegionResult>[],
  focusAreas: ValidatedMetric<FocusArea>[],
  age: ValidatedMetric<AgeEstimation> | null,
  symmetry: ValidatedMetric<SymmetryAnalysis> | null,
  skinTexture: ValidatedMetric<SkinTextureProfile> | null,
  lipAnalysis: ValidatedMetric<LipAnalysis> | null,
  youngProfile: YoungFaceProfile,
  _config: PipelineConfig,
  observations?: StructuredObservation[],
): FilteredResults {
  // ── Wrinkles ──
  const shownWrinkles = wrinkles.filter(w => w.decision === 'show')
  const softWrinkles = wrinkles.filter(w => w.decision === 'soft')
  const hiddenWrinkles = wrinkles.filter(w => w.decision === 'hide')

  // ── Focus areas ──
  const shownFocusAreas = focusAreas.filter(f => f.decision === 'show')
  const softFocusAreas = focusAreas.filter(f => f.decision === 'soft')
  const hiddenFocusAreas = focusAreas.filter(f => f.decision === 'hide')

  // ── Age: only show if decision allows ──
  const filteredAge = age && age.decision !== 'hide' ? age : null

  // ── Symmetry: HIGH RELIABILITY — always show if available ──
  const filteredSymmetry = symmetry && symmetry.decision !== 'hide' ? symmetry : null

  // ── Skin texture ──
  const filteredSkinTexture = skinTexture && skinTexture.decision !== 'hide' ? skinTexture : null

  // ── Lip analysis ──
  const filteredLipAnalysis = lipAnalysis && lipAnalysis.decision !== 'hide' ? lipAnalysis : null

  // ── Build findings ──
  const findings = observations
    ? buildFindingsFromObservations(observations, youngProfile)
    : buildFindings(
      shownWrinkles,
      softWrinkles,
      shownFocusAreas,
      softFocusAreas,
      filteredSymmetry,
      youngProfile,
    )

  // ── Focus labels ──
  const focusLabels = observations
    ? buildFocusLabelsFromObservations(observations)
    : buildFocusLabels(
      shownWrinkles,
      softWrinkles,
      shownFocusAreas,
      softFocusAreas,
    )

  const totalShown = shownWrinkles.length + shownFocusAreas.length +
    (filteredAge?.decision === 'show' ? 1 : 0) +
    (filteredSymmetry?.decision === 'show' ? 1 : 0) +
    (filteredSkinTexture?.decision === 'show' ? 1 : 0) +
    (filteredLipAnalysis?.decision === 'show' ? 1 : 0)

  const totalSoft = softWrinkles.length + softFocusAreas.length +
    (filteredAge?.decision === 'soft' ? 1 : 0) +
    (filteredSymmetry?.decision === 'soft' ? 1 : 0) +
    (filteredSkinTexture?.decision === 'soft' ? 1 : 0) +
    (filteredLipAnalysis?.decision === 'soft' ? 1 : 0)

  const totalSuppressed = hiddenWrinkles.length + hiddenFocusAreas.length +
    (age && age.decision === 'hide' ? 1 : 0) +
    (symmetry && symmetry.decision === 'hide' ? 1 : 0) +
    (skinTexture && skinTexture.decision === 'hide' ? 1 : 0) +
    (lipAnalysis && lipAnalysis.decision === 'hide' ? 1 : 0)

  return {
    shownWrinkles,
    softWrinkles,
    hiddenWrinkles,
    shownFocusAreas,
    softFocusAreas,
    hiddenFocusAreas,
    age: filteredAge,
    symmetry: filteredSymmetry,
    skinTexture: filteredSkinTexture,
    lipAnalysis: filteredLipAnalysis,
    findings,
    focusLabels,
    totalShown,
    totalSoft,
    totalSuppressed,
  }
}

// ─── Observation-Based Finding Builder ─────────────────────

/**
 * Build findings from structured observations.
 * Uses the observation engine's per-area output for richer, more varied text.
 * Each finding is unique because observations are area-specific.
 */
function buildFindingsFromObservations(
  observations: StructuredObservation[],
  youngProfile: YoungFaceProfile,
): TrustFinding[] {
  const findings: TrustFinding[] = []

  // Sort by impact weight and score — most notable findings first
  const sorted = [...observations]
    .filter(o => o.visibility !== 'not_evaluable')
    .sort((a, b) => {
      const aw = (IMPACT_WEIGHT[a.impact] ?? 1) * a.score
      const bw = (IMPACT_WEIGHT[b.impact] ?? 1) * b.score
      return bw - aw
    })

  // Priority 1: Non-positive observations with clear/partial visibility (notable findings)
  for (const o of sorted) {
    if (findings.length >= 4) break
    if (o.isPositive) continue
    if (o.visibility === 'limited' && o.confidence < 30) continue

    const isSoft = o.visibility === 'limited' || o.confidence < 45
    const band = o.confidence >= 70 ? 'high' as const
      : o.confidence >= 40 ? 'moderate' as const
      : 'low' as const

    findings.push({
      text: o.observation,
      region: o.area,
      band,
      isSoft,
    })
  }

  // Priority 2: Best positive observation (strength)
  const bestPositive = sorted.find(o => o.isPositive && o.visibility !== 'limited')
  if (bestPositive && findings.length < 5) {
    findings.push({
      text: bestPositive.observation,
      region: bestPositive.area,
      band: 'high',
      isSoft: false,
    })
  }

  // Young face: ensure positive note if few findings
  if (youngProfile.active && findings.filter(f => !f.isSoft).length <= 1) {
    const freshness = observations.find(o => o.area === 'fatigue_freshness')
    if (freshness && freshness.isPositive) {
      findings.push({
        text: freshness.observation,
        region: 'fatigue_freshness',
        band: 'high',
        isSoft: false,
      })
    } else {
      findings.push({
        text: 'Cilt dokusu genel olarak düzgün ve sağlıklı görünmektedir.',
        region: 'skin_health',
        band: 'high',
        isSoft: false,
      })
    }
  }

  // Fallback
  if (findings.length === 0) {
    findings.push({
      text: 'Belirgin bulgu saptanmadı. Genel değerlendirme için uzman görüşü önerilir.',
      region: 'general',
      band: 'high',
      isSoft: false,
    })
  }

  return findings.slice(0, 5)
}

/** Build focus labels from observations — top non-positive areas by impact */
function buildFocusLabelsFromObservations(
  observations: StructuredObservation[],
): string[] {
  const labels = observations
    .filter(o => !o.isPositive && o.visibility !== 'not_evaluable' && o.score > 20)
    .sort((a, b) => (IMPACT_WEIGHT[b.impact] ?? 1) * b.score - (IMPACT_WEIGHT[a.impact] ?? 1) * a.score)
    .slice(0, 4)
    .map(o => o.label)

  return labels.length > 0 ? labels : ['Genel Yüz Dengesi']
}

// ─── Legacy Finding Builder ───────────────────────────────

/** Region key → Turkish label for findings */
const FINDING_LABELS: Record<string, string> = {
  forehead: 'Alın Bölgesi',
  glabella: 'Kaş Arası',
  crow_feet_left: 'Göz Kenarı',
  crow_feet_right: 'Göz Kenarı',
  under_eye_left: 'Göz Altı',
  under_eye_right: 'Göz Altı',
  nasolabial_left: 'Nazolabial',
  nasolabial_right: 'Nazolabial',
  jawline: 'Çene Hattı',
  marionette_left: 'Ağız Kenarı',
  marionette_right: 'Ağız Kenarı',
  cheek_left: 'Yanak',
  cheek_right: 'Yanak',
  forehead_glabella: 'Alın / Glabella',
  crow_feet: 'Kaz Ayağı',
  under_eye: 'Göz Altı',
  mid_face: 'Orta Yüz',
  lip_chin_jawline: 'Alt Yüz',
  nasolabial: 'Nazolabial',
  nose: 'Burun',
}

function buildFindings(
  shownWrinkles: ValidatedMetric<WrinkleRegionResult>[],
  softWrinkles: ValidatedMetric<WrinkleRegionResult>[],
  shownFocusAreas: ValidatedMetric<FocusArea>[],
  softFocusAreas: ValidatedMetric<FocusArea>[],
  symmetry: ValidatedMetric<SymmetryAnalysis> | null,
  youngProfile: YoungFaceProfile,
): TrustFinding[] {
  const findings: TrustFinding[] = []
  const usedRegions = new Set<string>()

  // Priority 1: HIGH RELIABILITY — symmetry (always first if notable)
  if (symmetry && symmetry.decision !== 'hide' && symmetry.data.overallScore < 85) {
    findings.push({
      text: symmetry.data.overallScore >= 70
        ? 'Yüz simetrisi genel olarak dengeli gözlenmektedir.'
        : 'Yüz simetrisinde hafif farklılık gözlenmektedir. Detaylı değerlendirme için uzman görüşü önerilir.',
      region: 'symmetry',
      band: symmetry.band,
      isSoft: symmetry.decision === 'soft',
    })
    usedRegions.add('symmetry')
  }

  // Priority 2: Shown wrinkle findings (confident)
  for (const w of shownWrinkles) {
    const regionGroup = getRegionGroup(w.data.region)
    if (usedRegions.has(regionGroup)) continue

    const intensity = w.data.score >= 55 ? 'belirgin' : w.data.score >= 30 ? 'orta düzey' : 'hafif'
    const label = FINDING_LABELS[w.data.region] ?? w.data.label

    findings.push({
      text: `${label} bölgesinde ${intensity} tekstür değişimi gözlenmektedir.`,
      region: regionGroup,
      band: w.band,
      isSoft: false,
    })
    usedRegions.add(regionGroup)
  }

  // Priority 3: Shown focus area findings
  for (const f of shownFocusAreas) {
    const regionGroup = getRegionGroup(f.data.region)
    if (usedRegions.has(regionGroup)) continue

    findings.push({
      text: f.data.insight,
      region: regionGroup,
      band: f.band,
      isSoft: false,
    })
    usedRegions.add(regionGroup)
  }

  // Priority 4: Soft language findings (limited to 2 max)
  let softCount = 0
  for (const w of softWrinkles) {
    if (softCount >= 2) break
    const regionGroup = getRegionGroup(w.data.region)
    if (usedRegions.has(regionGroup)) continue

    findings.push({
      text: w.softLanguage ?? `${w.data.label}: sınırlı veri — uzman değerlendirmesi önerilir.`,
      region: regionGroup,
      band: w.band,
      isSoft: true,
    })
    usedRegions.add(regionGroup)
    softCount++
  }

  // If young face and few findings: add positive note
  if (youngProfile.active && findings.length <= 1) {
    findings.push({
      text: 'Cilt dokusu genel olarak düzgün ve sağlıklı görünmektedir.',
      region: 'skin_health',
      band: 'high',
      isSoft: false,
    })
  }

  // Always add: if no findings at all
  if (findings.length === 0) {
    findings.push({
      text: 'Belirgin bulgu saptanmadı. Genel değerlendirme için uzman görüşü önerilir.',
      region: 'general',
      band: 'high',
      isSoft: false,
    })
  }

  // Cap at 5 findings
  return findings.slice(0, 5)
}

function buildFocusLabels(
  shownWrinkles: ValidatedMetric<WrinkleRegionResult>[],
  softWrinkles: ValidatedMetric<WrinkleRegionResult>[],
  shownFocusAreas: ValidatedMetric<FocusArea>[],
  softFocusAreas: ValidatedMetric<FocusArea>[],
): string[] {
  const labels: string[] = []
  const usedRegions = new Set<string>()

  // Shown wrinkles first
  for (const w of shownWrinkles) {
    const group = getRegionGroup(w.data.region)
    if (usedRegions.has(group)) continue
    labels.push(FINDING_LABELS[w.data.region] ?? w.data.label)
    usedRegions.add(group)
  }

  // Then shown focus areas
  for (const f of shownFocusAreas) {
    const group = getRegionGroup(f.data.region)
    if (usedRegions.has(group)) continue
    labels.push(f.data.label)
    usedRegions.add(group)
  }

  // Then soft items (limited)
  for (const w of [...softWrinkles, ...softFocusAreas]) {
    if (labels.length >= 4) break
    const group = getRegionGroup('data' in w && 'region' in w.data ? w.data.region : '')
    if (usedRegions.has(group)) continue
    const label = 'label' in w.data ? (w.data as { label: string }).label : ''
    if (label) {
      labels.push(label)
      usedRegions.add(group)
    }
  }

  return labels.length > 0 ? labels.slice(0, 4) : ['Genel Yüz Dengesi']
}

// ─── Helpers ───────────────────────────────────────────────

/** Group left/right variants into a single region */
function getRegionGroup(region: string): string {
  if (region.startsWith('crow_feet')) return 'crow_feet'
  if (region.startsWith('under_eye')) return 'under_eye'
  if (region.startsWith('nasolabial')) return 'nasolabial'
  if (region.startsWith('marionette')) return 'marionette'
  if (region.startsWith('cheek')) return 'cheek'
  return region
}
