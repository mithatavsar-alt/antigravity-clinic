'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { ThinLine } from '@/components/design-system/ThinLine'
import { EditorialHeading } from '@/components/design-system/EditorialHeading'
import { AnalysisStepBar } from '@/components/analysis/AnalysisStepBar'
import { ConsentForm } from '@/components/analysis/ConsentForm'
import { buildPatientSummary } from '@/lib/lead-helpers'
import { deriveConsultationReadiness } from '@/lib/ai/derive-doctor-analysis'
import { generateLeadId } from '@/lib/utils'
import { getActiveConsentVersion } from '@/lib/data/consent-versions'
import { saveCaptureManifest } from '@/lib/photo-bridge'
import { logAuditEvent } from '@/lib/audit'
import type { Lead } from '@/types/lead'
import type { CaptureManifest } from '@/components/analysis/FaceGuideCapture'

export default function AnalysisConsentPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead, addLead } = useClinicStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step guard: must have completed media step (photo uploaded)
  // Skip guard while loading to prevent redirect race after clearCurrentLead()
  useEffect(() => {
    if (loading) return
    if (!currentLead?.full_name) {
      router.replace('/analysis')
    } else if (!currentLead?.patient_photo_url) {
      router.replace('/analysis/media')
    }
  }, [currentLead, router, loading])

  // Render guard — currentLead stays populated until processing page clears it
  if (!currentLead?.full_name || !currentLead?.patient_photo_url) return null

  const handleConfirm = async () => {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      // Validate photo exists
      if (!currentLead.patient_photo_url) {
        setError('Fotoğraf bulunamadı. Lütfen önce fotoğraf adımına dönün.')
        setLoading(false)
        return
      }

      const consentVersion = getActiveConsentVersion()
      const now = new Date().toISOString()
      const id = generateLeadId()

      // Build lead with all capture metadata
      const lead: Omit<Lead, 'readiness_score' | 'readiness_band'> = {
        id,
        full_name: currentLead.full_name ?? '',
        gender: (currentLead.gender as Lead['gender']) ?? 'female',
        age_range: (currentLead.age_range as Lead['age_range']) ?? '25-34',
        phone: currentLead.phone ?? '',
        concern_area: (currentLead.concern_area as Lead['concern_area']) ?? 'genel_yuz_dengesi',
        concern_sub_areas: currentLead.concern_sub_areas,
        desired_result_style: (currentLead.desired_result_style as Lead['desired_result_style']) ?? 'emin_degil',
        prior_treatment: currentLead.prior_treatment ?? false,
        consultation_timing: (currentLead.consultation_timing as Lead['consultation_timing']) ?? 'bilgi_almak',
        expectation_note: currentLead.expectation_note,
        consent_given: true,
        consent_timestamp: now,
        consent_text_version: consentVersion.version,
        status: 'consented',
        source: 'website',
        created_at: now,
        updated_at: now,
        patient_photo_url: currentLead.patient_photo_url ?? '',
        captured_frames: currentLead.captured_frames,
        doctor_frontal_photos: currentLead.doctor_frontal_photos ?? [],
        doctor_mimic_photos: currentLead.doctor_mimic_photos ?? [],
        optional_video_url: currentLead.optional_video_url,
        before_media: [],
        after_media: [],
        capture_confidence: currentLead.capture_confidence,
        capture_quality_score: currentLead.capture_quality_score,
        recapture_recommended: currentLead.recapture_recommended,
        recapture_views: currentLead.recapture_views,
        capture_manifest: currentLead.capture_manifest,
        liveness_status: currentLead.liveness_status,
        liveness_confidence: currentLead.liveness_confidence,
        liveness_required: currentLead.liveness_required,
        liveness_passed: currentLead.liveness_passed,
        liveness_signals: currentLead.liveness_signals,
        patient_summary: buildPatientSummary({
          concern_area: currentLead.concern_area,
          patient_photo_url: currentLead.patient_photo_url,
        }),
        consultation_readiness: deriveConsultationReadiness(currentLead),
      }

      setCurrentLead({ consent_given: true, consent_timestamp: now, consent_text_version: consentVersion.version })
      addLead(lead)

      // Save capture manifest locally
      const manifest = currentLead.capture_manifest as CaptureManifest | undefined
      if (manifest) {
        saveCaptureManifest(id, { ...manifest, session_id: id })
      }
      logAuditEvent('form_completed', { lead_id: id })
      logAuditEvent('consent_granted', { lead_id: id, version: consentVersion.version })

      // Capture-specific audit
      if (currentLead.capture_quality_score != null || currentLead.liveness_status) {
        logAuditEvent('capture_completed', {
          lead_id: id,
          capture_quality_score: currentLead.capture_quality_score,
          recapture_recommended: currentLead.recapture_recommended ?? false,
          liveness_status: currentLead.liveness_status,
          liveness_confidence: currentLead.liveness_confidence,
          liveness_passed: currentLead.liveness_passed ?? false,
        })
      }
      if (currentLead.recapture_recommended) {
        logAuditEvent('capture_recapture_recommended', {
          lead_id: id,
          views: currentLead.recapture_views ?? [],
        })
      }

      // ── Persist to Supabase (non-blocking) ──
      const photos: Record<string, string> = {}
      const frontal = currentLead.doctor_frontal_photos ?? [currentLead.patient_photo_url]
      if (frontal[0]) photos.front = frontal[0]
      if (frontal[1]) photos.left = frontal[1]
      if (frontal[2]) photos.right = frontal[2]
      if (!photos.front && currentLead.patient_photo_url) photos.front = currentLead.patient_photo_url

      const rawLivenessConfidence = currentLead.liveness_confidence as number | undefined
      const normalizedLivenessConfidence = rawLivenessConfidence != null && Number.isFinite(rawLivenessConfidence)
        ? Math.min(1, Math.max(0, rawLivenessConfidence > 1 ? rawLivenessConfidence / 100 : rawLivenessConfidence))
        : undefined

      try {
        const response = await fetch('/api/analysis/persist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: id,
            patient: {
              full_name: currentLead.full_name ?? '',
              phone: currentLead.phone ?? '',
              age_range: (currentLead.age_range as string) ?? '25-34',
              gender: (currentLead.gender as string) ?? 'female',
              city: currentLead.city,
              source: 'website',
            },
            intake: {
              concern_area: (currentLead.concern_area as string) ?? 'genel_yuz_dengesi',
              concern_sub_areas: currentLead.concern_sub_areas as string[] | undefined,
              desired_result_style: (currentLead.desired_result_style as string) ?? 'emin_degil',
              prior_treatment: currentLead.prior_treatment ?? false,
              consultation_timing: (currentLead.consultation_timing as string) ?? 'bilgi_almak',
              expectation_note: currentLead.expectation_note,
            },
            consent: {
              consent_given: true,
              consent_text_version: consentVersion.version,
              consent_timestamp: now,
              user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
            session: {
              status: 'consented',
              capture_confidence: currentLead.capture_confidence,
              capture_quality_score: currentLead.capture_quality_score,
              capture_manifest: currentLead.capture_manifest,
              liveness_status: currentLead.liveness_status,
              liveness_passed: currentLead.liveness_passed,
              liveness_confidence: normalizedLivenessConfidence,
            },
            photos,
            rawLivenessConfidence: rawLivenessConfidence ?? null,
          }),
        })

        const result = await response.json() as { sessionId?: string; patientId?: string; warnings?: Array<{ step: string; message: string }> }
        if (result.sessionId && result.patientId) {
          setCurrentLead({
            _supabase_session_id: result.sessionId,
            _supabase_patient_id: result.patientId,
          } as Partial<Lead>)
        }
        if (result.warnings && result.warnings.length > 0) {
          console.warn('[Consent] Persist warnings:', result.warnings)
        }
      } catch (e) {
        console.error('[Consent] Persist error (non-blocking):', e)
      }

      router.push(`/analysis/processing?id=${id}`)
    } catch (err) {
      console.error('[Consent] Error:', err)
      setError('Analiz başlatılamadı. Lütfen tekrar deneyin.')
      setLoading(false)
    }
  }

  return (
    <div className="theme-dark min-h-screen py-28 px-5" style={{ background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)' }}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[var(--color-gold)] mb-3">Adım 3 / 3</p>
          <EditorialHeading as="h1" light>Onay</EditorialHeading>
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

        {error && (
          <div className="mt-4 rounded-lg border border-[rgba(160,82,82,0.25)] bg-[rgba(160,82,82,0.1)] px-5 py-4">
            <p className="font-body text-[13px] text-[#C47A7A] leading-relaxed">{error}</p>
          </div>
        )}

        <p className="text-center font-body text-[11px] text-[var(--color-text-muted)] mt-6 leading-relaxed">
          Verileriniz KVKK kapsamında korunmaktadır.
        </p>
      </div>
    </div>
  )
}
