'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/ai/radar-scores'
import type { RadarCategory } from '@/lib/ai/radar-scores'

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

// ─── Constants ────────────────────────────────────────────────

const VB = 600
const CX = VB / 2
const CY = VB / 2
const OUTER_R = 170
const LABEL_R = OUTER_R + 48
const LEVELS = [0.25, 0.5, 0.75, 1.0]

const SHORT_LABELS: Record<string, string> = {
  forehead_lines: 'Alın Çizgileri',
  glabella: 'Kaş Arası',
  crow_feet: 'Kaz Ayağı',
  under_eye: 'Göz Altı',
  nasolabial: 'Nazolabial',
  perioral: 'Dudak Çevresi',
  lower_face: 'Alt Yüz',
  symmetry: 'Simetri',
  firmness: 'Cilt Sıkılığı',
  age_appearance: 'Yaş Görünümü',
  golden_ratio: 'Altın Oran',
}

// ─── Geometry ─────────────────────────────────────────────────

function polar(index: number, total: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)]
}

function polygonPoints(total: number, radius: number): string {
  return Array.from({ length: total }, (_, i) =>
    polar(i, total, radius).join(','),
  ).join(' ')
}

function scoreColor(score: number): string {
  if (score >= 75) return '#4AE3A7'
  if (score >= 55) return '#D6B98C'
  return '#C47A7A'
}

function scoreGrade(score: number): string {
  if (score >= 75) return 'Güçlü'
  if (score >= 55) return 'Dengeli'
  return 'İyileştirilebilir'
}

// ─── Tooltip ──────────────────────────────────────────────────

function Tooltip({ point, x, y, visible }: {
  point: RadarDataPoint
  x: number
  y: number
  visible: boolean
}) {
  const color = scoreColor(point.score)
  const catColor = CATEGORY_COLORS[point.category as RadarCategory] ?? '#D6B98C'
  const catLabel = CATEGORY_LABELS[point.category as RadarCategory] ?? point.category

  return (
    <g
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease-out',
        pointerEvents: 'none',
      }}
    >
      <foreignObject
        x={x - 96}
        y={y - 82}
        width={192}
        height={72}
      >
        <div
          style={{
            background: 'rgba(10,8,6,0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(214,185,140,0.12)',
            borderRadius: '14px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '12px',
              fontWeight: 500,
              color: '#F8F6F2',
              letterSpacing: '0.02em',
            }}>
              {point.label}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '16px',
              fontWeight: 300,
              color,
            }}>
              {point.score}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '8px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              color: catColor,
              opacity: 0.85,
            }}>
              {catLabel}
            </span>
            {point.confidence > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '9px',
                color: 'rgba(248,246,242,0.28)',
              }}>
                {Math.round(point.confidence * 100)}%
              </span>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  )
}

// ─── Radar SVG ────────────────────────────────────────────────

