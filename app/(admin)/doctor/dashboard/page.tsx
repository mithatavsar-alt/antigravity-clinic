'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CalendarCheck2,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ImageWithFallback } from '@/components/public/ImageWithFallback'
import { sessionToLead } from '@/lib/supabase/queries'
import { concernAreaLabels } from '@/types/lead'
import { formatDate } from '@/lib/utils'
import { scoreColor } from '@/lib/ui/score-colors'
import type { Lead } from '@/types/lead'

type MetricCardData = {
  label: string
  value: number
  note: string
  color: string
  tint: string
  icon: React.ComponentType<{ className?: string }>
}

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

  const highPriorityCount = useMemo(
    () => leads.filter((lead) => (lead.readiness_score ?? 0) >= 70 && lead.status !== 'booked' && lead.status !== 'archived').length,
    [leads]
  )

  const reviewQueueCount = useMemo(
    () => leads.filter((lead) => lead.status === 'analysis_ready' || lead.status === 'doctor_reviewed').length,
    [leads]
  )

  const stats = useMemo<MetricCardData[]>(() => {
    const byStatus = (status: string) => leads.filter((lead) => lead.status === status).length
    const lowConfidence = leads.filter(
      (lead) => lead.capture_confidence === 'low' || (lead.analysis_confidence != null && lead.analysis_confidence < 0.5)
    ).length

    return [
      {
        label: 'Toplam',
        value: leads.length,
        note: 'Aktif lead havuzu',
        color: '#1A1A2E',
        tint: 'rgba(26,26,46,0.05)',
        icon: Users,
      },
      {
        label: 'Yeni',
        value: byStatus('new') + byStatus('consented'),
        note: 'İlk temas bekliyor',
        color: '#2D5F5D',
        tint: 'rgba(45,95,93,0.09)',
        icon: Sparkles,
      },
      {
        label: 'İnceleme',
        value: byStatus('analysis_ready'),
        note: 'Doktor kararı bekleniyor',
        color: '#C4A35A',
        tint: 'rgba(196,163,90,0.10)',
        icon: Stethoscope,
      },
      {
        label: 'Öncelikli',
        value: highPriorityCount,
        note: 'Hızlı dönüş önerilir',
        color: '#A05252',
        tint: 'rgba(160,82,82,0.08)',
        icon: TriangleAlert,
      },
      {
        label: 'Düşük Güven',
        value: lowConfidence,
        note: 'Tekrar çekim adayı',
        color: '#B87941',
        tint: 'rgba(184,121,65,0.09)',
        icon: ShieldAlert,
      },
      {
        label: 'Randevu',
        value: byStatus('booked'),
        note: 'Klinik takvime taşındı',
        color: '#3D7A5F',
        tint: 'rgba(61,122,95,0.09)',
        icon: CalendarCheck2,
      },
    ]
  }, [highPriorityCount, leads])

  const latestLeads = useMemo(
    () =>
      [...leads]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    [leads]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[rgba(196,163,90,0.18)] border-t-[#C4A35A]" />
          <p className="font-body text-[14px] text-[rgba(26,26,46,0.48)]">Dashboard hazırlanıyor...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="doctor-card-soft flex h-14 w-14 items-center justify-center rounded-full">
          <TriangleAlert className="h-5 w-5 text-[#A05252]" />
        </div>
        <p className="font-body text-[14px] text-[#A05252]">{fetchError}</p>
        <button type="button" onClick={() => window.location.reload()} className="font-body text-[12px] text-[#C4A35A] hover:underline">
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 lg:gap-9">
      <section className="doctor-card-strong doctor-leads-hero overflow-hidden rounded-[34px]">
        <div className="grid items-stretch gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="doctor-leads-hero-media relative min-h-[280px] overflow-hidden sm:min-h-[360px] lg:min-h-[520px]">
            <ImageWithFallback
              src="/images/Dashboard/Beforeafter.jpg"
              alt="AI destekli doktor dashboard hero görseli"
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 52vw"
              priority
              fallbackIcon="face"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(26,26,46,0.06)_0%,rgba(245,237,226,0.08)_22%,transparent_58%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_48%,rgba(245,237,226,0.18)_100%)]" />

            <div className="absolute left-4 top-4 right-4 sm:left-6 sm:top-6 sm:right-auto">
              <div className="doctor-card-soft rounded-[22px] px-4 py-3 sm:px-5 sm:py-4">
                <p className="font-body text-[13px] uppercase tracking-[0.22em] text-[rgba(26,26,46,0.42)]">Canlı Klinik Görünümü</p>
                <p className="mt-2 max-w-[250px] font-body text-[14px] leading-7 text-[rgba(26,26,46,0.64)]">
                  Lead yoğunluğu, hazırlık seviyesi ve inceleme kuyruğu tek bir sakin hero yüzeyinde okunuyor.
                </p>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
              <div className="flex flex-wrap gap-3">
                <div className="doctor-card-soft min-w-[150px] rounded-[22px] px-4 py-3">
                  <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">Öncelikli Lead</p>
                  <p className="mt-2 font-mono text-[28px] tracking-[-0.04em] text-[#1A1A2E]">{highPriorityCount}</p>
                </div>
                <div className="doctor-card-soft min-w-[150px] rounded-[22px] px-4 py-3">
                  <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">İnceleme Kuyruğu</p>
                  <p className="mt-2 font-mono text-[28px] tracking-[-0.04em] text-[#1A1A2E]">{reviewQueueCount}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="doctor-leads-hero-copy flex flex-col justify-center px-6 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
            <p className="font-body text-[14px] uppercase tracking-[0.28em] text-[#C4A35A]">Kişiselleştirilmiş Analiz</p>

            <div className="mt-5">
              <EditorialHeading as="h1" className="!text-[clamp(2.7rem,5vw,4.4rem)] !leading-[0.94] !tracking-[-0.04em]">
                Doktor Panelini
                <br />
                <GoldItalic>Yumuşak Bir Netlikle</GoldItalic>
                <br />
                Yönetin
              </EditorialHeading>
            </div>

            <p className="mt-5 max-w-xl font-body text-[17px] leading-8 text-[rgba(26,26,46,0.58)]">
              Yüksek öncelikli hastaları, analiz güvenini ve klinik dönüşüm fırsatlarını daha okunaklı bir hiyerarşiyle
              görün. Referanstaki premium landing dili artık dashboard girişinde de hissediliyor.
            </p>

            <div className="mt-6 space-y-3">
              <HeroBullet icon={<Sparkles className="h-4.5 w-4.5" />}>Hasta portföyünü editorial bir yüzeyde okuyun</HeroBullet>
              <HeroBullet icon={<Activity className="h-4.5 w-4.5" />}>Günlük hareketleri tek bakışta önceliklendirin</HeroBullet>
              <HeroBullet icon={<Stethoscope className="h-4.5 w-4.5" />}>İnceleme gerektiren vakaları hızla ayıklayın</HeroBullet>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/doctor/leads">
                <PremiumButton size="lg" className="min-w-[220px] justify-center">
                  DEĞERLENDİRME LİSTESİNİ AÇ
                </PremiumButton>
              </Link>
              <PremiumButton
                variant="ghost"
                size="lg"
                className="min-w-[220px] justify-center border-[rgba(196,163,90,0.16)] bg-[rgba(255,255,255,0.4)] text-[rgba(26,26,46,0.62)]"
                onClick={() => document.getElementById('dashboard-latest')?.scrollIntoView({ behavior: 'smooth' })}
              >
                TÜM KAYITLARI GÖRÜNTÜLE
              </PremiumButton>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="doctor-card-soft rounded-[22px] px-4 py-4">
                <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">Bugün</p>
                <p className="mt-3 font-mono text-[32px] tracking-[-0.05em] text-[#1A1A2E]">{latestLeads.length}</p>
                <p className="mt-1 font-body text-[14px] leading-6 text-[rgba(26,26,46,0.48)]">
                  {latestLeads.length > 0 ? 'Yeni hareket var' : 'Sistem sakin görünüyor'}
                </p>
              </div>
              <div className="doctor-card-soft rounded-[22px] px-4 py-4">
                <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">Toplam Lead</p>
                <p className="mt-3 font-mono text-[32px] tracking-[-0.05em] text-[#1A1A2E]">{leads.length}</p>
                <p className="mt-1 font-body text-[14px] leading-6 text-[rgba(26,26,46,0.48)]">Aktif değerlendirme havuzu</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {stats.map((stat) => (
          <MetricCard key={stat.label} stat={stat} />
        ))}
      </section>

      <section id="dashboard-latest">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-body text-[14px] uppercase tracking-[0.22em] text-[#C4A35A]">Son Başvurular</p>
            <h2 className="mt-2 font-display text-[34px] font-light tracking-[-0.02em] text-[#1A1A2E]">
              En yeni klinik akışı
            </h2>
            <p className="mt-2 font-body text-[15px] leading-7 text-[rgba(26,26,46,0.50)]">
              En güncel lead’ler ve öne çıkan kalite sinyalleri artık daha büyük ve daha rahat okunuyor.
            </p>
          </div>

          <Link
            href="/doctor/leads"
            className="inline-flex items-center gap-2 font-body text-[14px] uppercase tracking-[0.14em] text-[#C4A35A] transition-colors hover:text-[#1A1A2E]"
          >
            Tümünü Gör
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {latestLeads.length === 0 ? (
          <div className="doctor-card-strong rounded-[28px] p-12 text-center">
            <div className="doctor-card-soft mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Users className="h-5 w-5 text-[#C4A35A]" />
            </div>
            <p className="font-display text-[32px] font-light text-[#1A1A2E]">Henüz başvuru bulunmuyor</p>
            <p className="mt-2 font-body text-[15px] leading-7 text-[rgba(26,26,46,0.55)]">
              Yeni lead’ler burada premium kart görünümüyle listelenecek.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {latestLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function HeroBullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="doctor-card-soft flex h-10 w-10 items-center justify-center rounded-full text-[#C4A35A]">
        {icon}
      </div>
      <span className="font-body text-[16px] text-[rgba(26,26,46,0.62)]">{children}</span>
    </div>
  )
}

function MetricCard({ stat }: { stat: MetricCardData }) {
  const Icon = stat.icon

  return (
    <div
      className="doctor-card doctor-card-hover doctor-metric-card rounded-[28px] px-5 py-5"
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.94) 0%, ${stat.tint} 140%)`,
      }}
    >
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(196,163,90,0.26)] to-transparent" />

      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[16px] border"
          style={{
            backgroundColor: stat.tint,
            borderColor: 'rgba(196,163,90,0.14)',
            color: stat.color,
          }}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <span className="font-body text-[14px] uppercase tracking-[0.12em] text-[rgba(26,26,46,0.34)]">{stat.note}</span>
      </div>

      <div className="mt-8">
        <p className="font-body text-[14px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.42)]">{stat.label}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="font-mono text-[48px] leading-none tracking-[-0.04em]" style={{ color: stat.color }}>
            {stat.value}
          </p>
          <div className="mb-1 h-px flex-1 bg-gradient-to-r from-[rgba(196,163,90,0.18)] to-transparent" />
        </div>
      </div>
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  const wrinkleScores = lead.wrinkle_scores as { overallScore?: number } | undefined
  const radarAnalysis = lead.radar_analysis as { radarScores?: Array<{ score: number }> } | undefined
  const score =
    wrinkleScores?.overallScore ??
    (radarAnalysis?.radarScores
      ? Math.round(radarAnalysis.radarScores.reduce((sum, region) => sum + region.score, 0) / radarAnalysis.radarScores.length)
      : undefined)

  const confidenceLabel =
    lead.capture_confidence ??
    (lead.analysis_confidence != null
      ? lead.analysis_confidence >= 0.7
        ? 'high'
        : lead.analysis_confidence >= 0.4
          ? 'medium'
          : 'low'
      : undefined)

  const initials = lead.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <Link href={`/doctor/leads/${lead.id}`} className="doctor-card doctor-card-hover doctor-lead-card group rounded-[28px] p-5">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(196,163,90,0.24)] to-transparent" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="doctor-card-soft flex h-12 w-12 items-center justify-center rounded-[16px] font-mono text-[14px] text-[#C4A35A]">
              {initials || 'AG'}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-display text-[26px] font-light leading-[0.96] tracking-[-0.03em] text-[#1A1A2E] transition-colors duration-300 group-hover:text-[#B38C4B]">
                {lead.full_name}
              </h3>
              <p className="mt-1 font-body text-[13px] text-[rgba(26,26,46,0.44)]">{formatDate(lead.created_at)}</p>
            </div>
          </div>
        </div>

        <LeadScoreDial score={score} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusBadge status={lead.status} type="lead" />
        {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
      </div>

      <div className="mt-5 border-t border-[rgba(196,163,90,0.10)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-body text-[14px] uppercase tracking-[0.14em] text-[rgba(26,26,46,0.36)]">Odak Alanı</p>
            <p className="truncate font-body text-[14px] text-[rgba(26,26,46,0.64)]">
              {concernAreaLabels[lead.concern_area as keyof typeof concernAreaLabels] ?? lead.concern_area}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {confidenceLabel && (
              <span className="doctor-card-soft rounded-full px-3 py-1.5 font-mono text-[13px] uppercase text-[rgba(26,26,46,0.46)]">
                {confidenceLabel === 'high' ? 'Yüksek güven' : confidenceLabel === 'medium' ? 'Orta güven' : 'Düşük güven'}
              </span>

            )}
            <div className="doctor-card-soft flex h-10 w-10 items-center justify-center rounded-full text-[#C4A35A] transition-colors duration-300 group-hover:text-[#1A1A2E]">
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function LeadScoreDial({ score }: { score?: number }) {
  if (score == null) {
    return (
      <div className="doctor-score-dial doctor-card-soft flex h-14 w-14 items-center justify-center rounded-full">
        <span className="font-mono text-[12px] text-[rgba(26,26,46,0.36)]">—</span>
      </div>
    )
  }

  const dash = 106
  const progress = (score / 100) * dash

  return (
    <div className="doctor-score-dial relative h-14 w-14 flex-shrink-0">
      <div className="absolute inset-1 rounded-full bg-[radial-gradient(circle,rgba(196,163,90,0.14)_0%,rgba(196,163,90,0.02)_72%,transparent_100%)]" />
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(26,26,46,0.08)" strokeWidth="2.6" />
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${dash}`}
          style={{ transition: 'stroke-dasharray 280ms ease, stroke 280ms ease', filter: 'drop-shadow(0 0 6px rgba(196,163,90,0.18))' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] text-[#1A1A2E]">{score}</span>
    </div>
  )
}
