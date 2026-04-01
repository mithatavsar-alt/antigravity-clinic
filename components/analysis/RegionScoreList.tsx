'use client'

import { useMemo } from 'react'
import type { ShowcaseRegion } from './InteractiveRadarChart'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  regions: ShowcaseRegion[]
  currentIndex: number
  locked: boolean
  onSelect: (index: number) => void
  onReset: () => void
}

// ─── Helpers ──────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 70) return '#4AE3A7'
  if (s >= 40) return '#D6B98C'
  return '#C47A7A'
}

// ─── Component ────────────────────────────────────────────────

export default function RegionScoreList({ regions, currentIndex, locked, onSelect, onReset }: Props) {
  const sorted = useMemo(() =>
    regions.map((r, i) => ({ ...r, idx: i })).sort((a, b) => b.score - a.score),
    [regions],
  )

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((item) => {
        const active = currentIndex === item.idx
        const c = scoreColor(item.score)

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.idx)}
            className="group relative flex items-center justify-between w-full text-left rounded-[12px] px-4 py-3 transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-[rgba(214,185,140,0.30)]"
            style={{
              background: active
                ? 'rgba(214,185,140,0.04)'
                : 'transparent',
              border: active
                ? '1px solid rgba(214,185,140,0.12)'
                : '1px solid transparent',
              boxShadow: active
                ? '0 0 20px rgba(214,185,140,0.04), inset 0 0 12px rgba(214,185,140,0.02)'
                : 'none',
            }}
            aria-label={`${item.label} — ${item.score} puan`}
            aria-pressed={active}
          >
            {/* Left: dot + label */}
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300"
                style={{
                  background: active ? c : 'rgba(248,246,242,0.10)',
                  boxShadow: active ? `0 0 8px ${c}40` : 'none',
                }}
              />
              <span
                className="font-body text-[15px] tracking-[0.01em] truncate transition-colors duration-300"
                style={{
                  color: active ? 'rgba(248,246,242,0.85)' : 'rgba(248,246,242,0.35)',
                  fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
              </span>

              {/* "Seçildi" marker */}
              {active && locked && (
                <span
                  className="font-body text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    color: 'rgba(214,185,140,0.50)',
                    background: 'rgba(214,185,140,0.05)',
                    border: '1px solid rgba(214,185,140,0.08)',
                  }}
                >
                  Seçildi
                </span>
              )}
            </div>

            {/* Right: score */}
            <span
              className="font-mono text-[18px] font-light tabular-nums tracking-tight flex-shrink-0 transition-colors duration-300"
              style={{ color: active ? c : 'rgba(248,246,242,0.20)' }}
            >
              {item.score}
            </span>

            {/* Active left accent */}
            {active && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-full"
                style={{ background: c, boxShadow: `0 0 6px ${c}30` }}
              />
            )}
          </button>
        )
      })}

      {/* Reset button — only when locked */}
      {locked && (
        <button
          onClick={onReset}
          className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-[rgba(214,185,140,0.20)]"
          style={{
            background: 'rgba(214,185,140,0.02)',
            border: '1px solid rgba(214,185,140,0.06)',
          }}
        >
          <svg className="w-3 h-3" style={{ color: 'rgba(214,185,140,0.35)' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          <span
            className="font-body text-[11px] tracking-[0.10em] uppercase"
            style={{ color: 'rgba(214,185,140,0.35)' }}
          >
            Otomatik Analize Dön
          </span>
        </button>
      )}
    </div>
  )
}
