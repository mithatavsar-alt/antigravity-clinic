'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { ThinLine } from '@/components/design-system/ThinLine'
import { AnalysisStepBar } from '@/components/analysis/AnalysisStepBar'
import { FaceMeshCamera } from '@/components/analysis/FaceMeshCamera'

export default function AnalysisMediaPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead } = useClinicStore()

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
    }
  }, [currentLead, router])

  const handleCapture = useCallback((dataUrl: string) => {
    setCurrentLead({
      patient_photo_url: dataUrl,
      doctor_frontal_photos: [dataUrl],
    })
    router.push('/analysis/consent')
  }, [setCurrentLead, router])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  if (!currentLead?.full_name) return null

  return (
    <div className="theme-dark min-h-screen py-28 px-5" style={{ background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[#D6B98C] mb-3">Adım 2 / 3</p>
          <h1 className="font-display text-[clamp(32px,5vw,48px)] font-light text-[#F8F6F2] tracking-[-0.02em]">
            Yüz Tarama
          </h1>
          <div className="flex justify-center mt-4">
            <ThinLine width={48} light />
          </div>
        </div>

        <GlassCard strong padding="lg" rounded="xl">
          <AnalysisStepBar currentStep={2} labels={['Kişisel Bilgiler', 'Yüz Tarama', 'Onay']} />

          <p className="font-body text-[12px] text-[rgba(248,246,242,0.5)] mb-5 leading-relaxed text-center">
            Kameranızı açarak yüzünüzü taratın. Face Mesh algılama başladığında fotoğraf çekebilirsiniz.
          </p>

          <FaceMeshCamera onCapture={handleCapture} onClose={handleBack} />
        </GlassCard>

        <p className="text-center font-body text-[11px] text-[rgba(248,246,242,0.25)] mt-6 leading-relaxed">
          Fotoğraflarınız yalnızca cihazınızda işlenir. Sunucuya yüklenmez.
        </p>
      </div>
    </div>
  )
}
