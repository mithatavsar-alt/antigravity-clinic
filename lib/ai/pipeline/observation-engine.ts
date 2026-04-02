/**
 * Observation Engine — Structured Per-Area Facial Observations
 *
 * Synthesizes ALL available analysis data (wrinkles, geometry, symmetry,
 * texture, lip analysis, age signals) into 14 structured observations,
 * one per facial area.
 *
 * Each observation is:
 * - Grounded in actual metric data (not random/templated)
 * - Unique text per area (never the same sentence twice)
 * - Weighted by the type of evidence that matters for that area
 * - Premium Turkish, clinical-calm tone
 *
 * Runs AFTER confidence engine (uses ValidatedMetric wrappers).
 */

import type {
  ValidatedMetric,
  StructuredObservation,
  ObservationArea,
  VisibilityLevel,
  ImpactLevel,
  ObservationSource,
  YoungFaceProfile,
  QualityGateResult,
} from './types'
import type {
  WrinkleRegionResult,
  FocusArea,
  SymmetryAnalysis,
  SkinTextureProfile,
  LipAnalysis,
} from '../types'
import { clamp } from '../utils'

// ─── Area Labels ──────────────────────────────────────────

const AREA_LABELS: Record<ObservationArea, string> = {
  forehead: 'Alın Bölgesi',
  glabella: 'Kaş Arası',
  eye_contour: 'Göz Çevresi',
  under_eye: 'Göz Altı',
  crow_feet: 'Kaz Ayağı',
  skin_texture: 'Cilt Dokusu',
  skin_tone: 'Cilt Tonu',
  cheek_support: 'Yanak Desteği',
  nasolabial: 'Nazolabial',
  jawline: 'Çene Hattı',
  lower_face: 'Alt Yüz Konturu',
  lip_area: 'Dudak Bölgesi',
  symmetry: 'Yüz Simetrisi',
  fatigue_freshness: 'Dinlenmiş Görünüm',
}

// ─── Main Generator ───────────────────────────────────────

export function generateObservations(
  wrinkleMetrics: ValidatedMetric<WrinkleRegionResult>[],
  focusAreaMetrics: ValidatedMetric<FocusArea>[],
  symmetryMetric: ValidatedMetric<SymmetryAnalysis> | null,
  skinTextureMetric: ValidatedMetric<SkinTextureProfile> | null,
  lipMetric: ValidatedMetric<LipAnalysis> | null,
  youngProfile: YoungFaceProfile,
  qualityGate: QualityGateResult,
): StructuredObservation[] {
  const ctx: ObservationContext = {
    wrinkleMetrics,
    focusAreaMetrics,
    symmetryMetric,
    skinTextureMetric,
    lipMetric,
    youngProfile,
    qualityGate,
    wrinkleByRegion: indexWrinkles(wrinkleMetrics),
    focusByRegion: indexFocusAreas(focusAreaMetrics),
  }

  return [
    observeForehead(ctx),
    observeGlabella(ctx),
    observeEyeContour(ctx),
    observeUnderEye(ctx),
    observeCrowFeet(ctx),
    observeSkinTexture(ctx),
    observeSkinTone(ctx),
    observeCheekSupport(ctx),
    observeNasolabial(ctx),
    observeJawline(ctx),
    observeLowerFace(ctx),
    observeLipArea(ctx),
    observeSymmetry(ctx),
    observeFatigueFreshness(ctx),
  ]
}

// ─── Context ──────────────────────────────────────────────

interface ObservationContext {
  wrinkleMetrics: ValidatedMetric<WrinkleRegionResult>[]
  focusAreaMetrics: ValidatedMetric<FocusArea>[]
  symmetryMetric: ValidatedMetric<SymmetryAnalysis> | null
  skinTextureMetric: ValidatedMetric<SkinTextureProfile> | null
  lipMetric: ValidatedMetric<LipAnalysis> | null
  youngProfile: YoungFaceProfile
  qualityGate: QualityGateResult
  wrinkleByRegion: Map<string, ValidatedMetric<WrinkleRegionResult>>
  focusByRegion: Map<string, ValidatedMetric<FocusArea>>
}

// ─── Index helpers ────────────────────────────────────────

