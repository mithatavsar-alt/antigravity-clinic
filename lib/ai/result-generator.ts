/**
 * Result Text Generator
 *
 * Generates patient-facing and doctor-facing text summaries
 * from enhanced analysis results.
 *
 * All outputs are framed as "AI-supported pre-assessment" and
 * clearly state that doctor review is recommended.
 */

import type { EnhancedAnalysisResult, FocusArea } from './types'
import type { StructuredObservation } from './pipeline/types'
import { IMPACT_WEIGHT } from './pipeline/types'
import type { ConcernArea } from '@/types/lead'
import { concernAreaLabels } from '@/types/lead'

// ─── Patient-facing text ────────────────────────────────────

export function generatePatientSummaryText(
  result: EnhancedAnalysisResult,
  concernArea?: ConcernArea
): string {
  const { geometry, focusAreas, qualityScore, ageEstimation } = result
  const area = concernArea ?? 'genel_yuz_dengesi'
  const concernLabel = concernAreaLabels[area]

  const avg = Math.round((geometry.scores.symmetry + geometry.scores.proportion) / 2)
  const parts: string[] = []

  // ── A. Overall Impression — warm, balanced, human ──
  if (avg >= 70) {
    parts.push('Genel görünümde doğal yüz dengesi korunmuş ve uyumlu bir profil gözlenmektedir.')
  } else if (avg >= 50) {
    parts.push('Genel görünümde yüz dengesi büyük ölçüde korunmuş; bazı bölgelerde hafif farklılıklar dikkat çekmektedir.')
  } else {
    parts.push('Yüz dengesinde bazı bölgelerde belirgin farklılıklar gözlenmektedir.')
  }

  // ── Age (only if confident) ──
  if (ageEstimation && ageEstimation.confidence !== 'low') {
    const [min, max] = ageEstimation.estimatedRange
    const confNote = ageEstimation.confidence === 'medium' ? ' (referans niteliğinde)' : ''
    parts.push(`Tahmini yaş aralığı: ${min}–${max}${confNote}.`)
  }

  // ── B. Strongest Areas ──
  const strongAreas = focusAreas.filter((a) => a.score <= 35)
  if (strongAreas.length > 0) {
    const names = strongAreas.slice(0, 2).map((a) => a.label).join(' ve ')
    parts.push(`${names} bölge${strongAreas.length > 1 ? 'leri' : 'si'} güçlü ve dengeli görünmektedir.`)
  }

  // ── C. Improvement Potential ──
  const improvementAreas = focusAreas.filter((a) => a.score > 50).slice(0, 3)
  if (improvementAreas.length > 0) {
    const names = improvementAreas.map((a) => a.label).join(', ')
    parts.push(`En belirgin odak alanları: ${names}.`)
  }

  // ── Concern area context ──
  if (area !== 'genel_yuz_dengesi') {
    parts.push(`${concernLabel} alanında detaylı değerlendirme için uzman görüşü önerilir.`)
  }

  // ── Quality caveat (only if truly needed) ──
  if (qualityScore < 40) {
    parts.push('Görüntü koşulları bazı bölgelerde değerlendirme doğruluğunu sınırlamış olabilir.')
  }

  parts.push('Sonuçlar ön değerlendirme niteliğindedir.')

  return parts.join(' ')
}

// ─── Internal candidate builder (shared by suggestions + focus labels) ───

interface Finding { text: string; priority: number; region: string }