function RadarSVG({ scores, hovered, onHover }: {
  scores: RadarDataPoint[]
  hovered: number | null
  onHover: (i: number | null) => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200)
    return () => clearTimeout(t)
  }, [])

  const n = scores.length
  if (n === 0) return null

  const dataPoints = scores
    .map((s, i) => {
      const r = (Math.max(0, Math.min(100, s.score)) / 100) * OUTER_R
      return polar(i, n, r).join(',')
    })
    .join(' ')

  const avg = Math.round(scores.reduce((sum, s) => sum + Math.max(0, Math.min(100, s.score)), 0) / n)
  const avgColor = scoreColor(avg)

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="w-full h-auto"
      role="img"
      aria-label="Estetik analiz radar grafiği"
    >
      <defs>
        <filter id="rGlowSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
        </filter>
        <filter id="rCenterGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="24" />
        </filter>
        <filter id="rDotGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>
        <filter id="rAmbient" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="40" />
        </filter>

        {/* Richer fill gradient */}
        <radialGradient id="rFill" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(214,185,140,0.18)" />
          <stop offset="40%" stopColor="rgba(61,155,122,0.10)" />
          <stop offset="100%" stopColor="rgba(61,155,122,0.01)" />
        </radialGradient>

        <linearGradient id="rStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4AE3A7" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#D6B98C" stopOpacity="1" />
          <stop offset="100%" stopColor="#4AE3A7" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id="rStrokeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4AE3A7" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#D6B98C" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4AE3A7" stopOpacity="0.3" />
        </linearGradient>

        <radialGradient id="rCenterOrb">
          <stop offset="0%" stopColor={avgColor} stopOpacity="0.16" />
          <stop offset="60%" stopColor={avgColor} stopOpacity="0.04" />
          <stop offset="100%" stopColor={avgColor} stopOpacity="0" />
        </radialGradient>

        {/* Ambient atmosphere */}
        <radialGradient id="rAtmosphere" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(214,185,140,0.04)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* ── LAYER 0: Ambient atmosphere ─────────────── */}
      <circle cx={CX} cy={CY} r={OUTER_R + 60} fill="url(#rAtmosphere)" />

      {/* ── LAYER 1: Outer halo ring ────────────────── */}
      <circle
        cx={CX} cy={CY} r={OUTER_R + 8}
        fill="none"
        stroke="rgba(248,246,242,0.02)"
        strokeWidth={24}
      />

      {/* ── LAYER 2: Grid ────────────────────────────── */}
      {LEVELS.map((level) => {
        const isOuter = level === 1.0
        return (
          <polygon
            key={level}
            points={polygonPoints(n, OUTER_R * level)}
            fill="none"
            stroke={isOuter
              ? 'rgba(248,246,242,0.10)'
              : `rgba(248,246,242,${0.015 + level * 0.015})`
            }
            strokeWidth={isOuter ? 1.0 : 0.4}
            strokeDasharray={isOuter ? 'none' : '2 5'}
          />
        )
      })}

      {/* Radial axes */}
      {scores.map((_, i) => {
        const [ox, oy] = polar(i, n, OUTER_R)
        const active = hovered === i
        return (
          <line
            key={`ax-${i}`}
            x1={CX} y1={CY} x2={ox} y2={oy}
            stroke={active ? 'rgba(248,246,242,0.08)' : 'rgba(248,246,242,0.02)'}
            strokeWidth={active ? 0.6 : 0.35}
            style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
          />
        )
      })}

      {/* ── LAYER 3: Center orb ──────────────────────── */}
      <circle
        cx={CX} cy={CY} r={60}
        fill="url(#rCenterOrb)"
        style={{
          opacity: mounted ? 1 : 0,
          transition: 'opacity 1.2s ease-out 0.6s',
        }}
      />

      {/* ── LAYER 4: Data polygon ────────────────────── */}
      <g
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: mounted ? 'scale(1)' : 'scale(0)',
          transition: 'transform 1.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Wide glow behind stroke */}
        <polygon
          points={dataPoints}
          fill="none"
          stroke="url(#rStrokeGlow)"
          strokeWidth={8}
          strokeLinejoin="round"
          filter="url(#rGlowSoft)"
          opacity={0.5}
        />

        {/* Fill */}
        <polygon
          points={dataPoints}
          fill="url(#rFill)"
          stroke="none"
        />

        {/* Crisp edge */}
        <polygon
          points={dataPoints}
          fill="none"
          stroke="url(#rStroke)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {scores.map((s, i) => {
          const r = (Math.max(0, Math.min(100, s.score)) / 100) * OUTER_R
          const [x, y] = polar(i, n, r)
          const dotColor = scoreColor(s.score)
          const active = hovered === i
          const dotR = active ? 7 : 4.5

          return (
            <g key={`dot-${s.key}`}>
              {/* Glow */}
              <circle
                cx={x} cy={y}
                r={active ? 16 : 10}
                fill={dotColor}
                filter="url(#rDotGlow)"
                opacity={active ? 0.5 : 0.15}
                style={{ transition: 'opacity 0.3s, r 0.3s' }}
              />
              {/* Core dot */}
              <circle
                cx={x} cy={y}
                r={dotR}
                fill={dotColor}
                stroke="rgba(10,8,6,0.7)"
                strokeWidth={1.8}
                style={{ transition: 'r 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}
              />
              {/* Hit area */}
              <circle
                cx={x} cy={y} r={22}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onTouchStart={() => onHover(i)}
                onTouchEnd={() => onHover(null)}
              />
            </g>
          )
        })}
      </g>

      {/* ── LAYER 5: Labels ──────────────────────────── */}
      {scores.map((s, i) => {
        const [lx, ly] = polar(i, n, LABEL_R)
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const textAnchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle'
        const dy = sin > 0.3 ? 16 : sin < -0.3 ? -8 : 4
        const shortLabel = SHORT_LABELS[s.key] ?? s.label

        const active = hovered === i
        const strong = s.score >= 70
        const weak = s.score < 45

        const labelFill = active
          ? scoreColor(s.score)
          : strong
            ? 'rgba(248,246,242,0.58)'
            : weak
              ? 'rgba(248,246,242,0.22)'
              : 'rgba(248,246,242,0.36)'

        return (
          <g key={`lbl-${s.key}`}>
            <text
              x={lx}
              y={ly + dy}
              textAnchor={textAnchor}
              fill={labelFill}
              style={{
                fontSize: active ? '12px' : '11px',
                fontFamily: "'Outfit', system-ui, sans-serif",
                letterSpacing: '0.04em',
                fontWeight: active ? 500 : 400,
                transition: 'fill 0.3s, font-size 0.2s',
              }}
            >
              {shortLabel}
            </text>
            {/* Score badge on hover */}
            <text
              x={lx}
              y={ly + dy + 15}
              textAnchor={textAnchor}
              fill={scoreColor(s.score)}
              style={{
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 400,
                opacity: active ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              {s.score}/100
            </text>
          </g>
        )
      })}

      {/* ── LAYER 6: Center score (hero) ─────────────── */}
      <g style={{
        opacity: mounted ? 1 : 0,
        transition: 'opacity 1s ease-out 0.9s',
      }}>
        {/* Subtle glow ring */}
        <circle
          cx={CX} cy={CY} r={44}
          fill="none"
          stroke={avgColor}
          strokeWidth={0.6}
          opacity={0.18}
          filter="url(#rCenterGlow)"
        />
        {/* Thin ring */}
        <circle
          cx={CX} cy={CY} r={44}
          fill="none"
          stroke={avgColor}
          strokeWidth={0.3}
          opacity={0.12}
        />

        {/* Score number */}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fill={avgColor}
          style={{
            fontSize: '46px',
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            letterSpacing: '-0.03em',
          }}
        >
          {avg}
        </text>

        {/* Label */}
        <text
          x={CX}
          y={CY + 26}
          textAnchor="middle"
          fill="rgba(248,246,242,0.28)"
          style={{
            fontSize: '8px',
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: '0.28em',
            textTransform: 'uppercase' as const,
            fontWeight: 500,
          }}
        >
          Genel Denge
        </text>
      </g>

      {/* ── LAYER 7: Tooltip ─────────────────────────── */}
      {hovered !== null && scores[hovered] && (() => {
        const s = scores[hovered]
        const r = (Math.max(0, Math.min(100, s.score)) / 100) * OUTER_R
        const [tx, ty] = polar(hovered, n, r)
        return <Tooltip point={s} x={tx} y={ty} visible />
      })()}
    </svg>
  )
}

