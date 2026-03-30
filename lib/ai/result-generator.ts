/**
 * Result Text Generator
 *
 * Generates patient-facing and doctor-facing text summaries
 * from enhanced analysis results.
 *
 * All outputs are framed as "AI-supported pre-assessment" and
 * clearly state that doctor review is recommended.
 */

import type { EnhancedAnalysisResult, FocusArea, AgeEstimation, ImageQualityAssessment } from './types'
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

// ─── Focus area labels for patient ──────────────────────────

export function generateFocusAreaLabels(focusAreas: FocusArea[]): string[] {
  return focusAreas
    .filter((a) => a.score > 35)
    .slice(0, 4)
    .map((a) => a.label)
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
  const { geometry, focusAreas, wrinkleAnalysis } = result

  // Collect all candidate findings with a priority score
  interface Finding { text: string; priority: number; region: string }
  const candidates: Finding[] = []

  // ── 1. Wrinkle-based findings (highest value — directly observed signals) ──
  if (wrinkleAnalysis) {
    // Forehead: always include if lines are detected (score ≥ 12 = 'low' or above)
    const forehead = wrinkleAnalysis.regions.find((r) => r.region === 'forehead')
    if (forehead && forehead.score >= 12 && forehead.confidence >= 0.3) {
      const intensity = forehead.score >= 55 ? 'belirgin' : forehead.score >= 30 ? 'orta düzey' : 'hafif'
      candidates.push({
        text: `Alın bölgesinde ${intensity} yatay çizgi belirginliği gözlenmektedir.${forehead.score >= 30 ? ' İstenirse bu bölgeye yönelik mimik çizgisi uygulamaları değerlendirilebilir.' : ''}`,
        priority: forehead.score + 10, // +10 boost: forehead is critical for user trust
        region: 'forehead',
      })
    }

    // Glabella
    const glabella = wrinkleAnalysis.regions.find((r) => r.region === 'glabella')
    if (glabella && glabella.score >= 20 && glabella.confidence >= 0.3) {
      const intensity = glabella.score >= 55 ? 'belirgin' : glabella.score >= 30 ? 'orta düzey' : 'hafif'
      candidates.push({
        text: `Kaş arası bölgede ${intensity} mimik çizgileri gözlenmektedir.`,
        priority: glabella.score,
        region: 'glabella',
      })
    }

    // Crow's feet (merge L/R into one finding)
    const crowL = wrinkleAnalysis.regions.find((r) => r.region === 'crow_feet_left')
    const crowR = wrinkleAnalysis.regions.find((r) => r.region === 'crow_feet_right')
    const crowMax = Math.max(crowL?.score ?? 0, crowR?.score ?? 0)
    if (crowMax >= 20) {
      const intensity = crowMax >= 55 ? 'belirgin' : crowMax >= 30 ? 'orta düzey' : 'hafif'
      candidates.push({
        text: `Göz kenarı bölgesinde ${intensity} kaz ayağı çizgileri dikkat çekmektedir.`,
        priority: crowMax,
        region: 'crow_feet',
      })
    }

    // Under-eye (merge L/R)
    const ueL = wrinkleAnalysis.regions.find((r) => r.region === 'under_eye_left')
    const ueR = wrinkleAnalysis.regions.find((r) => r.region === 'under_eye_right')
    const ueMax = Math.max(ueL?.score ?? 0, ueR?.score ?? 0)
    if (ueMax >= 25) {
      const intensity = ueMax >= 55 ? 'belirgin' : ueMax >= 30 ? 'orta düzey' : 'hafif'
      candidates.push({
        text: `Göz altı dokusunda ${intensity} tekstür değişimi gözlenmektedir.${ueMax >= 40 ? ' İstenirse bu bölge için klinik değerlendirme düşünülebilir.' : ''}`,
        priority: ueMax,
        region: 'under_eye',
      })
    }

    // Nasolabial (merge L/R)
    const nlL = wrinkleAnalysis.regions.find((r) => r.region === 'nasolabial_left')
    const nlR = wrinkleAnalysis.regions.find((r) => r.region === 'nasolabial_right')
    const nlMax = Math.max(nlL?.score ?? 0, nlR?.score ?? 0)
    if (nlMax >= 25) {
      const intensity = nlMax >= 55 ? 'belirgin' : nlMax >= 30 ? 'orta düzey' : 'hafif'
      candidates.push({
        text: `Nazolabial bölgede ${intensity} kıvrım derinliği gözlenmektedir.${nlMax >= 40 ? ' İstenirse hacim desteği açısından değerlendirme düşünülebilir.' : ''}`,
        priority: nlMax,
        region: 'nasolabial',
      })
    }

    // Jawline
    const jawline = wrinkleAnalysis.regions.find((r) => r.region === 'jawline')
    if (jawline && jawline.score >= 25 && jawline.confidence >= 0.3) {
      const intensity = jawline.score >= 55 ? 'belirgin' : jawline.score >= 30 ? 'orta düzey' : 'hafif'
      candidates.push({
        text: `Çene hattında ${intensity} kontur değişimi gözlenmektedir.`,
        priority: jawline.score,
        region: 'jawline',
      })
    }
  }

  // ── 2. Geometry-based findings (observation tone, no treatment names) ──
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

  // ── 3. Focus area insights (only for regions not already covered by wrinkle findings) ──
  const coveredRegions = new Set(candidates.map((c) => c.region))
  const topFocusAreas = focusAreas
    .filter((a) => a.score > 55 && a.doctorReviewRecommended)
    .slice(0, 3)

  for (const area of topFocusAreas) {
    // Map focus area regions to wrinkle regions to avoid duplicates
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

  // ── 4. Sort by priority, limit to top 5, ensure region diversity ──
  candidates.sort((a, b) => b.priority - a.priority)

  const suggestions: string[] = []
  const usedRegions = new Set<string>()
  for (const c of candidates) {
    if (suggestions.length >= 5) break
    if (usedRegions.has(c.region)) continue
    suggestions.push(c.text)
    usedRegions.add(c.region)
  }

  // ── 5. Fallback if no significant findings ──
  if (suggestions.length === 0) {
    suggestions.push('Yüz oranları genel olarak dengeli görünmektedir. Detaylı değerlendirme için klinik görüşme önerilir.')
  }

  return suggestions
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
