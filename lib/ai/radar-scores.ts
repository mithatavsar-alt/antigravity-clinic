/**
 * Radar Score Derivation
 *
 * Maps existing analysis signals (wrinkle scores, geometry, symmetry,
 * skin texture, age estimation) into 11 normalized aesthetic categories.
 *
 * Score interpretation: higher = better aesthetic condition (0–100).
 * Raw concern signals are inverted so the user sees an intuitive scale.
 * Quality-gated: poor capture compresses scores toward center.
 *
 * All text is Turkish, framed as "ön değerlendirme".
 */

import type { EnhancedAnalysisResult, WrinkleAnalysisResult } from './types'
import { clamp } from './utils'

// ─── Exported types ───────────────────────────────────────────

export type RadarCategory = 'botox' | 'filler' | 'structure' | 'overall'

export type RadarScoreKey =
  | 'forehead_lines'
  | 'glabella'
  | 'crow_feet'
  | 'under_eye'
  | 'nasolabial'
  | 'perioral'
  | 'lower_face'
  | 'symmetry'
  | 'firmness'
  | 'age_appearance'
  | 'golden_ratio'

export interface RadarScore {
  key: RadarScoreKey
  label: string
  score: number
  confidence: number
  category: RadarCategory
  insight: string
}

export interface RadarAnalysis {
  analysisMeta: {
    overallConfidence: number
    imageQuality: number
    captureQuality: 'high' | 'medium' | 'low'
    generatedAt: string
  }
  radarScores: RadarScore[]
  derivedInsights: {
    strongestAreas: string[]
    improvementAreas: string[]
    summaryText: string
  }
}

// ─── Chart-friendly short labels ──────────────────────────────

export const RADAR_CHART_LABELS: Record<RadarScoreKey, string> = {
  forehead_lines: 'Alın Çizgileri',
  glabella: 'Kaş Arası',
  crow_feet: 'Kaz Ayağı',
  under_eye: 'Göz Altı',
  nasolabial: 'Nazolabial',
  perioral: 'Dudak Çevresi',
  lower_face: 'Alt Yüz',
  symmetry: 'Simetri',
  firmness: 'Cilt Sıkılığı',
  age_appearance: 'Yaş Görünümü',
  golden_ratio: 'Altın Oran',
}

export const CATEGORY_LABELS: Record<RadarCategory, string> = {
  botox: 'Botoks',
  filler: 'Dolgu',
  structure: 'Yapısal',
  overall: 'Genel',
}

export const CATEGORY_COLORS: Record<RadarCategory, string> = {
  botox: '#C47A7A',
  filler: '#D6B98C',
  structure: '#4AE3A7',
  overall: '#7A9BC4',
}

// ─── Internal helpers ─────────────────────────────────────────

function clamp100(v: number): number {
  return clamp(Math.round(v), 0, 100)
}

/** Compress score range toward center when image quality is low */
function qualityAdjust(rawScore: number, iqFactor: number): number {
  const center = 55
  const spread = 0.55 + 0.45 * iqFactor
  return clamp100(center + (rawScore - center) * spread)
}

function getRegion(
  wrinkles: WrinkleAnalysisResult | null,
  region: string,
): { score: number; confidence: number } | null {
  if (!wrinkles) return null
  const r = wrinkles.regions.find((x) => x.region === region)
  return r ? { score: r.score, confidence: r.confidence } : null
}

function avgPair(
  wrinkles: WrinkleAnalysisResult | null,
  left: string,
  right: string,
): { score: number; confidence: number } | null {
  const l = getRegion(wrinkles, left)
  const r = getRegion(wrinkles, right)
  if (!l && !r) return null
  if (!l) return r
  if (!r) return l
  return {
    score: (l.score + r.score) / 2,
    confidence: (l.confidence + r.confidence) / 2,
  }
}

// ─── Insight text per category ────────────────────────────────

