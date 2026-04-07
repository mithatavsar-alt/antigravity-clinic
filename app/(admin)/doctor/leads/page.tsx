'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useClinicStore } from '@/lib/store'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import type { Lead, LeadStatus, ReadinessBand } from '@/types/lead'
import { concernAreaLabels } from '@/types/lead'
import { formatDate } from '@/lib/utils'
import { sessionToLead } from '@/lib/supabase/queries'

export default function LeadsPage() {
  const { leads } = useClinicStore()
  const [supabaseLeads, setSupabaseLeads] = useState<Lead[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('')
  const [bandFilter, setBandFilter] = useState<ReadinessBand | ''>('')

  // Fetch leads from server API on mount, merge with Zustand
  useEffect(() => {
    fetch('/api/doctor/leads')
      .then(async (res) => {
        if (!res.ok) {
          setFetchError('Veriler yüklenirken bir hata oluştu.')
          console.error('[Leads] API error:', res.status)
          return
        }
        const { data } = await res.json()
        if (data && data.length > 0) {
          setSupabaseLeads(data.map((row: Record<string, unknown>) => sessionToLead(row)))
        }
      })
      .catch((e) => {
        setFetchError('Sunucuya bağlanılamadı.')
        console.error('[Leads] Network error:', e)
      })
  }, [])

  // Merge: Zustand leads + Supabase leads (deduplicate by id, Zustand wins)
  const allLeads = useMemo(() => {
    const map = new Map<string, Lead>()
    for (const l of supabaseLeads) map.set(l.id, l)
    for (const l of leads) map.set(l.id, l) // Zustand overwrites Supabase
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [leads, supabaseLeads])

  const filtered = useMemo(() => {
    return allLeads.filter((l) => {
      const q = search.toLowerCase()
      const matchSearch = !q || l.full_name.toLowerCase().includes(q) || l.phone.includes(q)
      const matchStatus = !statusFilter || l.status === statusFilter
      const matchBand = !bandFilter || l.readiness_band === bandFilter
      return matchSearch && matchStatus && matchBand
    })
  }, [allLeads, search, statusFilter, bandFilter])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <SectionLabel className="mb-1">Hasta Yönetimi</SectionLabel>
          <h1 className="font-display text-[28px] font-light text-[var(--color-text)]">Lead Listesi</h1>
        </div>
        <div className="font-mono text-[11px] text-[var(--color-text-muted)] tracking-[0.1em]">
          {filtered.length} / {allLeads.length} kayıt
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

      {/* Fetch error banner */}
      {fetchError && (
        <div className="bg-[rgba(160,82,82,0.06)] border border-[rgba(160,82,82,0.2)] rounded-[10px] px-4 py-3 flex items-center justify-between">
          <p className="font-body text-[12px] text-[#A05252]">{fetchError}</p>
          <button type="button" onClick={() => window.location.reload()} className="font-body text-[11px] text-medical-trust hover:underline">
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border-gold)] bg-[var(--glass-bg)]">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-[var(--glass-bg-strong)] border-b border-[var(--color-border-gold)]">
              {['ID', 'Ad Soyad', 'Yaş / Cinsiyet', 'Telefon', 'İlgi Alanı', 'Statü', 'Readiness', 'Tarih', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-body text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-muted)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center font-body text-[13px] text-[var(--color-text-muted)] italic">
                  Sonuç bulunamadı
                </td>
              </tr>
            )}
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-gold-glow)] transition-colors">
                <td className="px-4 py-3 font-mono text-[11px] text-[var(--color-text-muted)]">{lead.id}</td>
                <td className="px-4 py-3 font-body text-[13px] text-[var(--color-text)] font-medium">{lead.full_name}</td>
                <td className="px-4 py-3 font-body text-[12px] text-[var(--color-text-secondary)]">{lead.age_range} · {lead.gender === 'female' ? 'K' : lead.gender === 'male' ? 'E' : 'D'}</td>
                <td className="px-4 py-3 font-body text-[12px] text-[var(--color-text-secondary)]">{lead.phone}</td>
                <td className="px-4 py-3 font-body text-[11px] text-[var(--color-text-secondary)]">{concernAreaLabels[lead.concern_area]}</td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} type="lead" /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
                    {lead.readiness_score != null && (
                      <span className="font-mono text-[12px] text-[var(--color-text-muted)]">{lead.readiness_score}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-body text-[11px] text-[var(--color-text-muted)]">{formatDate(lead.created_at)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/doctor/leads/${lead.id}`}
                    className="font-body text-[10px] tracking-[0.15em] uppercase text-medical-trust hover:text-[var(--color-text)] transition-colors border border-[rgba(45,95,93,0.3)] hover:border-[var(--color-text)] px-3 py-1.5 rounded-sm"
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
