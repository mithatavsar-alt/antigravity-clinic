'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useClinicStore } from '@/lib/store'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import type { LeadStatus, ReadinessBand } from '@/types/lead'
import { concernAreaLabels } from '@/types/lead'
import { formatDate } from '@/lib/utils'

export default function LeadsPage() {
  const { leads } = useClinicStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('')
  const [bandFilter, setBandFilter] = useState<ReadinessBand | ''>('')

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const q = search.toLowerCase()
      const matchSearch = !q || l.full_name.toLowerCase().includes(q) || l.phone.includes(q)
      const matchStatus = !statusFilter || l.status === statusFilter
      const matchBand = !bandFilter || l.readiness_band === bandFilter
      return matchSearch && matchStatus && matchBand
    })
  }, [leads, search, statusFilter, bandFilter])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <SectionLabel className="mb-1">Hasta Yönetimi</SectionLabel>
          <h1 className="font-display text-[28px] font-light text-[#1A1A2E]">Lead Listesi</h1>
        </div>
        <div className="font-mono text-[11px] text-[rgba(26,26,46,0.35)] tracking-[0.1em]">
          {filtered.length} / {leads.length} kayıt
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya telefon ara..."
          className="field-input field-input-sm min-w-[200px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | '')} className="field-input field-input-sm">
          <option value="">Tüm Statüler</option>
          {([
            { value: 'new', label: 'Yeni' },
            { value: 'consented', label: 'Rıza Verildi' },
            { value: 'analysis_ready', label: 'Analiz Hazır' },
            { value: 'doctor_reviewed', label: 'İncelendi' },
            { value: 'contacted', label: 'İletişime Geçildi' },
            { value: 'booked', label: 'Randevu Alındı' },
            { value: 'archived', label: 'Arşivlendi' },
          ] as { value: LeadStatus; label: string }[]).map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value as ReadinessBand | '')} className="field-input field-input-sm">
          <option value="">Tüm Readiness</option>
          <option value="very_high">Çok Yüksek</option>
          <option value="high">Yüksek</option>
          <option value="medium">Orta</option>
          <option value="low">Düşük</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[14px] border border-[rgba(196,163,90,0.15)] bg-[rgba(255,254,249,0.6)]">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-[rgba(255,254,249,0.8)] border-b border-[rgba(196,163,90,0.12)]">
              {['ID', 'Ad Soyad', 'Yaş / Cinsiyet', 'Telefon', 'İlgi Alanı', 'Statü', 'Readiness', 'Tarih', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center font-body text-[13px] text-[rgba(26,26,46,0.4)] italic">
                  Sonuç bulunamadı
                </td>
              </tr>
            )}
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-b border-[rgba(196,163,90,0.07)] hover:bg-[rgba(196,163,90,0.03)] transition-colors">
                <td className="px-4 py-3 font-mono text-[11px] text-[rgba(26,26,46,0.5)]">{lead.id}</td>
                <td className="px-4 py-3 font-body text-[13px] text-[#1A1A2E] font-medium">{lead.full_name}</td>
                <td className="px-4 py-3 font-body text-[12px] text-[rgba(26,26,46,0.6)]">{lead.age_range} · {lead.gender === 'female' ? 'K' : lead.gender === 'male' ? 'E' : 'D'}</td>
                <td className="px-4 py-3 font-body text-[12px] text-[rgba(26,26,46,0.6)]">{lead.phone}</td>
                <td className="px-4 py-3 font-body text-[11px] text-[rgba(26,26,46,0.6)]">{concernAreaLabels[lead.concern_area]}</td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} type="lead" /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
                    {lead.readiness_score != null && (
                      <span className="font-mono text-[12px] text-[rgba(26,26,46,0.5)]">{lead.readiness_score}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-body text-[11px] text-[rgba(26,26,46,0.45)]">{formatDate(lead.created_at)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/doctor/leads/${lead.id}`}
                    className="font-body text-[10px] tracking-[0.15em] uppercase text-[#2D5F5D] hover:text-[#1A1A2E] transition-colors border border-[rgba(45,95,93,0.3)] hover:border-[#1A1A2E] px-3 py-1.5 rounded-[8px]"
                  >
                    İncele
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
