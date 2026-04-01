'use client'

import { useState, useEffect } from 'react'

/**
 * Regional Score Cards — Premium consultation-oriented region assessments.
 *
 * Maps the 14-area structured observations into 5 consultation-relevant
 * region cards: Crow's Feet, Under-Eye, Lips, Cheeks, Chin & Lower Face.
 *
 * Each card shows: region title, graded visual scale, confidence indicator,
 * 1 short observation, and optional consultation relevance line.
 */

// ─── Types ──────────────────────────────────────────────────

export interface RegionCardData {
  /** Region key */
  key: string
  /** Turkish display title */
  title: string
  /** Icon for the region */
  icon: string
  /** Score 0-100 */
  score: number
  /** Confidence 0-100 */
  confidence: number
  /** Severity label */
  severity: 'minimal' | 'hafif' | 'orta' | 'belirgin'
  /** Observation text (Turkish, premium tone) */
  observation: string
  /** Whether this is a positive observation */
  isPositive: boolean
  /** Optional consultation relevance note */
  consultationNote?: string
}

interface RegionalScoreCardsProps {
  /** Observations from trust pipeline */
  observations?: Array<{
    area: string
    label: string
    observation: string
    visibility: string
    confidence: number
    impact: string
    isPositive: boolean
    score: number
    limitation?: string
  }>
  /** Wrinkle scores for fallback */
  wrinkleScores?: {
    regions: Array<{
      region: string
      label: string
      score: number
      insight: string
      confidence: number
    }>
  }
  /** Specialist module assessments (preferred when available) */
  specialistAssessments?: Array<{
    moduleKey: string
    displayName: string
    icon: string
    score: number
    confidence: number
    severity: 'minimal' | 'hafif' | 'orta' | 'belirgin'
    observation: string
    isPositive: boolean
    consultationNote?: string
    evaluable: boolean
    limitation?: string
    subScores: Array<{
      key: string
      label: string
      score: number
      weight: number
      confidence: number
    }>
  }>
}

// ─── Observation area → Card region mapping ─────────────────

const CARD_CONFIGS = [
  {
    key: 'crow_feet',
    title: 'Göz Çevresi / Kaz Ayağı',
    icon: '◎',
    areas: ['crow_feet', 'eye_contour'],
    fallbackRegions: ['crow_feet_left', 'crow_feet_right'],
    defaultNote: 'Göz çevresi mimik çizgileri klinik değerlendirmede öncelikli incelenebilir.',
  },
  {
    key: 'under_eye',
    title: 'Göz Altı Bölgesi',
    icon: '◈',
    areas: ['under_eye', 'fatigue_freshness'],
    fallbackRegions: ['under_eye_left', 'under_eye_right'],
    defaultNote: 'Göz altı doku değişimi ve yorgunluk görünümü için uzman değerlendirmesi önerilir.',
  },
  {
    key: 'lips',
    title: 'Dudak & Perioral Alan',
    icon: '◇',
    areas: ['lip_area', 'lower_face'],
    fallbackRegions: ['marionette_left', 'marionette_right'],
    defaultNote: 'Dudak hacim dengesi ve çevre kontur netliği klinik görüşmede ele alınabilir.',
  },
  {
    key: 'cheeks',
    title: 'Yanak & Orta Yüz',
    icon: '△',
    areas: ['cheek_support', 'nasolabial', 'skin_texture'],
    fallbackRegions: ['nasolabial_left', 'nasolabial_right', 'cheek_left', 'cheek_right'],
    defaultNote: 'Yanak desteği ve nazolabial çizgi derinliği uzman incelemesinde değerlendirilebilir.',
  },
  {
    key: 'chin_lower',
    title: 'Çene & Alt Yüz Hattı',
    icon: '⬡',
    areas: ['jawline', 'lower_face', 'symmetry'],
    fallbackRegions: ['jawline'],
    defaultNote: 'Alt yüz konturu ve çene hattı netliği klinik değerlendirmede ele alınabilir.',
  },
]

