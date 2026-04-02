'use client'

import Link from 'next/link'
import { scoreColor } from '@/lib/ui/score-colors'

// ─── Types ────────────────────────────────────────────────────

export interface RegionInsight {
  title: string
  analysis: string
  info: string
  treatmentLabel: string
  treatmentSlug: string
}

interface Props {
  insight: RegionInsight
  score: number
  /** Used as React key externally to trigger entrance animation */
  regionIndex: number
  /** Optional confidence 0–1 for the region */
  confidence?: number
}

// ─── Helpers ──────────────────────────────────────────────────

function scoreGrade(s: number): string {
  if (s >= 70) return 'Dengeli'
  if (s >= 40) return 'Geliştirilebilir'
  return 'İyileştirme Potansiyeli'
}

// ─── Component ────────────────────────────────────────────────

export default function DynamicInsightPanel({ insight, score, regionIndex, confidence }: Props) {
  const c = scoreColor(score)
  const grade = scoreGrade(score)
  const isLowConfidence = confidence !== undefined && confidence < 0.45

  return (
    <div
      key={regionIndex}
      className="glass-elevated rounded-[20px] sm:rounded-[24px] overflow-hidden"
      style={{
        animation: 'insightPanelFade 0.28s ease-out',
        border: '1px solid rgba(214,185,140,0.06)',
      }}
    >
      <div className="p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-6">

          {/* Left: region marker */}
          <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-2.5 sm:min-w-[60px] flex-shrink-0">
            <div
              className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center"
              style={{
                background: `${c}08`,
                border: `1px solid ${c}18`,
              }}
            >
              {/* Pulsing ring */}
              <span
                className="absolute inset-0 rounded-full animate-radar-dot-pulse"
                style={{ border: `1px solid ${c}15` }}
              />
              {/* Inner dot */}
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: c, boxShadow: `0 0 10px ${c}40` }}
              />
            </div>
            <span
              className="font-mono text-[22px] sm:text-[24px] font-light tabular-nums"
              style={{ color: c }}
            >
              {score}
            </span>
          </div>

          {/* Center: content */}
          <div className="flex-1 min-w-0">
            {/* Title + grade */}
            <div className="flex items-center gap-3 mb-2.5">
              <h3
                className="font-body text-[17px] sm:text-[18px] font-medium leading-snug tracking-[0.01em]"
                style={{ color: 'rgba(248,246,242,0.85)' }}
              >
                {insight.title}
              </h3>
              <span
                className="font-body text-[9px] tracking-[0.14em] uppercase px-2.5 py-[3px] rounded-full border flex-shrink-0"
                style={{
                  color: c,
                  backgroundColor: `${c}0A`,
                  borderColor: `${c}1A`,
                }}
              >
                {grade}
              </span>
            </div>

            {/* Analysis */}
            <p
              className="font-body text-[13px] sm:text-[14px] leading-[1.7] mb-2"
              style={{ color: 'rgba(248,246,242,0.50)' }}
            >
              {insight.analysis}
            </p>

            {/* Info */}
            <p
              className="font-body text-[12px] sm:text-[13px] leading-[1.7]"
              style={{ color: 'rgba(248,246,242,0.30)' }}
            >
              {insight.info}
            </p>

            {/* Low-confidence caveat */}
            {isLowConfidence && (
              <p
                className="font-body text-[10px] leading-[1.5] mt-2 flex items-center gap-1.5"
                style={{ color: 'rgba(200,120,90,0.50)' }}
              >
                <span className="opacity-60">⚠</span>
                Bu bölge için güven düzeyi sınırlıdır; sonuçlar referans niteliğindedir.
              </p>
            )}
          </div>

          {/* Right: CTA */}
          <div className="flex-shrink-0 self-start sm:self-center">
            <Link
              href={insight.treatmentSlug}
              className="inline-flex items-center gap-2 font-body text-[12px] sm:text-[13px] tracking-[0.02em] px-4 sm:px-5 py-2.5 rounded-full transition-all duration-300 group/cta whitespace-nowrap"
              style={{
                color: 'rgba(214,185,140,0.55)',
                background: 'rgba(214,185,140,0.03)',
                border: '1px solid rgba(214,185,140,0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(214,185,140,0.20)'
                e.currentTarget.style.color = 'rgba(214,185,140,0.80)'
                e.currentTarget.style.background = 'rgba(214,185,140,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(214,185,140,0.08)'
                e.currentTarget.style.color = 'rgba(214,185,140,0.55)'
                e.currentTarget.style.background = 'rgba(214,185,140,0.03)'
              }}
            >
              {insight.treatmentLabel}
              <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
