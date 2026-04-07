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
  wrinkleScores?: {
    regions?: Array<{
      region: string
      label: string
      score: number
      level?: string
      confidence?: number
      insight?: string
      evidenceStrength?: string
    }>
  }
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
  Botoks: '#8B7FA8',
  Dolgu: '#C4A35A',
  Yapısal: '#2D5F5D',
  Genel: 'rgba(26,26,46,0.42)',
}

function evidenceIcon(strength?: string) {
  if (strength === 'strong') return { label: 'Güçlü', color: '#3D7A5F' }
  if (strength === 'moderate') return { label: 'Orta', color: '#C4A35A' }
  if (strength === 'weak') return { label: 'Zayıf', color: '#C4883A' }
  return { label: 'Yetersiz', color: '#C47A7A' }
}

export function RegionAnalysisGrid({ radarScores, focusAreas, wrinkleScores }: RegionAnalysisGridProps) {
  const regions = buildRegionList(radarScores, focusAreas, wrinkleScores)

  if (regions.length === 0) {
    return (
      <div className="doctor-card-soft rounded-xl p-8 text-center">
        <p className="font-body text-[14px] text-[rgba(26,26,46,0.45)]">Bölgesel analiz verisi mevcut değil</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {regions.map((region) => (
        <RegionCard key={region.key} region={region} />
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
  wrinkleScores?: {
    regions?: Array<{
      region: string
      label: string
      score: number
      level?: string
      confidence?: number
      insight?: string
      evidenceStrength?: string
    }>
  }
) {
  const map = new Map<string, MergedRegion>()

  if (radarScores) {
    for (const region of radarScores) {
      map.set(region.key, {
        key: region.key,
        label: region.label,
        score: region.score,
        confidence: region.confidence,
        insight: region.insight,
        category: categoryMap[region.key],
        evidenceStrength: region.evidenceStrength,
      })
    }
  }

  if (focusAreas) {
    for (const focusArea of focusAreas) {
      const existing = map.get(focusArea.region)
      if (existing) {
        existing.doctorReviewRecommended = focusArea.doctorReviewRecommended
        if (!existing.insight && focusArea.insight) existing.insight = focusArea.insight
      } else {
        map.set(focusArea.region, {
          key: focusArea.region,
          label: focusArea.label,
          score: focusArea.score,
          insight: focusArea.insight,
          doctorReviewRecommended: focusArea.doctorReviewRecommended,
        })
      }
    }
  }

  if (wrinkleScores?.regions) {
    for (const wrinkleRegion of wrinkleScores.regions) {
      const existing = map.get(wrinkleRegion.region)
      if (existing) {
        existing.wrinkleLevel = wrinkleRegion.level
        if (!existing.evidenceStrength && wrinkleRegion.evidenceStrength) existing.evidenceStrength = wrinkleRegion.evidenceStrength
        if (!existing.confidence && wrinkleRegion.confidence) existing.confidence = wrinkleRegion.confidence
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.score - b.score)
}

function RegionCard({ region }: { region: MergedRegion }) {
  const color = scoreColor(region.score)
  const evidence = evidenceIcon(region.evidenceStrength)
  const categoryColor = region.category ? categoryColors[region.category] : undefined

  return (
    <div className="doctor-card doctor-card-hover rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-body text-[15px] font-medium text-[#1A1A2E] truncate">{region.label}</h4>
            {region.doctorReviewRecommended && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#C4883A]" title="Doktor incelemesi önerilir" />}
          </div>
          {region.category && (
            <span className="font-body text-[11px] tracking-[0.12em] uppercase" style={{ color: categoryColor }}>
              {region.category}
            </span>
          )}
        </div>

        <div className="relative w-12 h-12 flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(26,26,46,0.10)" strokeWidth="3" />
            <circle
              cx="24"
              cy="24"
              r="19"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(region.score / 100) * 119.4} 119.4`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[15px] font-light text-[#1A1A2E]">{region.score}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {region.confidence != null && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1 rounded-full bg-[rgba(26,26,46,0.10)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(region.confidence * 100)}%`, backgroundColor: color }} />
            </div>
            <span className="font-mono text-[11px] text-[rgba(26,26,46,0.38)]">{Math.round(region.confidence * 100)}%</span>
          </div>
        )}
        {region.evidenceStrength && (
          <span className="font-body text-[11px] tracking-[0.1em] uppercase" style={{ color: evidence.color }}>
            {evidence.label}
          </span>
        )}
      </div>

      {region.insight && (
        <p className="font-body text-[13px] text-[rgba(26,26,46,0.72)] leading-relaxed line-clamp-2">{region.insight}</p>
      )}

      {region.wrinkleLevel && (
        <span className="doctor-card-soft inline-flex self-start px-2 py-0.5 rounded-md text-[11px] font-mono tracking-[0.05em] uppercase text-[rgba(26,26,46,0.60)]">
          {region.wrinkleLevel === 'minimal'
            ? 'Minimal'
            : region.wrinkleLevel === 'low'
              ? 'Düşük'
              : region.wrinkleLevel === 'medium'
                ? 'Orta'
                : 'Yüksek'}
        </span>
      )}
    </div>
  )
}
