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
import type { ConcernArea } from '@/types/lead'
import { concernAreaLabels } from '@/types/lead'

// ─── Patient-facing text ────────────────────────────────────

export function generatePatientSummaryText(
  result: EnhancedAnalysisResult,
  concernArea?: ConcernArea
): string {
  const { geometry, focusAreas, qualityScore, ageEstimation, imageQuality } = result
  const area = concernArea ?? 'genel_yuz_dengesi'
  const concernLabel = concernAreaLabels[area]

  const avg = Math.round((geometry.scores.symmetry + geometry.scores.proportion) / 2)
  const qualityLabel = avg >= 70 ? 'dengeli' : avg >= 50 ? 'orta düzeyde' : 'belirgin farklılıklar içeren'

  const parts: string[] = []

  parts.push(`AI destekli ön değerlendirme tamamlandı.`)

  // Confidence-aware age display
  if (ageEstimation) {
    const [min, max] = ageEstimation.estimatedRange
    const confLabel = ageEstimation.confidence === 'high' ? '' :
      ageEstimation.confidence === 'medium' ? ' (orta güvenilirlik)' : ' (düşük güvenilirlik)'
    parts.push(`Tahmini yaş aralığı: ${min}–${max}${confLabel}.`)
  } else if (result.estimatedAge !== null) {
    parts.push(`Tahmini yaş: ~${Math.round(result.estimatedAge)}.`)
  }

  parts.push(`Yüz oranları ${qualityLabel} bir profil gösteriyor.`)

  // Top focus areas
  const topAreas = focusAreas.filter((a) => a.score > 40).slice(0, 3)
  if (topAreas.length > 0) {
    const areaNames = topAreas.map((a) => a.label).join(', ')
    parts.push(`Öne çıkan bölgeler: ${areaNames}.`)
  }

  parts.push(`${concernLabel} odağında detaylı doktor değerlendirmesi önerilir.`)
  parts.push(`Simetri skoru: ${geometry.scores.symmetry}/100, Oran uyumu: ${geometry.scores.proportion}/100.`)

  // Quality-aware caveat
  if (imageQuality && !imageQuality.sufficient) {
    parts.push(`Görüntü kalitesi sınırlı — sonuçlar referans niteliğindedir. Dengeli ışıkta tekrar analiz önerilir.`)
  } else if (qualityScore < 50) {
    parts.push(`(Fotoğraf kalitesi düşük — sonuçlar referans niteliğindedir.)`)
  }

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
      candidates.push({
        text: `Alın bölgesinde ${intensity} yatay çizgi belirginliği gözlenmektedir.${forehead.score >= 30 ? ' İstenirse bu bölgeye yönelik mimik çizgisi uygulamaları değerlendirilebilir.' : ''}`,
        priority: forehead.score + 10,
        region: 'forehead',
      })
    }

    const glabella = wrinkleAnalysis.regions.find((r) => r.region === 'glabella')
    if (glabella && glabella.score >= 20 && isReliable(glabella)) {
      const intensity = getIntensity(glabella.score, glabella.evidenceStrength)
      candidates.push({
        text: `Kaş arası bölgede ${intensity} mimik çizgileri gözlenmektedir.`,
        priority: glabella.score,
        region: 'glabella',
      })
    }

    const crowL = wrinkleAnalysis.regions.find((r) => r.region === 'crow_feet_left')
    const crowR = wrinkleAnalysis.regions.find((r) => r.region === 'crow_feet_right')
    const bestCrow = [crowL, crowR].filter(Boolean).sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0]
    const crowMax = bestCrow?.score ?? 0
    if (crowMax >= 20 && bestCrow && isReliable(bestCrow)) {
      const intensity = getIntensity(crowMax, bestCrow.evidenceStrength)
      candidates.push({
        text: `Göz kenarı bölgesinde ${intensity} kaz ayağı çizgileri dikkat çekmektedir.`,
        priority: crowMax,
        region: 'crow_feet',
      })
    }

    const ueL = wrinkleAnalysis.regions.find((r) => r.region === 'under_eye_left')
    const ueR = wrinkleAnalysis.regions.find((r) => r.region === 'under_eye_right')
    const bestUe = [ueL, ueR].filter(Boolean).sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0]
    const ueMax = bestUe?.score ?? 0
    if (ueMax >= 25 && bestUe && isReliable(bestUe)) {
      const intensity = getIntensity(ueMax, bestUe.evidenceStrength)
      candidates.push({
        text: `Göz altı dokusunda ${intensity} tekstür değişimi gözlenmektedir.${ueMax >= 40 ? ' İstenirse bu bölge için klinik değerlendirme düşünülebilir.' : ''}`,
        priority: ueMax,
        region: 'under_eye',
      })
    }

    const nlL = wrinkleAnalysis.regions.find((r) => r.region === 'nasolabial_left')
    const nlR = wrinkleAnalysis.regions.find((r) => r.region === 'nasolabial_right')
    const bestNl = [nlL, nlR].filter(Boolean).sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0]
    const nlMax = bestNl?.score ?? 0
    if (nlMax >= 25 && bestNl && isReliable(bestNl)) {
      const intensity = getIntensity(nlMax, bestNl.evidenceStrength)
      candidates.push({
        text: `Nazolabial bölgede ${intensity} kıvrım derinliği gözlenmektedir.${nlMax >= 40 ? ' İstenirse hacim desteği açısından değerlendirme düşünülebilir.' : ''}`,
        priority: nlMax,
        region: 'nasolabial',
      })
    }

    const jawline = wrinkleAnalysis.regions.find((r) => r.region === 'jawline')
    if (jawline && jawline.score >= 25 && isReliable(jawline)) {
      const intensity = getIntensity(jawline.score, jawline.evidenceStrength)
      candidates.push({
        text: `Çene hattında ${intensity} kontur değişimi gözlenmektedir.`,
        priority: jawline.score,
        region: 'jawline',
      })
    }

    // If most regions have insufficient evidence, add a quality caveat
    const insufficientCount = wrinkleAnalysis.regions.filter(
      (r) => r.evidenceStrength === 'insufficient'
    ).length
    if (insufficientCount > wrinkleAnalysis.regions.length * 0.5) {
      candidates.push({
        text: 'Görüntü kalitesi bazı bölgelerde güvenilir değerlendirme için yetersiz — daha net ışıkta tekrar analiz önerilir.',
        priority: 5,
        region: 'quality_caveat',
      })
    }
  }

  // ── 2. Geometry-based findings ──
  if (geometry.metrics.symmetryRatio < 0.85) {
    candidates.push({
      text: 'Yüz simetrisi standart aralığın altında gözlenmektedir. Klinik değerlendirme ile desteklenebilir.',
      priority: Math.round((1 - geometry.metrics.symmetryRatio) * 100),
      region: 'symmetry',
    })
  }

  if (geometry.metrics.noseToFaceWidth > 0.32) {
    candidates.push({
      text: 'Burun genişliğinde yüz oranlarına göre farklılık dikkat çekmektedir.',
      priority: Math.round((geometry.metrics.noseToFaceWidth - 0.25) * 200),
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
 * Tone: clinical, calm, non-commercial. Never prescriptive.
 */
export function generateSuggestions(
  result: EnhancedAnalysisResult
): string[] {
  const candidates = buildCandidates(result)
  const top = selectTopFindings(candidates, 5)
  const suggestions = top.map((c) => c.text)

  if (suggestions.length === 0) {
    suggestions.push('Yüz oranları genel olarak dengeli görünmektedir. Detaylı değerlendirme için klinik görüşme önerilir.')
  }

  return suggestions
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
  resultOrFocusAreas: EnhancedAnalysisResult | FocusArea[]
): string[] {
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