function buildCandidates(result: EnhancedAnalysisResult): Finding[] {
  const { geometry, focusAreas, wrinkleAnalysis } = result
  const candidates: Finding[] = []

  // ── 1. Wrinkle-based findings (highest value — directly observed signals) ──
  // Only include regions with sufficient evidence strength. Insufficient evidence
  // regions get a generic low-confidence caveat instead of false claims.
  if (wrinkleAnalysis) {
    /** Helper: check if a region's evidence is strong enough to make claims */
    const isReliable = (r: { evidenceStrength?: string; confidence: number }) =>
      r.evidenceStrength !== 'insufficient' && r.confidence >= 0.3

    /** Intensity qualifier — soften for weak evidence */
    const getIntensity = (score: number, evidence?: string) => {
      if (evidence === 'weak') return score >= 55 ? 'olası belirgin' : score >= 30 ? 'olası orta düzey' : 'hafif'
      return score >= 55 ? 'belirgin' : score >= 30 ? 'orta düzey' : 'hafif'
    }

    const forehead = wrinkleAnalysis.regions.find((r) => r.region === 'forehead')
    if (forehead && forehead.score >= 12 && isReliable(forehead)) {
      const intensity = getIntensity(forehead.score, forehead.evidenceStrength)
      const detail = forehead.score >= 45
        ? ' Hekiminiz uygun görürse mimik çizgilerine yönelik değerlendirme yapılabilir.'
        : ''
      candidates.push({
        text: `Alın bölgesinde ${intensity} yatay çizgilenme gözlenmektedir.${detail}`,
        priority: forehead.score + 10,
        region: 'forehead',
      })
    }

    const glabella = wrinkleAnalysis.regions.find((r) => r.region === 'glabella')
    if (glabella && glabella.score >= 20 && isReliable(glabella)) {
      const intensity = getIntensity(glabella.score, glabella.evidenceStrength)
      candidates.push({
        text: `Kaş arası bölgede ${intensity} mimik aktivitesi izleri dikkat çekmektedir.`,
        priority: glabella.score,
        region: 'glabella',
      })
    }

    // Bilateral regions: report asymmetry when significant, otherwise summarize
    const crowL = wrinkleAnalysis.regions.find((r) => r.region === 'crow_feet_left')
    const crowR = wrinkleAnalysis.regions.find((r) => r.region === 'crow_feet_right')
    const crowScores = [crowL, crowR].filter(Boolean).filter(r => isReliable(r!))
    if (crowScores.length > 0) {
      const crowMax = Math.max(...crowScores.map(r => r!.score))
      if (crowMax >= 20) {
        const delta = crowL && crowR ? Math.abs(crowL.score - crowR.score) : 0
        const bestCrow = crowScores.sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0]!
        const intensity = getIntensity(crowMax, bestCrow.evidenceStrength)
        const asymNote = delta > 15 && crowL && crowR
          ? ` ${crowL.score > crowR.score ? 'Sol' : 'Sağ'} tarafta daha belirgin.`
          : ''
        candidates.push({
          text: `Göz kenarında ${intensity} mimik çizgileri gözlenmektedir.${asymNote}`,
          priority: crowMax,
          region: 'crow_feet',
        })
      }
    }

    const ueL = wrinkleAnalysis.regions.find((r) => r.region === 'under_eye_left')
    const ueR = wrinkleAnalysis.regions.find((r) => r.region === 'under_eye_right')
    const ueScores = [ueL, ueR].filter(Boolean).filter(r => isReliable(r!))
    if (ueScores.length > 0) {
      const ueMax = Math.max(...ueScores.map(r => r!.score))
      if (ueMax >= 25) {
        const bestUe = ueScores.sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0]!
        const intensity = getIntensity(ueMax, bestUe.evidenceStrength)
        const detail = ueMax >= 45 ? ' Klinik değerlendirme ile netleştirilebilir.' : ''
        const delta = ueL && ueR ? Math.abs(ueL.score - ueR.score) : 0
        const asymNote = delta > 15 && ueL && ueR
          ? ` ${ueL.score > ueR.score ? 'Sol' : 'Sağ'} tarafta daha belirgin.`
          : ''
        candidates.push({
          text: `Göz altı bölgesinde ${intensity} doku farklılığı gözlenmektedir.${asymNote}${detail}`,
          priority: ueMax,
          region: 'under_eye',
        })
      }
    }

    const nlL = wrinkleAnalysis.regions.find((r) => r.region === 'nasolabial_left')
    const nlR = wrinkleAnalysis.regions.find((r) => r.region === 'nasolabial_right')
    const nlScores = [nlL, nlR].filter(Boolean).filter(r => isReliable(r!))
    if (nlScores.length > 0) {
      const nlMax = Math.max(...nlScores.map(r => r!.score))
      if (nlMax >= 25) {
        const bestNl = nlScores.sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0]!
        const intensity = getIntensity(nlMax, bestNl.evidenceStrength)
        const detail = nlMax >= 45 ? ' Minimal dokunuşlarla desteklenebilir.' : ''
        const delta = nlL && nlR ? Math.abs(nlL.score - nlR.score) : 0
        const asymNote = delta > 15 && nlL && nlR
          ? ` ${nlL.score > nlR.score ? 'Sol' : 'Sağ'} tarafta daha belirgin.`
          : ''
        candidates.push({
          text: `Nazolabial bölgede ${intensity} kıvrım derinliği gözlenmektedir.${asymNote}${detail}`,
          priority: nlMax,
          region: 'nasolabial',
        })
      }
    }

    const jawline = wrinkleAnalysis.regions.find((r) => r.region === 'jawline')
    if (jawline && jawline.score >= 25 && isReliable(jawline)) {
      const intensity = getIntensity(jawline.score, jawline.evidenceStrength)
      candidates.push({
        text: `Çene hattında ${intensity} kontur yumuşaması gözlenmektedir.`,
        priority: jawline.score,
        region: 'jawline',
      })
    }

    // Quality caveat only if majority of regions lack evidence
    const insufficientCount = wrinkleAnalysis.regions.filter(
      (r) => r.evidenceStrength === 'insufficient'
    ).length
    if (insufficientCount > wrinkleAnalysis.regions.length * 0.6) {
      candidates.push({
        text: 'Bazı bölgelerde görüntü koşulları detaylı değerlendirmeyi sınırlamaktadır.',
        priority: 5,
        region: 'quality_caveat',
      })
    }
  }

  // ── 2. Geometry-based findings ──
  if (geometry.metrics.symmetryRatio < 0.85) {
    candidates.push({
      text: 'Yüz simetrisinde hafif farklılıklar dikkat çekmektedir; çoğu yüzde doğal olarak gözlenen bir durumdur.',
      priority: Math.round((1 - geometry.metrics.symmetryRatio) * 80),
      region: 'symmetry',
    })
  }

  if (geometry.metrics.noseToFaceWidth > 0.32) {
    candidates.push({
      text: 'Burun oranlarında yüz geneline kıyasla farklılık gözlenmektedir.',
      priority: Math.round((geometry.metrics.noseToFaceWidth - 0.25) * 140),
      region: 'nose',
    })
  }

  // ── 3. Focus area insights (only for uncovered regions) ──
  const coveredRegions = new Set(candidates.map((c) => c.region))
  const topFocusAreas = focusAreas
    .filter((a) => a.score > 55 && a.doctorReviewRecommended)
    .slice(0, 3)

  for (const area of topFocusAreas) {
    const regionKey = area.region === 'forehead_glabella' ? 'forehead'
      : area.region === 'crow_feet' ? 'crow_feet'
      : area.region === 'under_eye' ? 'under_eye'
      : area.region === 'lip_chin_jawline' ? 'jawline'
      : area.region
    if (!coveredRegions.has(regionKey)) {
      candidates.push({
        text: area.insight,
        priority: area.score,
        region: regionKey,
      })
      coveredRegions.add(regionKey)
    }
  }

  return candidates
}