function indexWrinkles(metrics: ValidatedMetric<WrinkleRegionResult>[]) {
  const map = new Map<string, ValidatedMetric<WrinkleRegionResult>>()
  for (const m of metrics) map.set(m.data.region, m)
  return map
}

function indexFocusAreas(metrics: ValidatedMetric<FocusArea>[]) {
  const map = new Map<string, ValidatedMetric<FocusArea>>()
  for (const m of metrics) map.set(m.data.region, m)
  return map
}

/** Merge L/R wrinkle pair: take the stronger side's score, average confidence */
function mergeLR(
  ctx: ObservationContext,
  leftKey: string,
  rightKey: string,
): { score: number; confidence: number; visible: boolean; evidence: string } {
  const left = ctx.wrinkleByRegion.get(leftKey)
  const right = ctx.wrinkleByRegion.get(rightKey)

  if (!left && !right) return { score: 0, confidence: 0, visible: false, evidence: 'insufficient' }

  const lScore = left?.data.score ?? 0
  const rScore = right?.data.score ?? 0
  const lConf = left?.confidence ?? 0
  const rConf = right?.confidence ?? 0

  const best = lScore >= rScore ? left : right
  return {
    score: Math.max(lScore, rScore),
    confidence: (lConf + rConf) / 2,
    visible: Boolean(left && left.decision !== 'hide') || Boolean(right && right.decision !== 'hide'),
    evidence: best?.data.evidenceStrength ?? 'insufficient',
  }
}

/** Build visibility from confidence + quality */
function toVisibility(confidence: number, isEvaluable: boolean): VisibilityLevel {
  if (!isEvaluable) return 'not_evaluable'
  if (confidence >= 65) return 'clear'
  if (confidence >= 35) return 'partial'
  return 'limited'
}

/** Build impact from score magnitude and area importance */
function toImpact(score: number, areaWeight: number): ImpactLevel {
  const weighted = score * areaWeight
  if (weighted > 45) return 'primary'
  if (weighted > 25) return 'secondary'
  if (weighted > 10) return 'minor'
  return 'neutral'
}

/**
 * Soften observation text for partial-visibility regions.
 * Adds a qualifying hedge so the user understands the finding is tentative.
 */
function softenForPartial(text: string, vis: VisibilityLevel): string {
  if (vis !== 'partial') return text
  // Don't double-soften if text already contains a hedge
  if (/sınırlı|referans|değerlendirilememiştir|net olarak/i.test(text)) return text
  return text.replace(/\.$/, ' — sınırlı görüntü koşullarında elde edilen gözlemdir.')
}

/** Build a standard observation */
function obs(
  area: ObservationArea,
  observation: string,
  visibility: VisibilityLevel,
  confidence: number,
  impact: ImpactLevel,
  isPositive: boolean,
  score: number,
  sources: ObservationSource[],
  limitation?: string,
): StructuredObservation {
  return {
    area,
    label: AREA_LABELS[area],
    observation: softenForPartial(observation, visibility),
    visibility,
    confidence: clamp(Math.round(confidence), 0, 100),
    impact,
    isPositive,
    score: clamp(Math.round(score), 0, 100),
    sources,
    ...(limitation ? { limitation } : {}),
  }
}

// ─── Per-Area Observers ───────────────────────────────────

function observeForehead(ctx: ObservationContext): StructuredObservation {
  const wrinkle = ctx.wrinkleByRegion.get('forehead')
  const focus = ctx.focusByRegion.get('forehead_glabella')
  const wScore = wrinkle?.data.score ?? 0
  const wConf = wrinkle?.confidence ?? 0
  const fScore = focus?.data.score ?? 0
  const conf = Math.max(wConf, focus?.confidence ?? 0)
  // Weighted: 60% wrinkle evidence, 40% geometric ratio
  const score = Math.round(wScore * 0.6 + fScore * 0.4)
  const visible = wrinkle?.decision !== 'hide' || focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 1.1)
  const sources: ObservationSource[] = ['wrinkle_density', 'geometry_ratio']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Alın bölgesi yeterli netlikle değerlendirilememiştir.'
  } else if (wScore >= 50 && wrinkle?.data.evidenceStrength === 'strong') {
    text = 'Alın bölgesinde belirgin yatay çizgilenme gözlenmektedir; mimik aktivitesine bağlı olası dinamik kırışıklıklar mevcuttur.'
  } else if (wScore >= 30) {
    text = 'Alın bölgesinde hafif yatay çizgilenme izleri mevcut; yaş grubuyla uyumlu, belirgin düzeyde değil.'
  } else if (fScore > 45) {
    text = 'Alın oranlarında hafif farklılık gözlenmekte; çizgilenme düzeyi düşük.'
  } else {
    text = 'Alın bölgesi düzgün ve dengeli görünmektedir; belirgin çizgilenme gözlenmemiştir.'
    positive = true
  }

  const limitation = wrinkle?.data.evidenceStrength === 'weak'
    ? 'Çizgi tespiti sınırlı güven düzeyindedir.'
    : undefined

  return obs('forehead', text, vis, conf, impact, positive, score, sources, limitation)
}

