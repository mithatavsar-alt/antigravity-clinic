import type { AnalysisResult, EnhancedAnalysisResult } from './types'
import type { TrustGatedResult } from './pipeline/types'
import type {
  DoctorAnalysis,
  PatientSummary,
  ConsultationReadiness,
  Lead,
  ConcernArea,
  PhotoQuality,
  GoalClarity,
  TimeIntent,
  CommunicationPreference,
  UpsellPotential,
  ReadinessBand,
} from '@/types/lead'
import { concernAreaLabels } from '@/types/lead'

/**
 * Derive doctor analysis from enhanced pipeline results.
 *
 * RELIABILITY: This now uses the trust pipeline output (wrinkle scores,
 * image quality, confidence) instead of raw geometry-only metrics.
 * Dose recommendations have been REMOVED — they had no clinical basis.
 * Region scores now reflect actual wrinkle/texture analysis, not geometry proxies.
 */
export function deriveDoctorAnalysis(
  leadId: string,
  geometry: AnalysisResult,
  lead: Partial<Lead>,
  enhanced?: EnhancedAnalysisResult | null,
  trustResult?: TrustGatedResult | null,
): DoctorAnalysis {
  const { metrics, scores } = geometry

  // ── Region scores: prefer enhanced wrinkle data if available ──
  let regionScores: Record<string, number>

  if (enhanced?.wrinkleAnalysis && trustResult) {
    regionScores = buildRegionScoresFromEnhanced(enhanced, trustResult)
  } else {
    // Fallback: geometry-only (less reliable)
    regionScores = buildRegionScoresFromGeometry(metrics, scores)
  }

  // Round all values
  for (const key of Object.keys(regionScores)) {
    regionScores[key] = Math.round(regionScores[key] * 100) / 100
  }

  // ── Quality checks: use actual image quality, not existence check ──
  const imageQualityScore = enhanced?.imageQuality?.overallScore ?? 0
  const frontalQuality: PhotoQuality = imageQualityScore >= 60 ? 'good'
    : imageQualityScore >= 30 ? 'acceptable'
    : lead.patient_photo_url ? 'acceptable'
    : 'poor'

  // ── Risk level from actual analysis confidence ──
  const overallConfidence = trustResult?.overallConfidence ?? 50
  const riskLevel = overallConfidence >= 65 ? 'low' as const
    : overallConfidence >= 40 ? 'medium' as const
    : 'high' as const

  const hasMimics = (lead.doctor_mimic_photos?.length ?? 0) >= 2
  const hasVideo = !!lead.optional_video_url

  // ── Stability score from symmetry + proportion ──
  const symNorm = scores.symmetry / 100
  const propNorm = scores.proportion / 100
  const stabilityScore = Math.round((symNorm * 0.6 + propNorm * 0.4) * 100) / 100

  return {
    lead_id: leadId,
    quality_checks: {
      frontal_quality: frontalQuality,
      mimic_set_complete: hasMimics,
      video_present: hasVideo,
    },
    region_scores: regionScores,
    stability_score: stabilityScore,
    overfill_risk_level: riskLevel,
    identity_preservation_score: Math.round((symNorm * 0.5 + propNorm * 0.5) * 100) / 100,
    // Dose recommendation removed — no clinical basis for automated dosing.
    // Doctor should determine dosing based on clinical examination.
    dose_recommendation: {
      range_cc: '—',
      upper_limit_cc: '—',
      risk_level: riskLevel,
    },
    feature_schema_version: '2.0.0',
    model_version: trustResult ? 'human-trust-v2' : 'human-v1',
  }
}

/**
 * Build region scores from enhanced wrinkle analysis + trust pipeline.
 * Uses actual texture-based scores instead of geometry proxies.
 */
