'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import InteractiveRadarChart from './InteractiveRadarChart'
import type { ShowcaseRegion } from './InteractiveRadarChart'
import RegionScoreList from './RegionScoreList'
import DynamicInsightPanel from './DynamicInsightPanel'
import type { RegionInsight } from './DynamicInsightPanel'

// ─── Types ────────────────────────────────────────────────────

interface RadarDataPoint {
  key: string
  label: string
  score: number
  confidence: number
  category: string
  insight: string
}

interface RadarChartSectionProps {
  scores: RadarDataPoint[]
  captureQuality?: 'high' | 'medium' | 'low'
  summaryText?: string
}

// ─── Showcase region definitions ──────────────────────────────
// Maps the 11-score analysis → 6 interactive regions

interface ShowcaseDef {
  id: string
  label: string
  sourceKeys: string[]
  insight: RegionInsight
}

const SHOWCASE_DEFS: ShowcaseDef[] = [
  {
    id: 'alin',
    label: 'Alın',
    sourceKeys: ['forehead_lines', 'glabella'],
    insight: {
      title: 'Alın',
      analysis: 'Alın bölgesinde mimik kaynaklı çizgilenme değerlendirilir.',
      info: 'Botoks uygulamaları bu bölgede çizgilerin yumuşatılmasında yaygın olarak tercih edilen seçenekler arasında yer alır.',
      treatmentLabel: 'Botoks Hakkında',
      treatmentSlug: '/treatments/botox',
    },
  },
  {
    id: 'kaz_ayagi',
    label: 'Kaz Ayağı',
    sourceKeys: ['crow_feet'],
    insight: {
      title: 'Kaz Ayağı',
      analysis: 'Göz çevresindeki ince mimik çizgileri bu alanda değerlendirilir.',
      info: 'Mimik kaynaklı çizgilerde botoks uygulamaları bilgilendirme kapsamında öne çıkabilir.',
      treatmentLabel: 'Botoks Hakkında',
      treatmentSlug: '/treatments/botox',
    },
  },
  {
    id: 'goz_alti',
    label: 'Göz Altı',
    sourceKeys: ['under_eye'],
    insight: {
      title: 'Göz Altı',
      analysis: 'Göz altı geçişi, hacim görünümü ve yorgun ifade değerlendirme kapsamındadır.',
      info: 'Bazı durumlarda dolgu uygulamaları veya cilt kalitesine yönelik destekleyici işlemler gündeme gelebilir.',
      treatmentLabel: 'Detaylı Bilgi',
      treatmentSlug: '/treatments/filler',
    },
  },
  {
    id: 'nazolabial',
    label: 'Nazolabial',
    sourceKeys: ['nasolabial'],
    insight: {
      title: 'Nazolabial',
      analysis: 'Burun kenarı ile ağız hattı arasındaki derinlik ve geçiş değerlendirilir.',
      info: 'Hacim kaybına bağlı derinleşmelerde dolgu uygulamaları bilgilendirme kapsamında değerlendirilebilir.',
      treatmentLabel: 'Dolgu Uygulamaları',
      treatmentSlug: '/treatments/filler',
    },
  },
  {
    id: 'dudak',
    label: 'Dudak',
    sourceKeys: ['perioral'],
    insight: {
      title: 'Dudak',
      analysis: 'Dudak hacmi ve konturu değerlendirme kapsamındadır.',
      info: 'Dudak dolgusu ile hacim artırma veya dudak sınırlarının belirginleştirilmesi değerlendirilebilir.',
      treatmentLabel: 'Dolgu Uygulamaları',
      treatmentSlug: '/treatments/filler',
    },
  },
  {
    id: 'yanak',
    label: 'Yanak',
    sourceKeys: ['lower_face'],
    insight: {
      title: 'Yanak',
      analysis: 'Orta yüz hacmi ve yüz desteği bu bölgede değerlendirilir.',
      info: 'Yanak hacmi ve yüz desteği açısından dolgu uygulamaları bilgilendirme kapsamında ele alınabilir.',
      treatmentLabel: 'Dolgu Uygulamaları',
      treatmentSlug: '/treatments/filler',
    },
  },
]

// ─── Mapping: 11 scores → 6 showcase regions ─────────────────

function mapToShowcase(scores: RadarDataPoint[]): ShowcaseRegion[] {
  const byKey = new Map(scores.map((s) => [s.key, s]))

  return SHOWCASE_DEFS.map((def) => {
    const matching = def.sourceKeys
      .map((k) => byKey.get(k))
      .filter((s): s is RadarDataPoint => !!s)

    const avg =
      matching.length > 0
        ? Math.round(matching.reduce((sum, s) => sum + Math.max(0, Math.min(100, s.score)), 0) / matching.length)
        : 50

    const avgConf =
      matching.length > 0
        ? matching.reduce((sum, s) => sum + s.confidence, 0) / matching.length
        : 0.5

    return { id: def.id, label: def.label, score: avg, confidence: avgConf }
  })
}

function scoreColor(s: number): string {
  if (s >= 70) return '#4AE3A7'
  if (s >= 40) return '#D6B98C'
  return '#C47A7A'
}

// ─── Auto-highlight interval ─────────────────────────────────

const AUTO_INTERVAL = 2500

// ─── Exported Section Component ──────────────────────────────

