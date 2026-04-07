'use client'

import { useState, useEffect, useRef } from 'react'
import { scoreColor } from '@/lib/ui/score-colors'

// ─── Types ────────────────────────────────────────────────────

export interface ShowcaseRegion {
  id: string
  label: string
  score: number
  confidence?: number
  status?: 'high' | 'medium' | 'low' | 'suppressed'
  sourceView?: string
}

interface Props {
  regions: ShowcaseRegion[]
  currentIndex: number
  onSelect: (index: number) => void
  variant?: 'dark' | 'light'
}

// ─── Proportional sizing ──────────────────────────────────────

const VB = 500
const CX = VB / 2
const CY = VB / 2
const R = VB * 0.34
const LABEL_R = R + VB * 0.155       // pushed out (was 0.13) for label breathing room
const DOT_R = VB * 0.009
const DOT_R_ACTIVE = VB * 0.014
const STROKE_W = VB * 0.003
const LABEL_FONT = VB * 0.034        // slightly smaller (was 0.036) for long labels
const LABEL_FONT_ACTIVE = VB * 0.040 // slightly smaller (was 0.042) for long labels
const LEVELS = [0.25, 0.5, 0.75, 1.0]
const MIN_VISUAL_PCT = 0.30

// Extra padding around the VB so perimeter labels + active scores are never clipped
const VB_PAD = 50

// ─── Geometry ─────────────────────────────────────────────────

function polar(i: number, n: number, r: number): [number, number] {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function polyPts(n: number, r: number): string {
  return Array.from({ length: n }, (_, i) => polar(i, n, r).join(',')).join(' ')
}

function vis(score: number): number {
  const c = Math.max(0, Math.min(100, score)) / 100
  return (MIN_VISUAL_PCT + c * (1 - MIN_VISUAL_PCT)) * R
}

// ─── Animated count hook ──────────────────────────────────────

function useAnimatedNumber(target: number, duration = 600): number {
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
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round(startVal.current + (target - startVal.current) * eased)
      setDisplay(value)
      if (progress < 1) raf.current = requestAnimationFrame(animate)
    }

    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration]) // eslint-disable-line react-hooks/exhaustive-deps -- display intentionally excluded to avoid infinite loop

  return display
}

// ─── Component ────────────────────────────────────────────────

