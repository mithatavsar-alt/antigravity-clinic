'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { ThinLine } from '@/components/design-system/ThinLine'

export default function AnalysisProcessingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  useEffect(() => {
    if (!id) {
      router.replace('/analysis')
      return
    }

    const timer = window.setTimeout(() => {
      router.replace(`/analysis/result?id=${id}`)
    }, 1800)

    return () => window.clearTimeout(timer)
  }, [id, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
      <div className="max-w-lg mx-auto">
        <GlassCard strong padding="lg" rounded="xl">
          <div className="flex flex-col items-center text-center gap-6">
            <SectionLabel className="justify-center">AI Analizi Hazırlanıyor</SectionLabel>
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-[rgba(196,163,90,0.2)] bg-[rgba(255,254,249,0.65)]">
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#C4A35A] border-r-[#2D5F5D] animate-spin" />
              <div className="w-12 h-12 rounded-full bg-[rgba(196,163,90,0.08)]" />
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="font-display text-[clamp(28px,4vw,40px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
                Fotoğrafınız değerlendiriliyor
              </h1>
              <p className="font-body text-[14px] text-[rgba(26,26,46,0.65)] leading-relaxed">
                Görsel kalite kontrolü, odak alanı eşleştirmesi ve konsültasyon hazırlık skoru hesaplanıyor.
              </p>
            </div>

            <ThinLine width={64} />

            <div className="w-full flex flex-col gap-3">
              {[
                'Görsel kalite kontrolü tamamlanıyor',
                'Odak bölgeleri işaretleniyor',
                'Doktor ön incelemesi için özet hazırlanıyor',
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-[12px] border border-[rgba(196,163,90,0.12)] bg-[rgba(255,254,249,0.55)] px-4 py-3"
                  style={{ animationDelay: `${index * 180}ms` }}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C4A35A]" />
                  <span className="font-body text-[13px] text-[rgba(26,26,46,0.62)]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
