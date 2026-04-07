'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { sessionToLead } from '@/lib/supabase/queries'
import { concernAreaLabels } from '@/types/lead'
import { formatDate } from '@/lib/utils'
import { scoreColor } from '@/lib/ui/score-colors'
import type { Lead } from '@/types/lead'

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/doctor/leads')
      .then(async (res) => {
        if (!res.ok) {
          setFetchError('Veriler yüklenirken bir hata oluştu.')
          return
        }
        const { data } = await res.json()
        if (data && data.length > 0) {
          setLeads(data.map((row: Record<string, unknown>) => sessionToLead(row)))
        }
      })
      .catch(() => setFetchError('Sunucuya bağlanılamadı.'))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const byStatus = (s: string) => leads.filter((l) => l.status === s).length
    const lowConf = leads.filter((l) => l.capture_confidence === 'low' || (l.analysis_confidence != null && l.analysis_confidence < 0.5)).length
    const highPriority = leads.filter((l) => (l.readiness_score ?? 0) >= 70 && l.status !== 'booked' && l.status !== 'archived').length
    return [
      { label: 'Toplam', value: leads.length, color: '#F8F6F2' },
      { label: 'Yeni', value: byStatus('new') + byStatus('consented'), color: '#4AE3A7' },
      { label: 'İnceleme Bekliyor', value: byStatus('analysis_ready'), color: '#D6B98C' },
      { label: 'Yüksek Öncelik', value: highPriority, color: '#C47A7A' },
      { label: 'Düşük Güven', value: lowConf, color: '#C4883A' },
      { label: 'Randevu', value: byStatus('booked'), color: '#3D9B7A' },
    ]
  }, [leads])

  const latestLeads = useMemo(() =>
    [...leads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8),
  [leads])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[rgba(214,185,140,0.12)] border-t-[#D6B98C] animate-spin" />
          <p className="font-body text-[12px] text-[rgba(248,246,242,0.48)]">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="font-body text-[13px] text-[#C47A7A]">{fetchError}</p>
        <button type="button" onClick={() => window.location.reload()} className="font-body text-[11px] text-[#D6B98C] hover:underline">
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[#D6B98C] mb-1">Genel Bakış</p>
        <h1 className="font-display text-[28px] font-light text-[#F8F6F2]">Dashboard</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg px-4 py-4"
          >
            <p className="font-body text-[9px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.48)] mb-2">{stat.label}</p>
            <p className="font-mono text-[28px] font-light leading-none" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Leads */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[18px] font-light text-[#F8F6F2]">Son Başvurular</h2>
          <Link href="/doctor/leads" className="font-body text-[10px] tracking-[0.12em] uppercase text-[#D6B98C] hover:text-[#F8F6F2] transition-colors">
            Tümünü Gör →
          </Link>
        </div>

        {latestLeads.length === 0 ? (
          <div className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-12 text-center">
            <p className="font-body text-[13px] text-[rgba(248,246,242,0.48)]">Henüz başvuru bulunmuyor.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {latestLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  const wrinkleScores = lead.wrinkle_scores as { overallScore?: number } | undefined
  const radarAnalysis = lead.radar_analysis as { radarScores?: Array<{ score: number }> } | undefined
  const score = wrinkleScores?.overallScore ?? (radarAnalysis?.radarScores ? Math.round(radarAnalysis.radarScores.reduce((s, r) => s + r.score, 0) / radarAnalysis.radarScores.length) : undefined)
  const confLabel = lead.capture_confidence ?? (lead.analysis_confidence != null ? (lead.analysis_confidence >= 0.7 ? 'high' : lead.analysis_confidence >= 0.4 ? 'medium' : 'low') : undefined)

  return (
    <Link
      href={`/doctor/leads/${lead.id}`}
      className="group rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-4 hover:border-[rgba(214,185,140,0.22)] hover:bg-[rgba(20,18,14,0.60)] transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-body text-[13px] font-medium text-[#F8F6F2] truncate group-hover:text-[#D6B98C] transition-colors">
            {lead.full_name}
          </h3>
          <p className="font-body text-[10px] text-[rgba(248,246,242,0.48)] mt-0.5">{formatDate(lead.created_at)}</p>
        </div>
        {score != null && (
          <div className="flex-shrink-0 w-10 h-10 relative">
            <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(248,246,242,0.08)" strokeWidth="2.5" />
              <circle cx="20" cy="20" r="16" fill="none" stroke={scoreColor(score)} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 100.5} 100.5`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-[#F8F6F2]">{score}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <StatusBadge status={lead.status} type="lead" />
        {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
      </div>

      <div className="flex items-center justify-between text-[rgba(248,246,242,0.48)]">
        <span className="font-body text-[10px]">
          {concernAreaLabels[lead.concern_area as keyof typeof concernAreaLabels] ?? lead.concern_area}
        </span>
        {confLabel && (
          <span className="font-mono text-[9px]">{confLabel === 'high' ? 'Yüksek' : confLabel === 'medium' ? 'Orta' : 'Düşük'} güven</span>
        )}
      </div>
    </Link>
  )
}