const INSIGHTS: Record<RadarScoreKey, (score: number) => string> = {
  forehead_lines: (s) =>
    s >= 75
      ? 'Alın bölgesinde belirgin bir çizgi oluşumu gözlenmemektedir.'
      : s >= 50
        ? 'Alın bölgesinde hafif çizgi belirginliği gözlenmektedir.'
        : s >= 25
          ? 'Alın bölgesinde orta düzeyde çizgi yoğunluğu tespit edilmiştir.'
          : 'Alın bölgesinde belirgin çizgi oluşumu gözlenmektedir; botoks değerlendirmesi önerilebilir.',

  glabella: (s) =>
    s >= 75
      ? 'Kaş arası bölgede belirgin bir kırışıklık oluşumu gözlenmemektedir.'
      : s >= 50
        ? 'Kaş arası bölgede hafif bir kırışıklık eğilimi mevcuttur.'
        : s >= 25
          ? 'Kaş arası bölgede orta düzeyde çizgi yoğunluğu tespit edilmiştir.'
          : 'Kaş arası bölgede belirgin kırışıklık oluşumu gözlenmektedir.',

  crow_feet: (s) =>
    s >= 75
      ? 'Göz çevresinde ince çizgi oluşumu minimal düzeydedir.'
      : s >= 50
        ? 'Göz çevresinde hafif ince çizgi yoğunluğu gözlenmektedir.'
        : s >= 25
          ? 'Göz çevresinde orta düzeyde kaz ayağı çizgileri tespit edilmiştir.'
          : 'Göz çevresinde belirgin kaz ayağı çizgileri gözlenmektedir.',

  under_eye: (s) =>
    s >= 75
      ? 'Göz altı bölgesinde belirgin bir doku bozulması gözlenmemektedir.'
      : s >= 50
        ? 'Göz altı bölgesinde hafif doku değişiklikleri mevcuttur.'
        : s >= 25
          ? 'Göz altı bölgesinde orta düzeyde doku farklılaşması tespit edilmiştir.'
          : 'Göz altı bölgesinde belirgin doku değişiklikleri gözlenmektedir; dolgu değerlendirmesi önerilebilir.',

  nasolabial: (s) =>
    s >= 75
      ? 'Nazolabial hat minimal düzeyde belirgindir.'
      : s >= 50
        ? 'Nazolabial hat hafif düzeyde belirginleşme göstermektedir.'
        : s >= 25
          ? 'Nazolabial hat orta düzeyde derinlik göstermektedir.'
          : 'Nazolabial hatta belirgin derinlik gözlenmektedir.',

  perioral: (s) =>
    s >= 75
      ? 'Dudak çevresi bölgesinde belirgin çizgi oluşumu gözlenmemektedir.'
      : s >= 50
        ? 'Dudak çevresi bölgesinde hafif ince çizgi eğilimi mevcuttur.'
        : s >= 25
          ? 'Dudak çevresinde orta düzeyde çizgi belirginliği tespit edilmiştir.'
          : 'Dudak çevresinde belirgin çizgi oluşumu gözlenmektedir.',

  lower_face: (s) =>
    s >= 75
      ? 'Alt yüz hattı genel olarak dengeli ve tanımlı görünmektedir.'
      : s >= 50
        ? 'Alt yüz hattı genel olarak dengeli, hafif destek potansiyeli bulunmaktadır.'
        : s >= 25
          ? 'Alt yüz hattında orta düzeyde kontur yumuşaması gözlenmektedir.'
          : 'Alt yüz hattında belirgin kontur kaybı gözlenmektedir.',

  symmetry: (s) =>
    s >= 75
      ? 'Yüz simetrisi genel olarak dengeli ve uyumlu görünmektedir.'
      : s >= 50
        ? 'Yüz simetrisinde hafif asimetri gözlenmektedir, genel denge korunmaktadır.'
        : s >= 25
          ? 'Yüz simetrisinde orta düzeyde farklılıklar tespit edilmiştir.'
          : 'Yüz simetrisinde belirgin farklılıklar gözlenmektedir.',

  firmness: (s) =>
    s >= 75
      ? 'Cilt sıkılığı genel olarak iyi düzeyde görünmektedir.'
      : s >= 50
        ? 'Cilt sıkılığında hafif düzeyde yumuşama eğilimi mevcuttur.'
        : s >= 25
          ? 'Cilt sıkılığında orta düzeyde azalma gözlenmektedir.'
          : 'Cilt sıkılığında belirgin azalma gözlenmektedir; yapısal destek değerlendirmesi önerilebilir.',

  age_appearance: (s) =>
    s >= 75
      ? 'Yaş görünümü genel olarak genç ve canlı bir izlenim vermektedir.'
      : s >= 50
        ? 'Yaş görünümü yaş grubuna uygun düzeydedir.'
        : s >= 25
          ? 'Yaş görünümünde orta düzeyde olgunlaşma işaretleri gözlenmektedir.'
          : 'Yaş görünümünde belirgin olgunlaşma işaretleri gözlenmektedir.',

  golden_ratio: (s) =>
    s >= 75
      ? 'Yüz oranları genel olarak uyumlu ve dengeli görünmektedir.'
      : s >= 50
        ? 'Yüz oranları büyük ölçüde uyumlu; küçük farklılıklar mevcuttur.'
        : s >= 25
          ? 'Yüz oranlarında sınırlı farklılıklar gözlenmektedir.'
          : 'Yüz oranlarında belirgin uyumsuzluklar gözlenmektedir.',
}