function observeGlabella(ctx: ObservationContext): StructuredObservation {
  const wrinkle = ctx.wrinkleByRegion.get('glabella')
  const wScore = wrinkle?.data.score ?? 0
  const wConf = wrinkle?.confidence ?? 0
  const visible = wrinkle?.decision !== 'hide'
  const vis = toVisibility(wConf, visible)
  const impact = toImpact(wScore, 0.9)
  const sources: ObservationSource[] = ['wrinkle_density']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Kaş arası bölge net olarak değerlendirilememiştir.'
  } else if (wScore >= 45) {
    text = 'Kaş arası bölgede dikey mimik çizgileri dikkat çekmektedir; ifade sırasında belirginleşen yapıda olabilir.'
  } else if (wScore >= 20) {
    text = 'Kaş arası bölgede hafif mimik izi gözlenmektedir; istirahat halinde belirgin düzeyde değil.'
  } else {
    text = 'Kaş arası bölge düzgün görünmektedir; belirgin mimik çizgisi saptanmamıştır.'
    positive = true
  }

  return obs('glabella', text, vis, wConf, impact, positive, wScore, sources)
}

function observeEyeContour(ctx: ObservationContext): StructuredObservation {
  // Combines crow_feet + under_eye wrinkles for a holistic eye contour view
  const crowLR = mergeLR(ctx, 'crow_feet_left', 'crow_feet_right')
  const underLR = mergeLR(ctx, 'under_eye_left', 'under_eye_right')
  // 55% crow's feet weight, 45% under-eye
  const score = Math.round(crowLR.score * 0.55 + underLR.score * 0.45)
  const conf = Math.max(crowLR.confidence, underLR.confidence)
  const visible = crowLR.visible || underLR.visible
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 1.0)
  const sources: ObservationSource[] = ['wrinkle_density', 'depth_estimate']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Göz çevresi yeterli ayrıntıyla değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Göz çevresinde belirgin doku değişimleri gözlenmektedir; hem lateral hem alt bölgede iz mevcut.'
  } else if (score >= 25) {
    text = 'Göz çevresinde hafif tekstür farklılıkları gözlenmektedir; doğal yaşlanma süreciyle uyumlu.'
  } else {
    text = 'Göz çevresi genel olarak düzgün ve dinlenmiş bir görünüm sergilemektedir.'
    positive = true
  }

  return obs('eye_contour', text, vis, conf, impact, positive, score, sources)
}

function observeUnderEye(ctx: ObservationContext): StructuredObservation {
  const merged = mergeLR(ctx, 'under_eye_left', 'under_eye_right')
  const focus = ctx.focusByRegion.get('under_eye')
  const fScore = focus?.data.score ?? 0
  // Weighted: 55% wrinkle/texture, 45% geometry (depth, transition)
  const score = Math.round(merged.score * 0.55 + fScore * 0.45)
  const conf = Math.max(merged.confidence, focus?.confidence ?? 0)
  const visible = merged.visible || focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  // Under-eye has HIGH impact on freshness impression
  const impact = toImpact(score, 1.3)
  const sources: ObservationSource[] = ['wrinkle_density', 'depth_estimate', 'geometry_ratio']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Göz altı bölgesi yeterli netlikle değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Göz altı bölgesinde hacim kaybı ve doku geçiş farklılığı gözlenmektedir; yorgunluk izlenimi oluşturabilir.'
  } else if (score >= 30) {
    text = 'Göz altı bölgesinde hafif yapısal farklılık mevcut; genel görünüm uyumlu.'
  } else {
    text = 'Göz altı bölgesi dolgun ve dinlenmiş görünmektedir.'
    positive = true
  }

  return obs('under_eye', text, vis, conf, impact, positive, score, sources)
}

