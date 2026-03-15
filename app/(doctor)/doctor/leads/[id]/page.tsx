'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { RegionBar } from '@/components/design-system/RegionBar'
import { PlaceholderImage } from '@/components/design-system/PlaceholderImage'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ThinLine } from '@/components/design-system/ThinLine'
import { readinessBandConfig } from '@/lib/readiness'
import { logAuditEvent } from '@/lib/audit'
import {
  communicationPreferenceLabels,
  concernAreaLabels,
  consultationTimingLabels,
  desiredResultLabels,
  goalClarityLabels,
  photoQualityLabels,
  sourceLabels,
  timeIntentLabels,
  type LeadStatus,
  upsellPotentialLabels,
} from '@/types/lead'
import { formatDateTime } from '@/lib/utils'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-[10px] tracking-[0.15em] uppercase text-[rgba(26,26,46,0.4)] mb-0.5">{label}</p>
      <p className="font-body text-[13px] text-[#1A1A2E]">{value}</p>
    </div>
  )
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] overflow-hidden">
      <button
        onClick={() => setOpen((current) => !current)}
        className="w-full flex justify-between items-center px-5 py-4 bg-[rgba(255,254,249,0.7)] hover:bg-[rgba(196,163,90,0.03)] transition-colors"
      >
        <h3 className="font-display text-[18px] font-light text-[#1A1A2E]">{title}</h3>
        <svg
          className="w-4 h-4 text-[#C4A35A] transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-5 py-5 border-t border-[rgba(196,163,90,0.1)]">{children}</div>}
    </div>
  )
}