/** Select top findings with region diversity */
function selectTopFindings(candidates: Finding[], limit: number): Finding[] {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority)
  const selected: Finding[] = []
  const usedRegions = new Set<string>()
  for (const c of sorted) {
    if (selected.length >= limit) break
    if (usedRegions.has(c.region)) continue
    selected.push(c)
    usedRegions.add(c.region)
  }
  return selected
}

// ─── Suggestions (patient-safe, observation-first) ──────────

/**
 * Generates "Estetik Tespitler" — observation-first findings with optional
 * soft advisories. Includes wrinkle analysis findings (especially forehead),
 * balances across all facial regions, and limits to top 3–5 findings.
 *
 * When observations are available (from the observation engine), uses them
 * for richer, evidence-grounded text. Falls back to legacy candidates.
 *
 * Tone: clinical, calm, non-commercial. Never prescriptive.
 */
export function generateSuggestions(
  result: EnhancedAnalysisResult,
  observations?: StructuredObservation[],
): string[] {
  if (observations && observations.length > 0) {
    return generateSuggestionsFromObservations(observations)
  }

  const candidates = buildCandidates(result)
  const top = selectTopFindings(candidates, 5)
  const suggestions = top.map((c) => c.text)

  if (suggestions.length === 0) {
    suggestions.push('Yüz oranları genel olarak dengeli ve uyumlu görünmektedir. Detaylı değerlendirme için uzman görüşü önerilir.')
  }

  return suggestions
}

/**
 * Generate suggestions from structured observations.
 * Picks the most impactful non-positive findings + 1 positive strength.
 * Each suggestion text is unique because observations are area-specific.
 *
 * RELIABILITY: Observations with limited visibility or low confidence
 * get softer language. View attribution is appended when available.
 */
function generateSuggestionsFromObservations(
  observations: StructuredObservation[],
): string[] {
  // Sort by weighted importance
  const sorted = [...observations]
    .filter(o => o.visibility !== 'not_evaluable')
    .sort((a, b) => {
      const aw = (IMPACT_WEIGHT[a.impact] ?? 1) * a.score
      const bw = (IMPACT_WEIGHT[b.impact] ?? 1) * b.score
      return bw - aw
    })

  const suggestions: string[] = []
  const usedAreas = new Set<string>()

  // Top non-positive findings (max 4)
  // Skip limited-visibility regions entirely; they add noise, not insight
  for (const o of sorted) {
    if (suggestions.length >= 4) break
    if (o.isPositive) continue
    if (usedAreas.has(o.area)) continue
    if (o.confidence < 25 || o.visibility === 'limited') continue

    let text = o.observation

    // Append evidence summary if available (from multi-view fusion)
    if (o.evidenceSummary && o.contributingViews && o.contributingViews.length > 0) {
      // Only append for multi-view supported findings
      if (o.contributingViews.length >= 2) {
        text = text.replace(/\.$/, '') + ' — çoklu açıdan desteklenmektedir.'
      }
    }

    suggestions.push(text)
    usedAreas.add(o.area)
  }

  // Add best positive observation as a strength note
  const bestPositive = sorted.find(o => o.isPositive && !usedAreas.has(o.area) && o.visibility === 'clear')
  if (bestPositive && suggestions.length < 5) {
    suggestions.push(bestPositive.observation)
  }

  if (suggestions.length === 0) {
    suggestions.push('Yüz oranları genel olarak dengeli ve uyumlu görünmektedir. Detaylı değerlendirme için uzman görüşü önerilir.')
  }

  return suggestions.slice(0, 5)
}

