'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { REGION_INSIGHTS } from '@/lib/data/treatments'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { colors, motion as motionTokens } from '@/lib/design-tokens'

const ease = motionTokens.easing

// ─── Area definition (label + key are static, score is mutable) ─

interface AreaDef {
  key: string
  label: string
}

const AREA_DEFS: AreaDef[] = [
  { key: 'goz_alti', label: 'Göz Altı' },
  { key: 'nazolabial', label: 'Nazolabial' },
  { key: 'kaz_ayagi', label: 'Kaz Ayağı' },
  { key: 'yanak', label: 'Yanak' },
  { key: 'alin', label: 'Alın' },
  { key: 'dudak', label: 'Dudak' },
]

/** Default scores — used as initial state seed */
const DEFAULT_SCORES: Record<string, number> = {
  goz_alti: 71,
  nazolabial: 67,
  kaz_ayagi: 63,
  yanak: 58,
  alin: 42,
  dudak: 49,
}

const N = AREA_DEFS.length

// ─── SVG geometry (static — don't depend on scores) ─────────

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
  if (s < 40) return '#2D5F5D'
  if (s < 70) return '#C4A35A'
  return '#A05252'
}

function scoreGlow(s: number) {
  if (s < 40) return 'rgba(45, 95, 93, 0.25)'
  if (s < 70) return 'rgba(196, 163, 90, 0.25)'
  return 'rgba(160, 82, 82, 0.20)'
}

// Pre-computed label positions (static — only depend on angle + radius)
const LABEL_POSITIONS = AREA_DEFS.map((_, i) => {
  const [x, y] = pol(ang(i), R + 38)
  const meta: { anchor: 'start' | 'middle' | 'end'; dy: number }[] = [
    { anchor: 'middle', dy: -8 },
    { anchor: 'start', dy: 0 },
    { anchor: 'start', dy: 8 },
    { anchor: 'middle', dy: 14 },
    { anchor: 'end', dy: 8 },
    { anchor: 'end', dy: 0 },
  ]
  return { x, y, ...meta[i] }
})

// ─── Derived geometry helpers (score-dependent) ─────────────

function buildDataPath(scores: Record<string, number>): string {
  return AREA_DEFS.map((def, i) => {
    const s = scores[def.key] ?? 0
    const [x, y] = pol(ang(i), R * s / 100)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z'
}

function buildDots(scores: Record<string, number>) {
  return AREA_DEFS.map((def, i) => {
    const s = scores[def.key] ?? 0
    const [x, y] = pol(ang(i), R * s / 100)
    return { x, y, color: scoreColor(s), glow: scoreGlow(s) }
  })
}

function computePathLength(scores: Record<string, number>): number {
  let total = 0
  for (let i = 0; i < N; i++) {
    const s1 = scores[AREA_DEFS[i].key] ?? 0
    const s2 = scores[AREA_DEFS[(i + 1) % N].key] ?? 0
    const [x1, y1] = pol(ang(i), R * s1 / 100)
    const [x2, y2] = pol(ang((i + 1) % N), R * s2 / 100)
    total += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  }
  return total
}

function computeCenterScore(scores: Record<string, number>): number {
  const values = AREA_DEFS.map(def => scores[def.key] ?? 0)
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// ─── Animated number hook ───────────────────────────────────

function useAnimatedNumber(target: number, duration: number, enabled: boolean) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const prevRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const from = prevRef.current
    const delta = target - from
    if (delta === 0) return

    const startTime = performance.now()
    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(from + delta * eased)
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, enabled])

  return display
}

// ─── InsightPanel (light glass) ───────────────────────────

