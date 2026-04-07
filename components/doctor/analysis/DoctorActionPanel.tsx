'use client'

import { useState } from 'react'
import type { Lead, LeadStatus } from '@/types/lead'
import { scoreColor } from '@/lib/ui/score-colors'

interface DoctorActionPanelProps {
  lead: Lead
  onStatusChange?: (status: LeadStatus) => void
  onSaveNotes?: (notes: string) => Promise<boolean>
}

const statusOptions: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'Yeni' },
  { value: 'consented', label: 'Rıza Verildi' },
  { value: 'analysis_ready', label: 'Analiz Hazır' },
  { value: 'doctor_reviewed', label: 'İncelendi' },
  { value: 'contacted', label: 'İletişime Geçildi' },
  { value: 'booked', label: 'Randevu Alındı' },
  { value: 'archived', label: 'Arşivlendi' },
]

function deriveInsights(lead: Lead) {
  const insights: Array<{ label: string; color: string; icon: string }> = []
  const readinessScore = lead.readiness_score ?? 0
  const confidence = lead.analysis_confidence ?? 0

  if (readinessScore >= 80) insights.push({ label: 'İlk görüşme için uygun', color: '#3D7A5F', icon: 'OK' })
  else if (readinessScore >= 60) insights.push({ label: 'İletişime hazır', color: '#2D5F5D', icon: 'GO' })

  if (lead.capture_confidence === 'low' || confidence < 0.5) {
    insights.push({ label: 'Düşük güven uyarısı', color: '#C4883A', icon: '!' })
  }

  if (lead.recapture_recommended) {
    insights.push({ label: 'Yeniden çekim önerilir', color: '#C4883A', icon: 'RE' })
  }

  const focusAreas = lead.focus_areas as Array<{ doctorReviewRecommended?: boolean }> | undefined
  if (focusAreas?.some((item) => item.doctorReviewRecommended)) {
    insights.push({ label: 'Detaylı değerlendirme önerilir', color: '#C4A35A', icon: 'MD' })
  }

  if (lead.consultation_timing === 'asap' || lead.consultation_timing === 'iki_hafta') {
    insights.push({ label: 'Öncelikli takip', color: '#C47A7A', icon: 'UP' })
  }

  return insights
}

export function DoctorActionPanel({ lead, onStatusChange, onSaveNotes }: DoctorActionPanelProps) {
  const [notes, setNotes] = useState(lead.doctor_notes ?? '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const insights = deriveInsights(lead)
  const readinessScore = lead.readiness_score ?? 0

  const handleSave = async () => {
    if (!onSaveNotes) return
    setSaving(true)
    setSaveError(false)
    const ok = await onSaveNotes(notes)
    setSaving(false)
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      setSaveError(true)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="doctor-card-strong relative rounded-xl p-5 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[rgba(196,163,90,0.22)] to-transparent" />
        <h4 className="font-body text-[13px] tracking-[0.15em] uppercase text-[#C4A35A] mb-4">Durum & Aksiyon</h4>

        <div className="mb-4">
          <label className="font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)] mb-1.5 block">Lead Durumu</label>
          <select value={lead.status} onChange={(event) => onStatusChange?.(event.target.value as LeadStatus)} className="doctor-control">
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {readinessScore > 0 && (
          <div className="doctor-card-soft mb-4 p-3 rounded-lg">
            <p className="font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)] mb-1">Hazırlık Skoru</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[28px] font-light" style={{ color: scoreColor(readinessScore) }}>
                {readinessScore}
              </span>
              <span className="font-body text-[13px] text-[rgba(26,26,46,0.38)]">/ 100</span>
            </div>
          </div>
        )}

        {insights.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {insights.map((insight) => (
              <div key={insight.label} className="doctor-card-soft flex items-center gap-2 px-2.5 py-1.5 rounded-md">
                <span className="font-mono text-[11px]" style={{ color: insight.color }}>
                  {insight.icon}
                </span>
                <span className="font-body text-[13px]" style={{ color: insight.color }}>
                  {insight.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="doctor-card-strong relative lg:col-span-2 rounded-xl p-5 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[rgba(196,163,90,0.22)] to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-body text-[13px] tracking-[0.15em] uppercase text-[#C4A35A]">Doktor Notları</h4>
          {lead.doctor_notes_updated_at && (
            <span className="font-mono text-[11px] text-[rgba(26,26,46,0.38)]">
              Son güncelleme: {new Date(lead.doctor_notes_updated_at).toLocaleDateString('tr-TR')}
            </span>
          )}
        </div>

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Hastaya özel klinik notlarınızı buraya ekleyin..."
          className="doctor-control min-h-[148px] resize-none text-[15px] leading-relaxed"
        />

        <div className="flex items-center justify-between mt-3">
          <span className="font-mono text-[11px] text-[rgba(26,26,46,0.38)]">{notes.length} / 2000</span>
          <div className="flex items-center gap-3">
            {saved && <span className="font-body text-[13px] text-[#3D7A5F]">Kaydedildi</span>}
            {saveError && <span className="font-body text-[13px] text-[#C47A7A]">Kayıt başarısız</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="doctor-card-soft px-4 py-2 rounded-lg font-body text-[13px] tracking-[0.08em] uppercase text-[#C4A35A] hover:bg-[rgba(196,163,90,0.12)] transition-colors disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
