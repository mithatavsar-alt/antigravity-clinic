'use client'

import { scoreColor } from '@/lib/ui/score-colors'

interface AnalysisHeroSummaryProps {
  overallScore?: number
  confidence?: number
  captureQuality?: string
  reliabilityBand?: string
  evidenceCoverage?: number
  suppressionCount?: number
  limitedRegions?: number
  summaryText?: string
  estimatedAge?: number | null
  estimatedGender?: string | null
  recaptureRecommended?: boolean
}

function confidenceLabel(c: number): { label: string; color: string } {
  if (c >= 0.85) return { label: 'Yüksek', color: '#4AE3A7' }
  if (c >= 0.70) return { label: 'İyi', color: '#3D9B7A' }
  if (c >= 0.55) return { label: 'Orta', color: '#D6B98C' }
  if (c >= 0.40) return { label: 'Düşük', color: '#C4883A' }
  return { label: 'Sınırlı', color: '#C47A7A' }
}

function qualityLabel(q?: string): { label: string; color: string } {
  if (q === 'high') return { label: 'Yüksek', color: '#4AE3A7' }
  if (q === 'medium') return { label: 'Orta', color: '#D6B98C' }
  return { label: 'Düşük', color: '#C47A7A' }
}

export function AnalysisHeroSummary({
  overallScore,
  confidence,
  captureQuality,
  reliabilityBand,
  evidenceCoverage,
  suppressionCount,
  limitedRegions,
  summaryText,
  estimatedAge,
  estimatedGender,
  recaptureRecommended,
}: AnalysisHeroSummaryProps) {
  const score = overallScore ?? 0
  const conf = confidence ?? 0
  const confInfo = confidenceLabel(conf)
  const qualInfo = qualityLabel(captureQuality)

  return (
    <div className="rounded-2xl border border-[rgba(248,246,242,0.06)] bg-[rgba(14,11,9,0.6)] backdrop-blur-sm overflow-hidden">
      {/* Top gradient accent */}
      <div className="h-px bg-gradient-to-r from-transparent via-[rgba(214,185,140,0.3)] to-transparent" />

      <div className="p-6 lg:p-8">
        {/* Score + Meta Grid */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
          {/* Main Score */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(248,246,242,0.06)" strokeWidth="4" />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke={scoreColor(score)}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 264} 264`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-[28px] font-light text-[#F8F6F2]">{score}</span>
                <span className="font-body text-[8px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.35)]">skor</span>
              </div>
            </div>
            <p className="font-body text-[10px] tracking-[0.12em] uppercase mt-2" style={{ color: scoreColor(score) }}>
              {score >= 70 ? 'Dengeli' : score >= 40 ? 'İyileştirilebilir' : 'Odaklanılmalı'}
            </p>
          </div>

          {/* Metric Tiles */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <MetricTile label="Güven Seviyesi" value={confInfo.label} color={confInfo.color} sub={`${Math.round(conf * 100)}%`} />
            <MetricTile label="Çekim Kalitesi" value={qualInfo.label} color={qualInfo.color} />
            <MetricTile
              label="Güvenilirlik"
              value={reliabilityBand === 'high' ? 'Yüksek' : reliabilityBand === 'medium' ? 'Orta' : reliabilityBand === 'low' ? 'Düşük' : '—'}
              color={reliabilityBand === 'high' ? '#4AE3A7' : reliabilityBand === 'medium' ? '#D6B98C' : '#C47A7A'}
            />
            {evidenceCoverage != null && (
              <MetricTile label="Kanıt Kapsamı" value={`${Math.round(evidenceCoverage * 100)}%`} color={evidenceCoverage >= 0.7 ? '#4AE3A7' : '#D6B98C'} />
            )}
            {estimatedAge != null && (
              <MetricTile label="Tahmini Yaş" value={`${estimatedAge}`} color="rgba(248,246,242,0.6)" />
            )}
            {estimatedGender && (
              <MetricTile label="Cinsiyet" value={estimatedGender === 'female' ? 'Kadın' : estimatedGender === 'male' ? 'Erkek' : estimatedGender} color="rgba(248,246,242,0.6)" />
            )}
            {(suppressionCount ?? 0) > 0 && (
              <MetricTile label="Bastırılan Bölge" value={`${suppressionCount}`} color="#C4883A" />
            )}
            {(limitedRegions ?? 0) > 0 && (
              <MetricTile label="Sınırlı Bölge" value={`${limitedRegions}`} color="#C4883A" />
            )}
          </div>
        </div>

        {/* Summary + Warnings */}
        {(summaryText || recaptureRecommended) && (
          <div className="mt-6 pt-5 border-t border-[rgba(248,246,242,0.04)]">
            {summaryText && (
              <p className="font-body text-[13px] text-[rgba(248,246,242,0.55)] leading-relaxed">{summaryText}</p>
            )}
            {recaptureRecommended && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(196,136,58,0.08)] border border-[rgba(196,136,58,0.15)]">
                <svg className="w-3.5 h-3.5 text-[#C4883A] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span className="font-body text-[11px] text-[#C4883A]">Yeniden çekim önerilir — analiz güvenilirliği düşük</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricTile({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[rgba(248,246,242,0.02)] border border-[rgba(248,246,242,0.04)] px-3.5 py-3">
      <p className="font-body text-[9px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.3)] mb-1.5">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[16px] font-light" style={{ color }}>{value}</span>
        {sub && <span className="font-mono text-[10px] text-[rgba(248,246,242,0.25)]">{sub}</span>}
      </div>
    </div>
  )
}
