'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { ThinLine } from '@/components/design-system/ThinLine'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { AnalysisStepBar } from '@/components/analysis/AnalysisStepBar'
import { MediaUploadGrid, EMPTY_SLOTS } from '@/components/analysis/MediaUploadGrid'
import type { MediaSlots } from '@/components/analysis/MediaUploadGrid'

export default function AnalysisMediaPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead } = useClinicStore()
  const [slots, setSlots] = useState<MediaSlots>(EMPTY_SLOTS)
  const [error, setError] = useState<string | null>(null)

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
    }
  }, [currentLead, router])

  if (!currentLead?.full_name) return null

  const handleContinue = () => {
    if (!slots.front) {
      setError('AI analiz için en az önden çekilmiş fotoğraf zorunludur.')
      return
    }
    setError(null)
    setCurrentLead({
      patient_photo_url: slots.front,
      doctor_frontal_photos: [slots.front, slots.rightProfile, slots.leftProfile].filter(Boolean) as string[],
      doctor_mimic_photos: [slots.eyebrow, slots.smile].filter(Boolean) as string[],
      optional_video_url: slots.video ?? undefined,
    })
    router.push('/analysis/consent')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[#8B7FA8] mb-3">Adım 2 / 3</p>
          <h1 className="font-display text-[clamp(32px,5vw,48px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
            Fotoğraf Yükleme
          </h1>
          <div className="flex justify-center mt-4">
            <ThinLine width={48} />
          </div>
        </div>

        <GlassCard strong padding="lg" rounded="xl">
          <AnalysisStepBar currentStep={2} labels={['Kişisel Bilgiler', 'Fotoğraf', 'Onay']} />

          <SectionLabel className="mb-4">Fotoğraflarınızı Yükleyin</SectionLabel>
          <p className="font-body text-[12px] text-[rgba(26,26,46,0.55)] mb-6 leading-relaxed">
            En iyi sonuç için önden çekilmiş fotoğraf zorunludur. Diğer açılar ve mimik fotoğrafları isteğe bağlıdır ancak doktor değerlendirmesine katkı sağlar.
          </p>

          <MediaUploadGrid value={slots} onChange={setSlots} />

          {error && (
            <p className="mt-4 font-body text-[12px] text-[#A05252] bg-[rgba(160,82,82,0.06)] rounded-[10px] px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <PremiumButton variant="ghost" size="md" onClick={() => router.back()} className="flex-1 justify-center">
              Geri
            </PremiumButton>
            <PremiumButton size="md" onClick={handleContinue} className="flex-1 justify-center">
              Devam
            </PremiumButton>
          </div>
        </GlassCard>

        <p className="text-center font-body text-[11px] text-[rgba(26,26,46,0.35)] mt-6 leading-relaxed">
          Fotoğraflarınız yalnızca cihazınızda işlenir. Sunucuya yüklenmez.
        </p>
      </div>
    </div>
  )
}
