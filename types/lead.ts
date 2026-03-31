export type LeadStatus =
  | 'new'
  | 'consented'
  | 'analysis_ready'
  | 'doctor_reviewed'
  | 'contacted'
  | 'booked'
  | 'archived'

export type ConcernArea =
  | 'yuz_hatlari'
  | 'cizgiler_kirisiklik'
  | 'cilt'
  // Legacy values (backwards compat)
  | 'goz_cevresi'
  | 'dudak'
  | 'alt_yuz_jawline'
  | 'cilt_gorunumu'
  | 'genel_yuz_dengesi'

export type ConcernSubArea =
  | 'dudak'
  | 'cene_hatti'
  | 'yanak'
  | 'alin'
  | 'kas_arasi'
  | 'kaz_ayagi'
  | 'nazolabial'
  | 'cilt_kalitesi'

export type DesiredResultStyle =
  | 'cok_dogal'
  | 'dogal_fark_edilir'
  | 'belirgin'
  | 'emin_degil'

export type ConsultationTiming =
  | 'bilgi_almak'
  | 'bir_ay'
  | 'iki_hafta'
  | 'asap'

export type ReadinessBand = 'low' | 'medium' | 'high' | 'very_high'
export type PhotoQuality = 'acceptable' | 'poor' | 'good'
export type GoalClarity = 'low' | 'medium' | 'high'
export type TimeIntent = 'exploratory' | 'within_1_month' | 'within_2_weeks' | 'asap'
export type CommunicationPreference = 'whatsapp' | 'phone' | 'email'
export type UpsellPotential = 'low' | 'medium' | 'high'
export type LeadSource = 'website' | 'instagram' | 'referral' | 'whatsapp'

export const concernAreaLabels: Record<ConcernArea, string> = {
  yuz_hatlari: 'Yüz Hatları',
  cizgiler_kirisiklik: 'Çizgiler & Kırışıklık',
  cilt: 'Cilt',
  // Legacy
  goz_cevresi: 'Göz Çevresi',
  dudak: 'Dudak',
  alt_yuz_jawline: 'Alt Yüz / Jawline',
  cilt_gorunumu: 'Cilt Görünümü',
  genel_yuz_dengesi: 'Genel Yüz Dengesi',
}

export const concernSubAreaLabels: Record<ConcernSubArea, string> = {
  dudak: 'Dudak',
  cene_hatti: 'Çene Hattı',
  yanak: 'Yanak',
  alin: 'Alın',
  kas_arasi: 'Kaş Arası',
  kaz_ayagi: 'Kaz Ayağı',
  nazolabial: 'Nazolabial',
  cilt_kalitesi: 'Cilt Kalitesi',
}

export const CONCERN_GROUPS: { key: ConcernArea; label: string; subs: ConcernSubArea[] }[] = [
  { key: 'yuz_hatlari', label: 'Yüz Hatları', subs: ['dudak', 'cene_hatti', 'yanak'] },
  { key: 'cizgiler_kirisiklik', label: 'Çizgiler & Kırışıklık', subs: ['alin', 'kas_arasi', 'kaz_ayagi', 'nazolabial'] },
  { key: 'cilt', label: 'Cilt', subs: ['cilt_kalitesi'] },
]

export const desiredResultLabels: Record<DesiredResultStyle, string> = {
  cok_dogal: 'Çok Doğal',
  dogal_fark_edilir: 'Doğal ama Fark Edilir',
  belirgin: 'Daha Belirgin',
  emin_degil: 'Emin Değilim',
}

export const consultationTimingLabels: Record<ConsultationTiming, string> = {
  bilgi_almak: 'Sadece Bilgi Almak İstiyorum',
  bir_ay: '1 Ay İçinde',
  iki_hafta: '1-2 Hafta İçinde',
  asap: 'Mümkün Olan En Kısa Sürede',
}

export const photoQualityLabels: Record<PhotoQuality, string> = {
  poor: 'Yetersiz',
  acceptable: 'Kabul Edilebilir',
  good: 'İyi',
}

export const goalClarityLabels: Record<GoalClarity, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
}

export const timeIntentLabels: Record<TimeIntent, string> = {
  exploratory: 'Bilgi toplama aşamasında',
  within_1_month: '1 ay içinde',
  within_2_weeks: '1-2 hafta içinde',
  asap: 'En kısa sürede',
}

export const communicationPreferenceLabels: Record<CommunicationPreference, string> = {
  whatsapp: 'WhatsApp',
  phone: 'Telefon',
  email: 'E-posta',
}

export const upsellPotentialLabels: Record<UpsellPotential, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
}

export const sourceLabels: Record<LeadSource, string> = {
  website: 'Web sitesi',
  instagram: 'Instagram',
  referral: 'Referans',
  whatsapp: 'WhatsApp',
}

export interface Lead {
  id: string
  full_name: string
  gender: 'female' | 'male' | 'other'
  age_range: '18-24' | '25-34' | '35-44' | '45-54' | '55+'
  phone: string
  city?: string
  concern_area: ConcernArea
  concern_sub_areas?: ConcernSubArea[]
  expectation_note?: string
  desired_result_style: DesiredResultStyle
  prior_treatment: boolean
  consultation_timing: ConsultationTiming

  consent_given: boolean
  consent_timestamp: string
  consent_text_version: string

  status: LeadStatus
  source: LeadSource

