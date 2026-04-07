'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

const showcaseConfig: Array<{ keys: string[]; label: string }> = [
  { keys: ['forehead_lines', 'glabella'], label: 'Alın' },
  { keys: ['crow_feet'], label: 'Göz Çevresi' },
  { keys: ['under_eye'], label: 'Göz Altı' },
  { keys: ['nasolabial', 'perioral'], label: 'Nazolabial' },
  { keys: ['lower_face'], label: 'Dudak' },
  { keys: ['symmetry', 'firmness', 'golden_ratio', 'age_appearance'], label: 'Genel' },
]

function buildShowcaseRegions(radarScores?: RadarScore[]): ShowcaseRegion[] {
  if (!radarScores || radarScores.length === 0) return []

  const scoreMap = new Map(radarScores.map((score) => [score.key, score]))

  return showcaseConfig.map((config) => {
    const matches = config.keys.map((key) => scoreMap.get(key)).filter(Boolean) as RadarScore[]
    if (matches.length === 0) return { id: config.keys[0], label: config.label, score: 50 }

    const averageScore = Math.round(matches.reduce((sum, match) => sum + match.score, 0) / matches.length)
    const averageConfidence =
      matches[0].confidence != null
        ? matches.reduce((sum, match) => sum + (match.confidence ?? 0.5), 0) / matches.length
        : undefined

    const status: ShowcaseRegion['status'] =
      averageConfidence != null && averageConfidence < 0.15
        ? 'suppressed'
        : averageScore >= 70
          ? 'high'
          : averageScore >= 40
            ? 'medium'
            : 'low'

    return { id: config.keys[0], label: config.label, score: averageScore, confidence: averageConfidence, status }
  })
}

/* ── Animated number hook ─────────────────────────── */
function useAnimatedNumber(target: number, duration = 500): number {
  const [display, setDisplay] = useState(target)
  const raf = useRef(0)
  const startVal = useRef(target)
  const startTime = useRef(0)

  useEffect(() => {
    startVal.current = display
    startTime.current = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round(startVal.current + (target - startVal.current) * eased)
      setDisplay(value)
      if (progress < 1) raf.current = requestAnimationFrame(animate)
    }

    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  return display
}

/* ── Animated bar component ───────────────────────── */
function AnimatedBar({ score, color }: { score: number; color: string }) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(score))
    return () => cancelAnimationFrame(t)
  }, [score])

  return (
    <div className="w-24 h-1.5 rounded-full bg-[rgba(26,26,46,0.08)] overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${width}%`,
          backgroundColor: color,
          transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </div>
  )
}

/* ── Auto-rotate interval ─────────────────────────── */
const AUTO_ROTATE_MS = 4000

