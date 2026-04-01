'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { EditorialHeading } from '@/components/design-system/EditorialHeading'
import { AnalysisStepBar } from '@/components/analysis/AnalysisStepBar'
import { FaceMeshCamera, type CaptureMetadata } from '@/components/analysis/FaceMeshCamera'
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

  const handleCapture = useCallback((dataUrl: string, meta?: CaptureMetadata) => {
    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: dataUrl,
      doctor_frontal_photos: [dataUrl],
      capture_confidence: confidence,
    })

    // High-confidence auto-capture: skip consent, go directly to processing
    if (confidence === 'high') {
      createLeadAndProcess(dataUrl, confidence)
    } else {
      // Medium/low: show consent step for manual confirmation
      router.push('/analysis/consent')
    }
  }, [setCurrentLead, router, createLeadAndProcess])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  if (!currentLead?.full_name) return null

  return (
    <div className="theme-dark min-h-screen py-28 px-5 relative" style={{ background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)' }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 35%, rgba(214,185,140,0.03) 0%, transparent 55%)' }} />

      <div className="relative max-w-2xl mx-auto">
        <div className="text-center mb-10" style={{ animation: 'cardEntrance 0.5s ease-out both' }}>
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[var(--color-gold)] mb-3">Adım 2 / 3</p>
          <EditorialHeading as="h1" light>Yüz Tarama</EditorialHeading>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-[rgba(214,185,140,0.3)]" />
            <div className="w-1 h-1 rounded-full bg-[rgba(214,185,140,0.35)]" />
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-[rgba(214,185,140,0.3)]" />
          </div>
        </div>

        <GlassCard strong padding="lg" rounded="xl" className="[animation:cardEntrance_0.5s_ease-out_0.15s_both]">
          <AnalysisStepBar currentStep={2} labels={['Kişisel Bilgiler', 'Yüz Tarama', 'Onay']} />

          <p className="font-body text-[12px] text-[var(--color-text-secondary)] mb-5 leading-relaxed text-center">
            Yüzünüzü kameraya gösterin. AI otomatik olarak en iyi kareyi seçecektir.
          </p>

          <FaceMeshCamera onCapture={handleCapture} onClose={handleBack} autoConfirm />
        </GlassCard>

        <div className="flex items-center justify-center gap-2 mt-6" style={{ animation: 'cardEntrance 0.4s ease-out 0.3s both' }}>
          <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="font-body text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            Fotoğraflarınız yalnızca cihazınızda işlenir. Sunucuya yüklenmez.
          </p>
        </div>
      </div>
    </div>
  )
}