  created_at: string
  updated_at: string

  patient_photo_url?: string
  doctor_frontal_photos: string[]
  doctor_mimic_photos: string[]
  optional_video_url?: string
  before_media: string[]
  after_media: string[]

  patient_summary?: PatientSummary
  doctor_analysis?: DoctorAnalysis
  consultation_readiness?: ConsultationReadiness

  ai_scores?: {
    symmetry: number
    proportion: number
    suggestions: string[]
    metrics: {
      faceRatio: number
      eyeDistanceRatio: number
      noseToFaceWidth: number
      mouthToNoseWidth: number
      symmetryRatio: number
    }
  }

  /** PerfectCorp skin analysis scores (from server-side API) */
  skin_scores?: {
    skinAge: number | null
    wrinkle: number | null
    texture: number | null
    pore: number | null
    pigmentation: number | null
    redness: number | null
    face_symmetry: number | null
    face_harmony: number | null
  }

  /** Estimated age from Human engine */
  estimated_age?: number | null

  /** Estimated gender from Human engine */
  estimated_gender?: string | null

  /** Gender detection confidence 0-1 */
  estimated_gender_confidence?: number

  /** Focus areas with cosmetic-support insights */
  focus_areas?: Array<{
    region: string
    label: string
    score: number
    insight: string
    doctorReviewRecommended: boolean
  }>

  /** Wrinkle / skin-line analysis scores */
  wrinkle_scores?: {
    regions: Array<{
      region: string
      label: string
      density: number
      score: number
      level: 'minimal' | 'low' | 'medium' | 'high'
      insight: string
      confidence: number
      detected?: boolean
      evidenceStrength?: 'strong' | 'moderate' | 'weak' | 'insufficient'
    }>
    overallScore: number
    overallLevel: 'minimal' | 'low' | 'medium' | 'high'
  }

  /** Suggested doctor-review zones */
  suggested_zones?: string[]

  /** Detection confidence 0-1 */
  analysis_confidence?: number

  /** Capture quality from camera validation (high = all checks, medium = 1 missing) */
  capture_confidence?: 'high' | 'medium' | 'low'

  /** Overall quality score 0-100 */
  quality_score?: number

  /** Tracks where the analysis data came from */
  analysis_source?: {
    provider: 'facemesh-local' | 'human-local' | 'perfectcorp' | 'combined' | 'mock'
    source: 'real-client-side' | 'real-api' | 'combined' | 'fallback'
    facemesh_ok: boolean
    perfectcorp_ok: boolean
    analyzed_at: string
  }

  /** Radar analysis: 11-category aesthetic scores with insights */
  radar_analysis?: {
    analysisMeta: {
      overallConfidence: number
      imageQuality: number
      captureQuality: 'high' | 'medium' | 'low'
      generatedAt: string
    }
    radarScores: Array<{
      key: string
      label: string
      score: number
      confidence: number
      category: 'botox' | 'filler' | 'structure' | 'overall'
      insight: string
    }>
    derivedInsights: {
      strongestAreas: string[]
      improvementAreas: string[]
      summaryText: string
    }
  }

  /** Multi-signal age estimation (range + confidence + drivers) */
  age_estimation?: {
    estimatedRange: [number, number]
    pointEstimate: number
    confidence: 'low' | 'medium' | 'high'
    confidenceScore: number
    drivers: Array<{
      signal: string
      label: string
      weight: number
      description: string
    }>
    caveat: string | null
  }

  /** Trust pipeline metadata — confidence gating, validation, decisions */
  trust_pipeline?: {
    overall_confidence: number
    quality_gate_verdict: 'pass' | 'degrade' | 'block'
    quality_gate_score: number
    young_face_active: boolean
    age_profile: 'young' | 'middle' | 'mature'
    metrics_shown: number
    metrics_soft: number
    metrics_suppressed: number
    quality_caveat: string | null
    findings: Array<{
      text: string
      region: string
      band: 'high' | 'moderate' | 'low' | 'insufficient'
      isSoft: boolean
    }>
  }

  doctor_notes?: string
  doctor_notes_updated_at?: string
  report_url?: string
  report_generated_at?: string

  readiness_score?: number
  readiness_band?: ReadinessBand
}

export interface PatientSummary {
  status: 'ready' | 'pending'
  photo_quality: PhotoQuality
  focus_areas: string[]
  consultation_recommended: boolean
  summary_text: string
  feature_schema_version: string
  model_version: string
}

export interface DoctorAnalysis {
  lead_id: string
  quality_checks: {
    frontal_quality: PhotoQuality
    mimic_set_complete: boolean
    video_present: boolean
  }
  region_scores: Record<string, number>
  stability_score: number
  overfill_risk_level: 'low' | 'medium' | 'high'
  identity_preservation_score: number
  dose_recommendation: {
    range_cc: string
    upper_limit_cc: string
    risk_level: 'low' | 'medium' | 'high'
  }
  feature_schema_version: string
  model_version: string
}

export interface ConsultationReadiness {
  readiness_score: number
  readiness_band: ReadinessBand
  primary_motivation: string
  goal_clarity: GoalClarity
  time_intent: TimeIntent
  prior_experience: boolean
  communication_preference: CommunicationPreference
  recommended_followup: string
  upsell_potential: UpsellPotential
  feature_schema_version: string
  model_version: string
}
