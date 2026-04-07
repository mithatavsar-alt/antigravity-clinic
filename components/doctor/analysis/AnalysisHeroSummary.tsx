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

function confidenceLabel(value: number): { label: string; color: string } {
  if (value >= 0.85) return { label: 'Yüksek', color: '#3D7A5F' }
  if (value >= 0.7) return { label: 'İyi', color: '#2D5F5D' }
  if (value >= 0.55) return { label: 'Orta', color: '#C4A35A' }
  if (value >= 0.4) return { label: 'Düşük', color: '#C4883A' }
  return { label: 'Sınırlı', color: '#C47A7A' }
}

function qualityLabel(value?: string): { label: string; color: string } {
  if (value === 'high') return { label: 'Yüksek', color: '#3D7A5F' }
  if (value === 'medium') return { label: 'Orta', color: '#C4A35A' }
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
  const confidenceInfo = confidenceLabel(confidence ?? 0)
  const qualityInfo = qualityLabel(captureQuality)

  return (
    <div className="doctor-card-strong rounded-2xl overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-[rgba(196,163,90,0.3)] to-transparent" />

      <div className="p-6 lg:p-8">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(26,26,46,0.10)" strokeWidth="4" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={scoreColor(score)}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 264} 264`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-[36px] font-light text-[#1A1A2E]">{score}</span>
                <span className="font-body text-[13px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.35)]">Skor</span>
              </div>
            </div>
            <p className="font-body text-[14px] tracking-[0.12em] uppercase mt-2" style={{ color: scoreColor(score) }}>
              {score >= 70 ? 'Dengeli' : score >= 40 ? 'İyileştirilebilir' : 'Odaklanılmalı'}
            </p>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <MetricTile label="Güven Seviyesi" value={confidenceInfo.label} color={confidenceInfo.color} sub={`${Math.round((confidence ?? 0) * 100)}%`} />
            <MetricTile label="Çekim Kalitesi" value={qualityInfo.label} color={qualityInfo.color} />
            <MetricTile
              label="Güvenilirlik"
              value={
                reliabilityBand === 'high'
                  ? 'Yüksek'
                  : reliabilityBand === 'medium'
                    ? 'Orta'
                    : reliabilityBand === 'low'
                      ? 'Düşük'
                      : '—'
              }
              color={reliabilityBand === 'high' ? '#3D7A5F' : reliabilityBand === 'medium' ? '#C4A35A' : '#C47A7A'}
            />
            {evidenceCoverage != null && (
              <MetricTile label="Kanıt Kapsamı" value={`${Math.round(evidenceCoverage * 100)}%`} color={evidenceCoverage >= 0.7 ? '#3D7A5F' : '#C4A35A'} />
            )}
            {estimatedAge != null && <MetricTile label="Tahmini Yaş" value={`${estimatedAge}`} color="rgba(26,26,46,0.62)" />}
            {estimatedGender && (
              <MetricTile
                label="Cinsiyet"
                value={estimatedGender === 'female' ? 'Kadın' : estimatedGender === 'male' ? 'Erkek' : estimatedGender}
                color="rgba(26,26,46,0.62)"
              />
            )}
            {(suppressionCount ?? 0) > 0 && <MetricTile label="Bastırılan Bölge" value={`${suppressionCount}`} color="#C4883A" />}
            {(limitedRegions ?? 0) > 0 && <MetricTile label="Sınırlı Bölge" value={`${limitedRegions}`} color="#C4883A" />}
          </div>
        </div>

        {(summaryText || recaptureRecommended) && (
          <div className="mt-6 pt-5 border-t border-[rgba(196,163,90,0.12)]">
            {summaryText && (
              <p className="font-body text-[15px] text-[rgba(26,26,46,0.72)] leading-relaxed">{summaryText}</p>
            )}
            {recaptureRecommended && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(196,136,58,0.08)] border border-[rgba(196,136,58,0.16)]">
                <svg className="w-3.5 h-3.5 text-[#C4883A] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span className="font-body text-[13px] text-[#C4883A]">Yeniden çekim önerilir, analiz güvenilirliği düşük.</span>
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
    <div className="doctor-card-soft rounded-xl px-3.5 py-3">
      <p className="font-body text-[13px] tracking-[0.15em] uppercase text-[rgba(26,26,46,0.38)] mb-1.5">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[20px] font-light" style={{ color }}>
          {value}
        </span>
        {sub && <span className="font-mono text-[12px] text-[rgba(26,26,46,0.38)]">{sub}</span>}
      </div>
    </div>
  )
}
