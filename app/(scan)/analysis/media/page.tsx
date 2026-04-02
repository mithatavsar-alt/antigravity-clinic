'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { FaceGuideCapture, type CaptureMetadata, type MultiCaptureResult } from '@/components/analysis/FaceGuideCapture'
import { buildPatientSummary } from '@/lib/lead-helpers'
import { deriveConsultationReadiness } from '@/lib/ai/derive-doctor-analysis'
import { generateLeadId } from '@/lib/utils'
import { getActiveConsentVersion } from '@/data/consent-versions'
import { logAuditEvent } from '@/lib/audit'
import type { Lead } from '@/types/lead'

export default function AnalysisMediaPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead, addLead } = useClinicStore()
  const navigatingRef = useRef(false)

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
    }
  }, [currentLead, router])

  /** Shared logic: create lead and navigate to processing (used by auto-advance and consent) */
  const createLeadAndProcess = useCallback((photoUrl: string, confidence: 'high' | 'medium' | 'low') => {
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
      doctor_frontal_photos: [photoUrl],
      doctor_mimic_photos: [],
      optional_video_url: undefined,
      before_media: [],
      after_media: [],
      capture_confidence: confidence,
      patient_summary: buildPatientSummary({ concern_area: cl.concern_area, patient_photo_url: photoUrl }),
      consultation_readiness: deriveConsultationReadiness(cl),
    }

    addLead(lead)
    logAuditEvent('form_completed', { lead_id: id })
    logAuditEvent('consent_granted', { lead_id: id, version: consentVersion.version })
    router.push(`/analysis/processing?id=${id}`)
  }, [addLead, router])

  /** Multi-angle capture: front + left + right */
  const handleMultiCapture = useCallback((photos: MultiCaptureResult, meta?: CaptureMetadata) => {
    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: photos.front,
      doctor_frontal_photos: [photos.front, photos.left, photos.right],
      doctor_mimic_photos: [],
      capture_confidence: confidence,
    })

    createLeadAndProcess(photos.front, confidence)
  }, [setCurrentLead, createLeadAndProcess])

  /** Fallback single capture (e.g. if multi fails or for legacy compat) */
  // With strict capture gate, all captured frames meet quality criteria.
  // Always go directly to processing — no consent detour needed.
  const handleCapture = useCallback((dataUrl: string, meta?: CaptureMetadata) => {
    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: dataUrl,
      doctor_frontal_photos: [dataUrl],
      capture_confidence: confidence,
    })

    createLeadAndProcess(dataUrl, confidence)
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
      {/* FaceGuideCapture renders as its own fixed full-screen overlay (z-[60]).
          This wrapper prevents background scroll and ensures no content leaks beneath. */}
      <FaceGuideCapture
        mode="multi"
        onCapture={handleCapture}
        onMultiCapture={handleMultiCapture}
        onClose={handleBack}
      />
    </div>
  )
}
