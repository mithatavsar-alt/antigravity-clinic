'use client'

import type { Lead } from '@/types/lead'
import {
  concernAreaLabels,
  desiredResultLabels,
  consultationTimingLabels,
  sourceLabels,
  goalClarityLabels,
  communicationPreferenceLabels,
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
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-[rgba(248,246,242,0.03)]">
      <span className="font-body text-[11px] text-[rgba(248,246,242,0.35)] flex-shrink-0">{label}</span>
      <span className="font-body text-[12px] text-[rgba(248,246,242,0.7)] text-right">{value}</span>
    </div>
  )
}

export function IntakeContextPanel({ lead }: IntakeContextPanelProps) {
  const cr = lead.consultation_readiness as Record<string, unknown> | undefined

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Patient Info */}
      <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.02)] p-5">
        <h4 className="font-body text-[10px] tracking-[0.15em] uppercase text-[#D6B98C] mb-4">Hasta Bilgileri</h4>
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

      {/* Intake Details */}
      <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.02)] p-5">
        <h4 className="font-body text-[10px] tracking-[0.15em] uppercase text-[#D6B98C] mb-4">Form & Tercihler</h4>
        <div className="flex flex-col">
          <InfoRow label="İlgi Alanı" value={concernAreaLabels[lead.concern_area as keyof typeof concernAreaLabels] ?? lead.concern_area} />
          <InfoRow label="Beklenen Sonuç" value={desiredResultLabels[lead.desired_result_style as keyof typeof desiredResultLabels] ?? lead.desired_result_style} />
          <InfoRow label="Zamanlama" value={consultationTimingLabels[lead.consultation_timing as keyof typeof consultationTimingLabels] ?? lead.consultation_timing} />
          <InfoRow label="Önceki İşlem" value={lead.prior_treatment ? 'Evet' : 'Hayır'} />
          <InfoRow label="Rıza Durumu" value={lead.consent_given ? 'Verildi' : 'Verilmedi'} />
          <InfoRow label="Rıza Tarihi" value={lead.consent_timestamp ? formatDateTime(lead.consent_timestamp) : undefined} />
        </div>

        {lead.expectation_note && (
          <div className="mt-4 p-3 rounded-lg bg-[rgba(248,246,242,0.02)] border border-[rgba(248,246,242,0.04)]">
            <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.3)] mb-1">Beklenti Notu</p>
            <p className="font-body text-[12px] text-[rgba(248,246,242,0.55)] leading-relaxed">{lead.expectation_note}</p>
          </div>
        )}
      </div>

      {/* Consultation Readiness */}
      {cr && (
        <div className="lg:col-span-2 rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.02)] p-5">
          <h4 className="font-body text-[10px] tracking-[0.15em] uppercase text-[#D6B98C] mb-4">Konsültasyon Hazırlığı</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cr.primary_motivation != null && (
              <MiniStat label="Motivasyon" value={String(cr.primary_motivation)} />
            )}
            {cr.goal_clarity != null && (
              <MiniStat label="Hedef Netliği" value={goalClarityLabels[cr.goal_clarity as keyof typeof goalClarityLabels] ?? String(cr.goal_clarity)} />
            )}
            {cr.time_intent != null && (
              <MiniStat label="Zaman Tercihi" value={timeIntentLabels[cr.time_intent as keyof typeof timeIntentLabels] ?? String(cr.time_intent)} />
            )}
            {cr.communication_preference != null && (
              <MiniStat label="İletişim" value={communicationPreferenceLabels[cr.communication_preference as keyof typeof communicationPreferenceLabels] ?? String(cr.communication_preference)} />
            )}
            {cr.upsell_potential != null && (
              <MiniStat label="Upsell" value={upsellPotentialLabels[cr.upsell_potential as keyof typeof upsellPotentialLabels] ?? String(cr.upsell_potential)} />
            )}
            {cr.recommended_followup != null && (
              <MiniStat label="Önerilen Takip" value={String(cr.recommended_followup)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-[rgba(248,246,242,0.02)] border border-[rgba(248,246,242,0.03)]">
      <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.25)] mb-1">{label}</p>
      <p className="font-body text-[11px] text-[rgba(248,246,242,0.6)]">{value}</p>
    </div>
  )
}
