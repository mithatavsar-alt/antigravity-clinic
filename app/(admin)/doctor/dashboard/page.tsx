'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { createClient } from '@/lib/supabase/client'
import { fetchLeadsWithResults, sessionToLead } from '@/lib/supabase/queries'
import { concernAreaLabels } from '@/types/lead'
import { formatDate } from '@/lib/utils'
import type { Lead } from '@/types/lead'

interface StatCard {
  label: string
  value: number
  color: string
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    const sb = createClient()
    fetchLeadsWithResults(sb)
      .then(({ data, error }) => {
        if (error) {
          setFetchError('Veriler yüklenirken bir hata oluştu.')
          console.error('[Dashboard] Supabase fetch error:', error.message)
          return
        }
        if (data && data.length > 0) {
          setLeads(data.map((row: Record<string, unknown>) => sessionToLead(row)))
        }
      })
      .catch((e) => {
        setFetchError('Sunucuya bağlanılamadı.')
        console.error('[Dashboard] Network error:', e)
      })
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo((): StatCard[] => {
    const byStatus = (s: string) => leads.filter((l) => l.status === s).length
    return [
      { label: 'Toplam Lead', value: leads.length, color: 'var(--color-text)' },
      { label: 'Yeni', value: byStatus('new') + byStatus('consented'), color: '#2D5F5D' },
      { label: 'Analiz Hazır', value: byStatus('analysis_ready'), color: '#C4A35A' },
      { label: 'İncelendi', value: byStatus('doctor_reviewed'), color: '#5B7DB1' },
      { label: 'İletişime Geçildi', value: byStatus('contacted'), color: '#7B6BA1' },
      { label: 'Randevu', value: byStatus('booked'), color: '#3D7A5F' },
    ]
  }, [leads])

  const latestLeads = useMemo(() => {
    return [...leads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  }, [leads])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-body text-[13px] text-[var(--color-text-muted)] animate-pulse">
          Yükleniyor...
        </p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="font-body text-[14px] text-[#A05252]">{fetchError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-body text-[12px] text-medical-trust hover:underline"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <SectionLabel className="mb-1">Genel Bakış</SectionLabel>
        <h1 className="font-display text-[28px] font-light text-[var(--color-text)]">
          Dashboard
        </h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <GlassCard key={stat.label} padding="sm">
            <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-muted)] mb-2">
              {stat.label}
            </p>
            <p className="font-mono text-[28px] font-medium leading-none" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </GlassCard>
        ))}
      </div>

      {/* Latest leads */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[18px] font-light text-[var(--color-text)]">
            Son Başvurular
          </h2>
          <Link
            href="/doctor/leads"
            className="font-body text-[11px] tracking-[0.12em] uppercase text-medical-trust hover:text-[var(--color-text)] transition-colors"
          >
            Tümünü Gör →
          </Link>
        </div>

        {latestLeads.length === 0 ? (
          <GlassCard padding="lg">
            <p className="font-body text-[13px] text-[var(--color-text-muted)] text-center italic">
              Henüz başvuru bulunmuyor.
            </p>
          </GlassCard>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border-gold)] bg-[var(--glass-bg)]">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-[var(--glass-bg-strong)] border-b border-[var(--color-border-gold)]">
                  {['Ad Soyad', 'Telefon', 'İlgi Alanı', 'Statü', 'Tarih', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-body text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-[var(--color-border)] hover:bg-[var(--color-gold-glow)] transition-colors"
                  >
                    <td className="px-4 py-3 font-body text-[13px] text-[var(--color-text)] font-medium">
                      {lead.full_name}
                    </td>
                    <td className="px-4 py-3 font-body text-[12px] text-[var(--color-text-secondary)]">
                      {lead.phone}
                    </td>
                    <td className="px-4 py-3 font-body text-[11px] text-[var(--color-text-secondary)]">
                      {concernAreaLabels[lead.concern_area]}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} type="lead" />
                    </td>
                    <td className="px-4 py-3 font-body text-[11px] text-[var(--color-text-muted)]">
                      {formatDate(lead.created_at)}
                    </td>
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
        )}
      </div>
    </div>
  )
}
