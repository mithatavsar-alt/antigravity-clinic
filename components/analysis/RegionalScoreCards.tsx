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
  /** Optional limitation note for low-confidence regions */
  limitation?: string
}

/** Multi-view region shape (from multi-view pipeline) */
interface MultiViewRegionData {
  key: string
  label: string
  icon: string
  sourceView: string
  score: number
  confidence: number
  severity: 'minimal' | 'hafif' | 'orta' | 'belirgin'
  observation: string
  isPositive: boolean
  consultationNote?: string
  subScores?: Array<{ key: string; label: string; score: number; weight: number; confidence: number }>
}

interface ViewSummaryData {
  view: string
  label: string
  qualityScore: number
  usable: boolean
  issue?: string
  poseCorrect: boolean
  visibleRegionCount: number
  limitations: string[]
  narrative: string
}

interface BilateralComparisonData {
  regionBase: string
  label: string
  leftScore: number
  rightScore: number
  leftConfidence: number
  rightConfidence: number
  asymmetryDelta: number
  asymmetryLevel: 'symmetrical' | 'mild_asymmetry' | 'notable_asymmetry'
  note: string
}

interface SynthesisData {
  strongestAreas: Array<{ region: string; label: string; score: number; note: string }>
  improvementAreas: Array<{ region: string; label: string; score: number; note: string }>
  bilateralComparisons: BilateralComparisonData[]
  confidenceNotes: Array<{ region: string; label: string; level: 'high' | 'medium' | 'low'; explanation: string }>
  overallNarrative: string
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
  /** Multi-view analysis data (highest priority when available) */
  multiViewAnalysis?: {
    globalScore: number
    globalConfidence: number
    centralRegions: MultiViewRegionData[]
    leftRegions: MultiViewRegionData[]
    rightRegions: MultiViewRegionData[]
    viewSummaries?: ViewSummaryData[]
    synthesis?: SynthesisData
  }
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
        limitation: assessment.confidence < 45 ? assessment.limitation : undefined,
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

    let limitation: string | undefined

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
        // Pick limitation from the best match or any match that has one
        limitation = best.limitation ?? matches.find(o => o.limitation)?.limitation
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
      limitation: confidence < 45 ? limitation : undefined,
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

