'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { AnalysisStepBar } from '@/components/analysis/AnalysisStepBar'
import { FaceMeshCamera, type CaptureMetadata } from '@/components/analysis/FaceMeshCamera'

export default function AnalysisMediaPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead } = useClinicStore()

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
    }
  }, [currentLead, router])

  const handleCapture = useCallback((dataUrl: string, meta?: CaptureMetadata) => {
    setCurrentLead({
      patient_photo_url: dataUrl,
      doctor_frontal_photos: [dataUrl],
      capture_confidence: meta?.confidence ?? 'high',
    })
    router.push('/analysis/consent')
  }, [setCurrentLead, router])

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
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[#D6B98C] mb-3">Adım 2 / 3</p>
          <h1 className="font-display text-[clamp(32px,5vw,48px)] font-light text-[#F8F6F2] tracking-[-0.02em]">
            Yüz Tarama
          </h1>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-[rgba(214,185,140,0.3)]" />
            <div className="w-1 h-1 rounded-full bg-[rgba(214,185,140,0.35)]" />
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-[rgba(214,185,140,0.3)]" />
          </div>
        </div>

        <GlassCard strong padding="lg" rounded="xl" className="[animation:cardEntrance_0.5s_ease-out_0.15s_both]">
          <AnalysisStepBar currentStep={2} labels={['Kişisel Bilgiler', 'Yüz Tarama', 'Onay']} />

          <p className="font-body text-[12px] text-[rgba(248,246,242,0.45)] mb-5 leading-relaxed text-center">
            Yüzünüzü kameraya gösterin. AI otomatik olarak en iyi kareyi seçecektir.
          </p>

          <FaceMeshCamera onCapture={handleCapture} onClose={handleBack} />
        </GlassCard>

        <div className="flex items-center justify-center gap-2 mt-6" style={{ animation: 'cardEntrance 0.4s ease-out 0.3s both' }}>
          <svg className="w-3.5 h-3.5 text-[rgba(248,246,242,0.2)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="font-body text-[11px] text-[rgba(248,246,242,0.22)] leading-relaxed">
            Fotoğraflarınız yalnızca cihazınızda işlenir. Sunucuya yüklenmez.
          </p>
        </div>
      </div>
    </div>
  )
}
