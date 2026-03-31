'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { REGION_INSIGHTS } from '@/data/treatments'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

// ─── Demo data ──────────────────────────────────────────────

const AREAS = [
  { key: 'goz_alti', label: 'Göz Altı', score: 71 },
  { key: 'nazolabial', label: 'Nazolabial', score: 67 },
  { key: 'kaz_ayagi', label: 'Kaz Ayağı', score: 63 },
  { key: 'yanak', label: 'Yanak', score: 58 },
  { key: 'alin', label: 'Alın', score: 42 },
  { key: 'dudak', label: 'Dudak', score: 49 },
] as const

const N = AREAS.length
const CENTER_SCORE = Math.round(AREAS.reduce((s, d) => s + d.score, 0) / N)

// ─── SVG geometry ───────────────────────────────────────────

const VB = 500
const CX = VB / 2
const CY = VB / 2
const R = 170

function ang(i: number) {
  return (Math.PI * 2 * i) / N - Math.PI / 2
}

function pol(a: number, r: number): [number, number] {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function hexPath(radius: number) {
  return Array.from({ length: N }, (_, i) => {
    const [x, y] = pol(ang(i), radius)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z'
}

function scoreColor(s: number) {
  if (s < 40) return '#3D9B7A'
  if (s < 70) return '#C4A35A'
  return '#A05252'
}

// Pre-computed label positioning per vertex
const LABEL_META: { anchor: 'start' | 'middle' | 'end'; dy: number }[] = [
  { anchor: 'middle', dy: -8 },  // top
  { anchor: 'start', dy: 0 },    // upper-right
  { anchor: 'start', dy: 8 },    // lower-right
  { anchor: 'middle', dy: 14 },  // bottom
  { anchor: 'end', dy: 8 },      // lower-left
  { anchor: 'end', dy: 0 },      // upper-left
]

// ─── InsightPanel ───────────────────────────────────────────

function InsightPanel({ regionKey, color }: { regionKey: string; color: string }) {
  const insight = REGION_INSIGHTS[regionKey]
  if (!insight) return null

  return (
    <div
      className="rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4 transition-all duration-300 bg-[rgba(214,185,140,0.03)] border border-[rgba(214,185,140,0.08)]"
    >
      {/* Color accent */}
      <div className="flex-shrink-0 flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1.5">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="font-body text-[13px] font-medium text-[#F8F6F2]">
          {insight.label}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-2">
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.45)] leading-[1.7]">
          {insight.analysis}
        </p>
        <p className="font-body text-[12px] text-[rgba(248,246,242,0.35)] leading-[1.7] italic">
          {insight.recommendation}
        </p>
      </div>

      {/* Treatment link */}
      <Link
        href={`/treatments/${insight.treatmentSlug}`}
        className="flex-shrink-0 inline-flex items-center gap-1.5 font-body text-[11px] text-[rgba(214,185,140,0.6)] hover:text-[rgba(214,185,140,0.9)] transition-colors duration-200 self-end sm:self-center cursor-pointer"
      >
        {insight.treatmentLabel}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────

export function AIAnalysisPreview() {
  const [active, setActive] = useState(0)
  const [inView, setInView] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCycle = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setActive(p => (p + 1) % N), 2500)
  }, [])

  useEffect(() => {
    if (!inView) return
    startCycle()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [inView, startCycle])

  const handleSelect = (i: number) => {
    setActive(i)
    startCycle()
  }

  // Pre-compute geometry
  const dataPath = AREAS.map((d, i) => {
    const [x, y] = pol(ang(i), R * d.score / 100)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z'

  const dots = AREAS.map((d, i) => {
    const [x, y] = pol(ang(i), R * d.score / 100)
    return { x, y, color: scoreColor(d.score) }
  })

  const labels = AREAS.map((_, i) => {
    const [x, y] = pol(ang(i), R + 28)
    return { x, y, ...LABEL_META[i] }
  })

  const activeArea = AREAS[active]
  const activeColor = scoreColor(activeArea.score)

  return (
    <section
      id="ai-analysis"
      className="theme-dark relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0E0B09 0%, #0B0E10 50%, #0E0B09 100%)' }}
    >
      {/* Ambient glow — shifted right */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 65% 45%, rgba(214,185,140,0.06) 0%, transparent 55%)' }} />

      {/* Left portrait — full section height, hidden on mobile */}
      <div className="absolute left-0 top-0 bottom-0 w-[42%] hidden lg:block">
        <Image
          src="/images/AIAnaliz/AIAnaliz.png"
          alt="AI Yüz Analizi"
          fill
          className="object-cover object-center"
          sizes="42vw"
          priority
        />
        {/* Right-edge gradient fade into dark background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              linear-gradient(90deg, transparent 30%, #0E0B09 90%),
              linear-gradient(180deg, rgba(14,11,9,0.2) 0%, transparent 10%, transparent 90%, rgba(14,11,9,0.2) 100%)
            `,
          }}
        />
        {/* Subtle gold accent along the fade edge */}
        <div
          className="absolute top-0 bottom-0 right-0 w-px pointer-events-none"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(214,185,140,0.06) 50%, transparent)' }}
        />
      </div>

      <div className="relative z-10 py-20 sm:py-28 px-6 sm:px-10">
        <div className="container-main lg:flex lg:justify-end">
          <div className="lg:w-[55%]">
        {/* Section header */}
        <div className="text-center mb-10 sm:mb-14">
          <motion.div
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, ease }}
            viewport={{ once: true }}
            className="flex flex-col items-center gap-4"
          >
            <SectionLabel className="text-techAccent-softPurple">AI Analiz Sistemi</SectionLabel>
            <EditorialHeading as="h2" light>
              <GoldItalic>AI Destekli</GoldItalic> Yüz Analizi
            </EditorialHeading>
          </motion.div>
        </div>

        {/* Chart + List */}
        <motion.div
          whileInView={{ opacity: 1, scale: 1 }}
          initial={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.9, delay: 0.15, ease }}
          viewport={{ once: true }}
          onViewportEnter={() => setInView(true)}
          className="flex flex-col items-center gap-6 lg:gap-10"
        >
          <div className="flex flex-col items-center lg:flex-row lg:justify-center lg:items-center gap-6 lg:gap-14">
            {/* ── Radar chart ── */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-16 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(214,185,140,0.045) 0%, transparent 70%)' }} />

              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-[260px] h-[260px] sm:w-[320px] sm:h-[320px] lg:w-[360px] lg:h-[360px]"
              >
                <svg viewBox={`0 0 ${VB} ${VB}`} className="w-full h-full" role="img" aria-label="AI yüz analizi radar grafiği">
                  <defs>
                    <linearGradient id="hp-rf" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3D9B7A" />
                      <stop offset="50%" stopColor="#C4A35A" />
                      <stop offset="100%" stopColor="#A05252" />
                    </linearGradient>
                    <radialGradient id="hp-cg">
                      <stop offset="0%" stopColor="rgba(214,185,140,0.10)" />
                      <stop offset="100%" stopColor="transparent" />
                    </radialGradient>
                    <filter id="hp-gl">
                      <feGaussianBlur stdDeviation="3.5" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>

                  <circle cx={CX} cy={CY} r={R * 0.55} fill="url(#hp-cg)" />

                  {[0.33, 0.66, 1].map((pct, i) => (
                    <path key={i} d={hexPath(R * pct)} fill="none" stroke="rgba(248,246,242,0.05)" strokeWidth={0.8} />
                  ))}

                  {Array.from({ length: N }, (_, i) => {
                    const [x2, y2] = pol(ang(i), R)
                    return <line key={i} x1={CX} y1={CY} x2={x2} y2={y2} stroke="rgba(248,246,242,0.04)" strokeWidth={0.8} />
                  })}

                  <path d={dataPath} fill="url(#hp-rf)" fillOpacity={0.10} />
                  <path d={dataPath} fill="none" stroke="url(#hp-rf)" strokeWidth={1.5} strokeOpacity={0.35} strokeLinejoin="round" />

                  {dots.map((d, i) => {
                    const isActive = i === active
                    return (
                      <g key={i}>
                        <circle cx={d.x} cy={d.y} r={12} fill={d.color} fillOpacity={0.15} style={{ opacity: isActive ? 1 : 0, transition: 'opacity 300ms ease' }}>
                          <animate attributeName="r" values="10;16;10" dur="2.5s" repeatCount="indefinite" />
                          <animate attributeName="fill-opacity" values="0.15;0.05;0.15" dur="2.5s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={d.x} cy={d.y} r={5} fill={d.color} filter="url(#hp-gl)" style={{ opacity: isActive ? 1 : 0, transition: 'opacity 250ms ease' }} />
                        <circle cx={d.x} cy={d.y} r={3} fill={d.color} style={{ opacity: isActive ? 0 : 0.6, transition: 'opacity 250ms ease' }} />
                      </g>
                    )
                  })}

                  {labels.map((l, i) => (
                    <text
                      key={i}
                      x={l.x}
                      y={l.y + l.dy}
                      textAnchor={l.anchor}
                      dominantBaseline="central"
                      className="font-body"
                      fontSize={11}
                      fill={i === active ? '#F8F6F2' : 'rgba(248,246,242,0.28)'}
                      style={{ transition: 'fill 300ms ease' }}
                    >
                      {AREAS[i].label}
                    </text>
                  ))}

                  <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="central" className="font-display" fontSize={48} fontWeight={300} fill="#F8F6F2">
                    {CENTER_SCORE}
                  </text>
                  <text x={CX} y={CY + 22} textAnchor="middle" dominantBaseline="central" className="font-body" fontSize={9} fill="rgba(214,185,140,0.50)" style={{ letterSpacing: '0.2em' }}>
                    GENEL DENGE
                  </text>
                </svg>
              </motion.div>
            </div>

            {/* ── Side mini list ── */}
            <div className="flex flex-col gap-2 min-w-[200px]">
              <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[rgba(214,185,140,0.45)] mb-1 px-3">
                Bölgesel Skorlar
              </p>

              {AREAS.map((d, i) => {
                const isActive = i === active
                const color = scoreColor(d.score)
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => handleSelect(i)}
                    className="flex items-center justify-between gap-8 py-2 px-3 rounded-lg transition-all duration-300 cursor-pointer text-left"
                    style={{
                      background: isActive ? 'rgba(214,185,140,0.06)' : 'transparent',
                      borderLeft: `2px solid ${isActive ? color : 'transparent'}`,
                    }}
                  >
                    <span className={`font-body text-[12px] transition-colors duration-300 ${isActive ? 'text-[#F8F6F2]' : 'text-[rgba(248,246,242,0.30)]'}`}>
                      {d.label}
                    </span>
                    <span className="font-mono text-[13px] font-medium transition-colors duration-300" style={{ color: isActive ? color : 'rgba(248,246,242,0.20)' }}>
                      {d.score}
                    </span>
                  </button>
                )
              })}

              <div className="mt-2 border-t border-[rgba(248,246,242,0.06)] pt-3 px-3">
                <p className="font-body text-[10px] text-[rgba(248,246,242,0.25)] leading-relaxed italic">
                  Örnek verilerle oluşturulmuştur.<br />
                  Gerçek analiz fotoğraf ve doktor onayı gerektirir.
                </p>
              </div>
            </div>
          </div>

          {/* ── Insight Panel ── */}
          <div className="w-full max-w-2xl">
            <InsightPanel regionKey={activeArea.key} color={activeColor} />
          </div>
        </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