  const color = value >= 85 ? '#3D9B7A' : value >= 70 ? '#3D9B7A' : value >= 55 ? '#D6B98C' : value >= 40 ? '#C4883A' : '#C8785A'
  const label = value >= 85 ? 'Yüksek' : value >= 70 ? 'İyi' : value >= 55 ? 'Orta' : value >= 40 ? 'Düşük' : 'Sınırlı'

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

// ─── Region card renderer ───────────────────────────────────

function RegionCard({ card, idx }: { card: RegionCardData; idx: number }) {
  const sev = SEVERITY_STYLES[card.severity]
  const scoreColor = card.isPositive ? '#3D9B7A'
    : card.score >= 55 ? '#C8785A'
    : card.score >= 35 ? '#E5A83B'
    : card.score >= 15 ? '#D6B98C'
    : '#3D9B7A'

  return (
    <div
      className="rounded-xl border bg-[rgba(248,246,242,0.015)] overflow-hidden"
      style={{
        borderColor: card.isPositive ? 'rgba(61,155,122,0.10)' : 'rgba(214,185,140,0.08)',
        animation: `cardEntrance 0.4s ease-out ${idx * 0.08}s both`,
      }}
    >
      <div className="flex gap-3 p-3.5 sm:p-4">
        <div className="flex-shrink-0">
          <ScoreArc score={card.score} color={scoreColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-body text-[11px] sm:text-[12px] font-medium text-[rgba(248,246,242,0.75)] tracking-[0.02em]">
              {card.title}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[9px] font-medium tracking-[0.12em] uppercase"
              style={{ background: sev.bg, color: sev.text }}
            >
              {sev.label}
            </span>
          </div>
          <p className="font-body text-[12px] sm:text-[11px] text-[rgba(248,246,242,0.48)] leading-[1.65] mb-2">
            {card.observation}
          </p>
          <ConfidenceBar value={card.confidence} />
        </div>
      </div>
      {card.limitation && (
        <div className="px-4 sm:px-3.5 py-2 border-t border-[rgba(200,120,90,0.06)]">
          <p className="font-body text-[9px] text-[rgba(200,120,90,0.5)] leading-[1.5] flex items-center gap-1.5">
            <span className="opacity-60">⚠</span>
            {card.limitation}
          </p>
        </div>
      )}
      {card.consultationNote && (
        <div className="px-4 sm:px-3.5 py-2.5 border-t border-[rgba(214,185,140,0.05)] bg-[rgba(214,185,140,0.015)]">
          <p className="font-body text-[10px] sm:text-[9px] text-[rgba(214,185,140,0.45)] leading-[1.6] italic">
            {card.consultationNote}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Section header ─────────────────────────────────────────

function SectionHeader({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1.5">
      <span className="text-[11px] font-medium text-[rgba(248,246,242,0.25)]">{icon}</span>
      <span className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(248,246,242,0.3)]">{label}</span>
      <div className="flex-1 h-px bg-[rgba(248,246,242,0.04)]" />
    </div>
  )
}

// ─── Multi-view region → card mapper ────────────────────────

function multiViewToCards(regions: MultiViewRegionData[]): RegionCardData[] {
  return regions.map(r => ({
    key: r.key,
    title: r.label,
    icon: r.icon,
    score: r.score,
    confidence: r.confidence,
    severity: r.severity,
    observation: r.observation,
    isPositive: r.isPositive,
    consultationNote: r.consultationNote,
  }))
}

// ─── Bilateral comparison bar ───────────────────────────────

function BilateralBar({ item }: { item: BilateralComparisonData }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 400); return () => clearTimeout(t) }, [])

  const levelColor = item.asymmetryLevel === 'symmetrical' ? '#3D9B7A'
    : item.asymmetryLevel === 'mild_asymmetry' ? '#D6B98C' : '#C8785A'
  const levelLabel = item.asymmetryLevel === 'symmetrical' ? 'Simetrik'
    : item.asymmetryLevel === 'mild_asymmetry' ? 'Hafif Fark' : 'Belirgin Fark'

  return (
    <div className="rounded-lg border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.01)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-body text-[11px] text-[rgba(248,246,242,0.6)]">{item.label}</span>
        <span className="font-body text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-full"
          style={{ background: `${levelColor}12`, color: levelColor }}>
          {levelLabel}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] text-[rgba(248,246,242,0.4)] w-6 text-right">Sol</span>
        <div className="flex-1 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: mounted ? `${item.leftScore}%` : '0%', background: levelColor }} />
        </div>
        <span className="font-mono text-[10px] text-[rgba(248,246,242,0.5)] w-5">{item.leftScore}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] text-[rgba(248,246,242,0.4)] w-6 text-right">Sağ</span>
        <div className="flex-1 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: mounted ? `${item.rightScore}%` : '0%', background: levelColor }} />
        </div>
        <span className="font-mono text-[10px] text-[rgba(248,246,242,0.5)] w-5">{item.rightScore}</span>
      </div>
      <p className="font-body text-[10px] text-[rgba(248,246,242,0.35)] leading-[1.6] italic">{item.note}</p>
    </div>
  )
}

// ─── Synthesis sections ─────────────────────────────────────

