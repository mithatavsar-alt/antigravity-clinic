'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
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

// ─── Proportional sizing system ──────────────────────────────
// All chart dimensions derive from a single viewBox.
// The SVG scales via CSS (w-full) — no hard-coded pixel sizes.

const VB = 500                   // tighter viewBox → chart fills more of SVG
const CX = VB / 2
const CY = VB / 2
const R = VB * 0.32             // outer radius = 160 (32% of viewBox)
const LABEL_R = R + VB * 0.085  // label distance from center
const DOT_R = VB * 0.008        // base dot size = 4
const DOT_R_ACTIVE = VB * 0.012 // active dot = 6
const STROKE_W = VB * 0.003     // polygon stroke = 1.5
const CENTER_FONT = VB * 0.10   // center score font = 50
const CENTER_SUB = VB * 0.017   // sublabel font = 8.5
const LABEL_FONT = VB * 0.022   // label font = 11
const LABEL_FONT_ACTIVE = VB * 0.025
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
  if (score >= 70) return '#4AE3A7'
  if (score >= 40) return '#D6B98C'
  return '#C47A7A'
}

function scoreGrade(score: number): string {
  if (score >= 70) return 'Dengeli'
  if (score >= 40) return 'Geliştirilebilir'
  return 'İyileştirme Potansiyeli Yüksek'
}

/** Visual-only radius: maps score 0→25%, score 100→100% of R.
 *  Real scores are never mutated — only the polygon shape gets a floor. */