export default function RadarChartSection({ scores, captureQuality, summaryText }: RadarChartSectionProps) {
  // ── State ──────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(0)
  const [lockedIndex, setLockedIndex] = useState<number | null>(null)

  const currentIndex = lockedIndex !== null ? lockedIndex : activeIndex

  // ── Derived data ───────────────────────────────────────────
  const regions = useMemo(() => mapToShowcase(scores), [scores])

  const avg = useMemo(
    () => Math.round(regions.reduce((s, r) => s + r.score, 0) / regions.length),
    [regions],
  )

  // ── Auto-highlight cycle ───────────────────────────────────
  useEffect(() => {
    if (lockedIndex !== null) return

    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % regions.length)
    }, AUTO_INTERVAL)

    return () => clearInterval(id)
  }, [lockedIndex, regions.length])

  // ── Selection handlers ─────────────────────────────────────
  const handleSelect = useCallback((index: number) => {
    setLockedIndex(index)
    setActiveIndex(index)
  }, [])

  const handleReset = useCallback(() => {
    setLockedIndex(null)
  }, [])

  // ── Guard ──────────────────────────────────────────────────
  if (!scores || scores.length === 0) return null

  const avgColor = scoreColor(avg)
  const currentRegion = regions[currentIndex]
  const currentInsight = SHOWCASE_DEFS[currentIndex]?.insight

  if (!currentRegion || !currentInsight) return null

  return (
    <div
      className="flex flex-col"
      style={{ gap: 'clamp(1.5rem, 3.5vw, 2.5rem)', animation: 'sectionReveal 0.8s ease-out 0.1s both' }}
    >
      {/* ── Section header ──────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-label text-[rgba(214,185,140,0.55)]">
          Estetik Harita
        </span>
        <h2
          className="heading-display heading-display-md text-[#F8F6F2]"
          style={{ maxWidth: '32ch' }}
        >
          İnteraktif Bölgesel Analiz
        </h2>
        <div className="flex items-center gap-4 mt-0.5">
          <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, transparent, rgba(214,185,140,0.25))' }} />
          <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(214,185,140,0.3)' }} />
          <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, rgba(214,185,140,0.25), transparent)' }} />
        </div>
      </div>

      {/* ── Main card: Chart + Score List ────────────────── */}
      <div
        className="glass-elevated rounded-[24px] sm:rounded-[28px]"
        style={{ animation: 'heroFadeUp 0.9s ease-out 0.2s both' }}
      >
        <div className="p-4 sm:p-7 lg:p-9">
          <div className="flex flex-col gap-5 sm:gap-6">

            {/* Top bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(214,185,140,0.05)', border: '1px solid rgba(214,185,140,0.08)' }}
                >
                  <svg className="w-3.5 h-3.5 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                  </svg>
                </div>
                <span className="text-label text-[rgba(248,246,242,0.30)]">
                  İnteraktif Harita
                </span>
              </div>

              {/* Average pill */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{
                  background: `${avgColor}06`,
                  border: `1px solid ${avgColor}14`,
                }}
              >
                <span className="text-label-sm" style={{ color: `${avgColor}70` }}>Ortalama</span>
                <span className="font-mono text-[16px] font-light" style={{ color: avgColor }}>{avg}</span>
              </div>
            </div>

            {/* Chart + List layout */}
            <div className="flex flex-col lg:flex-row gap-5 lg:gap-7 items-center lg:items-start">
              {/* Radar chart */}
              <div className="w-full max-w-[280px] sm:max-w-[360px] lg:max-w-[400px] flex-shrink-0">
                <InteractiveRadarChart
                  regions={regions}
                  currentIndex={currentIndex}
                  onSelect={handleSelect}
                />
              </div>

              {/* Score list */}
              <div className="w-full lg:w-[220px] lg:flex-shrink-0 lg:pt-4">
                <RegionScoreList
                  regions={regions}
                  currentIndex={currentIndex}
                  locked={lockedIndex !== null}
                  onSelect={handleSelect}
                  onReset={handleReset}
                />
              </div>
            </div>

            {/* Quality caveat */}
            {captureQuality && captureQuality !== 'high' && (
              <div className="rounded-[10px] px-3.5 py-2.5" style={{ background: 'rgba(214,185,140,0.02)', border: '1px solid rgba(214,185,140,0.05)' }}>
                <p className="font-body text-[11px] text-[rgba(248,246,242,0.22)] leading-relaxed italic text-center">
                  {captureQuality === 'low'
                    ? 'Bu değerlendirme mevcut görüntü kalitesine göre yaklaşık olarak oluşturulmuştur.'
                    : 'Görüntü kalitesi orta düzeydedir. Sonuçlar genel yönelimi yansıtmaktadır.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Dynamic Insight Panel ────────────────────────── */}
      <div key={currentIndex} style={{ animation: 'sectionReveal 0.5s ease-out both' }}>
        <DynamicInsightPanel
          insight={currentInsight}
          score={currentRegion.score}
          regionIndex={currentIndex}
          confidence={currentRegion.confidence}
        />
      </div>

      {/* ── Summary ──────────────────────────────────────── */}
      {summaryText && (
        <div
          className="rounded-[14px] px-5 py-4 text-center max-w-2xl mx-auto w-full"
          style={{
            background: 'rgba(214,185,140,0.02)',
            border: '1px solid rgba(214,185,140,0.05)',
            animation: 'sectionReveal 0.6s ease-out 0.5s both',
          }}
        >
          <p className="font-body text-[12px] text-[rgba(248,246,242,0.35)] leading-[1.8]">
            {summaryText}
          </p>
          <p className="font-body text-[10px] text-[rgba(248,246,242,0.18)] leading-relaxed mt-2 italic">
            Bu analiz AI destekli ön değerlendirme niteliğindedir. Kesin sonuçlar klinik muayene gerektirir.
          </p>
        </div>
      )}
    </div>
  )
}