function observeCrowFeet(ctx: ObservationContext): StructuredObservation {
  const merged = mergeLR(ctx, 'crow_feet_left', 'crow_feet_right')
  const focus = ctx.focusByRegion.get('crow_feet')
  const fScore = focus?.data.score ?? 0
  // Weighted: 70% wrinkle (primary signal), 30% geometric
  const score = Math.round(merged.score * 0.7 + fScore * 0.3)
  const conf = Math.max(merged.confidence, focus?.confidence ?? 0)
  const visible = merged.visible || focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 1.0)
  const sources: ObservationSource[] = ['wrinkle_density', 'geometry_ratio']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Kaz ayağı bölgesi yeterli ayrıntıyla değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Göz kenarında belirgin mimik çizgileri gözlenmektedir; gülümseme ve ifade ile ilişkili dinamik yapıda.'
  } else if (score >= 25) {
    text = 'Göz kenarında hafif mimik izleri mevcut; istirahat halinde çok belirgin değil.'
  } else {
    text = 'Kaz ayağı bölgesinde belirgin çizgilenme gözlenmemiştir.'
    positive = true
  }

  return obs('crow_feet', text, vis, conf, impact, positive, score, sources)
}

function observeSkinTexture(ctx: ObservationContext): StructuredObservation {
  const tex = ctx.skinTextureMetric
  const texData = tex?.data
  const conf = tex?.confidence ?? 0
  const visible = tex?.decision !== 'hide'
  const vis = toVisibility(conf, visible !== false)
  const sources: ObservationSource[] = ['texture_analysis']

  // Texture score: high smoothness = low score (positive)
  const smoothness = texData?.smoothness ?? 50
  const uniformity = texData?.uniformity ?? 50
  // Invert: 100-smoothness so rough skin = high score
  const score = Math.round(100 - (smoothness * 0.6 + uniformity * 0.4))
  const impact = toImpact(score, 0.8)

  let text: string
  let positive = false
  if (vis === 'not_evaluable' || !texData) {
    text = 'Cilt dokusu yeterli netlikle değerlendirilememiştir.'
  } else if (smoothness >= 75 && uniformity >= 70) {
    text = 'Cilt dokusu düzgün, pürüzsüz ve homojen görünmektedir.'
    positive = true
  } else if (smoothness >= 55) {
    text = 'Cilt dokusu genel olarak düzgün; bazı bölgelerde hafif tekstür farklılığı mevcut.'
    positive = smoothness >= 65
  } else {
    text = 'Cilt dokusunda belirgin tekstür değişimleri gözlenmektedir; gözenek ve yüzey düzensizlikleri dikkat çekmektedir.'
  }

  const limitation = ctx.qualityGate.warnings.includes('mild_filter')
    ? 'Olası yazılımsal görüntü düzeltmesi cilt dokusu değerlendirmesini sınırlamış olabilir.'
    : undefined

  return obs('skin_texture', text, vis, conf, impact, positive, score, sources, limitation)
}

