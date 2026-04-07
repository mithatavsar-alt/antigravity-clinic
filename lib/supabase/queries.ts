/**
 * Supabase write/read helpers for the Antigravity Clinic.
 *
 * All functions accept a Supabase client (browser or server) so they
 * work from both client components and server actions.
 * Errors are returned, never thrown — callers decide how to handle.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from '@/types/lead'

// ─── Types ────────────────────────────────────────────────────

export interface PatientInsert {
  full_name: string
  phone: string
  age_range: string
  gender: string
  city?: string
  source?: string
}

export interface IntakeInsert {
  patient_id: string
  concern_area: string
  concern_sub_areas?: string[]
  desired_result_style: string
  prior_treatment: boolean
  consultation_timing: string
  expectation_note?: string
}

export interface ConsentInsert {
  patient_id: string
  consent_given: boolean
  consent_text_version: string
  consent_timestamp?: string
  ip_address?: string
  user_agent?: string
}

export interface SessionInsert {
  patient_id: string
  intake_id?: string
  consent_id?: string
  status?: string
  capture_confidence?: string
  capture_quality_score?: number
  capture_manifest?: Record<string, unknown>
  liveness_status?: string
  liveness_passed?: boolean
  liveness_confidence?: number
  photo_urls?: Record<string, string>
}

export interface SessionUpdate {
  status?: string
  capture_confidence?: string
  capture_quality_score?: number
  capture_manifest?: Record<string, unknown>
  liveness_status?: string
  liveness_passed?: boolean
  liveness_confidence?: number
  analysis_source?: Record<string, unknown>
  overall_reliability_band?: string
  report_confidence?: number
  recapture_recommended?: boolean
  recapture_views?: string[]
  output_degraded?: boolean
  canonical_analysis?: Record<string, unknown>
  photo_urls?: Record<string, string>
  updated_at?: string
}

export interface ResultInsert {
  session_id: string
  ai_scores?: Record<string, unknown> | null
  wrinkle_scores?: Record<string, unknown> | null
  focus_areas?: unknown[] | null
  radar_analysis?: Record<string, unknown> | null
  trust_pipeline?: Record<string, unknown> | null
  specialist_analysis?: Record<string, unknown> | null
  multi_view_analysis?: Record<string, unknown> | null
  lip_analysis?: Record<string, unknown> | null
  age_estimation?: Record<string, unknown> | null
  skin_scores?: Record<string, unknown> | null
  estimated_age?: number | null
  estimated_gender?: string | null
  doctor_analysis?: Record<string, unknown> | null
  patient_summary?: Record<string, unknown> | null
  consultation_readiness?: Record<string, unknown> | null
  readiness_score?: number
  readiness_band?: string
}

export interface AuditInsert {
  event: string
  patient_id?: string | null
  session_id?: string | null
  payload?: Record<string, unknown>
}

export interface AppointmentInsert {
  patient_id: string
  session_id?: string
  channel?: string
  status?: string
  notes?: string
}

// ─── Patient ──────────────────────────────────────────────────

export async function upsertPatient(sb: SupabaseClient, data: PatientInsert) {
  // Try find existing by phone first
  const { data: existing } = await sb
    .from('patients')
    .select('id')
    .eq('phone', data.phone)
    .maybeSingle()

  if (existing) {
    const { data: updated, error } = await sb
      .from('patients')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) console.error('[Supabase] upsertPatient update FAILED:', error.message)
    return { id: updated?.id ?? existing.id, error }
  }

  const { data: inserted, error } = await sb
    .from('patients')
    .insert(data)
    .select('id')
    .single()
  if (error) console.error('[Supabase] upsertPatient insert FAILED:', error.message)
  return { id: inserted?.id, error }
}

// ─── Intake ───────────────────────────────────────────────────

export async function insertIntake(sb: SupabaseClient, data: IntakeInsert) {
  const { data: row, error } = await sb
    .from('analysis_intakes')
    .insert(data)
    .select('id')
    .single()
  if (error) console.error('[Supabase] insertIntake FAILED:', error.message, '| code:', error.code)
  return { id: row?.id, error }
}

// ─── Consent ──────────────────────────────────────────────────

export async function insertConsent(sb: SupabaseClient, data: ConsentInsert) {
  // Strip undefined values — Supabase REST API rejects unknown/null-typed columns
  const payload: Record<string, unknown> = {
    patient_id: data.patient_id,
    consent_given: data.consent_given,
    consent_text_version: data.consent_text_version,
    // DB check constraint requires consent_timestamp when consent_given = true
    consent_timestamp: data.consent_timestamp || (data.consent_given ? new Date().toISOString() : undefined),
  }
  if (data.ip_address) payload.ip_address = data.ip_address
  if (data.user_agent) payload.user_agent = data.user_agent

  console.log('[Supabase] insertConsent payload keys:', Object.keys(payload))

  const { data: row, error } = await sb
    .from('analysis_consents')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    console.error('[Supabase] insertConsent FAILED:', error.message, '| code:', error.code)
  }
  return { id: row?.id, error }
}

// ─── Session ──────────────────────────────────────────────────

export async function insertSession(sb: SupabaseClient, data: SessionInsert) {
  // Build payload with only defined values — prevents 400 from unknown columns
  const payload: Record<string, unknown> = {
    patient_id: data.patient_id,
    status: data.status ?? 'consented',
  }
  if (data.intake_id) payload.intake_id = data.intake_id
  if (data.consent_id) payload.consent_id = data.consent_id
  if (data.capture_confidence) payload.capture_confidence = data.capture_confidence
  if (data.capture_quality_score != null) payload.capture_quality_score = data.capture_quality_score
  if (data.capture_manifest) payload.capture_manifest = data.capture_manifest
  if (data.liveness_status) payload.liveness_status = data.liveness_status
  if (data.liveness_passed != null) payload.liveness_passed = data.liveness_passed
  if (data.liveness_confidence != null) payload.liveness_confidence = data.liveness_confidence
  if (data.photo_urls) payload.photo_urls = data.photo_urls

  const { data: row, error } = await sb
    .from('analysis_sessions')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    console.error('[Supabase] insertSession FAILED:', error.message, '| code:', error.code, '| payload keys:', Object.keys(payload))
  }
  return { id: row?.id, error }
}

export async function updateSession(sb: SupabaseClient, id: string, data: SessionUpdate) {
  const { error } = await sb
    .from('analysis_sessions')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { error }
}

// ─── Results ──────────────────────────────────────────────────

export async function upsertResult(sb: SupabaseClient, data: ResultInsert) {
  const { data: existing } = await sb
    .from('analysis_results')
    .select('id')
    .eq('session_id', data.session_id)
    .maybeSingle()

  if (existing) {
    const { error } = await sb
      .from('analysis_results')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('session_id', data.session_id)
    return { id: existing.id, error }
  }

  const { data: row, error } = await sb
    .from('analysis_results')
    .insert(data)
    .select('id')
    .single()
  return { id: row?.id, error }
}

// ─── Appointment ──────────────────────────────────────────────

export async function insertAppointment(sb: SupabaseClient, data: AppointmentInsert) {
  const { data: row, error } = await sb
    .from('appointment_requests')
    .insert(data)
    .select('id')
    .single()
  return { id: row?.id, error }
}

// ─── Doctor Notes ─────────────────────────────────────────────

export async function insertDoctorNote(sb: SupabaseClient, sessionId: string, noteText: string) {
  const { data: row, error } = await sb
    .from('doctor_notes')
    .insert({ session_id: sessionId, note_text: noteText })
    .select('id')
    .single()
  return { id: row?.id, error }
}

// ─── Audit ────────────────────────────────────────────────────

export async function insertAuditEvent(sb: SupabaseClient, data: AuditInsert) {
  const { error } = await sb
    .from('audit_events')
    .insert(data)
  return { error }
}

// ─── Read helpers (doctor dashboard) ──────────────────────────

export async function fetchLeadsWithResults(sb: SupabaseClient) {
  const { data, error } = await sb
    .from('analysis_sessions')
    .select(`
      id,
      patient_id,
      status,
      capture_confidence,
      report_confidence,
      overall_reliability_band,
      recapture_recommended,
      photo_urls,
      created_at,
      updated_at,
      patients (
        id,
        full_name,
        phone,
        age_range,
        gender,
        city,
        source
      ),
      analysis_intakes (
        concern_area,
        concern_sub_areas,
        desired_result_style,
        prior_treatment,
        consultation_timing,
        expectation_note
      ),
      analysis_consents (
        consent_given,
        consent_timestamp,
        consent_text_version
      ),
      analysis_results (
        ai_scores,
        skin_scores,
        wrinkle_scores,
        focus_areas,
        radar_analysis,
        trust_pipeline,
        specialist_analysis,
        multi_view_analysis,
        lip_analysis,
        age_estimation,
        doctor_analysis,
        patient_summary,
        consultation_readiness,
        readiness_score,
        readiness_band,
        estimated_age,
        estimated_gender
      )
    `)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function fetchSessionById(sb: SupabaseClient, sessionId: string) {
  const { data, error } = await sb
    .from('analysis_sessions')
    .select(`
      *,
      patients (*),
      analysis_intakes (*),
      analysis_consents (*),
      analysis_results (*),
      doctor_notes (id, note_text, created_at)
    `)
    .eq('id', sessionId)
    .maybeSingle()

  return { data, error }
}

/**
 * Convert a Supabase session+joins row into a Lead-shaped object.
 * This bridges the Supabase relational model back to the flat Lead type
 * the existing UI components already consume.
 */