function buildRegionScoresFromEnhanced(
  enhanced: EnhancedAnalysisResult,
  trustResult: TrustGatedResult,
): Record<string, number> {
  const wa = enhanced.wrinkleAnalysis!
  const normalize = (score: number) => Math.round(Math.min(1, score / 100) * 100) / 100

  // Helper: get wrinkle score for a region, considering trust pipeline confidence
  const getScore = (regionKey: string): number => {
    const wrinkleRegion = wa.regions.find(r => r.region === regionKey)
    if (!wrinkleRegion) return 0.1

    // Find the trust-validated metric for this region
    const validated = trustResult.wrinkleMetrics.find(
      m => m.data.region === regionKey
    )

    // If the metric was hidden (low confidence), discount the score
    if (validated?.decision === 'hide') {
      return Math.min(normalize(wrinkleRegion.score), 0.15)
    }
    if (validated?.decision === 'soft') {
      return normalize(wrinkleRegion.score) * 0.7
    }
    return normalize(wrinkleRegion.score)
  }

  // Bilateral: average left+right, weighted by confidence
  const bilateral = (leftKey: string, rightKey: string): number => {
    const l = getScore(leftKey)
    const r = getScore(rightKey)
    return Math.round(((l + r) / 2) * 100) / 100
  }

  return {
    alin: getScore('forehead'),
    glabella: getScore('glabella'),
    kaz_ayagi: bilateral('crow_feet_left', 'crow_feet_right'),
    goz_alti: bilateral('under_eye_left', 'under_eye_right'),
    yanak_orta_yuz: bilateral('cheek_left', 'cheek_right'),
    nazolabial: bilateral('nasolabial_left', 'nasolabial_right'),
    dudak: enhanced.lipAnalysis?.evaluable
      ? normalize(enhanced.lipAnalysis.volume === 'low' ? 40 : enhanced.lipAnalysis.volume === 'full' ? 20 : 15)
      : 0.15,
    marionette: bilateral('marionette_left', 'marionette_right'),
    jawline: getScore('jawline'),
    cene_ucu: getScore('jawline') * 0.8,
    cilt_kalitesi: enhanced.skinTexture
      ? normalize(100 - enhanced.skinTexture.smoothness)
      : 0.3,
    simetri_gozlemi: enhanced.symmetryAnalysis
      ? normalize((100 - enhanced.symmetryAnalysis.overallScore))
      : 0.2,
  }
}

/**
 * Fallback: geometry-only region scores (legacy path).
 * Less reliable — no texture or wrinkle data.
 */
function buildRegionScoresFromGeometry(
  metrics: AnalysisResult['metrics'],
  scores: AnalysisResult['scores'],
): Record<string, number> {
  const symNorm = scores.symmetry / 100
  const propNorm = scores.proportion / 100

  return {
    alin: Math.min(1, Math.abs(1 - metrics.faceRatio / 1.35) * 1.2),
    glabella: Math.min(1, (1 - symNorm) * 1.5),
    kaz_ayagi: Math.min(1, Math.max(0.1, 0.3 + (1 - symNorm) * 0.5)),
    goz_alti: Math.min(1, Math.abs(metrics.eyeDistanceRatio - 0.32) * 3),
    yanak_orta_yuz: Math.min(1, Math.abs(metrics.noseToFaceWidth - 0.25) * 3),
    nazolabial: Math.min(1, Math.abs(1 - propNorm) * 1.2),
    dudak: Math.min(1, Math.abs(metrics.mouthToNoseWidth - 1.6) * 0.5),
    marionette: Math.min(1, Math.max(0, 0.2 + Math.abs(scores.proportion - 85) / 85 * 0.4)),
    jawline: Math.min(1, Math.abs(metrics.faceRatio - 1.35) * 1.5),
    cene_ucu: Math.min(1, Math.abs(metrics.faceRatio - 1.35)),
    cilt_kalitesi: Math.max(0.15, 0.5 - symNorm * 0.3),
    simetri_gozlemi: Math.min(1, (1 - metrics.symmetryRatio) * 3),
  }
}