// ─── Focus area labels derived from the same findings ───────

/** Region → clean patient-facing Turkish label */
const REGION_LABEL_MAP: Record<string, string> = {
  forehead: 'Alın Çizgileri',
  glabella: 'Kaş Arası',
  crow_feet: 'Kaz Ayağı',
  under_eye: 'Göz Altı',
  nasolabial: 'Nazolabial Hat',
  jawline: 'Alt Yüz Hattı',
  symmetry: 'Yüz Simetrisi',
  nose: 'Burun Oranı',
  mid_face: 'Orta Yüz',
  lip_chin_jawline: 'Alt Yüz Hattı',
}

/**
 * Derives "Odak Alanları" labels from the same candidate pool as
 * "Estetik Tespitler", ensuring perfect consistency between the two sections.
 * Returns 2–4 clean Turkish labels for the top findings.
 */
export function generateFocusAreaLabels(
  resultOrFocusAreas: EnhancedAnalysisResult | FocusArea[],
  observations?: StructuredObservation[],
): string[] {
  // Observation-based path: use structured observations for labels
  if (observations && observations.length > 0) {
    return observations
      .filter(o => !o.isPositive && o.visibility !== 'not_evaluable' && o.score > 20)
      .sort((a, b) => (IMPACT_WEIGHT[b.impact] ?? 1) * b.score - (IMPACT_WEIGHT[a.impact] ?? 1) * a.score)
      .slice(0, 4)
      .map(o => o.label)
      .filter(Boolean)
      .concat([] as string[]) // Ensure array
      || ['Genel Yüz Dengesi']
  }

  // Support both new (EnhancedAnalysisResult) and legacy (FocusArea[]) call signatures
  if (Array.isArray(resultOrFocusAreas)) {
    // Legacy path: plain FocusArea[] — map labels directly (backward compat)
    return resultOrFocusAreas
      .filter((a) => a.score > 35)
      .slice(0, 4)
      .map((a) => a.label)
  }

  const candidates = buildCandidates(resultOrFocusAreas)
  const top = selectTopFindings(candidates, 4)

  const labels = top
    .map((c) => REGION_LABEL_MAP[c.region])
    .filter((label): label is string => !!label)

  return labels.length > 0 ? labels : ['Genel Yüz Dengesi']
}

// ─── Doctor-facing region score mapping ─────────────────────

/**
 * Maps focus areas to the existing doctor analysis region_scores format.
 * This bridges the new scoring engine with the existing DoctorAnalysis type.
 */
export function mapFocusAreasToRegionScores(
  focusAreas: FocusArea[],
  geometryMetrics: { symmetryRatio: number; faceRatio: number }
): Record<string, number> {
  const regionMap: Record<string, FocusArea | undefined> = {}
  for (const area of focusAreas) {
    regionMap[area.region] = area
  }

  // Convert focus area scores (0-100, higher = more attention needed)
  // to region scores (0-1, higher = more intervention needed)
  const normalize = (score: number) => Math.round(Math.min(1, score / 100) * 100) / 100

  return {
    alin: normalize(regionMap['forehead_glabella']?.score ?? 20),
    glabella: normalize(regionMap['forehead_glabella']?.score ?? 20),
    kaz_ayagi: normalize(regionMap['crow_feet']?.score ?? 15),
    goz_alti: normalize(regionMap['under_eye']?.score ?? 15),
    yanak_orta_yuz: normalize(regionMap['mid_face']?.score ?? 20),
    nazolabial: normalize(regionMap['nasolabial']?.score ?? 20),
    dudak: normalize(regionMap['lip_chin_jawline']?.score ?? 15),
    marionette: normalize((regionMap['nasolabial']?.score ?? 15) * 0.7),
    jawline: normalize(regionMap['lip_chin_jawline']?.score ?? 15),
    cene_ucu: normalize(regionMap['lip_chin_jawline']?.score ?? 15),
    cilt_kalitesi: Math.max(0.15, 0.5 - geometryMetrics.symmetryRatio * 0.3),
    simetri_gozlemi: normalize((1 - geometryMetrics.symmetryRatio) * 100),
  }
}