// ─── Build card data from observations ──────────────────────

/** Map specialist moduleKey → card config key */
const SPECIALIST_TO_CARD: Record<string, string> = {
  crow_feet: 'crow_feet',
  under_eye: 'under_eye',
  lips_perioral: 'lips',
  cheek_volume: 'cheeks',
  chin_contour: 'chin_lower',
}

function buildCards(props: RegionalScoreCardsProps): RegionCardData[] {
  const { observations, wrinkleScores, specialistAssessments } = props
  const cards: RegionCardData[] = []

  // ── Preferred path: use specialist module assessments ──
  if (specialistAssessments && specialistAssessments.length > 0) {
    for (const assessment of specialistAssessments) {
      if (!assessment.evaluable) continue

      const cardKey = SPECIALIST_TO_CARD[assessment.moduleKey] ?? assessment.moduleKey
      const config = CARD_CONFIGS.find(c => c.key === cardKey)

      cards.push({
        key: cardKey,
        title: assessment.displayName,
        icon: assessment.icon,
        score: assessment.score,
        confidence: assessment.confidence,
        severity: assessment.severity,
        observation: assessment.observation,
        isPositive: assessment.isPositive,
        consultationNote: assessment.consultationNote ?? (
          !assessment.isPositive && assessment.score >= 25 && assessment.confidence >= 35
            ? config?.defaultNote
            : undefined
        ),
      })
    }

    if (cards.length > 0) return cards
  }

  // ── Fallback path: use trust pipeline observations ──
  for (const config of CARD_CONFIGS) {
    let score = 0
    let confidence = 0
    let observation = ''
    let isPositive = false
    let hasData = false

    if (observations && observations.length > 0) {
      const matches = observations.filter(o => config.areas.includes(o.area))
      if (matches.length > 0) {
        const nonPositive = matches.filter(o => !o.isPositive).sort((a, b) => b.score - a.score)
        const positive = matches.filter(o => o.isPositive).sort((a, b) => b.confidence - a.confidence)
        const best = nonPositive[0] ?? positive[0]!

        score = Math.round(matches.reduce((s, o) => s + o.score, 0) / matches.length)
        confidence = Math.round(matches.reduce((s, o) => s + o.confidence, 0) / matches.length)
        observation = best.observation
        isPositive = best.isPositive
        hasData = true
      }
    }

    if (!hasData && wrinkleScores?.regions) {
      const matches = wrinkleScores.regions.filter(r =>
        config.fallbackRegions.some(fr => r.region.includes(fr))
      )
      if (matches.length > 0) {
        score = Math.round(matches.reduce((s, r) => s + r.score, 0) / matches.length)
        confidence = Math.round(matches.reduce((s, r) => s + r.confidence, 0) / matches.length)
        observation = matches[0].insight
        isPositive = score < 20
        hasData = true
      }
    }

    if (!hasData) continue

    const severity: RegionCardData['severity'] =
      score >= 55 ? 'belirgin'
        : score >= 35 ? 'orta'
        : score >= 15 ? 'hafif'
        : 'minimal'

    const showConsultation = !isPositive && score >= 25 && confidence >= 35

    cards.push({
      key: config.key,
      title: config.title,
      icon: config.icon,
      score,
      confidence,
      severity,
      observation,
      isPositive,
      consultationNote: showConsultation ? config.defaultNote : undefined,
    })
  }

  return cards
}

// ─── Severity badge colors ──────────────────────────────────

const SEVERITY_STYLES: Record<RegionCardData['severity'], { bg: string; text: string; label: string }> = {
  minimal: { bg: 'rgba(61,155,122,0.08)', text: '#3D9B7A', label: 'Minimal' },
  hafif: { bg: 'rgba(196,163,90,0.08)', text: '#D6B98C', label: 'Hafif' },
  orta: { bg: 'rgba(229,168,59,0.08)', text: '#E5A83B', label: 'Orta Düzey' },
  belirgin: { bg: 'rgba(200,120,90,0.08)', text: '#C8785A', label: 'Belirgin' },
}