function MediaGrid({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)]">{title}</p>
      {items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item, index) => (
            <div key={`${title}-${index}`} className="rounded-[14px] overflow-hidden border border-[rgba(196,163,90,0.16)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item} alt={`${title} ${index + 1}`} className="w-full h-32 object-cover" />
            </div>
          ))}
        </div>
      ) : (
        <PlaceholderImage variant="media" className="h-28" label="Henüz medya yüklenmedi" />
      )}
    </div>
  )
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { leads, updateLeadStatus, updateDoctorNotes, generateReport } = useClinicStore()
  const router = useRouter()
  const lead = leads.find((item) => item.id === id)

  const [notes, setNotes] = useState(lead?.doctor_notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)

  useEffect(() => {
    if (lead) {
      logAuditEvent('lead_viewed', { lead_id: lead.id })
    }
  }, [lead])

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="font-display text-2xl font-light text-[#1A1A2E]">Lead bulunamadı</p>
        <PremiumButton onClick={() => router.push('/doctor/leads')} variant="ghost">
          Geri Dön
        </PremiumButton>
      </div>
    )
  }

  const doctorAnalysis = lead.doctor_analysis
  const readiness = lead.consultation_readiness
  const readinessConfig = lead.readiness_band ? readinessBandConfig[lead.readiness_band] : null

  const upperFace = ['alin', 'glabella', 'kaz_ayagi']
  const midFace = ['goz_alti', 'yanak_orta_yuz', 'nazolabial']
  const lowerFace = ['dudak', 'marionette', 'jawline', 'cene_ucu']
  const general = ['cilt_kalitesi', 'simetri_gozlemi']

  const handleSaveNotes = () => {
    updateDoctorNotes(lead.id, notes)
    logAuditEvent('doctor_note_added', { lead_id: lead.id })
    setNotesSaved(true)
    window.setTimeout(() => setNotesSaved(false), 3000)
  }

  const handleGenerateReport = () => {
    generateReport(lead.id, `/doctor/leads/${lead.id}/report`)
    logAuditEvent('report_generated', { lead_id: lead.id })
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/doctor/leads')}
          className="font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.4)] hover:text-[#1A1A2E] transition-colors"
        >
          ← Lead Listesi
        </button>
        <span className="text-[rgba(26,26,46,0.2)]">/</span>
        <span className="font-mono text-[11px] text-[rgba(26,26,46,0.4)]">{lead.id}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-light text-[#1A1A2E]">{lead.full_name}</h1>
          <div className="flex gap-2 mt-2 flex-wrap">
            <StatusBadge status={lead.status} type="lead" />
            {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
          </div>
        </div>

        <select
          value={lead.status}
          onChange={(e) => {
            updateLeadStatus(lead.id, e.target.value as LeadStatus)
            logAuditEvent('lead_status_changed', { lead_id: lead.id, status: e.target.value })
          }}
          className="bg-[rgba(255,254,249,0.8)] border border-[rgba(196,163,90,0.25)] rounded-[10px] px-3 py-2 font-body text-[12px] text-[#1A1A2E] focus:outline-none focus:border-[#2D5F5D]"
        >
          {([
            { value: 'new', label: 'Yeni' },
            { value: 'consented', label: 'Rıza Verildi' },
            { value: 'analysis_ready', label: 'Analiz Hazır' },
            { value: 'doctor_reviewed', label: 'İncelendi' },
            { value: 'contacted', label: 'İletişime Geçildi' },
            { value: 'booked', label: 'Randevu Alındı' },
            { value: 'archived', label: 'Arşivlendi' },
          ] as { value: LeadStatus; label: string }[]).map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <CollapsibleSection title="Hasta Özeti">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <InfoRow label="Ad Soyad" value={lead.full_name} />
          <InfoRow label="Cinsiyet" value={lead.gender === 'female' ? 'Kadın' : lead.gender === 'male' ? 'Erkek' : 'Diğer'} />
          <InfoRow label="Yaş Aralığı" value={lead.age_range} />
          <InfoRow label="Telefon" value={lead.phone} />
          <InfoRow label="Şehir" value={lead.city ?? 'Belirtilmedi'} />
          <InfoRow label="Kaynak" value={sourceLabels[lead.source]} />
          <InfoRow label="İlgi Alanı" value={concernAreaLabels[lead.concern_area]} />
          <InfoRow label="Sonuç Beklentisi" value={desiredResultLabels[lead.desired_result_style]} />
          <InfoRow label="Zamanlama" value={consultationTimingLabels[lead.consultation_timing]} />
          <InfoRow label="Önceki İşlem" value={lead.prior_treatment ? 'Evet' : 'Hayır'} />
          <InfoRow label="Başvuru Tarihi" value={formatDateTime(lead.created_at)} />
          <InfoRow
            label="Rıza"
            value={lead.consent_given ? `✓ ${formatDateTime(lead.consent_timestamp)} · v${lead.consent_text_version}` : 'Verilmedi'}
          />
          {lead.expectation_note && (
            <div className="col-span-full">
              <InfoRow label="Beklenti Notu" value={lead.expectation_note} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Medya İnceleme">
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mb-3">
              Hasta Yüklemesi
            </p>
            {lead.patient_photo_url ? (
              <div className="max-w-sm rounded-[16px] overflow-hidden border border-[rgba(196,163,90,0.18)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lead.patient_photo_url} alt={`${lead.full_name} hasta fotoğrafı`} className="w-full h-72 object-cover" />
              </div>
            ) : (
              <PlaceholderImage variant="upload" className="h-48 max-w-sm" />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <GlassCard padding="sm">
              <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)] mb-2">
                Klinik Referans Seti
              </p>
              <p className="font-body text-[16px] text-[#1A1A2E]">{lead.doctor_frontal_photos.length} fotoğraf</p>
              <p className="font-body text-[11px] text-[rgba(26,26,46,0.5)] mt-1">
                {lead.doctor_frontal_photos.length > 0 ? 'Klinik çekim seti hazır.' : 'Klinik referans fotoğrafları henüz yüklenmedi.'}
              </p>
            </GlassCard>

            <GlassCard padding="sm">
              <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)] mb-2">
                Mimik Seti
              </p>
              <p className="font-body text-[16px] text-[#1A1A2E]">{lead.doctor_mimic_photos.length} fotoğraf</p>
              <p className="font-body text-[11px] text-[rgba(26,26,46,0.5)] mt-1">
                {lead.doctor_mimic_photos.length > 0 ? 'Dinamik mimik seti hazır.' : 'Dinamik mimik fotoğrafları bekleniyor.'}
              </p>
            </GlassCard>

            <GlassCard padding="sm">
              <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)] mb-2">
                Video
              </p>
              <p className="font-body text-[16px] text-[#1A1A2E]">{lead.optional_video_url ? 'Mevcut' : 'Yok'}</p>
              <p className="font-body text-[11px] text-[rgba(26,26,46,0.5)] mt-1">
                {lead.optional_video_url ? 'Dinamik yüz hareket videosu yüklendi.' : '10 saniyelik referans video henüz eklenmedi.'}
              </p>
            </GlassCard>
          </div>

          <MediaGrid title="Klinik Referans Fotoğrafları" items={lead.doctor_frontal_photos} />
          <MediaGrid title="Mimik Fotoğrafları" items={lead.doctor_mimic_photos} />
        </div>
      </CollapsibleSection>

      {doctorAnalysis && (
        <CollapsibleSection title="Bölgesel Değerlendirme">
          <div className="flex flex-col gap-6">
            {[
              { title: 'Üst Yüz', keys: upperFace },
              { title: 'Orta Yüz', keys: midFace },
              { title: 'Alt Yüz', keys: lowerFace },
              { title: 'Genel', keys: general },
            ].map(({ title, keys }) => (
              <div key={title}>
                <p className="font-display text-[15px] font-light text-[#1A1A2E] mb-3">{title}</p>
                <div className="flex flex-col gap-3">
                  {keys.filter((key) => doctorAnalysis.region_scores[key] != null).map((key) => (
                    <RegionBar key={key} label={key} score={doctorAnalysis.region_scores[key]} />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-4 pt-2 border-t border-[rgba(196,163,90,0.12)]">
              <span className="font-body text-[11px] text-[rgba(26,26,46,0.5)]">
                Görsel kalite: <strong>{photoQualityLabels[doctorAnalysis.quality_checks.frontal_quality]}</strong>
              </span>
              <span className="font-body text-[11px] text-[rgba(26,26,46,0.5)]">
                Mimik seti: <strong>{doctorAnalysis.quality_checks.mimic_set_complete ? 'Tam' : 'Eksik'}</strong>
              </span>
              <span className="font-body text-[11px] text-[rgba(26,26,46,0.5)]">
                Video: <strong>{doctorAnalysis.quality_checks.video_present ? 'Var' : 'Yok'}</strong>
              </span>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {doctorAnalysis && (
        <CollapsibleSection title="Risk ve Doz Kılavuzu">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <GlassCard padding="sm">
                <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mb-1.5">Risk Seviyesi</p>
                <StatusBadge status={doctorAnalysis.dose_recommendation.risk_level} type="risk" />
              </GlassCard>
              <GlassCard padding="sm">
                <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mb-1.5">Doz Aralığı</p>
                <p className="font-mono text-[18px] font-medium text-[#1A1A2E]">{doctorAnalysis.dose_recommendation.range_cc}</p>
              </GlassCard>
              <GlassCard padding="sm">
                <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mb-1.5">Üst Limit</p>
                <p className="font-mono text-[18px] font-medium text-[#A05252]">{doctorAnalysis.dose_recommendation.upper_limit_cc}</p>
              </GlassCard>
            </div>

            <div className="border border-[rgba(196,163,90,0.2)] rounded-[10px] px-4 py-3 bg-[rgba(196,163,90,0.04)]">
              <p className="font-body text-[11px] text-[rgba(26,26,46,0.55)] italic leading-relaxed">
                Bu çıktı doktor karar desteği içindir. Final uygulama kararı klinik değerlendirme sonrasında verilir.
              </p>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {readiness && (
        <CollapsibleSection title="Konsültasyon Hazırlığı">
          <GlassCard strong>
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="font-mono text-[48px] font-medium leading-none" style={{ color: readinessConfig?.color }}>
                    {readiness.readiness_score}
                  </p>
                  <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mt-1">Skor</p>
                </div>
                <div>
                  <StatusBadge status={readiness.readiness_band} type="readiness" />
                  <p className="font-body text-[12px] text-[rgba(26,26,46,0.65)] mt-2">{readinessConfig?.action}</p>
                </div>
              </div>

              <ThinLine />

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <InfoRow label="Motivasyon" value={readiness.primary_motivation} />
                <InfoRow label="Hedef Netliği" value={goalClarityLabels[readiness.goal_clarity]} />
                <InfoRow label="Zamanlama Niyeti" value={timeIntentLabels[readiness.time_intent]} />
                <InfoRow label="Önceki Deneyim" value={readiness.prior_experience ? 'Evet' : 'Hayır'} />
                <InfoRow label="İletişim Tercihi" value={communicationPreferenceLabels[readiness.communication_preference]} />
                <InfoRow label="Ek İşlem Potansiyeli" value={upsellPotentialLabels[readiness.upsell_potential]} />
                <div className="col-span-full">
                  <InfoRow label="Önerilen Takip" value={readiness.recommended_followup} />
                </div>
              </div>
            </div>
          </GlassCard>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Doktor Notları">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Klinik notlarınızı buraya ekleyin..."
              className="w-full bg-[rgba(255,254,249,0.7)] border border-[rgba(196,163,90,0.25)] rounded-[10px] px-4 py-3 font-body text-[13px] text-[#1A1A2E] focus:outline-none focus:border-[#2D5F5D] resize-none placeholder:text-[rgba(26,26,46,0.3)]"
            />
            <span className="absolute bottom-2 right-3 font-mono text-[10px] text-[rgba(26,26,46,0.25)]">
              {notes.length}/2000
            </span>
          </div>
          <div className="flex items-center gap-4">
            <PremiumButton onClick={handleSaveNotes} size="sm">
              Kaydet
            </PremiumButton>
            {notesSaved && <p className="font-body text-[11px] text-[#3D7A5F]">✓ Kaydedildi</p>}
            {lead.doctor_notes_updated_at && (
              <p className="font-body text-[10px] text-[rgba(26,26,46,0.4)]">Son: {formatDateTime(lead.doctor_notes_updated_at)}</p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Before / After">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="flex flex-col gap-3">
            <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)]">Öncesi</p>
            {lead.before_media.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {lead.before_media.map((item, index) => (
                  <div key={`before-${index}`} className="rounded-[14px] overflow-hidden border border-[rgba(196,163,90,0.16)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item} alt={`Öncesi ${index + 1}`} className="w-full h-32 object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <PlaceholderImage variant="before-after" className="h-40" label="Henüz öncesi görseli eklenmedi" />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)]">Sonrası</p>
            {lead.after_media.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {lead.after_media.map((item, index) => (
                  <div key={`after-${index}`} className="rounded-[14px] overflow-hidden border border-[rgba(196,163,90,0.16)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item} alt={`Sonrası ${index + 1}`} className="w-full h-32 object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <PlaceholderImage variant="before-after" className="h-40" label="Henüz sonrası görseli eklenmedi" />
            )}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Rapor">
        <div className="flex flex-col gap-4">
          <PremiumButton onClick={handleGenerateReport} size="md">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Rapor Sayfasını Oluştur
          </PremiumButton>

          {lead.report_generated_at && lead.report_url && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="font-body text-[12px] text-[rgba(26,26,46,0.5)]">✓ Rapor hazırlandı: {formatDateTime(lead.report_generated_at)}</p>
              <Link href={lead.report_url} className="font-body text-[11px] tracking-[0.1em] uppercase text-[#2D5F5D] hover:underline">
                Raporu Aç
              </Link>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  )
}