export function sessionToLead(row: Record<string, unknown>): Lead {
  const patient = (row.patients ?? {}) as Record<string, unknown>
  const intake = row.analysis_intakes
    ? (Array.isArray(row.analysis_intakes) ? row.analysis_intakes[0] : row.analysis_intakes) as Record<string, unknown> | undefined
    : undefined
  const consent = row.analysis_consents
    ? (Array.isArray(row.analysis_consents) ? row.analysis_consents[0] : row.analysis_consents) as Record<string, unknown> | undefined
    : undefined
  const result = row.analysis_results
    ? (Array.isArray(row.analysis_results) ? row.analysis_results[0] : row.analysis_results) as Record<string, unknown> | undefined
    : undefined
  const notes = row.doctor_notes as Array<Record<string, unknown>> | undefined
  const photoUrls = (row.photo_urls ?? {}) as Record<string, string>

  return {
    id: row.id as string,
    full_name: patient.full_name as string ?? '',
    gender: (patient.gender as Lead['gender']) ?? 'female',
    age_range: (patient.age_range as Lead['age_range']) ?? '25-34',
    phone: patient.phone as string ?? '',
    city: patient.city as string | undefined,
    source: (patient.source as Lead['source']) ?? 'website',

    concern_area: (intake?.concern_area as Lead['concern_area']) ?? 'genel_yuz_dengesi',
    concern_sub_areas: intake?.concern_sub_areas as Lead['concern_sub_areas'],
    desired_result_style: (intake?.desired_result_style as Lead['desired_result_style']) ?? 'emin_degil',
    prior_treatment: intake?.prior_treatment as boolean ?? false,
    consultation_timing: (intake?.consultation_timing as Lead['consultation_timing']) ?? 'bilgi_almak',
    expectation_note: intake?.expectation_note as string | undefined,

    consent_given: consent?.consent_given as boolean ?? false,
    consent_timestamp: consent?.consent_timestamp as string ?? row.created_at as string,
    consent_text_version: consent?.consent_text_version as string ?? '1.0.0',

    status: (row.status as Lead['status']) ?? 'new',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,

    patient_photo_url: photoUrls.front,
    doctor_frontal_photos: [photoUrls.front, photoUrls.left, photoUrls.right].filter(Boolean) as string[],
    doctor_mimic_photos: [],
    before_media: [],
    after_media: [],

    ai_scores: result?.ai_scores as Lead['ai_scores'],
    skin_scores: result?.skin_scores as Lead['skin_scores'],
    wrinkle_scores: result?.wrinkle_scores as Lead['wrinkle_scores'],
    focus_areas: result?.focus_areas as Lead['focus_areas'],
    radar_analysis: result?.radar_analysis as Lead['radar_analysis'],
    trust_pipeline: result?.trust_pipeline as Lead['trust_pipeline'],
    specialist_analysis: result?.specialist_analysis as Lead['specialist_analysis'],
    multi_view_analysis: result?.multi_view_analysis as Lead['multi_view_analysis'],
    lip_analysis: result?.lip_analysis as Lead['lip_analysis'],
    age_estimation: result?.age_estimation as Lead['age_estimation'],
    estimated_age: result?.estimated_age as number | undefined,
    estimated_gender: result?.estimated_gender as string | undefined,
    doctor_analysis: result?.doctor_analysis as Lead['doctor_analysis'],
    patient_summary: result?.patient_summary as Lead['patient_summary'],
    consultation_readiness: result?.consultation_readiness as Lead['consultation_readiness'],
    readiness_score: result?.readiness_score as number | undefined,
    readiness_band: result?.readiness_band as Lead['readiness_band'],

    doctor_notes: notes?.length ? notes[notes.length - 1].note_text as string : undefined,
    doctor_notes_updated_at: notes?.length ? notes[notes.length - 1].created_at as string : undefined,

    capture_confidence: row.capture_confidence as Lead['capture_confidence'],
    overall_reliability_band: row.overall_reliability_band as Lead['overall_reliability_band'],
    recapture_recommended: row.recapture_recommended as boolean | undefined,
  } as Lead
}
