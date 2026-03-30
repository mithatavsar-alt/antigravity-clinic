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

const VB = 560
const CX = VB / 2
const CY = VB / 2
const OUTER_R = 155
const LABEL_R = OUTER_R + 42
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

function centerGrade(avg: number): string {
  if (avg >= 80) return 'Mükemmel'
  if (avg >= 65) return 'İyi'
  if (avg >= 50) return 'Dengeli'
  return 'Gelişime Açık'
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
      {/* Background card */}
      <foreignObject
        x={x - 88}
        y={y - 76}
        width={176}
        height={68}
      >
        <div
          style={{
            background: 'rgba(12,10,8,0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(214,185,140,0.15)',
            borderRadius: '10px',
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
              fontWeight: 400,
              color,
            }}>
              {point.score}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '8px',
              letterSpacing: '0.08em',
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
                color: 'rgba(248,246,242,0.3)',
              }}>
                Güven: {Math.round(point.confidence * 100)}%
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
    const t = setTimeout(() => setMounted(true), 150)
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
        {/* Filters */}
        <filter id="rGlowSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>
        <filter id="rCenterGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="20" />
        </filter>
        <filter id="rDotGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>

        {/* Gradients */}
        <radialGradient id="rFill" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="rgba(214,185,140,0.16)" />
          <stop offset="55%" stopColor="rgba(61,155,122,0.09)" />
          <stop offset="100%" stopColor="rgba(61,155,122,0.02)" />
        </radialGradient>

        <linearGradient id="rStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4AE3A7" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#D6B98C" stopOpacity="1" />
          <stop offset="100%" stopColor="#4AE3A7" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id="rStrokeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4AE3A7" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#D6B98C" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#4AE3A7" stopOpacity="0.35" />
        </linearGradient>

        <radialGradient id="rCenterOrb">
          <stop offset="0%" stopColor={avgColor} stopOpacity="0.14" />
          <stop offset="70%" stopColor={avgColor} stopOpacity="0.03" />
          <stop offset="100%" stopColor={avgColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── LAYER 1: Ambient depth ring ──────────────── */}
      <circle
        cx={CX} cy={CY} r={OUTER_R + 6}
        fill="none"
        stroke="rgba(248,246,242,0.025)"
        strokeWidth={20}
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
              ? 'rgba(248,246,242,0.12)'
              : `rgba(248,246,242,${0.02 + level * 0.018})`
            }
            strokeWidth={isOuter ? 1.2 : 0.5}
            strokeDasharray={isOuter ? 'none' : '2 4'}
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
            stroke={active ? 'rgba(248,246,242,0.10)' : 'rgba(248,246,242,0.025)'}
            strokeWidth={active ? 0.7 : 0.4}
            style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
          />
        )
      })}

      {/* ── LAYER 3: Center orb ──────────────────────── */}
      <circle
        cx={CX} cy={CY} r={55}
        fill="url(#rCenterOrb)"
        style={{
          opacity: mounted ? 1 : 0,
          transition: 'opacity 1s ease-out 0.5s',
        }}
      />

      {/* ── LAYER 4: Data polygon ────────────────────── */}
      <g
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: mounted ? 'scale(1)' : 'scale(0)',
          transition: 'transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Glow behind stroke */}
        <polygon
          points={dataPoints}
          fill="none"
          stroke="url(#rStrokeGlow)"
          strokeWidth={7}
          strokeLinejoin="round"
          filter="url(#rGlowSoft)"
          opacity={0.55}
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
          strokeWidth={1.8}
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {scores.map((s, i) => {
          const r = (Math.max(0, Math.min(100, s.score)) / 100) * OUTER_R
          const [x, y] = polar(i, n, r)
          const dotColor = scoreColor(s.score)
          const active = hovered === i
          const dotR = active ? 6.5 : 4

          return (
            <g key={`dot-${s.key}`}>
              <circle
                cx={x} cy={y}
                r={active ? 14 : 8}
                fill={dotColor}
                filter="url(#rDotGlow)"
                opacity={active ? 0.5 : 0.18}
                style={{ transition: 'opacity 0.3s' }}
              />
              <circle
                cx={x} cy={y}
                r={dotR}
                fill={dotColor}
                stroke="rgba(10,10,15,0.65)"
                strokeWidth={1.5}
                style={{ transition: 'r 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}
              />
              <circle
                cx={x} cy={y} r={20}
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
        const dy = sin > 0.3 ? 15 : sin < -0.3 ? -7 : 4
        const shortLabel = SHORT_LABELS[s.key] ?? s.label

        const active = hovered === i
        const strong = s.score >= 70
        const weak = s.score < 45

        const labelFill = active
          ? scoreColor(s.score)
          : strong
            ? 'rgba(248,246,242,0.62)'
            : weak
              ? 'rgba(248,246,242,0.26)'
              : 'rgba(248,246,242,0.40)'

        return (
          <g key={`lbl-${s.key}`}>
            <text
              x={lx}
              y={ly + dy}
              textAnchor={textAnchor}
              fill={labelFill}
              style={{
                fontSize: active ? '11.5px' : '10.5px',
                fontFamily: 'var(--font-body, system-ui)',
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
              y={ly + dy + 14}
              textAnchor={textAnchor}
              fill={scoreColor(s.score)}
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 500,
                opacity: active ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              {s.score}/100
            </text>
          </g>
        )
      })}

      {/* ── LAYER 6: Center score ────────────────────── */}
      <g style={{
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.9s ease-out 0.8s',
      }}>
        {/* Subtle glow ring */}
        <circle
          cx={CX} cy={CY} r={38}
          fill="none"
          stroke={avgColor}
          strokeWidth={0.5}
          opacity={0.2}
          filter="url(#rCenterGlow)"
        />

        {/* Score */}
        <text
          x={CX}
          y={CY - 5}
          textAnchor="middle"
          dominantBaseline="central"
          fill={avgColor}
          style={{
            fontSize: '40px',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 300,
            letterSpacing: '-0.02em',
          }}
        >
          {avg}
        </text>

        {/* Label */}
        <text
          x={CX}
          y={CY + 24}
          textAnchor="middle"
          fill="rgba(248,246,242,0.32)"
          style={{
            fontSize: '8.5px',
            fontFamily: 'var(--font-body, system-ui)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase' as const,
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

// ─── Insight Row ──────────────────────────────────────────────

function InsightRow({ item, idx, variant }: {
  item: RadarDataPoint
  idx: number
  variant: 'strong' | 'improve'
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), idx * 60 + 100)
    return () => clearTimeout(t)
  }, [idx])

  const color = scoreColor(item.score)
  const grade = scoreGrade(item.score)
  const gradFill = item.score >= 75
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
      className="relative rounded-[14px] border border-[rgba(214,185,140,0.07)] bg-[rgba(14,11,9,0.5)] overflow-hidden"
      style={{ animation: `cardEntrance 0.45s ease-out ${idx * 55}ms both` }}
    >
      {/* Left accent */}
      <div
        className="absolute left-0 inset-y-0 w-[3px] rounded-l-[14px]"
        style={{ background: gradFill }}
      />

      <div className="pl-5 pr-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <span className="font-body text-[13px] font-medium text-[#F8F6F2] leading-snug">
              {item.label}
            </span>
            <span
              className="font-body text-[7.5px] tracking-[0.12em] uppercase px-2 py-[3px] rounded-full border"
              style={{
                color,
                backgroundColor: `${color}0C`,
                borderColor: `${color}22`,
              }}
            >
              {grade}
            </span>
          </div>
          <span
            className="font-mono text-[20px] font-light leading-none tabular-nums"
            style={{ color }}
          >
            {item.score}
          </span>
        </div>

        {/* Insight */}
        <p className="font-body text-[11.5px] text-[rgba(248,246,242,0.38)] leading-relaxed mb-3">
          {insight}
        </p>

        {/* Score bar */}
        <div className="h-[2.5px] rounded-full bg-[rgba(248,246,242,0.04)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: mounted ? `${item.score}%` : '0%',
              background: gradFill,
              boxShadow: `0 0 8px ${color}35`,
              transition: 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
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

  const { strongest, improvement } = useMemo(() => {
    const clamped = scores.map(s => ({
      ...s,
      score: Math.max(0, Math.min(100, s.score)),
    }))
    const sorted = [...clamped].sort((a, b) => b.score - a.score)
    return {
      strongest: sorted.slice(0, 3),
      improvement: sorted.slice(-3).reverse(),
    }
  }, [scores])

  if (!scores || scores.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      {/* ── Radar Chart Card ──────────────────────────── */}
      <div
        className="glass-strong rounded-[20px] p-6 sm:p-8"
        style={{ animation: 'cardEntrance 0.5s ease-out 0.1s both' }}
      >
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(214,185,140,0.08)', border: '1px solid rgba(214,185,140,0.12)' }}>
                <svg className="w-3.5 h-3.5 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
              </div>
              <div>
                <p className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(248,246,242,0.45)]">
                  Estetik Analiz Haritası
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full" style={{ background: 'rgba(214,185,140,0.05)', border: '1px solid rgba(214,185,140,0.10)' }}>
              <span className="font-body text-[9px] tracking-[0.12em] uppercase text-[rgba(248,246,242,0.30)]">
                11 Bölge
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="w-full max-w-[500px] mx-auto">
            <RadarSVG scores={scores} hovered={hovered} onHover={handleHover} />
          </div>

          {/* Quality caveat */}
          {captureQuality && captureQuality !== 'high' && (
            <div className="rounded-[10px] p-3" style={{ background: 'rgba(214,185,140,0.03)', border: '1px solid rgba(214,185,140,0.08)' }}>
              <p className="font-body text-[10px] text-[rgba(248,246,242,0.28)] leading-relaxed italic">
                {captureQuality === 'low'
                  ? 'Bu değerlendirme mevcut görüntü kalitesine göre yaklaşık olarak oluşturulmuştur. Daha dengeli ışıkta tekrar analiz yapılması sonuç güvenini artırabilir.'
                  : 'Görüntü kalitesi orta düzeydedir. Sonuçlar genel yönelimi yansıtmakta olup kesin değerlendirme doktor muayenesi gerektirir.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Insight Panels ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* En Güçlü Alanlar */}
        <div
          className="glass-strong rounded-[20px] p-6"
          style={{ animation: 'cardEntrance 0.5s ease-out 0.2s both' }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(74,227,167,0.08)', border: '1px solid rgba(74,227,167,0.15)' }}>
                <svg className="w-3 h-3 text-[#4AE3A7]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </div>
              <p className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(74,227,167,0.65)]">
                En Güçlü Alanlar
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {strongest.map((item, idx) => (
                <InsightRow key={item.key} item={item} idx={idx} variant="strong" />
              ))}
            </div>
          </div>
        </div>

        {/* İyileştirme Potansiyeli */}
        <div
          className="glass-strong rounded-[20px] p-6"
          style={{ animation: 'cardEntrance 0.5s ease-out 0.3s both' }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(196,122,122,0.08)', border: '1px solid rgba(196,122,122,0.15)' }}>
                <svg className="w-3 h-3 text-[#C47A7A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <p className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(196,122,122,0.65)]">
                İyileştirme Potansiyeli
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
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
          className="rounded-[14px] p-4"
          style={{
            background: 'rgba(214,185,140,0.025)',
            border: '1px solid rgba(214,185,140,0.07)',
            animation: 'cardEntrance 0.5s ease-out 0.4s both',
          }}
        >
          <p className="font-body text-[12px] text-[rgba(248,246,242,0.42)] leading-relaxed">
            {summaryText}
          </p>
          <p className="font-body text-[10px] text-[rgba(248,246,242,0.22)] leading-relaxed mt-2 italic">
            Bu analiz AI destekli ön değerlendirme niteliğindedir. Kesin sonuçlar klinik muayene gerektirir.
          </p>
        </div>
      )}
    </div>
  )
}
