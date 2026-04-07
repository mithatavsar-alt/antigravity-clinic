'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { FaceGuideCapture, type CaptureMetadata, type MultiCaptureResult } from '@/components/analysis/FaceGuideCapture'
import { saveCaptureManifest, saveCapturedFramesByView } from '@/lib/photo-bridge'
import { buildPatientSummary } from '@/lib/lead-helpers'
import { deriveConsultationReadiness } from '@/lib/ai/derive-doctor-analysis'
import { generateLeadId } from '@/lib/utils'
import { getActiveConsentVersion } from '@/lib/data/consent-versions'
import { logAuditEvent } from '@/lib/audit'
import type { Lead } from '@/types/lead'

interface PersistCaptureResponse {
  ok?: boolean
  patientId?: string
  intakeId?: string | null
  consentId?: string | null
  sessionId?: string
  photoPaths?: Record<string, string>
  warnings?: Array<{ step: string; message: string }>
  error?: string
}

export default function AnalysisMediaPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead, addLead } = useClinicStore()
  const navigatingRef = useRef(false)

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
      return
    }

    // Workflow: entering capture phase.
    const { scanWorkflow, transitionWorkflow, resetWorkflow } = useClinicStore.getState()
    if (scanWorkflow.phase === 'result') {
      transitionWorkflow('start_recapture')
      transitionWorkflow('start_capture')
    } else if (scanWorkflow.phase !== 'capture') {
      resetWorkflow()
      transitionWorkflow('start_capture')
    }
  }, [currentLead, router])

  const persistManifest = useCallback((leadId: string, meta?: CaptureMetadata) => {
    if (meta?.captureManifest) {
      saveCaptureManifest(leadId, {
        ...meta.captureManifest,
        session_id: leadId,
      })
    }
    if (meta?.viewFrames) {
      saveCapturedFramesByView(leadId, meta.viewFrames)
    }
  }, [])

  const createLeadAndProcess = useCallback(async (photoUrl: string, confidence: 'high' | 'medium' | 'low', meta?: CaptureMetadata) => {
    if (navigatingRef.current) return
    navigatingRef.current = true

    const cl = useClinicStore.getState().currentLead ?? {}
    const consentVersion = getActiveConsentVersion()
    const now = new Date().toISOString()
    const id = generateLeadId()

    const lead: Omit<Lead, 'readiness_score' | 'readiness_band'> = {
      id,
      full_name: cl.full_name ?? '',
      gender: (cl.gender as Lead['gender']) ?? 'female',
      age_range: (cl.age_range as Lead['age_range']) ?? '25-34',
      phone: cl.phone ?? '',
      concern_area: (cl.concern_area as Lead['concern_area']) ?? 'genel_yuz_dengesi',
      concern_sub_areas: cl.concern_sub_areas,
      desired_result_style: (cl.desired_result_style as Lead['desired_result_style']) ?? 'emin_degil',
      prior_treatment: cl.prior_treatment ?? false,
      consultation_timing: (cl.consultation_timing as Lead['consultation_timing']) ?? 'bilgi_almak',
      expectation_note: cl.expectation_note,
      consent_given: true,
      consent_timestamp: now,
      consent_text_version: consentVersion.version,
      status: 'consented',
      source: 'website',
      created_at: now,
      updated_at: now,
      patient_photo_url: photoUrl,
      captured_frames: meta?.capturedFrames ?? cl.captured_frames,
      doctor_frontal_photos: cl.doctor_frontal_photos && cl.doctor_frontal_photos.length > 0
        ? cl.doctor_frontal_photos
        : [photoUrl],
      doctor_mimic_photos: cl.doctor_mimic_photos ?? [],
      optional_video_url: undefined,
      before_media: [],
      after_media: [],
      capture_confidence: confidence,
      capture_quality_score: meta?.captureQualityScore,
      recapture_recommended: meta?.recaptureRecommended,
      recapture_views: meta?.recaptureViews,
      capture_manifest: meta?.captureManifest,
      liveness_status: meta?.livenessStatus,
      liveness_confidence: meta?.livenessConfidence,
      liveness_required: meta?.livenessRequired,
      liveness_passed: meta?.livenessPassed,
      liveness_signals: meta?.livenessSignals,
      patient_summary: buildPatientSummary({ concern_area: cl.concern_area, patient_photo_url: photoUrl }),
      consultation_readiness: deriveConsultationReadiness(cl),
    }

    addLead(lead)
    persistManifest(id, meta)

    const { transitionWorkflow } = useClinicStore.getState()
    transitionWorkflow('capture_complete', { leadId: id })

    logAuditEvent('form_completed', { lead_id: id })
    logAuditEvent('consent_granted', { lead_id: id, version: consentVersion.version })
    logAuditEvent('capture_completed', {
      lead_id: id,
      capture_quality_score: meta?.captureQualityScore,
      recapture_recommended: meta?.recaptureRecommended ?? false,
      liveness_status: meta?.livenessStatus,
      liveness_confidence: meta?.livenessConfidence,
      liveness_passed: meta?.livenessPassed ?? false,
      capture_views: meta?.captureManifest?.views.map(view => ({
        view: view.view,
        accepted: view.captured,
        acceptance_score: Math.round(view.acceptance_score * 100),
        recapture_required: view.recapture_required,
      })),
    })
    if (meta?.recaptureRecommended) {
      logAuditEvent('capture_recapture_recommended', {
        lead_id: id,
        views: meta.recaptureViews ?? [],
      })
    }

    const photos: Record<string, string> = {}
    const frontal = cl.doctor_frontal_photos ?? [photoUrl]
    if (frontal[0]) photos.front = frontal[0]
    if (frontal[1]) photos.left = frontal[1]
    if (frontal[2]) photos.right = frontal[2]
    if (!photos.front) photos.front = photoUrl

    const rawLivenessConfidence = meta?.livenessConfidence
    const normalizedLivenessConfidence = rawLivenessConfidence != null && Number.isFinite(rawLivenessConfidence)
      ? Math.min(1, Math.max(0, rawLivenessConfidence > 1 ? rawLivenessConfidence / 100 : rawLivenessConfidence))
      : undefined

    const consentPayload = {
      consent_given: true,
      consent_text_version: consentVersion.version,
      consent_timestamp: now,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }

    const sessionPayload = {
      status: 'consented',
      capture_confidence: confidence,
      capture_quality_score: meta?.captureQualityScore,
      capture_manifest: meta?.captureManifest,
      liveness_status: meta?.livenessStatus,
      liveness_passed: meta?.livenessPassed,
      liveness_confidence: normalizedLivenessConfidence,
    }

    console.log('[Media] Persistence diagnostics:', {
      leadId: id,
      consent_given: consentPayload.consent_given,
      has_consent_timestamp: Boolean(consentPayload.consent_timestamp),
      consent_payload_keys: Object.keys(consentPayload).filter((key) => consentPayload[key as keyof typeof consentPayload] != null),
      raw_liveness_confidence: rawLivenessConfidence ?? null,
      normalized_liveness_confidence: normalizedLivenessConfidence ?? null,
      session_payload_keys: Object.keys(sessionPayload).filter((key) => sessionPayload[key as keyof typeof sessionPayload] != null),
      photo_views: Object.keys(photos),
      photo_details: Object.fromEntries(
        Object.entries(photos).map(([view, dataUrl]) => [view, {
          chars: dataUrl.length,
          kb: Math.round(dataUrl.length / 1024),
          prefix: dataUrl.slice(0, 40),
          isDataUri: dataUrl.startsWith('data:'),
        }]),
      ),
    })

    try {
      const response = await fetch('/api/analysis/persist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadId: id,
          patient: {
            full_name: cl.full_name ?? '',
            phone: cl.phone ?? '',
            age_range: (cl.age_range as string) ?? '25-34',
            gender: (cl.gender as string) ?? 'female',
            city: cl.city,
            source: 'website',
          },
          intake: {
            concern_area: (cl.concern_area as string) ?? 'genel_yuz_dengesi',
            concern_sub_areas: cl.concern_sub_areas as string[] | undefined,
            desired_result_style: (cl.desired_result_style as string) ?? 'emin_degil',
            prior_treatment: cl.prior_treatment ?? false,
            consultation_timing: (cl.consultation_timing as string) ?? 'bilgi_almak',
            expectation_note: cl.expectation_note,
          },
          consent: consentPayload,
          session: sessionPayload,
          photos,
          rawLivenessConfidence: rawLivenessConfidence ?? null,
        }),
      })

      const result = await response.json() as PersistCaptureResponse
      if (!response.ok || !result.sessionId || !result.patientId) {
        console.error('[Media] Persist request failed:', {
          status: response.status,
          error: result.error ?? 'Unknown persistence error',
        })
      } else {
        useClinicStore.getState().setCurrentLead({
          _supabase_session_id: result.sessionId,
          _supabase_patient_id: result.patientId,
        } as Partial<Lead>)
        console.log('[Media] Persist request completed:', {
          patientId: result.patientId,
          sessionId: result.sessionId,
          photoPaths: result.photoPaths ?? {},
          warnings: result.warnings ?? [],
        })
      }

      if (result.warnings && result.warnings.length > 0) {
        console.warn('[Media] Persist warnings:', result.warnings)
      }
    } catch (e) {
      console.error('[Media] Persist request exception (non-blocking):', e)
    }

    router.push(`/analysis/processing?id=${id}`)
  }, [addLead, persistManifest, router])

  const handleMultiCapture = useCallback((photos: MultiCaptureResult, meta?: CaptureMetadata) => {
    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: photos.front,
      captured_frames: meta?.capturedFrames,
      doctor_frontal_photos: [photos.front, photos.left, photos.right],
      doctor_mimic_photos: [],
      capture_confidence: confidence,
      liveness_status: meta?.livenessStatus,
      liveness_confidence: meta?.livenessConfidence,
    })

    createLeadAndProcess(photos.front, confidence, meta)
  }, [setCurrentLead, createLeadAndProcess])

  // With strict capture gate, all captured frames meet quality criteria.
  const handleCapture = useCallback((dataUrl: string, meta?: CaptureMetadata) => {
    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: dataUrl,
      captured_frames: meta?.capturedFrames,
      doctor_frontal_photos: [dataUrl],
      capture_confidence: confidence,
      liveness_status: meta?.livenessStatus,
      liveness_confidence: meta?.livenessConfidence,
    })

    createLeadAndProcess(dataUrl, confidence, meta)
  }, [setCurrentLead, createLeadAndProcess])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  if (!currentLead?.full_name) return null

  return (
    <div
      className="theme-dark fixed inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)' }}
    >
      <FaceGuideCapture
        mode="multi"
        onCapture={handleCapture}
        onMultiCapture={handleMultiCapture}
        onClose={handleBack}
      />
    </div>
  )
}