// ─── Main derivation function ─────────────────────────────────

export function deriveRadarAnalysis(
  enhanced: EnhancedAnalysisResult,
  captureQuality?: 'high' | 'medium' | 'low',
): RadarAnalysis {
  const {
    geometry,
    wrinkleAnalysis,
    symmetryAnalysis,
    skinTexture,
    ageEstimation,
    imageQuality,
    qualityScore,
    confidence,
  } = enhanced

  const baseConf = confidence ?? 0.5
  const iqScore = imageQuality?.overallScore ?? qualityScore ?? 50
  const iqFactor = Math.min(1, iqScore / 100)

  // Per-category confidence: blend region, detection, and image quality
  const catConf = (regionConf: number | null): number => {
    const rc = regionConf ?? 0.5
    return Math.round((rc * 0.4 + baseConf * 0.3 + iqFactor * 0.3) * 100) / 100
  }

  // ── Derive raw scores (higher = better) ─────────────────────
  // RELIABILITY: When wrinkle region is null, score is null (not a fake default).
  // Null scores get low confidence and display as "değerlendirilmedi" (not evaluated).
  // This prevents pleasant-looking charts from hiding analysis failures.

  const foreheadR = getRegion(wrinkleAnalysis, 'forehead')
  const foreheadRaw = foreheadR ? 100 - foreheadR.score : null

  const glabellaR = getRegion(wrinkleAnalysis, 'glabella')
  const glabellaRaw = glabellaR ? 100 - glabellaR.score : null

  const crowR = avgPair(wrinkleAnalysis, 'crow_feet_left', 'crow_feet_right')
  const crowRaw = crowR ? 100 - crowR.score : null

  const underEyeR = avgPair(wrinkleAnalysis, 'under_eye_left', 'under_eye_right')
  const underEyeRaw = underEyeR ? 100 - underEyeR.score : null

  const nasolabialR = avgPair(wrinkleAnalysis, 'nasolabial_left', 'nasolabial_right')
  const nasolabialRaw = nasolabialR ? 100 - nasolabialR.score : null

  const perioralR = avgPair(wrinkleAnalysis, 'marionette_left', 'marionette_right')
  const perioralRaw = perioralR ? 100 - perioralR.score : null

  const jawR = getRegion(wrinkleAnalysis, 'jawline')
  const jawSym = symmetryAnalysis?.jawSymmetry ?? geometry.metrics.symmetryRatio
  const lowerFaceRaw = jawR
    ? (100 - jawR.score) * 0.6 + jawSym * 100 * 0.4
    : null

  const symRaw = symmetryAnalysis?.overallScore ?? geometry.scores.symmetry

  const smooth = skinTexture?.smoothness ?? 50
  const uniform = skinTexture?.uniformity ?? 50
  const jawInv = jawR ? 100 - jawR.score : null
  // Firmness: if jawline data is missing, rely only on skin texture (reduced confidence)
  const firmnessRaw = jawInv != null
    ? smooth * 0.4 + uniform * 0.3 + jawInv * 0.3
    : smooth * 0.55 + uniform * 0.45

  const wrinkleOvr = wrinkleAnalysis?.overallScore ?? 30
  const ageAppRaw = (100 - wrinkleOvr) * 0.55 + smooth * 0.25 + uniform * 0.2

  const goldenRaw = geometry.scores.proportion

  // ── Quality-adjust all scores ───────────────────────────────
  // When a region has no evidence (null raw), use score 0 with very low confidence.
  // This prevents fake center-clustered scores on the radar chart.

  const adj = (raw: number) => qualityAdjust(raw, iqFactor)

  /** Score for a region: real evidence → adjusted, no evidence → 0 with suppressed confidence */
  const regionScore = (raw: number | null) => raw != null ? adj(raw) : 0
  /** Confidence for a region: real evidence → computed, no evidence → 0.05 (near-zero) */
  const regionConf = (raw: number | null, regionConfidence: number | null) =>
    raw != null ? catConf(regionConfidence) : 0.05

  const scores: RadarScore[] = [
    { key: 'forehead_lines', label: 'Alın Çizgileri', score: regionScore(foreheadRaw), confidence: regionConf(foreheadRaw, foreheadR?.confidence ?? null), category: 'botox', insight: '' },
    { key: 'glabella', label: 'Kaş Arası (Glabella)', score: regionScore(glabellaRaw), confidence: regionConf(glabellaRaw, glabellaR?.confidence ?? null), category: 'botox', insight: '' },
    { key: 'crow_feet', label: 'Kaz Ayağı', score: regionScore(crowRaw), confidence: regionConf(crowRaw, crowR?.confidence ?? null), category: 'botox', insight: '' },
    { key: 'under_eye', label: 'Göz Altı', score: regionScore(underEyeRaw), confidence: regionConf(underEyeRaw, underEyeR?.confidence ?? null), category: 'filler', insight: '' },
    { key: 'nasolabial', label: 'Nazolabial Hat', score: regionScore(nasolabialRaw), confidence: regionConf(nasolabialRaw, nasolabialR?.confidence ?? null), category: 'filler', insight: '' },
    { key: 'perioral', label: 'Dudak Çevresi', score: regionScore(perioralRaw), confidence: regionConf(perioralRaw, perioralR?.confidence ?? null), category: 'filler', insight: '' },
    { key: 'lower_face', label: 'Alt Yüz Hattı', score: regionScore(lowerFaceRaw), confidence: regionConf(lowerFaceRaw, jawR?.confidence ?? null), category: 'filler', insight: '' },
    { key: 'symmetry', label: 'Yüz Simetrisi', score: adj(symRaw), confidence: catConf(symmetryAnalysis ? 0.8 : 0.5), category: 'structure', insight: '' },
    { key: 'firmness', label: 'Cilt Sıkılığı', score: adj(firmnessRaw), confidence: catConf(skinTexture?.confidence ?? null), category: 'structure', insight: '' },
    { key: 'age_appearance', label: 'Yaş Görünümü', score: adj(ageAppRaw), confidence: catConf(ageEstimation?.confidenceScore ?? null), category: 'overall', insight: '' },
    { key: 'golden_ratio', label: 'Altın Oran Uyumu', score: adj(goldenRaw), confidence: catConf(0.7), category: 'overall', insight: '' },
  ]

  // Fill insights based on final adjusted scores.
  // Low-confidence regions (< 0.15) get an honest "not evaluated" message.
  for (const s of scores) {
    if (s.confidence < 0.15) {
      s.insight = 'Bu bölge mevcut görüntü koşullarında yeterli güvenilirlikle değerlendirilememiştir.'
    } else {
      s.insight = INSIGHTS[s.key](s.score)
    }
  }

  // ── Derive insights ─────────────────────────────────────────

  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const strongestAreas = sorted.slice(0, 3).map((s) => s.label)
  const improvementAreas = sorted.slice(-3).reverse().map((s) => s.label)

  const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
  let summaryText: string
  if (avgScore >= 70) {
    summaryText =
      'Genel yüz analizi sonuçları olumlu bir profil ortaya koymaktadır. Mevcut yapıyı korumaya yönelik bakım önerileri doktor değerlendirmesinde sunulabilir.'
  } else if (avgScore >= 50) {
    summaryText =
      'Yüz analizi genel olarak dengeli bir profil göstermektedir. Bazı bölgelerde iyileştirme potansiyeli bulunmaktadır; detaylı doktor değerlendirmesi önerilir.'
  } else {
    summaryText =
      'Yüz analizinde birden fazla bölgede iyileştirme potansiyeli tespit edilmiştir. Kişiye özel tedavi planı için doktor değerlendirmesi önerilir.'
  }

  // Weight overall confidence by each region's own confidence (self-weighting).
  // High-confidence regions contribute more; low-confidence regions pull less.
  const confWeighted = scores.reduce((sum, s) => {
    const w = s.confidence >= 0.55 ? 1 : s.confidence >= 0.35 ? 0.5 : 0.2
    return { num: sum.num + s.confidence * w, den: sum.den + w }
  }, { num: 0, den: 0 })
  const overallConf =
    Math.round((confWeighted.den > 0 ? confWeighted.num / confWeighted.den : 0.5) * 100) / 100
  const captureQ =
    captureQuality ?? (iqScore >= 65 ? 'high' : iqScore >= 40 ? 'medium' : 'low')

  return {
    analysisMeta: {
      overallConfidence: overallConf,
      imageQuality: Math.round(iqScore),
      captureQuality: captureQ,
      generatedAt: new Date().toISOString(),
    },
    radarScores: scores,
    derivedInsights: {
      strongestAreas,
      improvementAreas,
      summaryText,
    },
  }
}