function InsightPanel({ regionKey, score }: { regionKey: string; score: number }) {
  const insight = REGION_INSIGHTS[regionKey]
  if (!insight) return null

  const color = scoreColor(score)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={regionKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.4, ease }}
        className="rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4"
        style={{
          background: 'rgba(255, 255, 255, 0.60)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(196, 163, 90, 0.10)',
          boxShadow: `0 2px 16px ${scoreGlow(score)}`,
        }}
      >
        <div className="flex-shrink-0 flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          <span className="font-body text-[15px] font-medium" style={{ color: colors.text.primary }}>
            {insight.label}
          </span>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <p className="font-body text-[13px] leading-[1.7]" style={{ color: colors.text.secondary }}>
            {insight.analysis}
          </p>
          <p className="font-body text-[13px] leading-[1.7] italic" style={{ color: colors.text.muted }}>
            {insight.recommendation}
          </p>
        </div>
        <Link
          href={`/treatments/${insight.treatmentSlug}`}
          className="flex-shrink-0 inline-flex items-center gap-1.5 font-body text-[12px] transition-colors duration-200 self-end sm:self-center cursor-pointer"
          style={{ color: colors.brand.gold }}
        >
          {insight.treatmentLabel}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Score Card ─────────────────────────────────────────────

function ScoreCard({
  label,
  score,
  isActive,
  onSelect,
  delay,
}: {
  label: string
  score: number
  isActive: boolean
  onSelect: () => void
  delay: number
}) {
  const color = scoreColor(score)
  const glow = scoreGlow(score)

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay, ease }}
      whileHover={{ scale: 1.02 }}
      className="group relative flex items-center justify-between gap-4 py-2 px-3 rounded-lg transition-all duration-500 cursor-pointer text-left w-full"
      style={{
        background: isActive
          ? 'rgba(255, 255, 255, 0.70)'
          : 'rgba(255, 255, 255, 0.30)',
        border: isActive
          ? '1px solid rgba(196, 163, 90, 0.20)'
          : '1px solid rgba(26, 26, 46, 0.04)',
        boxShadow: isActive
          ? `0 4px 20px ${glow}, inset 0 1px 0 rgba(255, 255, 255, 0.8)`
          : 'none',
        backdropFilter: isActive ? 'blur(12px)' : 'none',
      }}
    >
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-500"
        style={{
          height: isActive ? '60%' : '0%',
          background: isActive ? color : 'transparent',
          boxShadow: isActive ? `0 0 8px ${color}` : 'none',
        }}
      />
      <div className="flex items-center gap-3">
        <div
          className="w-1.5 h-1.5 rounded-full transition-all duration-500"
          style={{
            background: isActive ? color : 'rgba(26, 26, 46, 0.15)',
            boxShadow: isActive ? `0 0 10px ${color}` : 'none',
          }}
        />
        <span
          className="font-body text-[14px] transition-all duration-500"
          style={{
            color: isActive ? colors.text.primary : 'rgba(26, 26, 46, 0.35)',
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {label}
        </span>
      </div>
      <span
        className="font-mono text-[15px] font-medium transition-all duration-500 tabular-nums"
        style={{
          color: isActive ? color : 'rgba(26, 26, 46, 0.20)',
          textShadow: isActive ? `0 0 12px ${glow}` : 'none',
        }}
      >
        {score}
      </span>
    </motion.button>
  )
}

// ─── Component ──────────────────────────────────────────────