// ─── Insight Row (premium card) ──────────────────────────────

function InsightRow({ item, idx, variant }: {
  item: RadarDataPoint
  idx: number
  variant: 'strong' | 'improve'
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), idx * 80 + 120)
    return () => clearTimeout(t)
  }, [idx])

  const color = scoreColor(item.score)
  const grade = scoreGrade(item.score)
  const gradFill = item.score >= 75
    ? 'linear-gradient(180deg, #2D5F5D 0%, #4AE3A7 100%)'
    : item.score >= 55
      ? 'linear-gradient(180deg, #8B6B2A 0%, #D6B98C 100%)'
      : 'linear-gradient(180deg, #6B2828 0%, #C47A7A 100%)'

  const barGrad = item.score >= 75
    ? 'linear-gradient(90deg, #2D5F5D 0%, #4AE3A7 100%)'
    : item.score >= 55
      ? 'linear-gradient(90deg, #8B6B2A 0%, #D6B98C 100%)'
      : 'linear-gradient(90deg, #6B2828 0%, #C47A7A 100%)'

  const positiveInsights: Record<string, string> = {
    forehead_lines: 'Alın bölgesi geniş ve düzgün bir görünüm sergilemektedir.',
    glabella: 'Kaş arası bölge dinlenmiş ve dengeli bir yapı göstermektedir.',
    crow_feet: 'Göz çevresi pürüzsüz ve genç bir görünüm taşımaktadır.',
    under_eye: 'Göz altı bölgesi dolgun ve sağlıklı görünümdedir.',
    nasolabial: 'Nazolabial hat yumuşak ve doğal bir geçiş sergilemektedir.',
    perioral: 'Dudak çevresi pürüzsüz ve bakımlı bir izlenim vermektedir.',
    lower_face: 'Alt yüz hattı belirgin ve konturlu bir yapıya sahiptir.',
    symmetry: 'Yüz simetrisi dengeli ve uyumlu bir yapı göstermektedir.',
    firmness: 'Cilt sıkılığı genel olarak iyi düzeyde görünmektedir.',
    age_appearance: 'Yaş görünümü genç ve canlı bir izlenim vermektedir.',
    golden_ratio: 'Yüz oranları altın oranla genel olarak uyumludur.',
  }

  const improveInsights: Record<string, string> = {
    forehead_lines: 'Alın bölgesinde hafif düzeyde iyileştirme potansiyeli bulunmaktadır.',
    glabella: 'Kaş arası bölgede hafif çizgi eğilimi gözlenmektedir.',
    crow_feet: 'Göz çevresinde hafif ince çizgi belirginliği mevcuttur.',
    under_eye: 'Göz altı bölgesinde hafif doku değişiklikleri gözlenmektedir.',
    nasolabial: 'Nazolabial hatta hafif derinleşme eğilimi mevcuttur.',
    perioral: 'Dudak çevresinde ince çizgi potansiyeli gözlenmektedir.',
    lower_face: 'Alt yüz hattında hafif kontur yumuşaması mevcuttur.',
    symmetry: 'Yüz simetrisinde hafif düzeyde farklılık gözlenmektedir.',
    firmness: 'Cilt sıkılığında hafif yumuşama eğilimi mevcuttur.',
    age_appearance: 'Yaş görünümünde hafif olgunlaşma işaretleri gözlenmektedir.',
    golden_ratio: 'Yüz oranlarında küçük farklılıklar gözlenmektedir.',
  }

  const insight = variant === 'strong'
    ? (positiveInsights[item.key] ?? 'Bu alan genel olarak dengeli ve olumlu görünüyor.')
    : (improveInsights[item.key] ?? 'Bu bölgede hafif düzeyde iyileştirme potansiyeli bulunmaktadır.')

  return (
    <div
      className="group relative overflow-hidden transition-all duration-300"
      style={{
        background: 'rgba(14, 12, 10, 0.45)',
        border: '1px solid rgba(214,185,140,0.06)',
        borderRadius: '16px',
        animation: `cardEntrance 0.5s ease-out ${idx * 70}ms both`,
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 inset-y-0 w-[3px]"
        style={{ background: gradFill, borderRadius: '16px 0 0 16px' }}
      />

      <div className="pl-6 pr-5 py-5">
        {/* Top row: label + grade + score */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="font-body text-[14px] font-medium text-[#F8F6F2] leading-snug tracking-[0.01em]">
              {item.label}
            </span>
            <span
              className="font-body text-[7px] tracking-[0.14em] uppercase px-2.5 py-[4px] rounded-full border"
              style={{
                color,
                backgroundColor: `${color}0A`,
                borderColor: `${color}1A`,
              }}
            >
              {grade}
            </span>
          </div>
          <span
            className="font-mono text-[22px] font-light leading-none tabular-nums tracking-tight"
            style={{ color }}
          >
            {item.score}
          </span>
        </div>

        {/* Insight text */}
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.36)] leading-[1.7] mb-4">
          {insight}
        </p>

        {/* Score bar */}
        <div className="h-[3px] rounded-full bg-[rgba(248,246,242,0.035)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: mounted ? `${item.score}%` : '0%',
              background: barGrad,
              boxShadow: `0 0 10px ${color}30`,
              transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Exported Section Component ───────────────────────────────

export default function RadarChartSection({ scores, captureQuality, summaryText }: RadarChartSectionProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const handleHover = useCallback((i: number | null) => setHovered(i), [])

  const { strongest, improvement, avg } = useMemo(() => {
    const clamped = scores.map(s => ({
      ...s,
      score: Math.max(0, Math.min(100, s.score)),
    }))
    const sorted = [...clamped].sort((a, b) => b.score - a.score)
    const avgVal = Math.round(clamped.reduce((sum, s) => sum + s.score, 0) / clamped.length)
    return {
      strongest: sorted.slice(0, 3),
      improvement: sorted.slice(-3).reverse(),
      avg: avgVal,
    }
  }, [scores])

  if (!scores || scores.length === 0) return null

  const avgColor = scoreColor(avg)

  return (
    <div
      className="flex flex-col"
      style={{ gap: 'clamp(1.5rem, 3.5vw, 2.5rem)', animation: 'sectionReveal 0.8s ease-out 0.1s both' }}
    >
      {/* ── Section header ────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-label text-[rgba(214,185,140,0.55)]">
          Estetik Harita
        </span>
        <h2
          className="heading-display heading-display-md text-[#F8F6F2]"
          style={{ maxWidth: '32ch' }}
        >
          Bölgesel Analiz Sonuçları
        </h2>
        {/* Editorial divider */}
        <div className="flex items-center gap-4 mt-1">
          <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(214,185,140,0.3))', animation: 'lineExpand 0.8s ease-out 0.4s both', transformOrigin: 'right' }} />
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(214,185,140,0.35)' }} />
          <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, rgba(214,185,140,0.3), transparent)', animation: 'lineExpand 0.8s ease-out 0.4s both', transformOrigin: 'left' }} />
        </div>
      </div>

      {/* ── Hero Radar Card ───────────────────────────── */}
      <div
        className="glass-elevated rounded-[28px]"
        style={{ animation: 'heroFadeUp 0.9s ease-out 0.2s both' }}
      >
        {/* Inner padding with extra breathing room */}
        <div className="p-6 sm:p-10 lg:p-12">
          <div className="flex flex-col gap-8">

            {/* Top bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(214,185,140,0.06)', border: '1px solid rgba(214,185,140,0.10)' }}
                >
                  <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                  </svg>
                </div>
                <span className="text-label text-[rgba(248,246,242,0.35)]">
                  11 Bölge Analizi
                </span>
              </div>
              {/* Average score pill */}
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{
                  background: `${avgColor}08`,
                  border: `1px solid ${avgColor}18`,
                }}
              >
                <span className="text-label-sm" style={{ color: `${avgColor}88` }}>Ortalama</span>
                <span className="font-mono text-[16px] font-light" style={{ color: avgColor }}>{avg}</span>
              </div>
            </div>

            {/* Chart — larger, more breathing room */}
            <div className="w-full max-w-[540px] mx-auto py-2">
              <RadarSVG scores={scores} hovered={hovered} onHover={handleHover} />
            </div>

            {/* Quality caveat */}
            {captureQuality && captureQuality !== 'high' && (
              <div className="rounded-[12px] px-4 py-3" style={{ background: 'rgba(214,185,140,0.025)', border: '1px solid rgba(214,185,140,0.06)' }}>
                <p className="font-body text-[11px] text-[rgba(248,246,242,0.26)] leading-relaxed italic text-center">
                  {captureQuality === 'low'
                    ? 'Bu değerlendirme mevcut görüntü kalitesine göre yaklaşık olarak oluşturulmuştur.'
                    : 'Görüntü kalitesi orta düzeydedir. Sonuçlar genel yönelimi yansıtmaktadır.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Insight Panels ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 'clamp(1rem, 2.5vw, 1.5rem)' }}>

        {/* En Güçlü Alanlar */}
        <div
          className="glass-elevated rounded-[24px] p-6 sm:p-8"
          style={{ animation: 'sectionReveal 0.7s ease-out 0.3s both' }}
        >
          <div className="flex flex-col gap-5">
            {/* Panel header */}
            <div className="flex items-center gap-3 pb-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(74,227,167,0.07)', border: '1px solid rgba(74,227,167,0.12)' }}
              >
                <svg className="w-3.5 h-3.5 text-[#4AE3A7]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </div>
              <span className="text-label" style={{ color: 'rgba(74,227,167,0.55)' }}>
                En Güçlü Alanlar
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {strongest.map((item, idx) => (
                <InsightRow key={item.key} item={item} idx={idx} variant="strong" />
              ))}
            </div>
          </div>
        </div>

        {/* İyileştirme Potansiyeli */}
        <div
          className="glass-elevated rounded-[24px] p-6 sm:p-8"
          style={{ animation: 'sectionReveal 0.7s ease-out 0.4s both' }}
        >
          <div className="flex flex-col gap-5">
            {/* Panel header */}
            <div className="flex items-center gap-3 pb-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(196,122,122,0.07)', border: '1px solid rgba(196,122,122,0.12)' }}
              >
                <svg className="w-3.5 h-3.5 text-[#C47A7A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <span className="text-label" style={{ color: 'rgba(196,122,122,0.55)' }}>
                İyileştirme Potansiyeli
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {improvement.map((item, idx) => (
                <InsightRow key={item.key} item={item} idx={idx} variant="improve" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary ───────────────────────────────────── */}
      {summaryText && (
        <div
          className="rounded-[16px] px-6 py-5 text-center max-w-2xl mx-auto w-full"
          style={{
            background: 'rgba(214,185,140,0.02)',
            border: '1px solid rgba(214,185,140,0.06)',
            animation: 'sectionReveal 0.6s ease-out 0.5s both',
          }}
        >
          <p className="font-body text-[13px] text-[rgba(248,246,242,0.40)] leading-[1.8]">
            {summaryText}
          </p>
          <p className="font-body text-[10px] text-[rgba(248,246,242,0.20)] leading-relaxed mt-3 italic">
            Bu analiz AI destekli ön değerlendirme niteliğindedir. Kesin sonuçlar klinik muayene gerektirir.
          </p>
        </div>
      )}
    </div>
  )
}