function observeSkinTone(ctx: ObservationContext): StructuredObservation {
  const tex = ctx.skinTextureMetric
  const uniformity = tex?.data?.uniformity ?? 50
  const conf = tex?.confidence ?? 0
  const visible = tex?.decision !== 'hide'
  const vis = toVisibility(conf * 0.8, visible !== false) // Lower confidence for tone
  const sources: ObservationSource[] = ['texture_analysis', 'quality_gate']

  // Tone uniformity score: low uniformity = high score
  const score = Math.round(100 - uniformity)
  const impact = toImpact(score, 0.6)

  let text: string
  let positive = false
  const hasLightingIssue = ctx.qualityGate.warnings.includes('uneven_lighting')

  if (vis === 'not_evaluable') {
    text = 'Cilt tonu değerlendirmesi görüntü koşulları nedeniyle sınırlı kalmıştır.'
  } else if (hasLightingIssue) {
    text = 'Aydınlatma koşulları cilt tonu değerlendirmesini etkilemiş olabilir; mevcut gözlemler referans niteliğindedir.'
  } else if (uniformity >= 75) {
    text = 'Cilt tonu genel olarak homojen ve dengeli görünmektedir.'
    positive = true
  } else if (uniformity >= 50) {
    text = 'Cilt tonunda hafif farklılıklar gözlenmektedir; belirgin düzensizlik mevcut değil.'
    positive = true
  } else {
    text = 'Cilt tonunda bölgesel farklılıklar dikkat çekmektedir.'
  }

  const limitation = hasLightingIssue
    ? 'Dengesiz aydınlatma ton değerlendirmesini etkilemiş olabilir.'
    : undefined

  return obs('skin_tone', text, vis, conf * 0.8, impact, positive, score, sources, limitation)
}

function observeCheekSupport(ctx: ObservationContext): StructuredObservation {
  const focus = ctx.focusByRegion.get('mid_face')
  const cheekL = ctx.wrinkleByRegion.get('cheek_left')
  const cheekR = ctx.wrinkleByRegion.get('cheek_right')
  const fScore = focus?.data.score ?? 0
  const cheekScore = Math.max(cheekL?.data.score ?? 0, cheekR?.data.score ?? 0)
  // Weighted: 60% geometric volume, 40% surface texture
  const score = Math.round(fScore * 0.6 + cheekScore * 0.4)
  const conf = Math.max(focus?.confidence ?? 0, cheekL?.confidence ?? 0, cheekR?.confidence ?? 0)
  const visible = focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 0.8)
  const sources: ObservationSource[] = ['geometry_ratio', 'wrinkle_density']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Yanak desteği yeterli netlikle değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Orta yüz bölgesinde hacim dengesizliği gözlenmektedir; yanak dolgunluğu farklılık göstermektedir.'
  } else if (score >= 30) {
    text = 'Yanak bölgesinde hafif hacim asimetrisi mevcut; belirgin düzeyde değil.'
  } else {
    text = 'Yanak desteği dengeli ve dolgun görünmektedir; orta yüz hacmi uyumlu.'
    positive = true
  }

  return obs('cheek_support', text, vis, conf, impact, positive, score, sources)
}

function observeNasolabial(ctx: ObservationContext): StructuredObservation {
  const merged = mergeLR(ctx, 'nasolabial_left', 'nasolabial_right')
  const focus = ctx.focusByRegion.get('nasolabial')
  const fScore = focus?.data.score ?? 0
  // Weighted: 55% wrinkle depth, 45% geometric
  const score = Math.round(merged.score * 0.55 + fScore * 0.45)
  const conf = Math.max(merged.confidence, focus?.confidence ?? 0)
  const visible = merged.visible || focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 1.1) // High impact on age impression
  const sources: ObservationSource[] = ['wrinkle_density', 'depth_estimate', 'age_signal']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Nazolabial bölge yeterli netlikle değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Nazolabial kıvrımlarda belirgin derinlik gözlenmektedir; yaş ve mimik aktivitesiyle ilişkili.'
  } else if (score >= 25) {
    text = 'Nazolabial bölgede hafif kıvrım mevcut; yaş grubuyla uyumlu, doğal geçişli.'
  } else {
    text = 'Nazolabial bölge yumuşak geçişli ve dengeli görünmektedir.'
    positive = true
  }

  return obs('nasolabial', text, vis, conf, impact, positive, score, sources)
}

function observeJawline(ctx: ObservationContext): StructuredObservation {
  const wrinkle = ctx.wrinkleByRegion.get('jawline')
  const wScore = wrinkle?.data.score ?? 0
  const wConf = wrinkle?.confidence ?? 0
  const focus = ctx.focusByRegion.get('lip_chin_jawline')
  const fScore = focus?.data.score ?? 0
  // Weighted: 45% texture, 55% geometric contour (definition is geometric)
  const score = Math.round(wScore * 0.45 + fScore * 0.55)
  const conf = Math.max(wConf, focus?.confidence ?? 0)
  const visible = wrinkle?.decision !== 'hide' || focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 0.9)
  const sources: ObservationSource[] = ['wrinkle_density', 'geometry_ratio']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Çene hattı yeterli netlikle değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Çene hattında kontur yumuşaması ve tanım kaybı gözlenmektedir.'
  } else if (score >= 25) {
    text = 'Çene hattı genel olarak tanımlı; hafif yumuşama mevcut.'
  } else {
    text = 'Çene hattı net ve tanımlı görünmektedir; kontur bütünlüğü korunmuş.'
    positive = true
  }

  return obs('jawline', text, vis, conf, impact, positive, score, sources)
}