export function DoctorRadarSection({ radarAnalysis }: DoctorRadarSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const [transitionKey, setTransitionKey] = useState(0)
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const regions = buildShowcaseRegions(radarAnalysis?.radarScores)

  // Auto-rotate
  useEffect(() => {
    if (regions.length <= 1 || isUserInteracting) return
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % regions.length)
      setTransitionKey((k) => k + 1)
    }, AUTO_ROTATE_MS)
    return () => clearInterval(interval)
  }, [regions.length, isUserInteracting])

  const handleSelect = useCallback(
    (index: number) => {
      setActiveIndex(index)
      setTransitionKey((k) => k + 1)
      setIsUserInteracting(true)

      // Resume auto-rotate after 10s of inactivity
      if (pauseTimer.current) clearTimeout(pauseTimer.current)
      pauseTimer.current = setTimeout(() => setIsUserInteracting(false), 10000)
    },
    [],
  )

  if (regions.length === 0) {
    return (
      <div className="doctor-card-soft rounded-xl p-8 text-center">
        <p className="font-body text-[14px] text-[rgba(26,26,46,0.45)]">Radar analiz verisi mevcut değil</p>
      </div>
    )
  }

  const activeRegion = regions[activeIndex]
  const activeScores =
    radarAnalysis?.radarScores?.filter((score) => showcaseConfig[activeIndex]?.keys.includes(score.key)) ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* ── Radar Chart ────────────────────────────── */}
      <div className="doctor-card-strong rounded-xl p-6 flex items-center justify-center">
        <div className="w-full max-w-[320px]">
          <InteractiveRadarChart regions={regions} currentIndex={activeIndex} onSelect={handleSelect} variant="light" />
        </div>
      </div>

      {/* ── Detail Panel ───────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Active region detail */}
        <div className="doctor-card rounded-xl p-5 relative overflow-hidden">
          {/* Accent bar */}
          <div
            className="absolute top-0 left-0 w-full h-[2px]"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${scoreColor(activeRegion?.score ?? 50)} 50%, transparent 100%)`,
              opacity: 0.4,
              transition: 'background 0.5s ease',
            }}
          />

          <div
            key={transitionKey}
            className="animate-fadeSlideIn"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h4 className="font-body text-[16px] font-medium text-[#1A1A2E]">{activeRegion?.label}</h4>
                {/* Progress dots */}
                <div className="flex items-center gap-1">
                  {regions.map((_, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => handleSelect(i)}
                      className="p-0.5"
                      aria-label={`Bölge ${i + 1}`}
                    >
                      <div
                        className="rounded-full transition-all duration-300"
                        style={{
                          width: i === activeIndex ? 14 : 5,
                          height: 5,
                          backgroundColor:
                            i === activeIndex
                              ? scoreColor(activeRegion?.score ?? 50)
                              : 'rgba(26,26,46,0.15)',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <AnimatedScore score={activeRegion?.score ?? 0} />
            </div>

            {activeScores.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {activeScores.map((score, i) => (
                  <div
                    key={score.key}
                    className="flex items-center justify-between gap-3"
                    style={{
                      animation: `fadeSlideUp 0.4s ease-out ${i * 0.08}s both`,
                    }}
                  >
                    <span className="font-body text-[13px] text-[rgba(26,26,46,0.72)] truncate">{score.label}</span>
                    <div className="flex items-center gap-2.5">
                      <AnimatedBar score={score.score} color={scoreColor(score.score)} />
                      <span className="font-mono text-[13px] w-7 text-right tabular-nums" style={{ color: scoreColor(score.score) }}>
                        {score.score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Region selector grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {regions.map((region, index) => {
            const isActive = index === activeIndex
            return (
              <button
                type="button"
                key={region.id}
                onClick={() => handleSelect(index)}
                className={`relative px-3 py-2.5 rounded-lg font-body text-[12px] tracking-[0.05em] transition-all duration-300 overflow-hidden ${
                  isActive
                    ? 'doctor-card-soft text-[#C4A35A] border-[rgba(196,163,90,0.18)] scale-[1.02]'
                    : 'doctor-card-soft text-[rgba(26,26,46,0.55)] hover:text-[#1A1A2E] hover:scale-[1.01]'
                }`}
              >
                {/* Auto-rotate progress indicator */}
                {isActive && !isUserInteracting && (
                  <div className="absolute bottom-0 left-0 h-[2px] bg-[rgba(196,163,90,0.35)] animate-progressBar" />
                )}
                <span className="block">{region.label}</span>
                <span className="font-mono text-[14px] block mt-0.5 tabular-nums" style={{ color: scoreColor(region.score) }}>
                  {region.score}
                </span>
              </button>
            )
          })}
        </div>

        {/* Insights */}
        {radarAnalysis?.derivedInsights && (
          <div className="doctor-card-soft rounded-xl p-4">
            {radarAnalysis.derivedInsights.strongestAreas && radarAnalysis.derivedInsights.strongestAreas.length > 0 && (
              <div className="mb-2">
                <span className="font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)]">Güçlü: </span>
                <span className="font-body text-[13px] text-[#3D7A5F]">{radarAnalysis.derivedInsights.strongestAreas.join(', ')}</span>
              </div>
            )}
            {radarAnalysis.derivedInsights.improvementAreas && radarAnalysis.derivedInsights.improvementAreas.length > 0 && (
              <div>
                <span className="font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)]">İyileştirme: </span>
                <span className="font-body text-[13px] text-[#C4A35A]">{radarAnalysis.derivedInsights.improvementAreas.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Animated score display ───────────────────────── */
function AnimatedScore({ score }: { score: number }) {
  const animatedValue = useAnimatedNumber(score, 500)
  const color = scoreColor(score)

  return (
    <span
      className="font-mono text-[28px] font-light tabular-nums transition-colors duration-500"
      style={{ color }}
    >
      {animatedValue}
    </span>
  )
}
