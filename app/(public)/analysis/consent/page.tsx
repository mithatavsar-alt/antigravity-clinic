'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { ThinLine } from '@/components/design-system/ThinLine'
import { AnalysisStepBar } from '@/components/analysis/AnalysisStepBar'
import { ConsentForm } from '@/components/analysis/ConsentForm'
import { buildPatientSummary } from '@/lib/lead-helpers'
import { generateLeadId } from '@/lib/utils'
import { getActiveConsentVersion } from '@/data/consent-versions'
import { logAuditEvent } from '@/lib/audit'
import type { Lead } from '@/types/lead'

export default function AnalysisConsentPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead, addLead, clearCurrentLead } = useClinicStore()
  const [loading, setLoading] = useState(false)

  // Step guard: must have completed media step (photo uploaded)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
    } else if (!currentLead?.patient_photo_url) {
      router.replace('/analysis/media')
    }
  }, [currentLead, router])

  if (!currentLead?.full_name || !currentLead?.patient_photo_url) return null

  const handleConfirm = () => {
    setLoading(true)
    const consentVersion = getActiveConsentVersion()
    const now = new Date().toISOString()
    const id = generateLeadId()

    const lead: Omit<Lead, 'readiness_score' | 'readiness_band'> = {
      id,
      full_name: currentLead.full_name ?? '',
      gender: (currentLead.gender as Lead['gender']) ?? 'female',
      age_range: (currentLead.age_range as Lead['age_range']) ?? '25-34',
      phone: currentLead.phone ?? '',
      concern_area: (currentLead.concern_area as Lead['concern_area']) ?? 'genel_yuz_dengesi',
      desired_result_style: (currentLead.desired_result_style as Lead['desired_result_style']) ?? 'emin_degil',
      prior_treatment: currentLead.prior_treatment ?? false,
      consultation_timing: (currentLead.consultation_timing as Lead['consultation_timing']) ?? 'bilgi_almak',
      expectation_note: currentLead.expectation_note,
      consent_given: true,
      consent_timestamp: now,
      consent_text_version: consentVersion.version,
      status: 'analysis_ready',
      source: 'website',
      created_at: now,
      updated_at: now,
      patient_photo_url: currentLead.patient_photo_url ?? '',
      doctor_frontal_photos: currentLead.doctor_frontal_photos ?? [],
      doctor_mimic_photos: currentLead.doctor_mimic_photos ?? [],
      optional_video_url: currentLead.optional_video_url,
      before_media: [],
      after_media: [],
      patient_summary: buildPatientSummary({
        concern_area: currentLead.concern_area,
        patient_photo_url: currentLead.patient_photo_url,
      }),
    }

    setCurrentLead({ consent_given: true, consent_timestamp: now, consent_text_version: consentVersion.version })
    addLead(lead)
    logAuditEvent('form_completed', { lead_id: id })
    logAuditEvent('consent_granted', { lead_id: id, version: consentVersion.version })
    clearCurrentLead()
    router.push(`/analysis/processing?id=${id}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[#8B7FA8] mb-3">Adım 3 / 3</p>
          <h1 className="font-display text-[clamp(32px,5vw,48px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
            Onay
          </h1>
          <div className="flex justify-center mt-4">
            <ThinLine width={48} />
          </div>
        </div>

        <GlassCard strong padding="lg" rounded="xl">
          <AnalysisStepBar currentStep={3} labels={['Kişisel Bilgiler', 'Fotoğraf', 'Onay']} />
          <ConsentForm
            onConfirm={handleConfirm}
            onBack={() => router.back()}
            loading={loading}
          />
        </GlassCard>

        <p className="text-center font-body text-[11px] text-[rgba(26,26,46,0.35)] mt-6 leading-relaxed">
          Verileriniz KVKK kapsamında korunmaktadır.
        </p>
      </div>
    </div>
  )
}
