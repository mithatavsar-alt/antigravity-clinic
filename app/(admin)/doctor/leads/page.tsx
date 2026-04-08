'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FunnelX, Search, SlidersHorizontal } from 'lucide-react'
import { useClinicStore } from '@/lib/store'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { PremiumButton } from '@/components/design-system/PremiumButton'
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

const readinessOptions: { value: ReadinessBand; label: string }[] = [
  { value: 'very_high', label: 'Çok yüksek' },
  { value: 'high', label: 'Yüksek' },
  { value: 'medium', label: 'Orta' },
  { value: 'low', label: 'Düşük' },
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
    const merged = new Map<string, Lead>()
    for (const lead of supabaseLeads) merged.set(lead.id, lead)
    for (const lead of leads) merged.set(lead.id, lead)
    return Array.from(merged.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [leads, supabaseLeads])

  const filtered = useMemo(() => {
    return allLeads.filter((lead) => {
      const query = search.toLowerCase()
      const matchSearch = !query || lead.full_name.toLowerCase().includes(query) || lead.phone.includes(query)
      const matchStatus = !statusFilter || lead.status === statusFilter
      const matchBand = !bandFilter || lead.readiness_band === bandFilter
      return matchSearch && matchStatus && matchBand
    })
  }, [allLeads, search, statusFilter, bandFilter])

  const reviewQueueCount = useMemo(
    () => allLeads.filter((lead) => lead.status === 'analysis_ready' || lead.status === 'doctor_reviewed').length,
    [allLeads]
  )

  const highIntentCount = useMemo(
    () => allLeads.filter((lead) => lead.readiness_band === 'very_high' || lead.readiness_band === 'high').length,
    [allLeads]
  )

  const activeFilterCount = [search, statusFilter, bandFilter].filter(Boolean).length

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('')
    setBandFilter('')
  }

  const focusReviewQueue = () => {
    setSearch('')
    setStatusFilter('analysis_ready')
    setBandFilter('')
  }

  return (
    <div className="flex flex-col gap-7 lg:gap-8">
      <section className="doctor-card-strong rounded-[36px] px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_320px] lg:gap-10">
          <div className="max-w-4xl">
            <p className="font-body text-[14px] uppercase tracking-[0.28em] text-[#C4A35A]">Kişiselleştirilmiş Analiz</p>

            <div className="mt-5">
              <EditorialHeading as="h1" className="!text-[clamp(3rem,5.4vw,5rem)] !leading-[0.92] !tracking-[-0.045em]">
                Lead Portföyünü
                <br />
                <GoldItalic>net, sakin ve premium</GoldItalic>
                <br />
                bir akışla yönetin
              </EditorialHeading>
            </div>

            <p className="mt-6 max-w-3xl font-body text-[18px] leading-9 text-[rgba(26,26,46,0.58)]">
              Hazırlık seviyesi, analiz güveni ve klinik önceliği tek bakışta okuyun. Bu sayfa artık görsel ağırlık
              yerine tipografi, boşluk ve yumuşak yüzeylerle yüksek güven hissi veriyor.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <HeaderStat
              label="Canlı Görünüm"
              value={filtered.length}
              detail={`${allLeads.length} lead içinde mevcut görünüm`}
            />
            <HeaderStat label="İnceleme Kuyruğu" value={reviewQueueCount} detail="Doktor kararı bekleyen lead" />
            <HeaderStat label="Yüksek Hazırlık" value={highIntentCount} detail="Hızlı dönüş için güçlü aday" />
          </div>
        </div>
      </section>

      <section className="doctor-card doctor-leads-filter-panel rounded-[32px] p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-body text-[14px] uppercase tracking-[0.22em] text-[#C4A35A]">Filtreler</p>
              <h2 className="mt-2 font-display text-[38px] font-light tracking-[-0.03em] text-[#1A1A2E]">
                Lead portföyünü rafine edin
              </h2>
              <p className="mt-3 max-w-2xl font-body text-[16px] leading-8 text-[rgba(26,26,46,0.54)]">
                Daha büyük alanlar, daha sakin boşluklar ve daha okunaklı kontroller ile aradığınız görünümü hızla oluşturun.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="doctor-card-soft rounded-full px-4 py-2.5">
                <span className="font-body text-[14px] uppercase tracking-[0.16em] text-[rgba(26,26,46,0.40)]">
                  {activeFilterCount} aktif filtre
                </span>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(196,163,90,0.14)] bg-[rgba(255,255,255,0.52)] px-4 py-2.5 font-body text-[14px] uppercase tracking-[0.16em] text-[rgba(26,26,46,0.56)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(196,163,90,0.24)] hover:text-[#1A1A2E]"
                >
                  <FunnelX className="h-3.5 w-3.5" />
                  Filtreleri Temizle
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
            <label className="relative block">
              <Search className="absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[rgba(26,26,46,0.35)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ad veya telefon ile arayın..."
                className="doctor-control h-[60px] w-full rounded-[20px] pl-[52px] text-[15px]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <SlidersHorizontal className="absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[rgba(26,26,46,0.35)]" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as LeadStatus | '')}
                  className="doctor-control h-[60px] w-full rounded-[20px] pl-[52px] text-[15px]"
                >
                  <option value="">Tüm statüler</option>
                  {statusOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={bandFilter}
                onChange={(event) => setBandFilter(event.target.value as ReadinessBand | '')}
                className="doctor-control h-[60px] w-full rounded-[20px] text-[15px]"
              >
                <option value="">Tüm hazırlık seviyeleri</option>
                {readinessOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {fetchError && (
        <div className="flex items-center justify-between rounded-[22px] border border-[rgba(160,82,82,0.15)] bg-[rgba(160,82,82,0.06)] px-4 py-3">
          <p className="font-body text-[13px] text-[#A05252]">{fetchError}</p>
          <button type="button" onClick={() => window.location.reload()} className="font-body text-[12px] text-[#C4A35A] hover:underline">
            Tekrar Dene
          </button>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-body text-[14px] uppercase tracking-[0.22em] text-[#C4A35A]">Lead Portföyü</p>
            <h2 className="mt-2 font-display text-[40px] font-light tracking-[-0.03em] text-[#1A1A2E]">
              Premium lead görünümü
            </h2>
          </div>
          <div className="doctor-card-soft rounded-full px-4 py-2.5">
            <span className="font-body text-[14px] uppercase tracking-[0.16em] text-[rgba(26,26,46,0.40)]">
              {filtered.length} sonuç gösteriliyor
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="doctor-card-strong rounded-[30px] p-12 text-center">
            <div className="doctor-card-soft mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Search className="h-5 w-5 text-[#C4A35A]" />
            </div>
            <p className="font-display text-[34px] font-light text-[#1A1A2E]">Sonuç bulunamadı</p>
            <p className="mx-auto mt-3 max-w-md font-body text-[15px] leading-8 text-[rgba(26,26,46,0.54)]">
              Arama veya filtre kriterlerini yumuşatıp portföyü yeniden genişletebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function HeaderStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="doctor-card-soft rounded-[24px] px-5 py-5">
      <p className="font-body text-[14px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">{label}</p>
      <p className="mt-3 font-mono text-[38px] tracking-[-0.05em] text-[#1A1A2E]">{value}</p>
      <p className="mt-2 font-body text-[14px] leading-7 text-[rgba(26,26,46,0.50)]">{detail}</p>
    </div>
  )
}

function LeadRow({ lead }: { lead: Lead }) {
  const wrinkleScores = lead.wrinkle_scores as { overallScore?: number } | undefined
  const radarAnalysis = lead.radar_analysis as { radarScores?: Array<{ score: number }> } | undefined
  const score =
    wrinkleScores?.overallScore ??
    (radarAnalysis?.radarScores
      ? Math.round(radarAnalysis.radarScores.reduce((sum, region) => sum + region.score, 0) / radarAnalysis.radarScores.length)
      : undefined)

  const initials = lead.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  const concernLabel = concernAreaLabels[lead.concern_area as keyof typeof concernAreaLabels] ?? lead.concern_area

  return (
    <Link href={`/doctor/leads/${lead.id}`} className="doctor-card doctor-card-hover doctor-leads-row group rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-4">
            <div className="doctor-card-soft flex h-[62px] w-[62px] flex-shrink-0 items-center justify-center rounded-[20px] font-mono text-[20px] text-[#C4A35A]">
              {initials || 'AG'}
            </div>

            <div className="min-w-0">
              <p className="font-body text-[14px] uppercase tracking-[0.24em] text-[#C4A35A]">{concernLabel}</p>
              <h3 className="mt-2 font-display text-[38px] font-light leading-[0.94] tracking-[-0.035em] text-[#1A1A2E] sm:text-[44px]">
                {lead.full_name}
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {lead.age_range && (
                  <span className="doctor-card-soft rounded-full px-3 py-1 font-body text-[15px] text-[rgba(26,26,46,0.50)]">
                    {lead.age_range}
                  </span>
                )}
                <span className="font-body text-[16px] text-[rgba(26,26,46,0.42)]">{formatDate(lead.created_at)}</span>
              </div>
            </div>
          </div>

          <p className="mt-5 max-w-3xl font-body text-[16px] leading-8 text-[rgba(26,26,46,0.56)]">
            {leadNarrative(lead)}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge status={lead.status} type="lead" />
            {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
          </div>

          <div className="mt-5 grid gap-3 border-t border-[rgba(196,163,90,0.11)] pt-4 sm:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)]">
            <LeadMetaCard label="Telefon" value={lead.phone} mono />
            <div className="doctor-card-soft rounded-[18px] px-4 py-3">
              <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">Klinik Notu</p>
              <p className="mt-2 font-body text-[14px] leading-7 text-[rgba(26,26,46,0.54)]">
                {lead.readiness_band === 'very_high' || lead.readiness_band === 'high'
                  ? 'Hızlı dönüş için güçlü aday. Detay görünümünde analizi derinleştirin.'
                  : 'Takip ritmini sakin tutun; karar sinyalleri detay sayfasında netleşir.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center justify-between gap-4 lg:w-[190px] lg:flex-col lg:items-stretch">
          <div className="doctor-card-soft rounded-[24px] px-4 py-4">
            <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">Hazırlık Skoru</p>
            <div className="mt-3 flex items-center gap-3 lg:flex-col lg:items-center">
              <LeadScoreDial score={score} />
              <div className="text-left lg:text-center">
                <p className="font-body text-[14px] text-[rgba(26,26,46,0.52)]">{scoreLabel(score)}</p>
              </div>
            </div>
          </div>

          <div className="inline-flex items-center justify-between gap-3 rounded-full border border-[rgba(196,163,90,0.14)] bg-[rgba(255,255,255,0.55)] px-4 py-3 transition-all duration-300 group-hover:border-[rgba(196,163,90,0.24)] group-hover:bg-[rgba(255,255,255,0.72)] lg:w-full">
            <span className="font-body text-[13px] uppercase tracking-[0.16em] text-[rgba(26,26,46,0.52)] group-hover:text-[#1A1A2E]">
              Detayı Aç
            </span>
            <span className="doctor-card-soft flex h-9 w-9 items-center justify-center rounded-full text-[#C4A35A] transition-colors duration-300 group-hover:text-[#1A1A2E]">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function LeadMetaCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="doctor-card-soft rounded-[18px] px-4 py-3">
      <p className="font-body text-[13px] uppercase tracking-[0.18em] text-[rgba(26,26,46,0.38)]">{label}</p>
      <p className={`mt-2 text-[15px] text-[#1A1A2E] ${mono ? 'font-mono tracking-[-0.02em]' : 'font-body'}`}>{value}</p>
    </div>
  )
}

function LeadScoreDial({ score }: { score?: number }) {
  if (score == null) {
    return (
      <div className="doctor-score-dial doctor-card-soft flex h-[72px] w-[72px] items-center justify-center rounded-full">
        <span className="font-mono text-[15px] text-[rgba(26,26,46,0.36)]">—</span>
      </div>
    )
  }

  const dash = 126
  const progress = (score / 100) * dash

  return (
    <div className="doctor-score-dial relative h-[72px] w-[72px]">
      <div className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle,rgba(196,163,90,0.14)_0%,rgba(196,163,90,0.02)_72%,transparent_100%)]" />
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(26,26,46,0.08)" strokeWidth="2.7" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="2.9"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${dash}`}
          style={{ transition: 'stroke-dasharray 280ms ease, stroke 280ms ease', filter: 'drop-shadow(0 0 8px rgba(196,163,90,0.18))' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[14px] text-[#1A1A2E]">{score}</span>
    </div>
  )
}

function scoreLabel(score?: number) {
  if (score == null) return 'Skor bekleniyor'
  if (score >= 70) return 'Yüksek hazırlık'
  if (score >= 40) return 'Orta hazırlık'
  return 'Düşük hazırlık'
}

function leadNarrative(lead: Lead) {
  if (lead.readiness_band === 'very_high') {
    return 'Hazırlık seviyesi oldukça güçlü görünüyor. Bu profil, hızlı doktor değerlendirmesi ve ilk temas için öne çıkıyor.'
  }
  if (lead.readiness_band === 'high') {
    return 'Olumlu karar sinyalleri taşıyan dengeli bir profil. Detay görünümünde bölgesel skorlar üzerinden derinleşebilirsiniz.'
  }
  if (lead.readiness_band === 'medium') {
    return 'İlgi yüksek ancak karar seviyesi daha çok bağlama ihtiyaç duyuyor. İnceleme notlarıyla desteklenmesi faydalı olur.'
  }
  if (lead.readiness_band === 'low') {
    return 'Bu profil daha nazik bir takip ritmi istiyor. Görsel kalite ve analiz güveni birlikte değerlendirilerek yön verilebilir.'
  }

  return 'Ön değerlendirme akışı devam ediyor. Analiz verileri geldikçe bu kart daha net klinik sinyaller gösterecek.'
}
