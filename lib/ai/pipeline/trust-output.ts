/**
 * Trust-First Output Language Engine
 *
 * Generates patient-facing text with clinical-but-soft tone.
 * Non-diagnostic. Non-aggressive. Suggestion-light.
 *
 * Principles:
 * - Never claim certainty where none exists
 * - "Belirgin bulgu saptanmadı" is a valid output
 * - "Uzman değerlendirmesi önerilir" is the default recommendation
 * - "Bu değerlendirme sınırlı veri içerir" when quality is limited
 */

import type { FilteredResults } from './decision-filter'
import type { QualityGateResult, YoungFaceProfile, ValidatedMetric } from './types'
import type { AgeEstimation } from '../types'

/**
 * Generate the complete patient summary with trust-first language.
 */
export function generateTrustSummary(
  filtered: FilteredResults,
  qualityGate: QualityGateResult,
  youngProfile: YoungFaceProfile,
): string {
  const parts: string[] = []

  // ── Opening ──
  parts.push('AI destekli ön değerlendirme tamamlandı.')

  // ── Quality caveat (if degraded) ──
  if (qualityGate.verdict === 'degrade' && qualityGate.degradeMessage) {
    parts.push(qualityGate.degradeMessage)
  }

  // ── Age (trust-gated) ──
  const ageText = generateAgeSummary(filtered.age)
  if (ageText) parts.push(ageText)

  // ── Symmetry (high reliability) ──
  if (filtered.symmetry && filtered.symmetry.decision !== 'hide') {
    const sym = filtered.symmetry.data
    if (sym.overallScore >= 80) {
      parts.push('Yüz simetrisi dengeli gözlenmektedir.')
    } else if (sym.overallScore >= 60) {
      parts.push('Yüz simetrisinde hafif farklılıklar gözlenmektedir.')
    } else {
      parts.push('Yüz simetrisinde dikkat çekici farklılıklar gözlenmektedir. Detaylı değerlendirme önerilir.')
    }
  }

  // ── Findings count context ──
  if (filtered.totalShown > 0) {
    parts.push(`Görsel analize göre ${filtered.totalShown} bölgede gözlem yapılmıştır.`)
  } else if (filtered.totalSoft > 0) {
    parts.push('Sınırlı güven düzeyinde bazı gözlemler mevcuttur.')
  } else {
    parts.push('Belirgin bulgu saptanmadı.')
  }

  // ── Suppression transparency ──
  if (filtered.totalSuppressed > 3) {
    parts.push('Bu değerlendirme sınırlı veri içerir — bazı bölgeler güvenilir analiz için yeterli değildir.')
  }

  // ── Young face positive note ──
  if (youngProfile.active && filtered.totalShown <= 1) {
    parts.push('Cilt dokusu genel olarak sağlıklı ve genç görünüme sahiptir.')
  }

  // ── Closing ──
  parts.push('Detaylı değerlendirme için uzman görüşü önerilir.')

  return parts.join(' ')
}

/**
 * Generate trust-gated age text.
 * NEVER shows exact age. NEVER shows if confidence is insufficient.
 */
function generateAgeSummary(
  age: ValidatedMetric<AgeEstimation> | null,
): string | null {
  if (!age) return null

  if (age.decision === 'hide') return null

  const data = age.data
  const [min, max] = data.estimatedRange

  if (age.decision === 'soft') {
    // Low confidence: show range with strong caveat
    return `Tahmini yaş aralığı: ${min}–${max} (sınırlı güvenilirlik — referans niteliğindedir).`
  }

  // High confidence: show range without exact number
  return `Tahmini yaş aralığı: ${min}–${max}.`
}

/**
 * Generate a quality-aware caveat for the analysis header.
 * Returns null if no caveat is needed.
 */
export function generateQualityCaveat(
  qualityGate: QualityGateResult,
  filtered: FilteredResults,
): string | null {
  if (qualityGate.verdict === 'block') {
    return qualityGate.blockMessage ?? 'Analiz için görüntü uygun değil.'
  }

  if (qualityGate.verdict === 'degrade') {
    return qualityGate.degradeMessage ?? 'Bu değerlendirme sınırlı veri içerir.'
  }

  if (filtered.totalSuppressed > filtered.totalShown + filtered.totalSoft) {
    return 'Çoğu bölgede güvenilir analiz yapılamamıştır — sonuçlar sınırlı veri içermektedir.'
  }

  return null
}

/**
 * Generate the disclaimer footer.
 */
export function generateDisclaimer(): string {
  return 'Bu değerlendirme AI destekli bir ön analiz olup tanı niteliği taşımamaktadır. Kesin değerlendirme ve tedavi kararı yalnızca klinik muayene sonrasında uzman hekim tarafından verilir.'
}

/**
 * Map a confidence band to a Turkish display label.
 */
export function confidenceBandLabel(band: string): string {
  switch (band) {
    case 'high': return 'Yüksek güven'
    case 'moderate': return 'Orta güven'
    case 'low': return 'Düşük güven'
    case 'insufficient': return 'Yetersiz veri'
    default: return ''
  }
}
