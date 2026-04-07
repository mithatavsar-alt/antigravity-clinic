'use client'

import { scoreColor } from '@/lib/ui/score-colors'

interface RegionScore {
  key: string
  label: string
  score: number
  confidence?: number
  insight?: string
  evidenceStrength?: string
}

interface RegionAnalysisGridProps {
  radarScores?: RegionScore[]
  focusAreas?: Array<{ region: string; label: string; score: number; insight?: string; doctorReviewRecommended?: boolean }>
  wrinkleScores?: { regions?: Array<{ region: string; label: string; score: number; level?: string; confidence?: number; insight?: string; evidenceStrength?: string }> }
}

const categoryMap: Record<string, string> = {
  forehead_lines: 'Botoks',
  glabella: 'Botoks',
  crow_feet: 'Botoks',
  under_eye: 'Dolgu',
  nasolabial: 'Dolgu',
  perioral: 'Dolgu',
  lower_face: 'Yapısal',
  symmetry: 'Genel',
  firmness: 'Genel',
  age_appearance: 'Genel',
  golden_ratio: 'Genel',
}

const categoryColors: Record<string, string> = {
  'Botoks': '#8B7FA8',
  'Dolgu': '#D6B98C',
  'Yapısal': '#3D9B7A',
  'Genel': 'rgba(248,246,242,0.4)',
}

function evidenceIcon(strength?: string) {
  if (strength === 'strong') return { label: 'Güçlü', color: '#4AE3A7' }
  if (strength === 'moderate') return { label: 'Orta', color: '#D6B98C' }
  if (strength === 'weak') return { label: 'Zayıf', color: '#C4883A' }
  return { label: 'Yetersiz', color: '#C47A7A' }
}

export function RegionAnalysisGrid({ radarScores, focusAreas, wrinkleScores }: RegionAnalysisGridProps) {
  // Merge all available region data
  const regions = buildRegionList(radarScores, focusAreas, wrinkleScores)

  if (regions.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-8 text-center">
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.48)]">Bölgesel analiz verisi mevcut değil</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {regions.map((r) => (
        <RegionCard key={r.key} region={r} />
      ))}
    </div>
  )
}

interface MergedRegion {
  key: string
  label: string
  score: number
  confidence?: number
  insight?: string
  category?: string
  evidenceStrength?: string
  doctorReviewRecommended?: boolean
  wrinkleLevel?: string
}

function buildRegionList(
  radarScores?: RegionScore[],
  focusAreas?: Array<{ region: string; label: string; score: number; insight?: string; doctorReviewRecommended?: boolean }>,
  wrinkleScores?: { regions?: Array<{ region: string; label: string; score: number; level?: string; confidence?: number; insight?: string; evidenceStrength?: string }> },
): MergedRegion[] {
  const map = new Map<string, MergedRegion>()

  // Start with radar scores (most complete)
  if (radarScores) {
    for (const r of radarScores) {
      map.set(r.key, {
        key: r.key,
        label: r.label,
        score: r.score,
        confidence: r.confidence,
        insight: r.insight,
        category: categoryMap[r.key],
        evidenceStrength: r.evidenceStrength,
      })
    }
  }

  // Overlay focus areas
  if (focusAreas) {
    for (const f of focusAreas) {
      const existing = map.get(f.region)
      if (existing) {
        existing.doctorReviewRecommended = f.doctorReviewRecommended
        if (!existing.insight && f.insight) existing.insight = f.insight
      } else {
        map.set(f.region, {
          key: f.region,
          label: f.label,
          score: f.score,
          insight: f.insight,
          doctorReviewRecommended: f.doctorReviewRecommended,
        })
      }
    }
  }

  // Overlay wrinkle scores
  if (wrinkleScores?.regions) {
    for (const w of wrinkleScores.regions) {
      const existing = map.get(w.region)
      if (existing) {
        existing.wrinkleLevel = w.level
        if (!existing.evidenceStrength && w.evidenceStrength) existing.evidenceStrength = w.evidenceStrength
        if (!existing.confidence && w.confidence) existing.confidence = w.confidence
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.score - b.score)
}

function RegionCard({ region }: { region: MergedRegion }) {
  const color = scoreColor(region.score)
  const evInfo = evidenceIcon(region.evidenceStrength)
  const catColor = region.category ? categoryColors[region.category] : undefined

  return (
    <div className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-4 flex flex-col gap-3 hover:border-[rgba(214,185,140,0.18)] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-body text-[13px] font-medium text-[#F8F6F2] truncate">{region.label}</h4>
            {region.doctorReviewRecommended && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#C4883A]" title="Doktor incelemesi önerilir" />
            )}
          </div>
          {region.category && (
            <span className="font-body text-[9px] tracking-[0.12em] uppercase" style={{ color: catColor }}>
              {region.category}
            </span>
          )}
        </div>

        {/* Score Arc */}
        <div className="relative w-12 h-12 flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(248,246,242,0.08)" strokeWidth="3" />
            <circle
              cx="24" cy="24" r="19"
              fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(region.score / 100) * 119.4} 119.4`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-light text-[#F8F6F2]">
            {region.score}
          </span>
        </div>
      </div>

      {/* Confidence + Evidence */}
      <div className="flex items-center gap-3">
        {region.confidence != null && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1 rounded-full bg-[rgba(248,246,242,0.10)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(region.confidence * 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="font-mono text-[9px] text-[rgba(248,246,242,0.48)]">{Math.round(region.confidence * 100)}%</span>
          </div>
        )}
        {region.evidenceStrength && (
          <span className="font-body text-[9px] tracking-[0.1em] uppercase" style={{ color: evInfo.color }}>
            {evInfo.label}
          </span>
        )}
      </div>

      {/* Insight */}
      {region.insight && (
        <p className="font-body text-[11px] text-[rgba(248,246,242,0.58)] leading-relaxed line-clamp-2">{region.insight}</p>
      )}

      {/* Wrinkle Level Badge */}
      {region.wrinkleLevel && (
        <span className="inline-flex self-start px-2 py-0.5 rounded-md text-[9px] font-mono tracking-[0.05em] uppercase bg-[rgba(20,18,14,0.55)] text-[rgba(248,246,242,0.52)]">
          {region.wrinkleLevel === 'minimal' ? 'Minimal' : region.wrinkleLevel === 'low' ? 'Düşük' : region.wrinkleLevel === 'medium' ? 'Orta' : 'Yüksek'}
        </span>
      )}
    </div>
  )
}
