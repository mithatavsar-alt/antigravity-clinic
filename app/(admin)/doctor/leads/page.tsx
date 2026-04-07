'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useClinicStore } from '@/lib/store'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import type { Lead, LeadStatus, ReadinessBand } from '@/types/lead'
import { concernAreaLabels } from '@/types/lead'
import { formatDate } from '@/lib/utils'
import { scoreColor } from '@/lib/ui/score-colors'
import { sessionToLead } from '@/lib/supabase/queries'

const statusOptions: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'Yeni' },
  { value: 'consented', label: 'Rıza Verildi' },
  { value: 'analysis_ready', label: 'Analiz Hazır' },
  { value: 'doctor_reviewed', label: 'İncelendi' },
  { value: 'contacted', label: 'İletişime Geçildi' },
  { value: 'booked', label: 'Randevu Alındı' },
  { value: 'archived', label: 'Arşivlendi' },
]

export default function LeadsPage() {
  const { leads } = useClinicStore()
  const [supabaseLeads, setSupabaseLeads] = useState<Lead[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('')
  const [bandFilter, setBandFilter] = useState<ReadinessBand | ''>('')

  useEffect(() => {
    fetch('/api/doctor/leads')
      .then(async (res) => {
        if (!res.ok) {
          setFetchError('Veriler yüklenirken bir hata oluştu.')
          return
        }
        const { data } = await res.json()
        if (data && data.length > 0) {
          setSupabaseLeads(data.map((row: Record<string, unknown>) => sessionToLead(row)))
        }
      })
      .catch(() => setFetchError('Sunucuya bağlanılamadı.'))
  }, [])

  const allLeads = useMemo(() => {
    const map = new Map<string, Lead>()
    for (const l of supabaseLeads) map.set(l.id, l)
    for (const l of leads) map.set(l.id, l)
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
          <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[#D6B98C] mb-1">Hasta Yönetimi</p>
          <h1 className="font-display text-[28px] font-light text-[#F8F6F2]">Lead Listesi</h1>
        </div>
        <div className="font-mono text-[11px] text-[rgba(248,246,242,0.3)]">
          {filtered.length} / {allLeads.length} kayıt
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya telefon ara..."
          className="min-w-[200px] bg-[rgba(248,246,242,0.04)] border border-[rgba(248,246,242,0.08)] rounded-lg px-3 py-2 font-body text-[12px] text-[#F8F6F2] placeholder:text-[rgba(248,246,242,0.2)] focus:outline-none focus:border-[rgba(214,185,140,0.2)]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | '')}
          className="bg-[rgba(248,246,242,0.04)] border border-[rgba(248,246,242,0.08)] rounded-lg px-3 py-2 font-body text-[12px] text-[#F8F6F2] focus:outline-none focus:border-[rgba(214,185,140,0.2)]"
        >
          <option value="" className="bg-[#14110E]">Tüm Statüler</option>
          {statusOptions.map(({ value, label }) => (
            <option key={value} value={value} className="bg-[#14110E]">{label}</option>
          ))}
        </select>
        <select
          value={bandFilter}
          onChange={(e) => setBandFilter(e.target.value as ReadinessBand | '')}
          className="bg-[rgba(248,246,242,0.04)] border border-[rgba(248,246,242,0.08)] rounded-lg px-3 py-2 font-body text-[12px] text-[#F8F6F2] focus:outline-none focus:border-[rgba(214,185,140,0.2)]"
        >
          <option value="" className="bg-[#14110E]">Tüm Hazırlık</option>
          <option value="very_high" className="bg-[#14110E]">Çok Yüksek</option>
          <option value="high" className="bg-[#14110E]">Yüksek</option>
          <option value="medium" className="bg-[#14110E]">Orta</option>
          <option value="low" className="bg-[#14110E]">Düşük</option>
        </select>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="rounded-lg bg-[rgba(196,122,122,0.06)] border border-[rgba(196,122,122,0.15)] px-4 py-3 flex items-center justify-between">
          <p className="font-body text-[12px] text-[#C47A7A]">{fetchError}</p>
          <button type="button" onClick={() => window.location.reload()} className="font-body text-[11px] text-[#D6B98C] hover:underline">
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Lead rows */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.02)] p-12 text-center">
          <p className="font-body text-[13px] text-[rgba(248,246,242,0.3)]">Sonuç bulunamadı</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadRow({ lead }: { lead: Lead }) {
  const wrinkleScores = lead.wrinkle_scores as { overallScore?: number } | undefined
  const radarAnalysis = lead.radar_analysis as { radarScores?: Array<{ score: number }> } | undefined
  const score = wrinkleScores?.overallScore ?? (radarAnalysis?.radarScores ? Math.round(radarAnalysis.radarScores.reduce((s, r) => s + r.score, 0) / radarAnalysis.radarScores.length) : undefined)

  return (
    <Link
      href={`/doctor/leads/${lead.id}`}
      className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-[rgba(248,246,242,0.03)] bg-[rgba(248,246,242,0.01)] hover:border-[rgba(214,185,140,0.12)] hover:bg-[rgba(248,246,242,0.025)] transition-all"
    >
      {/* Score mini arc */}
      <div className="flex-shrink-0 w-9 h-9 relative">
        {score != null ? (
          <>
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(248,246,242,0.04)" strokeWidth="2" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={scoreColor(score)} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 88} 88`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[rgba(248,246,242,0.7)]">{score}</span>
          </>
        ) : (
          <div className="w-full h-full rounded-full bg-[rgba(248,246,242,0.03)] flex items-center justify-center">
            <span className="font-mono text-[9px] text-[rgba(248,246,242,0.15)]">—</span>
          </div>
        )}
      </div>

      {/* Name + Meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-body text-[13px] font-medium text-[#F8F6F2] truncate group-hover:text-[#D6B98C] transition-colors">
            {lead.full_name}
          </span>
          {lead.age_range && (
            <span className="font-mono text-[9px] text-[rgba(248,246,242,0.25)]">{lead.age_range}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-body text-[10px] text-[rgba(248,246,242,0.25)]">
            {concernAreaLabels[lead.concern_area as keyof typeof concernAreaLabels] ?? lead.concern_area}
          </span>
          <span className="text-[rgba(248,246,242,0.1)]">·</span>
          <span className="font-mono text-[10px] text-[rgba(248,246,242,0.2)]">{lead.phone}</span>
        </div>
      </div>

      {/* Badges */}
      <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
        <StatusBadge status={lead.status} type="lead" />
        {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
      </div>

      {/* Date */}
      <span className="flex-shrink-0 font-mono text-[10px] text-[rgba(248,246,242,0.2)]">
        {formatDate(lead.created_at)}
      </span>

      {/* Arrow */}
      <svg className="w-4 h-4 text-[rgba(248,246,242,0.1)] group-hover:text-[#D6B98C] transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  )
}
