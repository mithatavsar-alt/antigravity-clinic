'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ThinLine } from '@/components/design-system/ThinLine'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { photoQualityLabels } from '@/types/lead'

const fallbackFocusAreas = ['Göz Çevresi', 'Orta Yüz', 'Alt Yüz', 'Cilt Görünümü']

export default function ResultPage() {
  const { leads } = useClinicStore()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const selectedLead = id ? leads.find((lead) => lead.id === id) : leads[0]

  if (!selectedLead) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
        <div className="max-w-lg mx-auto">
          <GlassCard strong padding="lg" rounded="xl">
            <div className="flex flex-col gap-4 text-center">
              <SectionLabel className="justify-center">Sonuç Bulunamadı</SectionLabel>
              <h1 className="font-display text-[32px] font-light text-[#1A1A2E]">Analiz kaydına ulaşılamadı</h1>
              <p className="font-body text-[14px] text-[rgba(26,26,46,0.6)] leading-relaxed">
                Ön değerlendirmeyi yeniden başlatarak fotoğrafınızı tekrar yükleyebilirsiniz.
              </p>
              <Link href="/analysis">
                <PremiumButton size="lg" className="w-full justify-center">
                  Ön Değerlendirmeyi Yeniden Başlat
                </PremiumButton>
              </Link>
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  const focusAreas = selectedLead.patient_summary?.focus_areas ?? fallbackFocusAreas
  const photoQuality = selectedLead.patient_summary?.photo_quality

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
      <div className="max-w-lg mx-auto flex flex-col gap-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[rgba(61,122,95,0.1)] border border-[rgba(61,122,95,0.25)] flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#3D7A5F]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <SectionLabel className="justify-center mb-3">Ön Değerlendirme Tamamlandı</SectionLabel>
          <h1 className="font-display text-[clamp(28px,4vw,44px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
            {selectedLead.full_name.split(' ')[0]}, analiz özetiniz hazır
          </h1>
        </div>

        <GlassCard strong padding="lg" rounded="xl">
          <div className="flex flex-col gap-6">
            <div className="flex gap-4 items-start">
              {selectedLead.patient_photo_url ? (
                <div className="w-16 h-16 rounded-[10px] overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedLead.patient_photo_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-[#F5E6D3] to-[#E8E4EF] flex-shrink-0" />
              )}

              <div className="flex-1">
                <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[#8B7FA8] mb-1">Ön İnceleme Özeti</p>
                <p className="font-body text-[13px] text-[rgba(26,26,46,0.7)] leading-relaxed">
                  {selectedLead.patient_summary?.summary_text ??
                    'Yüklediğiniz görsel ve paylaştığınız bilgiler üzerinden yapılan ön incelemede, doktor değerlendirmesine uygun odak alanları çıkarıldı.'}
                </p>
              </div>
            </div>

            <ThinLine />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-[12px] border border-[rgba(196,163,90,0.15)] bg-[rgba(255,254,249,0.55)] px-4 py-3">
                <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)] mb-1">
                  Fotoğraf Kalitesi
                </p>
                <p className="font-body text-[14px] text-[#1A1A2E]">
                  {photoQuality ? photoQualityLabels[photoQuality] : 'Değerlendiriliyor'}
                </p>
              </div>
              <div className="rounded-[12px] border border-[rgba(196,163,90,0.15)] bg-[rgba(255,254,249,0.55)] px-4 py-3">
                <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)] mb-1">
                  Sonraki Adım
                </p>
                <p className="font-body text-[14px] text-[#1A1A2E]">Doktor ön incelemesi ve randevu planlama</p>
              </div>
            </div>

            <div>
              <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mb-3">Odak Alanları</p>
              <div className="flex flex-wrap gap-2">
                {focusAreas.map((area) => (
                  <span
                    key={area}
                    className="font-body text-[11px] px-3 py-1.5 rounded-full border border-[rgba(196,163,90,0.3)] text-[#1A1A2E] bg-[rgba(196,163,90,0.06)]"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-[rgba(196,163,90,0.05)] border border-[rgba(196,163,90,0.15)] rounded-[10px] p-4">
              <p className="font-body text-[11px] text-[rgba(26,26,46,0.5)] leading-relaxed italic">
                Bu sistem doktor kararını destekler, yerine geçmez. Kesin tedavi planı klinik muayene ve doktor değerlendirmesi sonrasında oluşturulur.
              </p>
            </div>
          </div>
        </GlassCard>

        <div className="flex flex-col gap-3">
          <a
            href="https://wa.me/905321234567?text=Merhaba%2C%20AI%20%C3%B6n%20de%C4%9Ferlendirmemi%20tamamlad%C4%B1m.%20Randevu%20planlamak%20istiyorum."
            target="_blank"
            rel="noopener noreferrer"
          >
            <PremiumButton size="lg" className="w-full justify-center gap-3">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.847L.057 23.882a.5.5 0 00.61.61l6.035-1.466A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.661-.518-5.175-1.42l-.37-.216-3.837.932.949-3.837-.234-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              WhatsApp ile Randevu Planla
            </PremiumButton>
          </a>
          <Link href="/">
            <PremiumButton variant="ghost" size="md" className="w-full justify-center">
              Ana Sayfaya Dön
            </PremiumButton>
          </Link>
        </div>
      </div>
    </div>
  )
}