const MIN_VISUAL_PCT = 0.25
function visualRadius(score: number): number {
  const clamped = Math.max(0, Math.min(100, score)) / 100
  return (MIN_VISUAL_PCT + clamped * (1 - MIN_VISUAL_PCT)) * R
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
        x={x - 88}
        y={y - 76}
        width={176}
        height={66}
      >
        <div
          style={{
            background: 'rgba(10,8,6,0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(214,185,140,0.10)',
            borderRadius: '12px',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '11px',
              fontWeight: 500,
              color: '#F8F6F2',
              letterSpacing: '0.02em',
            }}>
              {point.label}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '14px',
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
                fontSize: '8px',
                color: 'rgba(248,246,242,0.25)',
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
    .map((s, i) => polar(i, n, visualRadius(s.score)).join(','))
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
        <filter id="rGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>
        <filter id="rDotGlow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>

        {/* Data polygon fill */}
        <radialGradient id="rFill" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(214,185,140,0.14)" />
          <stop offset="50%" stopColor="rgba(61,155,122,0.08)" />
          <stop offset="100%" stopColor="rgba(61,155,122,0)" />
        </radialGradient>

        <linearGradient id="rStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4AE3A7" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#D6B98C" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4AE3A7" stopOpacity="0.8" />
        </linearGradient>

        <radialGradient id="rCenterOrb">
          <stop offset="0%" stopColor={avgColor} stopOpacity="0.12" />
          <stop offset="60%" stopColor={avgColor} stopOpacity="0.03" />
          <stop offset="100%" stopColor={avgColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── LAYER 1: Grid ────────────────────────────── */}
      {LEVELS.map((level) => {
        const isOuter = level === 1.0
        return (
          <polygon
            key={level}
            points={polygonPoints(n, R * level)}
            fill="none"
            stroke={isOuter
              ? 'rgba(248,246,242,0.08)'
              : `rgba(248,246,242,${0.01 + level * 0.012})`
            }
            strokeWidth={isOuter ? 0.8 : 0.35}
            strokeDasharray={isOuter ? 'none' : '2 5'}
          />
        )
      })}

      {/* Radial axes */}
      {scores.map((_, i) => {
        const [ox, oy] = polar(i, n, R)
        const active = hovered === i
        return (
          <line
            key={`ax-${i}`}
            x1={CX} y1={CY} x2={ox} y2={oy}
            stroke={active ? 'rgba(248,246,242,0.06)' : 'rgba(248,246,242,0.015)'}
            strokeWidth={0.35}
            style={{ transition: 'stroke 0.3s' }}
          />
        )
      })}

      {/* ── LAYER 2: Center orb ──────────────────────── */}
      <circle
        cx={CX} cy={CY} r={R * 0.32}
        fill="url(#rCenterOrb)"
        style={{
          opacity: mounted ? 1 : 0,
          transition: 'opacity 1s ease-out 0.5s',
        }}
      />

      {/* ── LAYER 3: Data polygon ────────────────────── */}
      <g
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: mounted ? 'scale(1)' : 'scale(0)',
          transition: 'transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Soft glow behind stroke */}
        <polygon
          points={dataPoints}
          fill="none"
          stroke="url(#rStroke)"
          strokeWidth={STROKE_W * 3}
          strokeLinejoin="round"
          filter="url(#rGlow)"
          opacity={0.35}
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
          strokeWidth={STROKE_W}
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {scores.map((s, i) => {
          const [x, y] = polar(i, n, visualRadius(s.score))
          const dotColor = scoreColor(s.score)
          const active = hovered === i
          const dr = active ? DOT_R_ACTIVE : DOT_R

          return (
            <g key={`dot-${s.key}`}>
              {/* Glow */}
              <circle
                cx={x} cy={y}
                r={dr * 2.5}
                fill={dotColor}
                filter="url(#rDotGlow)"
                opacity={active ? 0.4 : 0.12}
                style={{ transition: 'opacity 0.3s' }}
              />
              {/* Core dot */}
              <circle
                cx={x} cy={y}
                r={dr}
                fill={dotColor}
                stroke="rgba(10,8,6,0.6)"
                strokeWidth={STROKE_W * 0.8}
                style={{ transition: 'r 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
              />
              {/* Hit area */}
              <circle
                cx={x} cy={y} r={VB * 0.04}
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

      {/* ── LAYER 4: Labels ──────────────────────────── */}
      {scores.map((s, i) => {
        const [lx, ly] = polar(i, n, LABEL_R)
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const textAnchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle'
        const dy = sin > 0.3 ? 14 : sin < -0.3 ? -6 : 3
        const shortLabel = SHORT_LABELS[s.key] ?? s.label

        const active = hovered === i
        const strong = s.score >= 70
        const weak = s.score < 40

        const labelFill = active
          ? scoreColor(s.score)
          : strong
            ? 'rgba(248,246,242,0.55)'
            : weak
              ? 'rgba(248,246,242,0.20)'
              : 'rgba(248,246,242,0.34)'

        return (
          <g key={`lbl-${s.key}`}>
            <text
              x={lx}
              y={ly + dy}
              textAnchor={textAnchor}
              fill={labelFill}
              style={{
                fontSize: `${active ? LABEL_FONT_ACTIVE : LABEL_FONT}px`,
                fontFamily: "'Outfit', system-ui, sans-serif",
                letterSpacing: '0.04em',
                fontWeight: active ? 500 : 400,
                transition: 'fill 0.3s, font-size 0.2s',
              }}
            >
              {shortLabel}
            </text>
            {/* Score on hover */}
            <text
              x={lx}
              y={ly + dy + 14}
              textAnchor={textAnchor}
              fill={scoreColor(s.score)}
              style={{
                fontSize: `${VB * 0.019}px`,
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

      {/* ── LAYER 5: Center score (hero) ─────────────── */}
      <g style={{
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.9s ease-out 0.8s',
      }}>
        {/* Subtle ring */}
        <circle
          cx={CX} cy={CY} r={R * 0.26}
          fill="none"
          stroke={avgColor}
          strokeWidth={0.4}
          opacity={0.10}
        />

        {/* Score number */}
        <text
          x={CX}
          y={CY - VB * 0.012}
          textAnchor="middle"
          dominantBaseline="central"
          fill={avgColor}
          style={{
            fontSize: `${CENTER_FONT}px`,
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
          y={CY + VB * 0.055}
          textAnchor="middle"
          fill="rgba(248,246,242,0.25)"
          style={{
            fontSize: `${CENTER_SUB}px`,
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: '0.26em',
            textTransform: 'uppercase' as const,
            fontWeight: 500,
          }}
        >
          Genel Denge
        </text>
      </g>

      {/* ── LAYER 6: Tooltip ─────────────────────────── */}
      {hovered !== null && scores[hovered] && (() => {
        const s = scores[hovered]
        const rv = visualRadius(s.score)
        const [tx, ty] = polar(hovered, n, rv)
        return <Tooltip point={s} x={tx} y={ty} visible />
      })()}
    </svg>
  )
}

// ─── Insight Row (premium card) ──────────────────────────────

/** Maps radar score keys to treatment page URLs (only for improvement-relevant items) */
const TREATMENT_LINKS: Partial<Record<string, { label: string; href: string }>> = {
  forehead_lines: { label: 'Botoks hakkında bilgi', href: '/treatments/botox' },
  glabella: { label: 'Botoks hakkında bilgi', href: '/treatments/botox' },
  crow_feet: { label: 'Botoks hakkında bilgi', href: '/treatments/botox' },
  under_eye: { label: 'Dolgu hakkında bilgi', href: '/treatments/filler' },
  nasolabial: { label: 'Dolgu hakkında bilgi', href: '/treatments/filler' },
  perioral: { label: 'Dolgu hakkında bilgi', href: '/treatments/filler' },
  lower_face: { label: 'Dolgu hakkında bilgi', href: '/treatments/filler' },
  firmness: { label: 'Mezoterapi hakkında bilgi', href: '/treatments/mesotherapy' },
  age_appearance: { label: 'Mezoterapi hakkında bilgi', href: '/treatments/mesotherapy' },
}

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
  const gradFill = item.score >= 70
    ? 'linear-gradient(180deg, #2D5F5D 0%, #4AE3A7 100%)'
    : item.score >= 40
      ? 'linear-gradient(180deg, #8B6B2A 0%, #D6B98C 100%)'
      : 'linear-gradient(180deg, #6B2828 0%, #C47A7A 100%)'

  const barGrad = item.score >= 70
    ? 'linear-gradient(90deg, #2D5F5D 0%, #4AE3A7 100%)'
    : item.score >= 40
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

        {/* Treatment info link — only for improvement items */}
        {variant === 'improve' && TREATMENT_LINKS[item.key] && (
          <Link
            href={TREATMENT_LINKS[item.key]!.href}
            className="inline-flex items-center gap-1.5 mt-3 font-body text-[11px] transition-colors duration-200"
            style={{ color: 'rgba(214,185,140,0.40)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(214,185,140,0.70)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(214,185,140,0.40)' }}
          >
            {TREATMENT_LINKS[item.key]!.label}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        )}
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
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-label text-[rgba(214,185,140,0.55)]">
          Estetik Harita
        </span>
        <h2
          className="heading-display heading-display-md text-[#F8F6F2]"
          style={{ maxWidth: '32ch' }}
        >
          Bölgesel Analiz Sonuçları
        </h2>
        <div className="flex items-center gap-4 mt-0.5">
          <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, transparent, rgba(214,185,140,0.25))' }} />
          <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(214,185,140,0.3)' }} />
          <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, rgba(214,185,140,0.25), transparent)' }} />
        </div>
      </div>

      {/* ── Hero Radar Card ───────────────────────────── */}
      <div
        className="glass-elevated rounded-[24px] sm:rounded-[28px]"
        style={{ animation: 'heroFadeUp 0.9s ease-out 0.2s both' }}
      >
        <div className="p-4 sm:p-8 lg:p-10">
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
                  11 Bölge Analizi
                </span>
              </div>
              {/* Average score pill */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{
                  background: `${avgColor}06`,
                  border: `1px solid ${avgColor}14`,
                }}
              >
                <span className="text-label-sm" style={{ color: `${avgColor}70` }}>Ortalama</span>
                <span className="font-mono text-[14px] font-light" style={{ color: avgColor }}>{avg}</span>
              </div>
            </div>

            {/* Chart — responsive container */}
            <div className="w-full max-w-[280px] sm:max-w-[380px] lg:max-w-[420px] mx-auto">
              <RadarSVG scores={scores} hovered={hovered} onHover={handleHover} />
            </div>

            {/* Quality caveat */}
            {captureQuality && captureQuality !== 'high' && (
              <div className="rounded-[10px] px-3.5 py-2.5" style={{ background: 'rgba(214,185,140,0.02)', border: '1px solid rgba(214,185,140,0.05)' }}>
                <p className="font-body text-[10px] text-[rgba(248,246,242,0.22)] leading-relaxed italic text-center">
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
