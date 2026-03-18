import type { AnalysisResult } from './types'
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

function scoreToRegionValue(score: number, baseline: number): number {
  // Map a 0-100 score to a 0-1 region relevance value
  // Higher deviation from ideal = higher region score (more intervention needed)
  const deviation = Math.abs(score - 85) / 85
  return Math.min(1, Math.max(0, baseline + deviation * 0.4))
}

function inferRiskLevel(result: AnalysisResult): 'low' | 'medium' | 'high' {
  const avg = (result.scores.symmetry + result.scores.proportion) / 2
  if (avg >= 75) return 'low'
  if (avg >= 50) return 'medium'
  return 'high'
}

function inferDoseRange(riskLevel: 'low' | 'medium' | 'high'): {
  range_cc: string
  upper_limit_cc: string
} {
  switch (riskLevel) {
    case 'low':
      return { range_cc: '0.4 - 0.8 cc', upper_limit_cc: '1.0 cc' }
    case 'medium':
      return { range_cc: '0.8 - 1.6 cc', upper_limit_cc: '2.0 cc' }
    case 'high':
      return { range_cc: '1.6 - 2.4 cc', upper_limit_cc: '3.0 cc' }
  }
}

export function deriveDoctorAnalysis(
  leadId: string,
  result: AnalysisResult,
  lead: Partial<Lead>
): DoctorAnalysis {
  const { metrics, scores } = result
  const symNorm = scores.symmetry / 100
  const propNorm = scores.proportion / 100

  // Derive region scores from actual facial metrics
  const regionScores: Record<string, number> = {
    alin: Math.min(1, Math.abs(1 - metrics.faceRatio / 1.35) * 1.2),
    glabella: Math.min(1, (1 - symNorm) * 1.5),
    kaz_ayagi: Math.min(1, Math.max(0.1, 0.3 + (1 - symNorm) * 0.5)),
    goz_alti: Math.min(1, Math.abs(metrics.eyeDistanceRatio - 0.32) * 3),
    yanak_orta_yuz: Math.min(1, Math.abs(metrics.noseToFaceWidth - 0.25) * 3),
    nazolabial: Math.min(1, Math.abs(1 - propNorm) * 1.2),
    dudak: Math.min(1, Math.abs(metrics.mouthToNoseWidth - 1.6) * 0.5),
    marionette: scoreToRegionValue(scores.proportion, 0.2),
    jawline: Math.min(1, Math.abs(metrics.faceRatio - 1.35) * 1.5),
    cene_ucu: Math.min(1, Math.abs(metrics.faceRatio - 1.35)),
    cilt_kalitesi: Math.max(0.15, 0.5 - symNorm * 0.3),
    simetri_gozlemi: Math.min(1, (1 - metrics.symmetryRatio) * 3),
  }

  // Round all values
  for (const key of Object.keys(regionScores)) {
    regionScores[key] = Math.round(regionScores[key] * 100) / 100
  }

  const riskLevel = inferRiskLevel(result)
  const dose = inferDoseRange(riskLevel)

  const hasMimics = (lead.doctor_mimic_photos?.length ?? 0) >= 2
  const hasVideo = !!lead.optional_video_url

  return {
    lead_id: leadId,
    quality_checks: {
      frontal_quality: lead.patient_photo_url ? 'good' : 'poor',
      mimic_set_complete: hasMimics,
      video_present: hasVideo,
    },
    region_scores: regionScores,
    stability_score: Math.round(symNorm * 0.6 + propNorm * 0.4 * 100) / 100,
    overfill_risk_level: riskLevel,
    identity_preservation_score: Math.round((symNorm * 0.5 + propNorm * 0.5) * 100) / 100,
    dose_recommendation: {
      range_cc: dose.range_cc,
      upper_limit_cc: dose.upper_limit_cc,
      risk_level: riskLevel,
    },
    feature_schema_version: '1.0.0',
    model_version: 'facemesh-v1',
  }
}

export function derivePatientSummary(
  result: AnalysisResult,
  concernArea: ConcernArea | undefined
): PatientSummary {
  const area = concernArea ?? 'genel_yuz_dengesi'
  const focusAreas: string[] = []

  // Derive focus areas from actual analysis
  if (result.metrics.symmetryRatio < 0.9) focusAreas.push('Simetri Düzeltme')
  if (result.metrics.eyeDistanceRatio < 0.28 || result.metrics.eyeDistanceRatio > 0.36) focusAreas.push('Göz Çevresi')
  if (result.metrics.noseToFaceWidth > 0.3) focusAreas.push('Burun Bölgesi')
  if (result.metrics.faceRatio < 1.2 || result.metrics.faceRatio > 1.5) focusAreas.push('Yüz Oranı')
  if (result.metrics.mouthToNoseWidth < 1.3 || result.metrics.mouthToNoseWidth > 1.8) focusAreas.push('Dudak / Alt Yüz')

  // Always include the concern area label
  const concernLabel = concernAreaLabels[area]
  if (!focusAreas.includes(concernLabel)) focusAreas.unshift(concernLabel)

  // If we have few areas, add generic ones
  if (focusAreas.length < 2) focusAreas.push('Genel Yüz Dengesi')

  const avg = Math.round((result.scores.symmetry + result.scores.proportion) / 2)
  const qualityLabel = avg >= 70 ? 'dengeli' : avg >= 50 ? 'orta düzeyde' : 'belirgin farklılıklar içeren'

  return {
    status: 'ready',
    photo_quality: 'good' as PhotoQuality,
    focus_areas: focusAreas.slice(0, 4),
    consultation_recommended: true,
    summary_text: `AI ön analiz tamamlandı. Yüz oranları ${qualityLabel} bir profil gösteriyor. ${concernLabel} odağında detaylı doktor değerlendirmesi önerilir. Simetri skoru: ${result.scores.symmetry}/100, Oran uyumu: ${result.scores.proportion}/100.`,
    feature_schema_version: '1.0.0',
    model_version: 'facemesh-v1',
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
