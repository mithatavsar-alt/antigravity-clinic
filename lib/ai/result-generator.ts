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
  const { geometry, estimatedAge, focusAreas, qualityScore } = result
  const area = concernArea ?? 'genel_yuz_dengesi'
  const concernLabel = concernAreaLabels[area]

  const avg = Math.round((geometry.scores.symmetry + geometry.scores.proportion) / 2)
  const qualityLabel = avg >= 70 ? 'dengeli' : avg >= 50 ? 'orta düzeyde' : 'belirgin farklılıklar içeren'

  const parts: string[] = []

  parts.push(`AI destekli ön değerlendirme tamamlandı.`)

  if (estimatedAge !== null) {
    parts.push(`Tahmini yaş: ${Math.round(estimatedAge)}.`)
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

  if (qualityScore < 50) {
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

// ─── Suggestions (patient-safe) ─────────────────────────────

export function generateSuggestions(
  result: EnhancedAnalysisResult
): string[] {
  const suggestions: string[] = []
  const { geometry, focusAreas, estimatedAge } = result

  // Geometry-based suggestions (from existing logic)
  if (geometry.metrics.symmetryRatio < 0.85) {
    suggestions.push('Yüz simetrisi standart aralığın altında — simetri odaklı değerlendirme önerilebilir.')
  }

  if (geometry.metrics.eyeDistanceRatio < 0.28) {
    suggestions.push('Göz arası mesafe yakın — burun köprüsü estetiği incelenebilir.')
  } else if (geometry.metrics.eyeDistanceRatio > 0.36) {
    suggestions.push('Göz arası mesafe geniş — orbita çevresi değerlendirmesi önerilebilir.')
  }

  if (geometry.metrics.noseToFaceWidth > 0.32) {
    suggestions.push('Burun genişliği yüz oranı üzerinde — burun ucu veya kanat düzeltmesi değerlendirilebilir.')
  }

  // Focus area insights (top scoring ones)
  const topInsights = focusAreas
    .filter((a) => a.score > 50 && a.doctorReviewRecommended)
    .slice(0, 3)

  for (const area of topInsights) {
    if (!suggestions.some((s) => s.includes(area.label))) {
      suggestions.push(area.insight)
    }
  }

  // Age-related general suggestion
  if (estimatedAge !== null && estimatedAge > 40 && suggestions.length < 5) {
    suggestions.push('Yaşa bağlı hacim değişimleri için genel yüz dolgusu değerlendirmesi önerilebilir.')
  }

  if (suggestions.length === 0) {
    suggestions.push('Yüz oranları genel olarak dengeli görünüyor. Detaylı doktor değerlendirmesi ile kişiye özel plan oluşturulabilir.')
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
