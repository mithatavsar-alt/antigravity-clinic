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
import type {
  AgeEstimation,
  RegionConfidence,
  AnalysisRegionKey,
  FocusArea,
  WrinkleRegionResult,
  LipAnalysis,
} from '../types'

/**
 * Generate the complete patient summary with trust-first language.
 */
export function generateTrustSummary(
  filtered: FilteredResults,
  qualityGate: QualityGateResult,
  youngProfile: YoungFaceProfile,
): string {
  const parts: string[] = []

  // ── Opening — warm and confident ──
  parts.push('Analiz tamamlandı.')

  // ── Quality caveat (soft, only when truly degraded) ──
  if (qualityGate.verdict === 'degrade' && qualityGate.degradeMessage) {
    parts.push(qualityGate.degradeMessage)
  }

  // ── Age (trust-gated) ──
  const ageText = generateAgeSummary(filtered.age)
  if (ageText) parts.push(ageText)

  // ── Symmetry (high reliability, natural language) ──
  if (filtered.symmetry && filtered.symmetry.decision !== 'hide') {
    const sym = filtered.symmetry.data
    if (sym.overallScore >= 80) {
      parts.push('Yüz simetrisi dengeli ve uyumlu gözlenmektedir.')
    } else if (sym.overallScore >= 60) {
      parts.push('Yüz simetrisinde doğal düzeyde hafif farklılıklar gözlenmektedir.')
    } else {
      parts.push('Yüz simetrisinde değerlendirmeye alınabilecek farklılıklar dikkat çekmektedir.')
    }
  }

  // ── Findings context — natural, not robotic ──
  if (filtered.totalShown > 0) {
    const areaCount = filtered.totalShown
    if (areaCount === 1) {
      parts.push('Bir bölgede dikkat çekici gözlem bulunmaktadır.')
    } else if (areaCount <= 3) {
      parts.push(`${areaCount} bölgede değerlendirmeye alınabilecek gözlemler yapılmıştır.`)
    } else {
      parts.push('Birden fazla bölgede değerlendirmeye alınabilecek gözlemler mevcuttur.')
    }
  } else if (filtered.totalSoft > 0) {
    parts.push('Bazı bölgelerde sınırlı düzeyde gözlemler mevcuttur.')
  } else {
    parts.push('Belirgin bir bulgu saptanmamıştır.')
  }

  // ── Suppression transparency (only when significant) ──
  if (filtered.totalSuppressed > 4) {
    parts.push('Görüntü koşulları bazı bölgelerde detaylı değerlendirmeyi sınırlamıştır.')
  }

  // ── Young face positive note ──
  if (youngProfile.active && filtered.totalShown <= 1) {
    parts.push('Cilt dokusu genel olarak sağlıklı ve genç görünüme sahiptir.')
  }

  // ── Closing — professional, not clinical ──
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
 *
 * POST-CAPTURE RULE: Never returns blocking/harsh messages.
 * Since capture gate now ensures minimum quality, post-capture
 * caveats are always soft warnings, never "Analiz yapılamadı".
 */
export function generateQualityCaveat(
  qualityGate: QualityGateResult,
  filtered: FilteredResults,
): string | null {
  if (qualityGate.verdict === 'degrade') {
    return qualityGate.degradeMessage ?? 'Sonuçlar mevcut görüntü koşullarına göre oluşturulmuştur.'
  }

  if (filtered.totalSuppressed > filtered.totalShown + filtered.totalSoft) {
    return 'Bazı bölgelerde görüntü koşulları nedeniyle değerlendirme kapsamı sınırlı kalmıştır.'
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
 * Generate "Strong Features" — positive observations that are clearly visible.
 *
 * System prompt rule: "STRONG FEATURES (only if clearly visible)"
 * e.g. symmetry, skin clarity, proportions
 *
 * Returns empty array if nothing can be confidently stated as positive.
 */
export function generateStrongFeatures(
  filtered: FilteredResults,
  youngProfile: YoungFaceProfile,
): string[] {
  const features: string[] = []

  // Symmetry — high reliability, warm language
  if (filtered.symmetry && filtered.symmetry.decision === 'show') {
    if (filtered.symmetry.data.overallScore >= 80) {
      features.push('Yüz simetrisi dengeli ve uyumlu bir profil ortaya koymaktadır.')
    } else if (filtered.symmetry.data.overallScore >= 65) {
      features.push('Yüz simetrisi genel olarak dengeli gözlenmektedir.')
    }
  }

  // Young face — positive, natural
  if (youngProfile.active) {
    features.push('Cilt genel olarak dinlenmiş ve sağlıklı bir görünüme sahiptir.')
  }

  // Skin texture — smoothness as a positive
  if (filtered.skinTexture && filtered.skinTexture.decision === 'show') {
    if (filtered.skinTexture.data.smoothness > 70) {
      features.push('Cilt dokusu düzgün ve pürüzsüz görünmektedir.')
    }
  }

  // Few wrinkle findings = positive
  if (!youngProfile.active && filtered.shownWrinkles.length <= 1 && filtered.hiddenWrinkles.length < 3) {
    features.push('Belirgin çizgilenme veya doku değişimi gözlenmemiştir.')
  }

  return features.slice(0, 3) // Max 3 strong features
}

/**
 * Map a confidence band to a Turkish display label.
 */
export function confidenceBandLabel(band: string): string {
  switch (band) {
    case 'high': return 'Yüksek'
    case 'moderate': return 'Orta'
    case 'low': return 'Düşük'
    case 'insufficient': return 'Sınırlı'
    default: return ''
  }
}

/**
 * Generate "Limited Areas" text — regions that could NOT be evaluated.
 *
 * System prompt rule: "Clearly state what cannot be evaluated."
 * e.g. "Forehead region not clearly visible due to lighting"
 *
 * Returns null if all regions were evaluable.
 */
export function generateLimitedAreasText(
  filtered: FilteredResults,
  qualityGate: QualityGateResult,
): string | null {
  const limited: string[] = []

  // Collect hidden wrinkle regions with their suppression reasons
  for (const w of filtered.hiddenWrinkles) {
    if (w.suppressionReason) {
      limited.push(w.suppressionReason)
    }
  }

  // Quality-based limitations
  if (qualityGate.warnings.includes('uneven_lighting')) {
    limited.push('Aydınlatma koşulları bazı bölgelerde ince detay değerlendirmesini sınırlamıştır.')
  }

  if (qualityGate.warnings.includes('moderate_angle')) {
    limited.push('Hafif açı farklılığı simetri ölçümünün doğruluğunu etkilemiş olabilir.')
  }

  if (qualityGate.warnings.includes('mild_blur')) {
    limited.push('Hafif bulanıklık doku detaylarının değerlendirilmesini sınırlamıştır.')
  }

  if (qualityGate.warnings.includes('mild_filter')) {
    limited.push('Görüntüde olası yazılımsal düzeltme izleri — cilt dokusu değerlendirmesi sınırlı olabilir.')
  }

  if (limited.length === 0) return null

  return limited.slice(0, 3).join(' ')
}

// ─── Per-Region Confidence ────────────────────────────────

/** Region key → wrinkle region prefix mapping */
const REGION_WRINKLE_MAP: Record<AnalysisRegionKey, string[]> = {
  forehead: ['forehead', 'glabella'],
  crow_feet: ['crow_feet_left', 'crow_feet_right'],
  under_eye: ['under_eye_left', 'under_eye_right'],
  lips: [],
}

/** Region key → focus area region mapping */
const REGION_FOCUS_MAP: Record<AnalysisRegionKey, string[]> = {
  forehead: ['forehead_glabella'],
  crow_feet: ['crow_feet'],
  under_eye: ['under_eye'],
  lips: ['lip_chin_jawline'],
}

const REGION_LABELS: Record<AnalysisRegionKey, string> = {
  forehead: 'Alın',
  crow_feet: 'Kaz Ayağı',
  under_eye: 'Göz Altı',
  lips: 'Dudak',
}

/**
 * Generate per-region confidence assessments for the 4 critical regions.
 *
 * Each region's confidence is derived from:
 * - Matching wrinkle region validations (forehead, crow_feet, under_eye)
 * - Matching focus area validations
 * - Lip analysis validation (lips only)
 */
export function generateRegionConfidences(
  focusAreaMetrics: ValidatedMetric<FocusArea>[],
  wrinkleMetrics: ValidatedMetric<WrinkleRegionResult>[],
  lipMetric: ValidatedMetric<LipAnalysis> | null,
): RegionConfidence[] {
  const regions: AnalysisRegionKey[] = ['forehead', 'crow_feet', 'under_eye', 'lips']

  return regions.map((region): RegionConfidence => {
    if (region === 'lips') {
      return buildLipRegionConfidence(lipMetric)
    }

    // Find matching wrinkle metrics
    const wrinkleKeys = REGION_WRINKLE_MAP[region]
    const matchingWrinkles = wrinkleMetrics.filter(w => wrinkleKeys.includes(w.data.region))

    // Find matching focus area metrics
    const focusKeys = REGION_FOCUS_MAP[region]
    const matchingFocus = focusAreaMetrics.filter(f => focusKeys.includes(f.data.region))

    // Aggregate confidence: take the best confidence from wrinkle or focus
    const allConfidences = [
      ...matchingWrinkles.map(w => w.confidence),
      ...matchingFocus.map(f => f.confidence),
    ]

    if (allConfidences.length === 0) {
      return {
        region,
        label: REGION_LABELS[region],
        confidence: 'low',
        evaluable: false,
        limitation: 'Bu bölge için yeterli veri elde edilemedi.',
      }
    }

    const bestConfidence = Math.max(...allConfidences)
    const anyShown = [...matchingWrinkles, ...matchingFocus].some(m => m.decision !== 'hide')
    const allHidden = [...matchingWrinkles, ...matchingFocus].every(m => m.decision === 'hide')

    const confidenceLevel: 'high' | 'medium' | 'low' =
      bestConfidence >= 70 ? 'high' :
      bestConfidence >= 40 ? 'medium' : 'low'

    let limitation: string | null = null
    if (allHidden) {
      const reasons = [...matchingWrinkles, ...matchingFocus]
        .filter(m => m.suppressionReason)
        .map(m => m.suppressionReason!)
      limitation = reasons[0] ?? 'Güven düzeyi yetersiz.'
    }

    return {
      region,
      label: REGION_LABELS[region],
      confidence: confidenceLevel,
      evaluable: anyShown,
      limitation,
    }
  })
}

function buildLipRegionConfidence(
  lipMetric: ValidatedMetric<LipAnalysis> | null,
): RegionConfidence {
  if (!lipMetric) {
    return {
      region: 'lips',
      label: REGION_LABELS.lips,
      confidence: 'low',
      evaluable: false,
      limitation: 'Dudak bölgesinde yeterli veri elde edilemedi.',
    }
  }

  const confidenceLevel: 'high' | 'medium' | 'low' =
    lipMetric.confidence >= 70 ? 'high' :
    lipMetric.confidence >= 40 ? 'medium' : 'low'

  return {
    region: 'lips',
    label: REGION_LABELS.lips,
    confidence: confidenceLevel,
    evaluable: lipMetric.data.evaluable && lipMetric.decision !== 'hide',
    limitation: lipMetric.decision === 'hide'
      ? lipMetric.suppressionReason ?? lipMetric.data.limitationReason
      : lipMetric.data.limitationReason,
  }
}