export function AIAnalysisPreview() {
  // ═══ SINGLE SOURCE OF TRUTH: scores state ═══
  const [scores, setScores] = useState<Record<string, number>>(DEFAULT_SCORES)

  const [active, setActive] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 })
  const [entranceComplete, setEntranceComplete] = useState(false)

  // ═══ ALL DERIVED STATE — computed from scores ═══
  const centerScore = useMemo(() => computeCenterScore(scores), [scores])
  const dataPath = useMemo(() => buildDataPath(scores), [scores])
  const pathLength = useMemo(() => computePathLength(scores), [scores])
  const dots = useMemo(() => buildDots(scores), [scores])

  // Active area derived
  const activeDef = AREA_DEFS[active]
  const activeScore = scores[activeDef.key] ?? 0

  // Center display score: shows active region score (changes on selection)
  // Falls back to global average only on initial entrance
  const centerDisplayTarget = entranceComplete ? activeScore : centerScore
  const displayScore = useAnimatedNumber(centerDisplayTarget, 0.7, entranceComplete)

  // Glow pulse: counter increments on each active change.
  // Framer Motion's `key` prop triggers re-mount → re-plays the animation.
  const [pulseKey, setPulseKey] = useState(0)

  // Entrance sequence
  useEffect(() => {
    if (!isInView) return
    const timer = setTimeout(() => setEntranceComplete(true), 1200)
    return () => clearTimeout(timer)
  }, [isInView])

  const startCycle = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setActive(p => (p + 1) % N)
      setPulseKey(k => k + 1)
    }, 3000)
  }, [])

  useEffect(() => {
    if (!entranceComplete) return
    startCycle()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [entranceComplete, startCycle])

  const handleSelect = useCallback((i: number) => {
    setActive(i)
    setPulseKey(k => k + 1)
    startCycle()
  }, [startCycle])

  /* ── Shared SVG colors for light theme ── */
  const gridStroke = 'rgba(26, 26, 46, 0.12)'
  const axisStroke = 'rgba(26, 26, 46, 0.08)'
  const labelActive = '#1A1A2E'
  const labelInactive = 'rgba(26, 26, 46, 0.55)'
  const centerFill = '#1A1A2E'

  return (
    <section
      ref={sectionRef}
      id="ai-analysis"
      className="analysis-section relative overflow-hidden"
      style={{
        background: 'linear-gradient(172deg, #F5F0E8 0%, #F2EDE4 40%, #EFE9E0 70%, #F5F0E8 100%)',
      }}
    >
      {/* ═══ Atmospheric ambient layers ═══ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 65% 40%, rgba(196, 163, 90, 0.06) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 30% 60%, rgba(139, 127, 168, 0.04) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      {/* ═══ Content ═══ */}
      <div className="relative z-10 py-10 sm:py-14 px-3 sm:px-4 lg:px-6">
        <div className="ai-analysis-inner mx-auto">

          {/* ── Section header ── */}
          <div className="text-center mb-5 sm:mb-6 lg:mb-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2, ease }}
              className="flex flex-col items-center gap-2.5"
            >
              <SectionLabel>AI Analiz Sistemi</SectionLabel>
              <EditorialHeading as="h2">
                <GoldItalic>AI Destekli</GoldItalic> Yüz Analizi
              </EditorialHeading>
              <motion.p
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="font-body text-[15px] max-w-sm mx-auto"
                style={{ color: colors.text.muted }}
              >
                Yapay zeka destekli analiz sistemi, yüz yapınızı detaylı olarak değerlendirir.
              </motion.p>
            </motion.div>
          </div>

          {/* ── Mobile portrait (visible below lg) ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="lg:hidden relative w-full h-36 sm:h-44 rounded-xl overflow-hidden mb-4"
          >
            <Image
              src="/images/AIAnaliz/AIAnaliz.png"
              alt="AI Yüz Analizi"
              fill
              className="object-cover object-top brightness-[1.06] contrast-[1.02] saturate-[1.05]"
              sizes="(max-width: 1024px) 100vw, 0px"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, transparent 50%, rgba(245, 240, 232, 0.4) 85%, rgba(242, 237, 228, 0.7) 100%)',
              }}
            />
          </motion.div>

          {/* ── Desktop two-column grid ── */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:items-center lg:gap-0">
            {/* Left — Portrait (contained, not absolute) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 1.0, delay: 0.2 }}
              className="ai-analysis-media relative h-[520px] rounded-l-2xl overflow-hidden"
            >
              <Image
                src="/images/AIAnaliz/AIAnaliz.png"
                alt="AI Yüz Analizi"
                fill
                className="object-cover object-center brightness-[1.06] contrast-[1.02] saturate-[1.05]"
                sizes="50vw"
                priority
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent 40%, rgba(245, 240, 232, 0.15) 65%, rgba(242, 237, 228, 0.55) 88%, rgba(239, 233, 224, 0.8) 100%)',
                }}
              />
              <div
                className="absolute top-[10%] bottom-[10%] right-0 w-px pointer-events-none"
                style={{
                  background: 'linear-gradient(180deg, transparent, rgba(196, 163, 90, 0.12) 50%, transparent)',
                }}
              />
            </motion.div>

            {/* Right — Analysis content */}
            <div className="ai-analysis-content">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 1.0, delay: 0.4, ease }}
                className="relative rounded-r-2xl overflow-hidden"
                style={{
                  background: 'rgba(255, 255, 255, 0.50)',
                  border: '1px solid rgba(196, 163, 90, 0.10)',
                  borderLeft: 'none',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  boxShadow: '0 4px 32px rgba(26, 26, 46, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
                }}
              >
                <div
                  className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(196, 163, 90, 0.12), transparent)',
                  }}
                />

                <div className="p-5 lg:p-7">
                  <div className="flex flex-col items-center lg:flex-row lg:justify-center lg:items-center gap-5 lg:gap-8">

                  {/* ════════════════════════════════════════════ */}
                  {/* ── RADAR CHART ── */}
                  {/* ════════════════════════════════════════════ */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="absolute -inset-12 rounded-full pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle, rgba(196, 163, 90, 0.05) 0%, transparent 65%)',
                      }}
                    />

                    <motion.div
                      animate={entranceComplete ? { y: [0, -4, 0] } : {}}
                      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                      className="relative w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] lg:w-[280px] lg:h-[280px]"
                    >
                      <svg
                        viewBox={`0 0 ${VB} ${VB}`}
                        className="w-full h-full"
                        role="img"
                        aria-label="AI yüz analizi radar grafiği"
                      >
                        <defs>
                          <linearGradient id="hp-rf" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#2D5F5D" />
                            <stop offset="50%" stopColor="#C4A35A" />
                            <stop offset="100%" stopColor="#A05252" />
                          </linearGradient>
                          <radialGradient id="hp-cg">
                            <stop offset="0%" stopColor="rgba(196, 163, 90, 0.06)" />
                            <stop offset="100%" stopColor="transparent" />
                          </radialGradient>
                          <filter id="hp-gl" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="4" result="b" />
                            <feMerge>
                              <feMergeNode in="b" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                          <filter id="hp-halo" x="-200%" y="-200%" width="500%" height="500%">
                            <feGaussianBlur stdDeviation="8" result="b" />
                            <feMerge>
                              <feMergeNode in="b" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>

                        <circle cx={CX} cy={CY} r={R * 0.6} fill="url(#hp-cg)" />

                        {/* Grid rings */}
                        {[0.33, 0.66, 1].map((pct, i) => (
                          <motion.path
                            key={i}
                            d={hexPath(R * pct)}
                            fill="none"
                            stroke={gridStroke}
                            strokeWidth={0.8}
                            initial={{ opacity: 0 }}
                            animate={isInView ? { opacity: 1 } : {}}
                            transition={{ duration: 0.6, delay: 0.6 + i * 0.15 }}
                          />
                        ))}

                        {/* Axis lines */}
                        {Array.from({ length: N }, (_, i) => {
                          const [x2, y2] = pol(ang(i), R)
                          return (
                            <motion.line
                              key={i}
                              x1={CX} y1={CY} x2={x2} y2={y2}
                              stroke={axisStroke}
                              strokeWidth={0.8}
                              initial={{ opacity: 0 }}
                              animate={isInView ? { opacity: 1 } : {}}
                              transition={{ duration: 0.4, delay: 0.8 + i * 0.08 }}
                            />
                          )
                        })}

                        {/* ── Data polygon (reactive to scores) ── */}
                        <motion.path
                          d={dataPath}
                          fill="url(#hp-rf)"
                          initial={{ fillOpacity: 0 }}
                          animate={entranceComplete ? { fillOpacity: 0.14 } : {}}
                          transition={{ duration: 1.5, delay: 0.3 }}
                        />
                        <motion.path
                          d={dataPath}
                          fill="none"
                          stroke="url(#hp-rf)"
                          strokeWidth={1.8}
                          strokeLinejoin="round"
                          strokeDasharray={pathLength}
                          initial={{ strokeDashoffset: pathLength, strokeOpacity: 0 }}
                          animate={isInView ? { strokeDashoffset: 0, strokeOpacity: 0.70 } : {}}
                          transition={{ duration: 2.0, delay: 1.0, ease: [0.25, 0.1, 0.25, 1] }}
                        />

                        {/* ── Node dots (reactive positions + colors) ── */}
                        {dots.map((d, i) => {
                          const isActiveNode = i === active
                          return (
                            <g key={AREA_DEFS[i].key}>
                              <circle
                                cx={d.x} cy={d.y} r={20}
                                fill={d.color}
                                fillOpacity={isActiveNode ? 0.14 : 0}
                                filter="url(#hp-halo)"
                                style={{ transition: 'cx 600ms ease, cy 600ms ease, fill-opacity 600ms ease, fill 600ms ease' }}
                              >
                                {isActiveNode && (
                                  <>
                                    <animate attributeName="r" values="16;22;16" dur="3s" repeatCount="indefinite" />
                                    <animate attributeName="fill-opacity" values="0.14;0.06;0.14" dur="3s" repeatCount="indefinite" />
                                  </>
                                )}
                              </circle>
                              <circle
                                cx={d.x} cy={d.y}
                                r={isActiveNode ? 7 : 3.5}
                                fill={d.color}
                                fillOpacity={isActiveNode ? 0.90 : 0.55}
                                filter={isActiveNode ? 'url(#hp-gl)' : undefined}
                                style={{ transition: 'cx 600ms ease, cy 600ms ease, r 500ms ease, fill 500ms ease, fill-opacity 500ms ease' }}
                              />
                              <circle
                                cx={d.x} cy={d.y}
                                r={isActiveNode ? 4 : 2.5}
                                fill={isActiveNode ? '#fff' : d.color}
                                fillOpacity={isActiveNode ? 0.9 : 0.6}
                                style={{ transition: 'cx 600ms ease, cy 600ms ease, r 400ms ease, fill 400ms ease, fill-opacity 400ms ease' }}
                              />
                            </g>
                          )
                        })}

                        {/* ── Vertex labels ── */}
                        {LABEL_POSITIONS.map((l, i) => (
                          <motion.text
                            key={AREA_DEFS[i].key}
                            x={l.x}
                            y={l.y + l.dy}
                            textAnchor={l.anchor}
                            dominantBaseline="central"
                            className="font-body select-none"
                            fontSize={16}
                            fontWeight={i === active ? 600 : 450}
                            fill={i === active ? labelActive : labelInactive}
                            style={{
                              transition: 'fill 500ms ease, font-weight 500ms ease',
                            }}
                            initial={{ opacity: 0 }}
                            animate={isInView ? { opacity: 1 } : {}}
                            transition={{ duration: 0.5, delay: 1.4 + i * 0.08 }}
                          >
                            {AREA_DEFS[i].label}
                          </motion.text>
                        ))}

                        {/* ── Center score ── */}
                        {entranceComplete && pulseKey > 0 && (
                          <motion.circle
                            key={`glow-${pulseKey}`}
                            cx={CX} cy={CY} r={38}
                            fill="none"
                            stroke={scoreColor(activeScore)}
                            strokeWidth={1.5}
                            initial={{ opacity: 0.5, scale: 0.85 }}
                            animate={{ opacity: 0, scale: 1.3 }}
                            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
                            style={{ transformOrigin: `${CX}px ${CY}px` }}
                          />
                        )}
                        <motion.text
                          x={CX} y={CY - 10}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="font-display tabular-nums"
                          fontSize={70}
                          fontWeight={300}
                          fill={centerFill}
                          initial={{ opacity: 0 }}
                          animate={entranceComplete ? { opacity: 1 } : {}}
                          transition={{ duration: 0.8 }}
                        >
                          {displayScore}
                        </motion.text>
                        {entranceComplete && pulseKey > 0 && (
                          <motion.text
                            key={`pulse-${pulseKey}`}
                            x={CX} y={CY - 10}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="font-display tabular-nums"
                            fontSize={70}
                            fontWeight={300}
                            fill={scoreColor(activeScore)}
                            initial={{ opacity: 0.5, scale: 1 }}
                            animate={{ opacity: 0, scale: 1.15 }}
                            transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
                            style={{ transformOrigin: `${CX}px ${CY - 10}px` }}
                          >
                            {displayScore}
                          </motion.text>
                        )}
                        <AnimatePresence mode="wait">
                          <motion.text
                            key={activeDef.key}
                            x={CX} y={CY + 26}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="font-body"
                            fontSize={13}
                            fill="rgba(196, 163, 90, 0.75)"
                            style={{ letterSpacing: '0.18em' }}
                            initial={{ opacity: 0, y: CY + 30 }}
                            animate={{ opacity: 1, y: CY + 26 }}
                            exit={{ opacity: 0, y: CY + 22 }}
                            transition={{ duration: 0.3, ease }}
                          >
                            {activeDef.label.toUpperCase()}
                          </motion.text>
                        </AnimatePresence>
                      </svg>
                    </motion.div>
                  </div>

                  {/* ════════════════════════════════════════════ */}
                  {/* ── SCORE CARDS (reactive to scores state) ── */}
                  {/* ════════════════════════════════════════════ */}
                  <div className="flex flex-col gap-1 min-w-[180px] lg:min-w-[220px]">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={isInView ? { opacity: 1 } : {}}
                      transition={{ duration: 0.6, delay: 1.0 }}
                      className="font-body text-[12px] tracking-[0.18em] uppercase mb-1 px-3"
                      style={{ color: 'rgba(196, 163, 90, 0.75)' }}
                    >
                      Bölgesel Skorlar
                    </motion.p>

                    {AREA_DEFS.map((def, i) => (
                      <ScoreCard
                        key={def.key}
                        label={def.label}
                        score={scores[def.key] ?? 0}
                        isActive={i === active}
                        onSelect={() => handleSelect(i)}
                        delay={1.2 + i * 0.1}
                      />
                    ))}

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={isInView ? { opacity: 1 } : {}}
                      transition={{ duration: 0.6, delay: 2.0 }}
                      className="mt-2 border-t pt-2 px-3"
                      style={{ borderColor: 'rgba(26, 26, 46, 0.08)' }}
                    >
                      <p
                        className="font-body text-[12px] leading-relaxed italic"
                        style={{ color: 'rgba(26, 26, 46, 0.45)' }}
                      >
                        Örnek verilerle oluşturulmuştur.<br />
                        Gerçek analiz fotoğraf ve doktor onayı gerektirir.
                      </p>
                    </motion.div>
                  </div>
                </div>

                {/* ── Insight Panel ── */}
                <div className="w-full mx-auto mt-3">
                  <InsightPanel regionKey={activeDef.key} score={activeScore} />
                </div>
              </div>

              <div
                className="absolute bottom-0 left-[15%] right-[15%] h-px pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(196, 163, 90, 0.10), transparent)',
                }}
              />
            </motion.div>
            </div>{/* close ai-analysis-content */}
          </div>{/* close desktop grid */}

          {/* ── Mobile glass container (below lg) ── */}
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 1.0, delay: 0.4, ease }}
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255, 255, 255, 0.50)',
                border: '1px solid rgba(196, 163, 90, 0.10)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                boxShadow: '0 4px 32px rgba(26, 26, 46, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
              }}
            >
              <div className="p-4 sm:p-5">
                <div className="flex flex-col items-center gap-5">
                  {/* Radar chart */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="absolute -inset-10 rounded-full pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle, rgba(196, 163, 90, 0.05) 0%, transparent 65%)',
                      }}
                    />
                    <motion.div
                      animate={entranceComplete ? { y: [0, -3, 0] } : {}}
                      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                      className="relative w-[200px] h-[200px] sm:w-[240px] sm:h-[240px]"
                    >
                      <svg
                        viewBox={`0 0 ${VB} ${VB}`}
                        className="w-full h-full"
                        role="img"
                        aria-label="AI yüz analizi radar grafiği"
                      >
                        <defs>
                          <linearGradient id="hp-rf-m" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#2D5F5D" />
                            <stop offset="50%" stopColor="#C4A35A" />
                            <stop offset="100%" stopColor="#A05252" />
                          </linearGradient>
                          <radialGradient id="hp-cg-m">
                            <stop offset="0%" stopColor="rgba(196, 163, 90, 0.06)" />
                            <stop offset="100%" stopColor="transparent" />
                          </radialGradient>
                          <filter id="hp-gl-m" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="4" result="b" />
                            <feMerge>
                              <feMergeNode in="b" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>
                        <circle cx={CX} cy={CY} r={R * 0.6} fill="url(#hp-cg-m)" />
                        {[0.33, 0.66, 1].map((pct, i) => (
                          <path key={i} d={hexPath(R * pct)} fill="none" stroke={gridStroke} strokeWidth={0.8} />
                        ))}
                        {Array.from({ length: N }, (_, i) => {
                          const [x2, y2] = pol(ang(i), R)
                          return <line key={i} x1={CX} y1={CY} x2={x2} y2={y2} stroke={axisStroke} strokeWidth={0.8} />
                        })}
                        <path d={dataPath} fill="url(#hp-rf-m)" fillOpacity={0.14} />
                        <path d={dataPath} fill="none" stroke="url(#hp-rf-m)" strokeWidth={1.8} strokeLinejoin="round" strokeOpacity={0.70} />
                        {dots.map((d, i) => {
                          const isActiveNode = i === active
                          return (
                            <g key={AREA_DEFS[i].key}>
                              <circle cx={d.x} cy={d.y} r={isActiveNode ? 6 : 3} fill={d.color} fillOpacity={isActiveNode ? 0.85 : 0.55} />
                              <circle cx={d.x} cy={d.y} r={isActiveNode ? 3.5 : 2} fill={isActiveNode ? '#fff' : d.color} fillOpacity={isActiveNode ? 0.9 : 0.65} />
                            </g>
                          )
                        })}
                        {LABEL_POSITIONS.map((l, i) => (
                          <text key={AREA_DEFS[i].key} x={l.x} y={l.y + l.dy} textAnchor={l.anchor} dominantBaseline="central" className="font-body select-none" fontSize={14.5} fontWeight={i === active ? 600 : 450} fill={i === active ? labelActive : labelInactive}>
                            {AREA_DEFS[i].label}
                          </text>
                        ))}
                        <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="central" className="font-display tabular-nums" fontSize={62} fontWeight={300} fill={centerFill}>
                          {displayScore}
                        </text>
                        <text x={CX} y={CY + 24} textAnchor="middle" dominantBaseline="central" className="font-body" fontSize={12} fontWeight={500} fill="rgba(196, 163, 90, 0.65)" style={{ letterSpacing: '0.18em' }}>
                          {activeDef.label.toUpperCase()}
                        </text>
                      </svg>
                    </motion.div>
                  </div>

                  {/* Score cards */}
                  <div className="flex flex-col gap-1 w-full">
                    <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1.5 px-3" style={{ color: 'rgba(196, 163, 90, 0.60)' }}>
                      Bölgesel Skorlar
                    </p>
                    {AREA_DEFS.map((def, i) => (
                      <ScoreCard key={def.key} label={def.label} score={scores[def.key] ?? 0} isActive={i === active} onSelect={() => handleSelect(i)} delay={0} />
                    ))}
                  </div>
                </div>

                {/* Insight panel */}
                <div className="w-full mt-3">
                  <InsightPanel regionKey={activeDef.key} score={activeScore} />
                </div>
              </div>
            </motion.div>
          </div>

        </div>{/* close ai-analysis-inner */}
      </div>
    </section>
  )
}
