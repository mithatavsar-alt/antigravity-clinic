'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { PlaceholderImage } from '@/components/design-system/PlaceholderImage'
import { processPhoto } from '@/lib/image-utils'
import { buildPatientSummary } from '@/lib/lead-helpers'
import { generateLeadId } from '@/lib/utils'
import { calculateReadiness } from '@/lib/readiness'
import type { Lead } from '@/types/lead'
import { getActiveConsentVersion } from '@/data/consent-versions'
import { logAuditEvent } from '@/lib/audit'

export function FormStepPhotoConsent() {
  const { currentLead, setCurrentLead, setFormStep, addLead, clearCurrentLead } = useClinicStore()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [photoUrl, setPhotoUrl] = useState<string | null>(currentLead?.patient_photo_url ?? null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [kvkk, setKvkk] = useState(false)
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setPhotoError(null)
    setFormError(null)

    try {
      const { url } = await processPhoto(file)
      setPhotoUrl(url)
      setCurrentLead({ patient_photo_url: url })
      logAuditEvent('photo_uploaded', { step: 3 })
    } catch (error) {
      setPhotoError((error as Error).message)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      void handleFile(file)
    }
  }

  const handleSubmit = () => {
    if (!photoUrl) {
      setFormError('AI ön değerlendirme için önden çekilmiş bir fotoğraf yüklemelisiniz.')
      return
    }

    if (!kvkk || !consent) {
      setFormError('KVKK onayı ve açık rıza zorunludur.')
      return
    }

    setLoading(true)
    setFormError(null)

    const consentVersion = getActiveConsentVersion()
    const now = new Date().toISOString()
    const id = generateLeadId()
    const { score, band } = calculateReadiness({
      ...currentLead,
      patient_photo_url: photoUrl,
    })

    const lead: Lead = {
      id,
      full_name: currentLead?.full_name ?? '',
      gender: (currentLead?.gender as Lead['gender']) ?? 'female',
      age_range: (currentLead?.age_range as Lead['age_range']) ?? '25-34',
      phone: currentLead?.phone ?? '',
      concern_area: (currentLead?.concern_area as Lead['concern_area']) ?? 'genel_yuz_dengesi',
      desired_result_style: (currentLead?.desired_result_style as Lead['desired_result_style']) ?? 'emin_degil',
      prior_treatment: currentLead?.prior_treatment ?? false,
      consultation_timing: (currentLead?.consultation_timing as Lead['consultation_timing']) ?? 'bilgi_almak',
      expectation_note: currentLead?.expectation_note,
      consent_given: true,
      consent_timestamp: now,
      consent_text_version: consentVersion.version,
      status: 'analysis_ready',
      source: 'website',
      created_at: now,
      updated_at: now,
      patient_photo_url: photoUrl,
      doctor_frontal_photos: [],
      doctor_mimic_photos: [],
      before_media: [],
      after_media: [],
      patient_summary: buildPatientSummary({
        concern_area: currentLead?.concern_area,
        patient_photo_url: photoUrl,
      }),
      readiness_score: score,
      readiness_band: band,
    }

    addLead(lead)
    logAuditEvent('form_completed', { lead_id: id })
    logAuditEvent('consent_granted', { lead_id: id, version: consentVersion.version })

    clearCurrentLead()
    router.push(`/analysis/processing?id=${id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.5)]">
          Önden Fotoğraf <span className="normal-case text-[rgba(26,26,46,0.35)]">(AI analiz için zorunlu)</span>
        </label>

        <div
          className="relative cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          {photoUrl ? (
            <div className="relative rounded-[14px] overflow-hidden h-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Yüklenen fotoğraf" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-[rgba(26,26,46,0.3)] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <p className="font-body text-white text-[12px] tracking-[0.1em]">Değiştir</p>
              </div>
            </div>
          ) : (
            <PlaceholderImage variant="upload" className="h-48 w-full" />
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              void handleFile(file)
            }
          }}
        />

        {photoError && <p className="font-body text-[11px] text-[#A05252]">{photoError}</p>}

        <div className="glass rounded-[10px] px-4 py-3">
          <p className="font-body text-[10px] text-[rgba(26,26,46,0.55)] leading-relaxed">
            <span className="text-[#C4A35A]">İpucu:</span> Nötr ifadeyle, iyi ışıkta, düz karşıya bakarak çekilmiş önden fotoğraf en iyi sonucu verir.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-2 border-t border-[rgba(196,163,90,0.15)]">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={kvkk}
            onChange={(e) => {
              setKvkk(e.target.checked)
              setFormError(null)
            }}
            className="mt-0.5 accent-[#2D5F5D] flex-shrink-0"
          />
          <span className="font-body text-[12px] text-[rgba(26,26,46,0.65)] leading-relaxed">
            <Link href="/privacy" target="_blank" className="text-[#C4A35A] hover:underline">
              KVKK Aydınlatma Metni
            </Link>
            &rsquo;ni okudum ve anladım. *
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked)
              setFormError(null)
            }}
            className="mt-0.5 accent-[#2D5F5D] flex-shrink-0"
          />
          <span className="font-body text-[12px] text-[rgba(26,26,46,0.65)] leading-relaxed">
            <Link href="/consent" target="_blank" className="text-[#C4A35A] hover:underline">
              Açık Rıza Metni
            </Link>
            &rsquo;ni okudum, kişisel verilerimin işlenmesine onay veriyorum. *
          </span>
        </label>
      </div>

      {formError && (
        <p className="font-body text-[12px] text-[#A05252] bg-[rgba(160,82,82,0.06)] rounded-[10px] px-4 py-3">
          {formError}
        </p>
      )}

      <div className="flex gap-3 mt-2">
        <PremiumButton
          type="button"
          variant="ghost"
          size="md"
          onClick={() => setFormStep(2)}
          className="flex-1 justify-center"
        >
          Geri
        </PremiumButton>
        <PremiumButton
          type="button"
          size="md"
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 justify-center"
        >
          {loading ? 'Analiz hazırlanıyor...' : 'Analizi Başlat'}
        </PremiumButton>
      </div>
    </div>
  )
}
