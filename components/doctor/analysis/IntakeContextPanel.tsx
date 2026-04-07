'use client'

import type { Lead } from '@/types/lead'
import {
  communicationPreferenceLabels,
  concernAreaLabels,
  consultationTimingLabels,
  desiredResultLabels,
  goalClarityLabels,
  sourceLabels,
  timeIntentLabels,
  upsellPotentialLabels,
} from '@/types/lead'
import { formatDateTime } from '@/lib/utils'

interface IntakeContextPanelProps {
  lead: Lead
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null

  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-[rgba(196,163,90,0.10)]">
      <span className="font-body text-[13px] text-[rgba(26,26,46,0.52)] flex-shrink-0">{label}</span>
      <span className="font-body text-[14px] text-[rgba(26,26,46,0.72)] text-right">{value}</span>
    </div>
  )
}

export function IntakeContextPanel({ lead }: IntakeContextPanelProps) {
  const readiness = lead.consultation_readiness as Record<string, unknown> | undefined

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="doctor-card rounded-xl p-5">
        <h4 className="font-body text-[14px] tracking-[0.15em] uppercase text-[#C4A35A] mb-4">Hasta Bilgileri</h4>
        <div className="flex flex-col">
          <InfoRow label="Ad Soyad" value={lead.full_name} />
          <InfoRow label="Cinsiyet" value={lead.gender === 'female' ? 'Kadın' : lead.gender === 'male' ? 'Erkek' : lead.gender} />
          <InfoRow label="Yaş Aralığı" value={lead.age_range} />
          <InfoRow label="Telefon" value={lead.phone} />
          <InfoRow label="Şehir" value={lead.city} />
          <InfoRow label="Kaynak" value={sourceLabels[lead.source as keyof typeof sourceLabels] ?? lead.source} />
          <InfoRow label="Tarih" value={formatDateTime(lead.created_at)} />
        </div>
      </div>

      <div className="doctor-card rounded-xl p-5">
        <h4 className="font-body text-[14px] tracking-[0.15em] uppercase text-[#C4A35A] mb-4">Form & Tercihler</h4>
        <div className="flex flex-col">
          <InfoRow label="İlgi Alanı" value={concernAreaLabels[lead.concern_area as keyof typeof concernAreaLabels] ?? lead.concern_area} />
          <InfoRow label="Beklenen Sonuç" value={desiredResultLabels[lead.desired_result_style as keyof typeof desiredResultLabels] ?? lead.desired_result_style} />
          <InfoRow label="Zamanlama" value={consultationTimingLabels[lead.consultation_timing as keyof typeof consultationTimingLabels] ?? lead.consultation_timing} />
          <InfoRow label="Önceki İşlem" value={lead.prior_treatment ? 'Evet' : 'Hayır'} />
          <InfoRow label="Rıza Durumu" value={lead.consent_given ? 'Verildi' : 'Verilmedi'} />
          <InfoRow label="Rıza Tarihi" value={lead.consent_timestamp ? formatDateTime(lead.consent_timestamp) : undefined} />
        </div>

        {lead.expectation_note && (
          <div className="doctor-card-soft mt-4 p-3 rounded-lg">
            <p className="font-body text-[13px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)] mb-1">Beklenti Notu</p>
            <p className="font-body text-[14px] text-[rgba(26,26,46,0.72)] leading-relaxed">{lead.expectation_note}</p>
          </div>
        )}
      </div>

      {readiness && (
        <div className="doctor-card lg:col-span-2 rounded-xl p-5">
          <h4 className="font-body text-[14px] tracking-[0.15em] uppercase text-[#C4A35A] mb-4">Konsültasyon Hazırlığı</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {readiness.primary_motivation != null && <MiniStat label="Motivasyon" value={String(readiness.primary_motivation)} />}
            {readiness.goal_clarity != null && (
              <MiniStat label="Hedef Netliği" value={goalClarityLabels[readiness.goal_clarity as keyof typeof goalClarityLabels] ?? String(readiness.goal_clarity)} />
            )}
            {readiness.time_intent != null && (
              <MiniStat label="Zaman Tercihi" value={timeIntentLabels[readiness.time_intent as keyof typeof timeIntentLabels] ?? String(readiness.time_intent)} />
            )}
            {readiness.communication_preference != null && (
              <MiniStat
                label="İletişim"
                value={communicationPreferenceLabels[readiness.communication_preference as keyof typeof communicationPreferenceLabels] ?? String(readiness.communication_preference)}
              />
            )}
            {readiness.upsell_potential != null && (
              <MiniStat label="Upsell" value={upsellPotentialLabels[readiness.upsell_potential as keyof typeof upsellPotentialLabels] ?? String(readiness.upsell_potential)} />
            )}
            {readiness.recommended_followup != null && <MiniStat label="Önerilen Takip" value={String(readiness.recommended_followup)} />}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="doctor-card-soft px-3 py-2.5 rounded-lg">
      <p className="font-body text-[13px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)] mb-1">{label}</p>
      <p className="font-body text-[13px] text-[rgba(26,26,46,0.72)]">{value}</p>
    </div>
  )
}