export default function InteractiveRadarChart({ regions, currentIndex, onSelect, variant = 'dark' }: Props) {
  const [mounted, setMounted] = useState(false)
  const [prevIndex, setPrevIndex] = useState(currentIndex)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200)
    return () => clearTimeout(t)
  }, [])

  // Track previous index for subtitle crossfade
  useEffect(() => {
    const t = setTimeout(() => setPrevIndex(currentIndex), 20)
    return () => clearTimeout(t)
  }, [currentIndex])

  const n = regions.length
  const currentRegion = regions[currentIndex]
  const centerScore = useAnimatedNumber(currentRegion?.score ?? 0, 600)
  const centerColor = scoreColor(currentRegion?.score ?? 50)
  const palette =
    variant === 'light'
      ? {
          gridOuter: 'rgba(26,26,46,0.10)',
          gridInner: 'rgba(26,26,46,0.05)',
          axis: 'rgba(26,26,46,0.04)',
          fillStart: 'rgba(196,163,90,0.16)',
          fillMid: 'rgba(45,95,93,0.08)',
          fillEnd: 'rgba(45,95,93,0)',
          strokeStart: '#2D5F5D',
          strokeMid: '#C4A35A',
          strokeEnd: '#2D5F5D',
          dotStroke: 'rgba(255,255,255,0.92)',
          label: 'rgba(26,26,46,0.64)',
          labelMuted: 'rgba(26,26,46,0.42)',
          labelSuppressed: 'rgba(26,26,46,0.30)',
          activeScoreSuppressed: 'rgba(26,26,46,0.26)',
          centerLabel: 'rgba(26,26,46,0.32)',
        }
      : {
          gridOuter: 'rgba(248,246,242,0.07)',
          gridInner: 'rgba(248,246,242,0.03)',
          axis: 'rgba(248,246,242,0.015)',
          fillStart: 'rgba(214,185,140,0.12)',
          fillMid: 'rgba(61,155,122,0.06)',
          fillEnd: 'rgba(61,155,122,0)',
          strokeStart: '#4AE3A7',
          strokeMid: '#D6B98C',
          strokeEnd: '#4AE3A7',
          dotStroke: 'rgba(10,8,6,0.6)',
          label: 'rgba(248,246,242,0.58)',
          labelMuted: 'rgba(248,246,242,0.42)',
          labelSuppressed: 'rgba(248,246,242,0.30)',
          activeScoreSuppressed: 'rgba(248,246,242,0.22)',
          centerLabel: 'rgba(248,246,242,0.28)',
        }

  if (n === 0) return null

  const dataPts = regions.map((r, i) => polar(i, n, vis(r.score)).join(',')).join(' ')

  return (
    <svg
      viewBox={`${-VB_PAD} ${-VB_PAD} ${VB + VB_PAD * 2} ${VB + VB_PAD * 2}`}
      className="w-full h-auto"
      style={{ overflow: 'visible' }}
      role="img"
      aria-label="İnteraktif yüz analizi radar grafiği"
    >
      <defs>
        <filter id="irGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>
        <filter id="irDotGlow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>
        <filter id="irPulseGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
        </filter>
        <filter id="irCenterGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>

        <radialGradient id="irFill" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor={palette.fillStart} />
          <stop offset="50%" stopColor={palette.fillMid} />
          <stop offset="100%" stopColor={palette.fillEnd} />
        </radialGradient>

        <linearGradient id="irStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.strokeStart} stopOpacity="0.75" />
          <stop offset="50%" stopColor={palette.strokeMid} stopOpacity="0.85" />
          <stop offset="100%" stopColor={palette.strokeEnd} stopOpacity="0.75" />
        </linearGradient>

        <radialGradient id="irOrb">
          <stop offset="0%" stopColor={centerColor} stopOpacity="0.12" />
          <stop offset="60%" stopColor={centerColor} stopOpacity="0.03" />
          <stop offset="100%" stopColor={centerColor} stopOpacity="0" />
        </radialGradient>

        {/* Active axis highlight gradient */}
        {regions.map((r, i) => {
          const c = scoreColor(r.score)
          return (
            <linearGradient key={`axGrad-${i}`} id={`axGrad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={c} stopOpacity="0" />
              <stop offset="100%" stopColor={c} stopOpacity="0.15" />
            </linearGradient>
          )
        })}
      </defs>

      {/* ── Grid ───────────────────────────────────────── */}
      {LEVELS.map((lv) => (
        <polygon
          key={lv}
          points={polyPts(n, R * lv)}
          fill="none"
          stroke={lv === 1 ? palette.gridOuter : palette.gridInner}
          strokeWidth={lv === 1 ? 0.8 : 0.35}
          strokeDasharray={lv === 1 ? 'none' : '2 5'}
        />
      ))}

      {/* ── Radial axes ────────────────────────────────── */}
      {regions.map((_, i) => {
        const [ox, oy] = polar(i, n, R)
        const active = currentIndex === i
        return (
          <line
            key={`ax-${i}`}
            x1={CX} y1={CY} x2={ox} y2={oy}
            stroke={active ? `url(#axGrad-${i})` : palette.axis}
            strokeWidth={active ? 0.7 : 0.35}
            style={{ transition: 'stroke-width 0.4s, stroke 0.4s' }}
          />
        )
      })}

      {/* ── Center orb (dynamic color) ─────────────────── */}
      <circle
        cx={CX} cy={CY} r={R * 0.30}
        fill="url(#irOrb)"
        style={{
          opacity: mounted ? 1 : 0,
          transition: 'opacity 1s ease-out 0.5s',
        }}
      />

      {/* ── Data polygon with breathing ────────────────── */}
      <g
        className="animate-polygon-breathe"
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: mounted ? 'scale(1)' : 'scale(0)',
          transition: 'transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Glow behind stroke */}
        <polygon
          points={dataPts} fill="none" stroke="url(#irStroke)"
          strokeWidth={STROKE_W * 3} strokeLinejoin="round"
          filter="url(#irGlow)"
          className="animate-polygon-glow"
        />
        {/* Fill */}
        <polygon points={dataPts} fill="url(#irFill)" stroke="none" />
        {/* Crisp edge */}
        <polygon
          points={dataPts} fill="none" stroke="url(#irStroke)"
          strokeWidth={STROKE_W} strokeLinejoin="round"
        />

        {/* Interactive dots */}
        {regions.map((r, i) => {
          const [x, y] = polar(i, n, vis(r.score))
          const c = r.status === 'suppressed' ? (variant === 'light' ? 'rgba(26,26,46,0.18)' : 'rgba(248,246,242,0.18)') : scoreColor(r.score)
          const active = currentIndex === i
          const dr = active ? DOT_R_ACTIVE : DOT_R
          const suppressed = r.status === 'suppressed'
          const muted = r.status === 'low'

          return (
            <g key={`dot-${i}`}>
              {/* Outer pulse ring (active only) */}
              {active && (
                <circle
                  cx={x} cy={y} r={dr * 4.5}
                  fill="none"
                  stroke={c}
                  strokeWidth={0.5}
                  className="animate-radar-dot-pulse"
                />
              )}
              {/* Soft glow (active only) */}
              {active && (
                <circle
                  cx={x} cy={y} r={dr * 3}
                  fill={c} filter="url(#irPulseGlow)"
                  className="animate-radar-glow-pulse"
                />
              )}
              {/* Static glow */}
              <circle
                cx={x} cy={y} r={dr * 2.5}
                fill={c} filter="url(#irDotGlow)"
                opacity={suppressed ? 0.08 : active ? 0.50 : muted ? 0.16 : 0.10}
                style={{ transition: 'opacity 0.4s ease-out' }}
              />
              {/* Core dot */}
              <circle
                cx={x} cy={y} r={dr}
                fill={c}
                stroke={palette.dotStroke}
                strokeWidth={STROKE_W * 0.8}
                opacity={suppressed ? 0.35 : muted ? 0.72 : 1}
                style={{ transition: 'r 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
              />
              {/* Hit area */}
              <circle
                cx={x} cy={y} r={VB * 0.05}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i) } }}
                tabIndex={0}
                role="button"
                aria-label={`${r.label} — ${r.score} puan`}
              />
            </g>
          )
        })}
      </g>

      {/* ── Labels (with active lift + multi-word wrapping) ── */}
      {regions.map((r, i) => {
        const [lx, ly] = polar(i, n, LABEL_R)
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const anchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle'
        // Increased spacing for top/bottom to prevent clipping
        const dy = sin > 0.3 ? 6 : sin < -0.3 ? -4 : 3
        const active = currentIndex === i
        const lift = active ? -2 : 0
        const suppressed = r.status === 'suppressed'
        const muted = r.status === 'low'

        // Split multi-word labels into lines for clean wrapping
        const words = r.label.split(' ')
        const isMultiWord = words.length > 1
        const lineHeight = (active ? LABEL_FONT_ACTIVE : LABEL_FONT) * 1.25

        return (
          <g key={`lbl-${i}`} style={{ cursor: 'pointer' }} onClick={() => onSelect(i)}>
            <text
              x={lx} y={ly + dy + lift + (isMultiWord && sin < -0.3 ? -lineHeight * 0.4 : 0)}
              textAnchor={anchor}
              fill={
                suppressed
                  ? palette.labelSuppressed
                  : active
                    ? scoreColor(r.score)
                    : muted
                      ? palette.labelMuted
                      : palette.label
              }
              style={{
                fontSize: `${active ? LABEL_FONT_ACTIVE : LABEL_FONT}px`,
                fontFamily: "'Outfit', system-ui, sans-serif",
                letterSpacing: active ? '0.06em' : '0.04em',
                fontWeight: active ? 600 : 500,
                transition: 'fill 0.35s, font-size 0.25s, font-weight 0.35s',
              }}
            >
              {isMultiWord ? (
                words.map((word, wi) => (
                  <tspan
                    key={wi}
                    x={lx}
                    dy={wi === 0 ? 0 : lineHeight}
                  >
                    {word}
                  </tspan>
                ))
              ) : (
                r.label
              )}
            </text>
            {/* Score on active */}
            <text
              x={lx} y={ly + dy + (isMultiWord ? lineHeight + 10 : 16) + lift + (isMultiWord && sin < -0.3 ? -lineHeight * 0.4 : 0)}
              textAnchor={anchor}
              fill={suppressed ? palette.activeScoreSuppressed : scoreColor(r.score)}
              style={{
                fontSize: `${VB * 0.026}px`,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 400,
                opacity: active ? (suppressed ? 0.55 : 0.8) : 0,
                transition: 'opacity 0.3s ease-out',
              }}
            >
              {suppressed ? 'YOK' : `${r.score}/100`}
            </text>
          </g>
        )
      })}

      {/* ── Center: animated score + dynamic subtitle ───── */}
      <g style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.9s ease-out 0.8s' }}>
        {/* Subtle ring — color follows active region */}
        <circle
          cx={CX} cy={CY} r={R * 0.24}
          fill="none" stroke={centerColor} strokeWidth={0.5} opacity={0.08}
          style={{ transition: 'stroke 0.5s ease-out' }}
        />
        {/* Soft center glow */}
        <text
          x={CX} y={CY - VB * 0.020}
          textAnchor="middle" dominantBaseline="central"
          fill={centerColor}
          filter="url(#irCenterGlow)"
          style={{
            fontSize: `${VB * 0.14}px`,
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            opacity: 0.25,
            transition: 'fill 0.5s ease-out',
          }}
        >
          {currentRegion?.status === 'suppressed' ? '—' : centerScore}
        </text>
        {/* Crisp score number */}
        <text
          x={CX} y={CY - VB * 0.020}
          textAnchor="middle" dominantBaseline="central"
          fill={centerColor}
          style={{
            fontSize: `${VB * 0.14}px`,
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            letterSpacing: '-0.03em',
            transition: 'fill 0.5s ease-out',
          }}
        >
          {currentRegion?.status === 'suppressed' ? '—' : centerScore}
        </text>

        {/* Dynamic subtitle — region name or "Genel Denge" */}
        <g>
          {/* Outgoing label (prevIndex — fades out) */}
          {prevIndex !== currentIndex && regions[prevIndex] && (
            <text
              x={CX} y={CY + VB * 0.062}
              textAnchor="middle"
              fill={palette.centerLabel}
              style={{
                fontSize: `${VB * 0.024}px`,
                fontFamily: "'Outfit', system-ui, sans-serif",
                letterSpacing: '0.20em',
                textTransform: 'uppercase' as const,
                fontWeight: 500,
                animation: 'centerLabelOut 0.25s ease-in forwards',
              }}
            >
              {regions[prevIndex].label.toUpperCase()}
            </text>
          )}
          {/* Incoming label (currentIndex — fades in) */}
          <text
            key={currentIndex}
            x={CX} y={CY + VB * 0.062}
            textAnchor="middle"
            fill={palette.centerLabel}
            style={{
              fontSize: `${VB * 0.024}px`,
              fontFamily: "'Outfit', system-ui, sans-serif",
              letterSpacing: '0.20em',
              textTransform: 'uppercase' as const,
              fontWeight: 500,
              animation: 'centerLabelIn 0.35s ease-out 0.1s both',
            }}
          >
              {(currentRegion?.status === 'suppressed'
                ? 'DEGERLENDIRILMEDI'
                : currentRegion?.label.toUpperCase()) ?? 'GENEL DENGE'}
            </text>
        </g>
      </g>
    </svg>
  )
}
