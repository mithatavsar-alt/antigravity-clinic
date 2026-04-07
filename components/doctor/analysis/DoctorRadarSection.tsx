'use client'

import { useState, useCallback } from 'react'
import InteractiveRadarChart, { type ShowcaseRegion } from '@/components/analysis/InteractiveRadarChart'
import { scoreColor } from '@/lib/ui/score-colors'

interface RadarScore {
  key: string
  label: string
  score: number
  confidence?: number
  category?: string
  insight?: string
}

interface DoctorRadarSectionProps {
  radarAnalysis?: {
    radarScores?: RadarScore[]
    derivedInsights?: {
      strongestAreas?: string[]
      improvementAreas?: string[]
      summaryText?: string
    }
  }
}

// Map 11 radar scores → 6 showcase regions for the hexagonal chart
const showcaseConfig: Array<{ keys: string[]; label: string }> = [
  { keys: ['forehead_lines', 'glabella'], label: 'Üst Yüz' },
  { keys: ['crow_feet'], label: 'Göz Çevresi' },
  { keys: ['under_eye'], label: 'Göz Altı' },
  { keys: ['nasolabial', 'perioral'], label: 'Orta Yüz' },
  { keys: ['lower_face'], label: 'Alt Yüz' },
  { keys: ['symmetry', 'firmness', 'golden_ratio', 'age_appearance'], label: 'Genel' },
]

function buildShowcaseRegions(radarScores?: RadarScore[]): ShowcaseRegion[] {
  if (!radarScores || radarScores.length === 0) return []

  const scoreMap = new Map(radarScores.map((r) => [r.key, r]))

  return showcaseConfig.map((cfg) => {
    const matches = cfg.keys.map((k) => scoreMap.get(k)).filter(Boolean) as RadarScore[]
    if (matches.length === 0) return { id: cfg.keys[0], label: cfg.label, score: 50 }

    const avgScore = Math.round(matches.reduce((s, m) => s + m.score, 0) / matches.length)
    const avgConf = matches[0].confidence != null
      ? matches.reduce((s, m) => s + (m.confidence ?? 0.5), 0) / matches.length
      : undefined

    const status: ShowcaseRegion['status'] =
      avgConf != null && avgConf < 0.15 ? 'suppressed' :
      avgScore >= 70 ? 'high' :
      avgScore >= 40 ? 'medium' : 'low'

    return { id: cfg.keys[0], label: cfg.label, score: avgScore, confidence: avgConf, status }
  })
}

export function DoctorRadarSection({ radarAnalysis }: DoctorRadarSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const regions = buildShowcaseRegions(radarAnalysis?.radarScores)

  const handleSelect = useCallback((i: number) => setActiveIndex(i), [])

  if (regions.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(14,11,9,0.4)] p-8 text-center">
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.3)]">Radar analiz verisi mevcut değil</p>
      </div>
    )
  }

  const activeRegion = regions[activeIndex]
  const activeScores = radarAnalysis?.radarScores?.filter((r) =>
    showcaseConfig[activeIndex]?.keys.includes(r.key)
  ) ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Radar Chart */}
      <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(14,11,9,0.4)] p-6 flex items-center justify-center">
        <div className="w-full max-w-[320px]">
          <InteractiveRadarChart
            regions={regions}
            currentIndex={activeIndex}
            onSelect={handleSelect}
          />
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex flex-col gap-3">
        {/* Active region detail */}
        <div className="rounded-xl border border-[rgba(248,246,242,0.06)] bg-[rgba(248,246,242,0.02)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-body text-[14px] font-medium text-[#F8F6F2]">{activeRegion?.label}</h4>
            <span className="font-mono text-[20px] font-light" style={{ color: scoreColor(activeRegion?.score ?? 50) }}>
              {activeRegion?.score}
            </span>
          </div>

          {/* Sub-scores */}
          {activeScores.length > 0 && (
            <div className="flex flex-col gap-2">
              {activeScores.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <span className="font-body text-[11px] text-[rgba(248,246,242,0.45)] truncate">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1 rounded-full bg-[rgba(248,246,242,0.06)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: scoreColor(s.score) }} />
                    </div>
                    <span className="font-mono text-[11px] w-6 text-right" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Region selector buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          {regions.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setActiveIndex(i)}
              className={`px-3 py-2 rounded-lg font-body text-[10px] tracking-[0.05em] transition-all ${
                i === activeIndex
                  ? 'bg-[rgba(214,185,140,0.1)] border border-[rgba(214,185,140,0.2)] text-[#D6B98C]'
                  : 'bg-[rgba(248,246,242,0.02)] border border-[rgba(248,246,242,0.03)] text-[rgba(248,246,242,0.35)] hover:text-[rgba(248,246,242,0.6)]'
              }`}
            >
              <span className="block">{r.label}</span>
              <span className="font-mono text-[12px] block mt-0.5" style={{ color: scoreColor(r.score) }}>{r.score}</span>
            </button>
          ))}
        </div>

        {/* Insights */}
        {radarAnalysis?.derivedInsights && (
          <div className="rounded-xl border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.02)] p-4">
            {radarAnalysis.derivedInsights.strongestAreas && radarAnalysis.derivedInsights.strongestAreas.length > 0 && (
              <div className="mb-2">
                <span className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.25)]">Güçlü: </span>
                <span className="font-body text-[11px] text-[#4AE3A7]">{radarAnalysis.derivedInsights.strongestAreas.join(', ')}</span>
              </div>
            )}
            {radarAnalysis.derivedInsights.improvementAreas && radarAnalysis.derivedInsights.improvementAreas.length > 0 && (
              <div>
                <span className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.25)]">İyileştirme: </span>
                <span className="font-body text-[11px] text-[#D6B98C]">{radarAnalysis.derivedInsights.improvementAreas.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
