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
  const rs = lead.readiness_score ?? 0
  const conf = lead.analysis_confidence ?? 0

  if (rs >= 80) insights.push({ label: 'İlk görüşme için uygun', color: '#4AE3A7', icon: '✓' })
  else if (rs >= 60) insights.push({ label: 'İletişime hazır', color: '#3D9B7A', icon: '→' })

  if (lead.capture_confidence === 'low' || conf < 0.5) insights.push({ label: 'Düşük güven uyarısı', color: '#C4883A', icon: '!' })
  if (lead.recapture_recommended) insights.push({ label: 'Yeniden çekim önerilir', color: '#C4883A', icon: '↻' })

  const focus = lead.focus_areas as Array<{ doctorReviewRecommended?: boolean }> | undefined
  if (focus?.some((f) => f.doctorReviewRecommended)) {
    insights.push({ label: 'Detaylı değerlendirme önerilir', color: '#D6B98C', icon: '◉' })
  }

  if (lead.consultation_timing === 'asap' || lead.consultation_timing === 'iki_hafta') {
    insights.push({ label: 'Öncelikli takip', color: '#C47A7A', icon: '⚡' })
  }

  return insights
}

export function DoctorActionPanel({ lead, onStatusChange, onSaveNotes }: DoctorActionPanelProps) {
  const [notes, setNotes] = useState(lead.doctor_notes ?? '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const insights = deriveInsights(lead)
  const rs = lead.readiness_score ?? 0

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
      {/* Status + Insights */}
      <div className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-5">
        <h4 className="font-body text-[10px] tracking-[0.15em] uppercase text-[#D6B98C] mb-4">Durum & Aksiyon</h4>

        {/* Status selector */}
        <div className="mb-4">
          <label className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)] mb-1.5 block">Lead Durumu</label>
          <select
            value={lead.status}
            onChange={(e) => onStatusChange?.(e.target.value as LeadStatus)}
            className="w-full bg-[rgba(18,16,13,0.55)] border border-[rgba(214,185,140,0.12)] rounded-lg px-3 py-2 font-body text-[12px] text-[#F8F6F2] focus:outline-none focus:border-[rgba(214,185,140,0.40)]"
          >
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value} className="bg-[#14110E]">{s.label}</option>
            ))}
          </select>
        </div>

        {/* Readiness score */}
        {rs > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-[rgba(16,14,11,0.55)] backdrop-blur-lg">
            <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)] mb-1">Hazırlık Skoru</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[22px] font-light" style={{ color: scoreColor(rs) }}>{rs}</span>
              <span className="font-body text-[10px] text-[rgba(248,246,242,0.48)]">/ 100</span>
            </div>
          </div>
        )}

        {/* Derived insights */}
        {insights.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {insights.map((ins) => (
              <div key={ins.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[rgba(16,14,11,0.55)] backdrop-blur-lg">
                <span className="text-[10px]" style={{ color: ins.color }}>{ins.icon}</span>
                <span className="font-body text-[11px]" style={{ color: ins.color }}>{ins.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Doctor Notes */}
      <div className="lg:col-span-2 rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-body text-[10px] tracking-[0.15em] uppercase text-[#D6B98C]">Doktor Notları</h4>
          {lead.doctor_notes_updated_at && (
            <span className="font-mono text-[9px] text-[rgba(248,246,242,0.38)]">
              Son güncelleme: {new Date(lead.doctor_notes_updated_at).toLocaleDateString('tr-TR')}
            </span>
          )}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Hastaya özel klinik notlarınızı buraya ekleyin..."
          className="w-full bg-[rgba(20,18,14,0.55)] border border-[rgba(214,185,140,0.10)] rounded-lg px-4 py-3 font-body text-[13px] text-[rgba(248,246,242,0.80)] placeholder:text-[rgba(248,246,242,0.28)] focus:outline-none focus:border-[rgba(214,185,140,0.35)] resize-none leading-relaxed"
        />

        <div className="flex items-center justify-between mt-3">
          <span className="font-mono text-[9px] text-[rgba(248,246,242,0.38)]">{notes.length} / 2000</span>
          <div className="flex items-center gap-3">
            {saved && <span className="font-body text-[11px] text-[#4AE3A7]">Kaydedildi</span>}
            {saveError && <span className="font-body text-[11px] text-[#C47A7A]">Kayıt başarısız</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[rgba(214,185,140,0.1)] border border-[rgba(214,185,140,0.2)] font-body text-[11px] tracking-[0.08em] uppercase text-[#D6B98C] hover:bg-[rgba(214,185,140,0.15)] transition-colors disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