function SynthesisSection({ synthesis, viewSummaries }: { synthesis: SynthesisData; viewSummaries?: ViewSummaryData[] }) {
  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* Overall narrative */}
      <div className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(214,185,140,0.02)] p-4">
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.55)] leading-[1.75]">
          {synthesis.overallNarrative}
        </p>
      </div>

      {/* Per-view summaries */}
      {viewSummaries && viewSummaries.length > 0 && (
        <>
          <SectionHeader label="Görünüm Özetleri" icon="⊞" />
          <div className="grid gap-2">
            {viewSummaries.map(vs => (
              <div key={vs.view} className="rounded-lg border border-[rgba(248,246,242,0.04)] bg-[rgba(248,246,242,0.01)] p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-body text-[11px] text-[rgba(248,246,242,0.6)]">{vs.label}</span>
                  <div className="flex items-center gap-1.5">
                    {vs.usable ? (
                      <span className="font-mono text-[10px] text-[#3D9B7A]">%{vs.qualityScore}</span>
                    ) : (
                      <span className="font-mono text-[10px] text-[#C8785A]">Yetersiz</span>
                    )}
                  </div>
                </div>
                <p className="font-body text-[10px] text-[rgba(248,246,242,0.4)] leading-[1.6]">{vs.narrative}</p>
                {vs.limitations.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {vs.limitations.map((lim, i) => (
                      <span key={i} className="font-body text-[9px] text-[rgba(200,120,90,0.5)] bg-[rgba(200,120,90,0.05)] px-1.5 py-0.5 rounded">
                        {lim}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Strongest areas */}
      {synthesis.strongestAreas.length > 0 && (
        <>
          <SectionHeader label="Güçlü Alanlar" icon="✦" />
          <div className="grid gap-1.5">
            {synthesis.strongestAreas.map(area => (
              <div key={area.region} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[rgba(61,155,122,0.03)] border border-[rgba(61,155,122,0.08)]">
                <span className="text-[10px] mt-0.5 text-[#3D9B7A]">●</span>
                <div className="flex-1">
                  <span className="font-body text-[11px] text-[rgba(248,246,242,0.6)]">{area.label}</span>
                  <p className="font-body text-[10px] text-[rgba(248,246,242,0.35)] leading-[1.5] mt-0.5">{area.note}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Improvement areas */}
      {synthesis.improvementAreas.length > 0 && (
        <>
          <SectionHeader label="Değerlendirme Önerilen Alanlar" icon="◇" />
          <div className="grid gap-1.5">
            {synthesis.improvementAreas.map(area => (
              <div key={area.region} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[rgba(214,185,140,0.02)] border border-[rgba(214,185,140,0.06)]">
                <span className="text-[10px] mt-0.5 text-[#D6B98C]">◇</span>
                <div className="flex-1">
                  <span className="font-body text-[11px] text-[rgba(248,246,242,0.6)]">{area.label}</span>
                  <p className="font-body text-[10px] text-[rgba(248,246,242,0.35)] leading-[1.5] mt-0.5">{area.note}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bilateral comparisons */}
      {synthesis.bilateralComparisons.length > 0 && (
        <>
          <SectionHeader label="Sol–Sağ Karşılaştırma" icon="⇌" />
          <div className="grid gap-2">
            {synthesis.bilateralComparisons.map(bc => (
              <BilateralBar key={bc.regionBase} item={bc} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────

export function RegionalScoreCards(props: RegionalScoreCardsProps) {
  const { multiViewAnalysis } = props

  // ── Preferred path: multi-view analysis (3-pose) ──
  if (multiViewAnalysis && (multiViewAnalysis.centralRegions.length > 0 || multiViewAnalysis.leftRegions.length > 0)) {
    const centralCards = multiViewToCards(multiViewAnalysis.centralRegions)
    const leftCards = multiViewToCards(multiViewAnalysis.leftRegions)
    const rightCards = multiViewToCards(multiViewAnalysis.rightRegions)
    let globalIdx = 0

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-label text-[rgba(248,246,242,0.35)]">
            Çoklu Açı Değerlendirmesi
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(61,155,122,0.06)] border border-[rgba(61,155,122,0.12)]">
            <span className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(61,155,122,0.5)]">Güven</span>
            <span className="font-mono text-[11px] text-[#3D9B7A]">{multiViewAnalysis.globalConfidence}%</span>
          </div>
        </div>

        {/* Central regions (from front view) */}
        {centralCards.length > 0 && (
          <>
            <SectionHeader label="Merkez / Genel Denge" icon="◎" />
            <div className="flex flex-col gap-2">
              {centralCards.map((card) => (
                <RegionCard key={card.key} card={card} idx={globalIdx++} />
              ))}
            </div>
          </>
        )}

        {/* Left-side regions (from left view) */}
        {leftCards.length > 0 && (
          <>
            <SectionHeader label="Sol Taraf" icon="◧" />
            <div className="flex flex-col gap-2">
              {leftCards.map((card) => (
                <RegionCard key={card.key} card={card} idx={globalIdx++} />
              ))}
            </div>
          </>
        )}

        {/* Right-side regions (from right view) */}
        {rightCards.length > 0 && (
          <>
            <SectionHeader label="Sağ Taraf" icon="◨" />
            <div className="flex flex-col gap-2">
              {rightCards.map((card) => (
                <RegionCard key={card.key} card={card} idx={globalIdx++} />
              ))}
            </div>
          </>
        )}

        {/* Synthesis section */}
        {multiViewAnalysis.synthesis && (
          <SynthesisSection
            synthesis={multiViewAnalysis.synthesis}
            viewSummaries={multiViewAnalysis.viewSummaries}
          />
        )}
      </div>
    )
  }

  // ── Fallback: single-view cards (specialist or trust pipeline) ──
  const cards = buildCards(props)

  if (cards.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <span className="text-label text-[rgba(248,246,242,0.35)] mb-1 block">
        Bolgesel Degerlendirmeler
      </span>
      <div className="flex flex-col gap-2.5">
        {cards.map((card, idx) => (
          <RegionCard key={card.key} card={card} idx={idx} />
        ))}
      </div>
    </div>
  )
}