function observeLowerFace(ctx: ObservationContext): StructuredObservation {
  const marioLR = mergeLR(ctx, 'marionette_left', 'marionette_right')
  const focus = ctx.focusByRegion.get('lip_chin_jawline')
  const fScore = focus?.data.score ?? 0
  // Weighted: 50% marionette lines, 50% lower face geometry
  const score = Math.round(marioLR.score * 0.5 + fScore * 0.5)
  const conf = Math.max(marioLR.confidence, focus?.confidence ?? 0)
  const visible = marioLR.visible || focus?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  const impact = toImpact(score, 0.85)
  const sources: ObservationSource[] = ['wrinkle_density', 'geometry_ratio', 'age_signal']

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Alt yüz konturu yeterli netlikle değerlendirilememiştir.'
  } else if (score >= 50) {
    text = 'Alt yüz konturunda belirgin yumuşama ve ağız kenarı çizgileri gözlenmektedir.'
  } else if (score >= 25) {
    text = 'Alt yüz konturunda hafif düzensizlik mevcut; genel çerçeve korunmuş.'
  } else {
    text = 'Alt yüz konturu düzgün ve dengeli; ağız kenarı bölgesi uyumlu görünmektedir.'
    positive = true
  }

  return obs('lower_face', text, vis, conf, impact, positive, score, sources)
}

function observeLipArea(ctx: ObservationContext): StructuredObservation {
  const lip = ctx.lipMetric
  const lipData = lip?.data
  const conf = lip?.confidence ?? 0
  const visible = lip?.decision !== 'hide' && lipData?.evaluable === true
  const vis = toVisibility(conf, visible)
  const sources: ObservationSource[] = ['lip_structure', 'geometry_ratio']

  // Lip score: low volume + asymmetry = higher score
  let score = 0
  if (lipData) {
    score += lipData.volume === 'low' ? 35 : lipData.volume === 'balanced' ? 10 : 5
    score += lipData.symmetry === 'slight_asymmetry' ? 20 : lipData.symmetry === 'unclear' ? 10 : 0
    score += lipData.contour === 'soft' ? 15 : lipData.contour === 'unclear' ? 10 : 0
    score += lipData.surface === 'mildly_dry' ? 10 : lipData.surface === 'unclear' ? 5 : 0
  }
  score = clamp(score, 0, 100)
  const impact = toImpact(score, 0.7)

  let text: string
  let positive = false
  if (!visible || !lipData) {
    text = 'Dudak bölgesi yeterli netlikle değerlendirilememiştir.'
  } else if (lipData.volume === 'full' && lipData.symmetry === 'symmetrical' && lipData.contour === 'well_defined') {
    text = 'Dudak yapısı dolgun, simetrik ve konturu belirgin görünmektedir.'
    positive = true
  } else if (lipData.volume === 'balanced') {
    const parts: string[] = ['Dudak hacmi dengeli']
    if (lipData.symmetry === 'slight_asymmetry') parts.push('hafif asimetri mevcut')
    if (lipData.contour === 'soft') parts.push('kontur hattı yumuşak')
    text = parts.join('; ') + '.'
    positive = lipData.symmetry === 'symmetrical'
  } else {
    text = 'Dudak bölgesinde hacim ve kontur açısından değerlendirilebilir farklılıklar gözlenmektedir.'
  }

  const limitation = lipData?.limitationReason ?? undefined

  return obs('lip_area', text, vis, conf, impact, positive, score, sources, limitation)
}