export function derivePatientSummary(
  result: AnalysisResult,
  concernArea: ConcernArea | undefined
): PatientSummary {
  const area = concernArea ?? 'genel_yuz_dengesi'
  const focusAreas: string[] = []

  if (result.metrics.symmetryRatio < 0.9) focusAreas.push('Simetri Düzeltme')
  if (result.metrics.eyeDistanceRatio < 0.28 || result.metrics.eyeDistanceRatio > 0.36) focusAreas.push('Göz Çevresi')
  if (result.metrics.noseToFaceWidth > 0.3) focusAreas.push('Burun Bölgesi')
  if (result.metrics.faceRatio < 1.2 || result.metrics.faceRatio > 1.5) focusAreas.push('Yüz Oranı')
  if (result.metrics.mouthToNoseWidth < 1.3 || result.metrics.mouthToNoseWidth > 1.8) focusAreas.push('Dudak / Alt Yüz')

  const concernLabel = concernAreaLabels[area]
  if (!focusAreas.includes(concernLabel)) focusAreas.unshift(concernLabel)
  if (focusAreas.length < 2) focusAreas.push('Genel Yüz Dengesi')

  const avg = Math.round((result.scores.symmetry + result.scores.proportion) / 2)
  const qualityLabel = avg >= 70 ? 'dengeli' : avg >= 50 ? 'orta düzeyde' : 'belirgin farklılıklar içeren'

  return {
    status: 'ready',
    photo_quality: 'good' as PhotoQuality,
    focus_areas: focusAreas.slice(0, 4),
    consultation_recommended: true,
    summary_text: `AI ön analiz tamamlandı. Yüz oranları ${qualityLabel} bir profil gösteriyor. ${concernLabel} odağında detaylı doktor değerlendirmesi önerilir. Simetri skoru: ${result.scores.symmetry}/100, Oran uyumu: ${result.scores.proportion}/100.`,
    feature_schema_version: '2.0.0',
    model_version: 'human-v1',
  }
}

export function deriveConsultationReadiness(lead: Partial<Lead>): ConsultationReadiness {
  let score = 15
  if (lead.consultation_timing === 'asap') score += 25
  else if (lead.consultation_timing === 'iki_hafta') score += 15
  else if (lead.consultation_timing === 'bir_ay') score += 5
  if (lead.prior_treatment) score += 15
  if (lead.desired_result_style && lead.desired_result_style !== 'emin_degil') score += 10
  if (lead.expectation_note?.trim()) score += 10
  if (lead.patient_photo_url) score += 10
  if (lead.concern_area && lead.concern_area !== 'genel_yuz_dengesi') score += 5
  score = Math.min(score, 100)

  const band: ReadinessBand =
    score >= 80 ? 'very_high' :
    score >= 60 ? 'high' :
    score >= 35 ? 'medium' : 'low'

  const timingMap: Record<string, TimeIntent> = {
    asap: 'asap',
    iki_hafta: 'within_2_weeks',
    bir_ay: 'within_1_month',
    bilgi_almak: 'exploratory',
  }

  const goalClarity: GoalClarity =
    lead.desired_result_style === 'emin_degil' ? 'low' :
    lead.expectation_note?.trim() ? 'high' : 'medium'

  const followupMap: Record<ReadinessBand, string> = {
    very_high: 'Aynı gün iletişime geç',
    high: '24 saat içinde WhatsApp ile iletişime geç',
    medium: '2 gün içinde takip et',
    low: 'Nurture listesine al',
  }

  const upsell: UpsellPotential =
    lead.prior_treatment && score >= 60 ? 'high' :
    score >= 35 ? 'medium' : 'low'

  return {
    readiness_score: score,
    readiness_band: band,
    primary_motivation: lead.expectation_note?.slice(0, 80) ?? (concernAreaLabels[lead.concern_area ?? 'genel_yuz_dengesi'] + ' iyileştirmesi'),
    goal_clarity: goalClarity,
    time_intent: timingMap[lead.consultation_timing ?? 'bilgi_almak'] ?? 'exploratory',
    prior_experience: lead.prior_treatment ?? false,
    communication_preference: 'whatsapp' as CommunicationPreference,
    recommended_followup: followupMap[band],
    upsell_potential: upsell,
    feature_schema_version: '1.0.0',
    model_version: 'readiness-v1',
  }
}