// ─── Confidence indicator ───────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 300); return () => clearTimeout(t) }, [])

  const color = value >= 70 ? '#3D9B7A' : value >= 40 ? '#D6B98C' : '#C8785A'
  const label = value >= 70 ? 'Yüksek güven' : value >= 40 ? 'Orta güven' : 'Sınırlı güven'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: mounted ? `${value}%` : '0%',
            background: color,
          }}
        />
      </div>
      <span className="font-body text-[9px] tracking-[0.08em] uppercase whitespace-nowrap" style={{ color: `${color}90` }}>
        {label}
      </span>
    </div>
  )
}

// ─── Score arc ──────────────────────────────────────────────

function ScoreArc({ score, color }: { score: number; color: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 200); return () => clearTimeout(t) }, [])

  const r = 22
  const circ = 2 * Math.PI * r
  const offset = circ - (mounted ? score / 100 : 0) * circ

  return (
    <svg className="w-[56px] h-[56px]" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r={r} stroke="rgba(248,246,242,0.04)" strokeWidth="3" />
      <circle
        cx="28" cy="28" r={r}
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{
          transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
          filter: `drop-shadow(0 0 4px ${color}50)`,
        }}
      />
      <text
        x="28" y="30"
        textAnchor="middle"
        className="font-mono text-[13px] font-light"
        fill={color}
      >
        {score}
      </text>
    </svg>
  )
}

// ─── Main component ─────────────────────────────────────────

export function RegionalScoreCards(props: RegionalScoreCardsProps) {
  const cards = buildCards(props)

  if (cards.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <span className="text-label text-[rgba(248,246,242,0.35)] mb-1 block">
        Bölgesel Değerlendirmeler
      </span>
      <div className="flex flex-col gap-2.5">
        {cards.map((card, idx) => {
          const sev = SEVERITY_STYLES[card.severity]
          const scoreColor = card.isPositive ? '#3D9B7A'
            : card.score >= 55 ? '#C8785A'
            : card.score >= 35 ? '#E5A83B'
            : card.score >= 15 ? '#D6B98C'
            : '#3D9B7A'

          return (
            <div
              key={card.key}
              className="rounded-xl border bg-[rgba(248,246,242,0.015)] overflow-hidden"
              style={{
                borderColor: card.isPositive ? 'rgba(61,155,122,0.10)' : 'rgba(214,185,140,0.08)',
                animation: `cardEntrance 0.4s ease-out ${idx * 0.08}s both`,
              }}
            >
              <div className="flex gap-3 p-4 sm:p-3.5">
                {/* Score arc */}
                <div className="flex-shrink-0">
                  <ScoreArc score={card.score} color={scoreColor} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title + severity */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-body text-[12px] sm:text-[11px] font-medium text-[rgba(248,246,242,0.75)] tracking-[0.02em]">
                      {card.title}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[8px] font-medium tracking-[0.12em] uppercase"
                      style={{ background: sev.bg, color: sev.text }}
                    >
                      {sev.label}
                    </span>
                  </div>

                  {/* Observation */}
                  <p className="font-body text-[12px] sm:text-[11px] text-[rgba(248,246,242,0.48)] leading-[1.65] mb-2">
                    {card.observation}
                  </p>

                  {/* Confidence bar */}
                  <ConfidenceBar value={card.confidence} />
                </div>
              </div>

              {/* Consultation relevance line */}
              {card.consultationNote && (
                <div className="px-4 sm:px-3.5 py-2.5 border-t border-[rgba(214,185,140,0.05)] bg-[rgba(214,185,140,0.015)]">
                  <p className="font-body text-[10px] sm:text-[9px] text-[rgba(214,185,140,0.45)] leading-[1.6] italic">
                    {card.consultationNote}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