function observeSymmetry(ctx: ObservationContext): StructuredObservation {
  const sym = ctx.symmetryMetric
  const symData = sym?.data
  const conf = sym?.confidence ?? 0
  const visible = sym?.decision !== 'hide'
  const vis = toVisibility(conf, visible !== false)
  const sources: ObservationSource[] = ['symmetry_measure', 'geometry_ratio']

  const overallScore = symData?.overallScore ?? 50
  // High symmetry = low score (positive)
  const score = Math.round(100 - overallScore)
  // Symmetry has HIGH impact on overall harmony impression
  const impact = toImpact(score, 1.2)

  let text: string
  let positive = false
  if (!symData || vis === 'not_evaluable') {
    text = 'Simetri değerlendirmesi yeterli güvenle yapılamamıştır.'
  } else if (overallScore >= 85) {
    text = 'Yüz simetrisi yüksek düzeyde uyumlu; sol-sağ denge belirgin şekilde korunmuş.'
    positive = true
  } else if (overallScore >= 70) {
    text = 'Yüz simetrisi genel olarak dengeli; doğal düzeyde hafif farklılıklar mevcut.'
    positive = true
  } else if (overallScore >= 55) {
    text = 'Yüz simetrisinde orta düzeyde farklılık gözlenmektedir; çoğu yüzde doğal olarak görülebilen bir durumdur.'
  } else {
    text = 'Yüz simetrisinde değerlendirmeye alınabilecek belirgin farklılıklar dikkat çekmektedir.'
  }

  // Add specific asymmetry detail if notable
  if (symData && overallScore < 75) {
    const weakest = [
      { label: 'göz', value: symData.eyeSymmetry },
      { label: 'yanak', value: symData.cheekSymmetry },
      { label: 'çene', value: symData.jawSymmetry },
    ].sort((a, b) => a.value - b.value)[0]
    if (weakest.value < 0.85) {
      text += ` ${weakest.label.charAt(0).toUpperCase() + weakest.label.slice(1)} bölgesinde daha belirgin.`
    }
  }

  const limitation = ctx.qualityGate.warnings.includes('moderate_angle')
    ? 'Hafif açı farklılığı simetri ölçümünü etkilemiş olabilir.'
    : undefined

  return obs('symmetry', text, vis, conf, impact, positive, score, sources, limitation)
}

function observeFatigueFreshness(ctx: ObservationContext): StructuredObservation {
  // Composite: under-eye + skin texture + young face profile
  const underLR = mergeLR(ctx, 'under_eye_left', 'under_eye_right')
  const tex = ctx.skinTextureMetric?.data
  const smoothness = tex?.smoothness ?? 50
  const underScore = underLR.score
  const sources: ObservationSource[] = ['wrinkle_density', 'texture_analysis', 'age_signal']

  // Freshness score: high under-eye + low smoothness = fatigued
  // Weight: 50% under-eye, 35% skin smoothness (inverted), young profile bonus
  const youngBonus = ctx.youngProfile.active ? -10 : 0
  const rawScore = Math.round(
    underScore * 0.50 +
    (100 - smoothness) * 0.35 +
    youngBonus + 8
  )
  const score = clamp(rawScore, 0, 100)

  const conf = Math.max(underLR.confidence, ctx.skinTextureMetric?.confidence ?? 0)
  const visible = underLR.visible || ctx.skinTextureMetric?.decision !== 'hide'
  const vis = toVisibility(conf, visible)
  // Freshness has HIGH impact on overall impression
  const impact = toImpact(score, 1.2)

  let text: string
  let positive = false
  if (vis === 'not_evaluable') {
    text = 'Genel tazelik izlenimi görüntü koşulları nedeniyle değerlendirilememiştir.'
  } else if (score <= 25) {
    text = 'Yüz genel olarak dinlenmiş ve taze bir görünüm sergilemektedir.'
    positive = true
  } else if (score <= 45) {
    text = 'Genel görünüm sağlıklı; bazı bölgelerde hafif yorgunluk izlenimi mevcut olabilir.'
    positive = true
  } else if (score <= 65) {
    text = 'Göz çevresi ve cilt dokusunda hafif yorgunluk belirtileri gözlenmektedir.'
  } else {
    text = 'Göz altı ve cilt dokusu birlikte değerlendirildiğinde yorgunluk izlenimi dikkat çekmektedir.'
  }

  return obs('fatigue_freshness', text, vis, conf, impact, positive, score, sources)
}
