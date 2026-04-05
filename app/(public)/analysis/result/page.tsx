'use client'

import { Suspense, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useClinicStore, waitForHydration } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ThinLine } from '@/components/design-system/ThinLine'
import { photoQualityLabels } from '@/types/lead'
import type { Lead } from '@/types/lead'
import { getPhoto, getViewPhotos } from '@/lib/photo-bridge'
import { LandmarkOverlay, type OverlayState } from '@/components/analysis/LandmarkOverlay'
import { contact } from '@/lib/contact'
import RadarChartSection from '@/components/analysis/RadarChart'
import { RegionalScoreCards } from '@/components/analysis/RegionalScoreCards'
import { deriveRadarAnalysis } from '@/lib/ai/radar-scores'
import type { EnhancedAnalysisResult, ImageQualityAssessment, SkinTextureProfile, SymmetryAnalysis, WrinkleAnalysisResult } from '@/lib/ai/types'

/* Ã¯¿½"?Ã¯¿½"? Radial gauge Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function RadialGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 250)
    return () => clearTimeout(t)
  }, [])

  const r = 34
  const circ = 2 * Math.PI * r
  const offset = circ - (mounted ? score / 100 : 0) * circ

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg className="w-[96px] h-[96px] sm:w-[88px] sm:h-[88px]" viewBox="0 0 88 88" fill="none">
          {/* Track */}
          <circle cx="44" cy="44" r={r} stroke="rgba(248,246,242,0.05)" strokeWidth="3.5" />
          {/* Fill */}
          <circle
            cx="44" cy="44" r={r}
            stroke={color}
            strokeWidth="3.5"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 44 44)"
            style={{
              transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)',
              filter: `drop-shadow(0 0 5px ${color}70)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span
            className="font-mono text-[26px] sm:text-[24px] font-normal leading-none"
            style={{ color, animation: mounted ? 'numberBloom 0.5s ease-out both' : 'none' }}
          >{score}</span>
          <span className="font-body text-[10px] text-[rgba(248,246,242,0.40)] tracking-wider uppercase">/ 100</span>
        </div>
      </div>
      <span className="font-body text-[11px] sm:text-[10px] tracking-[0.16em] sm:tracking-[0.18em] uppercase text-center text-[rgba(248,246,242,0.60)] sm:text-[rgba(248,246,242,0.55)]">{label}</span>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-3 sm:py-2.5 border-b border-[rgba(214,185,140,0.07)] last:border-b-0 group">
      <span className="font-body text-[14px] sm:text-[13px] text-[rgba(248,246,242,0.65)] sm:text-[rgba(248,246,242,0.60)] group-hover:text-[rgba(248,246,242,0.78)] transition-colors duration-200">{label}</span>
      <span className="font-mono text-[16px] sm:text-[15px] font-normal text-[#F8F6F2] tabular-nums tracking-tight">{value}</span>
    </div>
  )
}

function buildFallbackRadarAnalysis(lead: Lead): Lead['radar_analysis'] | null {
  if (!lead.ai_scores) return null

  const wrinkleAnalysis: WrinkleAnalysisResult | null = lead.wrinkle_scores
    ? {
        regions: lead.wrinkle_scores.regions.map((region) => ({
          region: region.region as WrinkleAnalysisResult['regions'][number]['region'],
          label: region.label,
          density: region.density,
          score: region.score,
          level: region.level,
          insight: region.insight,
          confidence: region.confidence,
          detected: region.detected ?? false,
          evidenceStrength: region.evidenceStrength ?? 'insufficient',
        })),
        overallScore: lead.wrinkle_scores.overallScore,
        overallLevel: lead.wrinkle_scores.overallLevel,
      }
    : null

  const imageQuality: ImageQualityAssessment | null = lead.analysis_input_quality_score != null
    ? {
        overallScore: lead.analysis_input_quality_score,
        sufficient: lead.analysis_input_quality_score >= 50,
        flags: [],
        brightness: 0.5,
        contrast: 0.5,
        sharpness: 0.5,
        resolution: 1,
        angleDeviation: 0,
        detectionConfidence: Math.max(0, Math.min(1, lead.analysis_confidence ?? 0.5)),
      }
    : null

  const skinTexture: SkinTextureProfile | null = lead.skin_scores?.texture != null
    ? {
        uniformity: lead.skin_scores.texture,
        smoothness: lead.skin_scores.texture,
        roughness: Math.max(0, Math.min(1, 1 - (lead.skin_scores.texture / 100))),
        confidence: Math.max(0.25, Math.min(1, lead.analysis_confidence ?? 0.5)),
      }
    : null

  const symmetryRatio = lead.ai_scores.metrics.symmetryRatio
  const symmetryAnalysis: SymmetryAnalysis | null = lead.ai_scores
    ? {
        overallScore: lead.skin_scores?.face_symmetry ?? lead.ai_scores.symmetry,
        eyeSymmetry: symmetryRatio,
        cheekSymmetry: symmetryRatio,
        jawSymmetry: symmetryRatio,
        noseDeviation: Math.max(0, 1 - symmetryRatio),
      }
    : null

  const enhanced: EnhancedAnalysisResult = {
    geometry: {
      metrics: lead.ai_scores.metrics,
      suggestions: lead.ai_scores.suggestions,
      scores: {
        symmetry: lead.ai_scores.symmetry,
        proportion: lead.ai_scores.proportion,
      },
    },
    estimatedAge: lead.estimated_age ?? null,
    gender: lead.estimated_gender ?? null,
    genderConfidence: lead.estimated_gender_confidence ?? 0,
    focusAreas: [],
    suggestedZones: [],
    confidence: lead.analysis_confidence ?? 0.5,
    qualityScore: lead.analysis_input_quality_score ?? lead.quality_score ?? 50,
    wrinkleAnalysis,
    engine: 'human',
    imageQuality,
    ageEstimation: lead.age_estimation ?? null,
    skinTexture,
    symmetryAnalysis,
    lipAnalysis: null,
    landmarkSourceMode: 'single_frame',
    temporalFrameCount: 1,
    temporalConfidence: 0,
  }

  return deriveRadarAnalysis(enhanced, lead.capture_confidence)
}

/* Ã¯¿½"?Ã¯¿½"? Lightbox Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.75)] backdrop-blur-md p-4 cursor-pointer"
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Analiz görseli — büyük önizleme"
          className="max-w-full max-h-[85vh] rounded-xl shadow-[0_32px_80px_rgba(0,0,0,0.5)] object-contain"
        />
        <button
          type="button"
          aria-label="Önizlemeyi kapat"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[rgba(20,18,15,0.8)] backdrop-blur-sm shadow-lg border border-[rgba(214,185,140,0.2)] flex items-center justify-center hover:bg-[rgba(20,18,15,0.95)] transition-colors"
        >
          <svg className="w-5 h-5 text-[#F8F6F2]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Hero photo card with landmark overlay Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function AnalysisPhoto({ src, onClick, hasAI, wrinkleRegions }: { src: string; onClick: () => void; hasAI: boolean; wrinkleRegions?: Array<{ region: string; score: number; detected?: boolean }> }) {
  const [showMesh, setShowMesh] = useState(true)
  const [overlayState, setOverlayState] = useState<OverlayState>('idle')
  const [retryKey, setRetryKey] = useState(0)

  const handleOverlayState = useCallback((s: OverlayState) => setOverlayState(s), [])

  const handleToggle = useCallback(() => {
    if (overlayState === 'error' && showMesh) {
      // Retry: remount overlay to re-trigger analysis
      setRetryKey((k) => k + 1)
      return
    }
    setShowMesh((v) => !v)
  }, [overlayState, showMesh])

  // Button label reflects actual overlay state
  const isActive = showMesh && overlayState === 'mapped'
  const isLoading = showMesh && overlayState === 'analyzing'
  const isError = showMesh && overlayState === 'error'
  const buttonLabel = isLoading
    ? 'AI Haritalanıyor…'
    : isError
      ? 'Tekrar Dene'
      : showMesh
        ? 'AI Haritasını Gizle'
        : 'AI Haritasını Göster'

  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.50)]" style={{ border: '1px solid rgba(214,185,140,0.06)' }}>
        <button
          type="button"
          onClick={onClick}
          className="group relative w-full cursor-pointer"
        >
          <div className="aspect-[4/5] w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Analiz edilen yüz görseli"
              className="w-full h-full object-cover object-[center_25%]"
            />
          </div>
          {/* Landmark overlay Ã¯¿½?" fade in/out */}
          {hasAI && (
            <LandmarkOverlay
              key={retryKey}
              src={src}
              visible={showMesh}
              onStateChange={handleOverlayState}
              wrinkleRegions={wrinkleRegions?.map(r => ({
                region: r.region as import('@/lib/ai/types').WrinkleRegion,
                label: '',
                density: 0,
                score: r.score,
                level: 'minimal' as const,
                insight: '',
                confidence: 0.5,
                detected: r.detected ?? false,
                evidenceStrength: 'moderate' as const,
              }))}
            />
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 z-[3] bg-[rgba(0,0,0,0.0)] group-hover:bg-[rgba(0,0,0,0.2)] transition-colors duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg">
              <svg className="w-5 h-5 text-[#1A1A2E]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
              </svg>
            </div>
          </div>
          {/* Bottom gradient with status label */}
          <div className="absolute bottom-0 inset-x-0 z-[3] bg-gradient-to-t from-[rgba(10,10,15,0.7)] to-transparent pt-10 pb-4 px-4">
            <p className="font-body text-[11px] tracking-[0.18em] uppercase text-white/90 flex items-center gap-2">
              {hasAI ? (
                <>
                  <svg className="w-3.5 h-3.5 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75" />
                  </svg>
                  {isActive ? 'AI Harita Görünümü' : 'Analiz Tamamlandı'}
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  Analiz Edilen Görüntü
                </>
              )}
            </p>
          </div>
        </button>

        {/* AI Map toggle button Ã¯¿½?" only shown when analysis is complete */}
        {hasAI && (
          <button
            type="button"
            onClick={handleToggle}
            className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-medium tracking-[0.08em] uppercase border backdrop-blur-md transition-all duration-300 active:scale-95 ${
              isActive
                ? 'bg-[rgba(0,255,102,0.12)] text-[#4AE3A7] border-[rgba(0,255,102,0.25)] shadow-[0_0_12px_rgba(74,227,167,0.15)]'
                : isLoading
                  ? 'bg-[rgba(74,227,167,0.06)] text-[#4AE3A7]/60 border-[rgba(74,227,167,0.15)]'
                  : isError
                    ? 'bg-[rgba(200,80,80,0.08)] text-[#D89090] border-[rgba(200,80,80,0.2)]'
                    : 'bg-[rgba(255,255,255,0.08)] text-white/60 border-[rgba(255,255,255,0.12)] hover:text-white hover:border-[rgba(255,255,255,0.25)] hover:shadow-[0_0_12px_rgba(214,185,140,0.12)]'
            }`}
            aria-label={buttonLabel}
          >
            {isLoading ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#4AE3A7] border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {isError ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                ) : showMesh ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                )}
              </svg>
            )}
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? No-photo placeholder Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function PhotoPlaceholder() {
  return (
    <div className="aspect-[4/5] w-full rounded-xl bg-gradient-to-br from-[rgba(20,18,15,0.5)] to-[rgba(20,18,15,0.3)] flex flex-col items-center justify-center gap-3 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
      <div className="w-16 h-16 rounded-full bg-[rgba(248,246,242,0.05)] flex items-center justify-center">
        <svg className="w-8 h-8 text-[rgba(248,246,242,0.2)]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <p className="font-body text-[12px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.45)]">Fotoğraf yüklenmedi</p>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? 3-View Photo Gallery Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
const VIEW_LABELS: Record<string, string> = { front: 'Ön Görünüm', left: 'Sol Profil', right: 'Sağ Profil' }
const VIEW_ICONS: Record<string, string> = { front: '◎', left: '◧', right: '◨' }

function ViewQualityBadge({ quality }: { quality: { view: string; score: number; usable: boolean; poseCorrect: boolean } }) {
  const color = quality.usable
    ? quality.score >= 70 ? '#3D9B7A' : '#D6B98C'
    : '#C8785A'
  const label = quality.usable
    ? quality.score >= 70 ? 'İyi' : 'Yeterli'
    : 'Yetersiz'

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}50` }} />
      <span className="font-body text-[9px] tracking-[0.1em] uppercase" style={{ color: `${color}CC` }}>
        {label} {quality.usable && <span className="font-mono text-[9px]">%{quality.score}</span>}
      </span>
    </div>
  )
}

function ThreeViewGallery({ photos, viewQualities, onPhotoClick }: {
  photos: [string | null, string | null, string | null]
  viewQualities?: Array<{ view: string; score: number; usable: boolean; poseCorrect: boolean }>
  onPhotoClick: (src: string) => void
}) {
  const views = ['front', 'left', 'right'] as const
  const hasAnyPhoto = photos.some(p => !!p)
  if (!hasAnyPhoto) return null

  return (
    <div className="flex flex-col gap-4" style={{ animation: 'sectionReveal 0.6s ease-out 0.1s both' }}>
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
        </svg>
        <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.45)]">Çoklu Açı Çekimleri</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {views.map((view, i) => {
          const src = photos[i]
          const vq = viewQualities?.find(q => q.view === view)

          return (
            <div key={view} className="flex flex-col gap-2">
              {src ? (
                <button
                  type="button"
                  onClick={() => onPhotoClick(src)}
                  className="group relative rounded-xl overflow-hidden border border-[rgba(214,185,140,0.08)] hover:border-[rgba(214,185,140,0.20)] transition-colors"
                  style={{ animation: `cardEntrance 0.4s ease-out ${i * 80}ms both` }}
                >
                  <div className="aspect-[3/4] w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={VIEW_LABELS[view]} className="w-full h-full object-cover" />
                  </div>
                  {/* Bottom gradient */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[rgba(10,10,15,0.75)] to-transparent pt-8 pb-2.5 px-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-body text-[10px] text-[rgba(248,246,242,0.50)]">{VIEW_ICONS[view]}</span>
                      <span className="font-body text-[9px] tracking-[0.14em] uppercase text-[rgba(248,246,242,0.65)]">
                        {VIEW_LABELS[view]}
                      </span>
                    </div>
                  </div>
                  {/* Hover zoom hint */}
                  <div className="absolute inset-0 bg-[rgba(0,0,0,0)] group-hover:bg-[rgba(0,0,0,0.15)] transition-colors flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3.5 h-3.5 text-[#1A1A2E]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                      </svg>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="aspect-[3/4] w-full rounded-xl bg-[rgba(20,18,15,0.4)] border border-[rgba(248,246,242,0.04)] flex flex-col items-center justify-center gap-1.5">
                  <span className="font-body text-[11px] text-[rgba(248,246,242,0.35)]">{VIEW_ICONS[view]}</span>
                  <span className="font-body text-[9px] tracking-[0.12em] uppercase text-[rgba(248,246,242,0.30)]">
                    Çekilmedi
                  </span>
                </div>
              )}
              {/* Quality badge */}
              {vq && (
                <div className="flex justify-center">
                  <ViewQualityBadge quality={vq} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Multi-View Synthesis Summary Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function MultiViewSynthesisSummary({ multiView }: { multiView: NonNullable<Lead['multi_view_analysis']> }) {
  const synthesis = multiView.synthesis
  if (!synthesis) return null

  const confColor = multiView.globalConfidence >= 70 ? '#3D9B7A'
    : multiView.globalConfidence >= 50 ? '#D6B98C' : '#C8785A'

  return (
    <div className="flex flex-col gap-5" style={{ animation: 'sectionReveal 0.6s ease-out 0.2s both' }}>
      {/* Header with global confidence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="font-body text-[12px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.65)] font-medium">
            Çoklu Açı Sentezi
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
          style={{ background: `${confColor}10`, borderColor: `${confColor}30` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: confColor }} />
          <span className="font-mono text-[13px] font-medium" style={{ color: confColor }}>
            %{multiView.globalConfidence}
          </span>
          <span className="font-body text-[10px] tracking-[0.08em] uppercase text-[rgba(248,246,242,0.50)]">
            güven
          </span>
        </div>
      </div>

      {/* Overall narrative */}
      {synthesis.overallNarrative && (
        <div className="rounded-xl border border-[rgba(214,185,140,0.14)] bg-[rgba(214,185,140,0.04)] px-5 py-4">
          <p className="font-body text-[14px] sm:text-[13px] text-[rgba(248,246,242,0.75)] leading-[1.85]">
            {synthesis.overallNarrative}
          </p>
        </div>
      )}

      {/* Strongest areas — full-width, 2-col card grid */}
      {synthesis.strongestAreas.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(61,155,122,0.75)] font-medium flex items-center gap-1.5">
            <span className="text-[11px]">✦</span> Güçlü Alanlar
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {synthesis.strongestAreas.map(area => (
              <div key={area.region} className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[rgba(61,155,122,0.05)] border border-[rgba(61,155,122,0.12)]">
                <span className="text-[10px] mt-0.5 text-[#3D9B7A]">●</span>
                <div className="flex-1 min-w-0">
                  <span className="font-body text-[13px] font-medium text-[rgba(248,246,242,0.80)]">{area.label}</span>
                  <p className="font-body text-[12px] text-[rgba(248,246,242,0.50)] leading-[1.65] mt-1">{area.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvement areas — full-width, 2-col card grid */}
      {synthesis.improvementAreas.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(214,185,140,0.75)] font-medium flex items-center gap-1.5">
            <span className="text-[11px]">◇</span> Değerlendirme Önerilen
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {synthesis.improvementAreas.map(area => (
              <div key={area.region} className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[rgba(214,185,140,0.04)] border border-[rgba(214,185,140,0.10)]">
                <span className="text-[10px] mt-0.5 text-[#D6B98C]">◇</span>
                <div className="flex-1 min-w-0">
                  <span className="font-body text-[13px] font-medium text-[rgba(248,246,242,0.80)]">{area.label}</span>
                  <p className="font-body text-[12px] text-[rgba(248,246,242,0.50)] leading-[1.65] mt-1">{area.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bilateral comparisons */}
      {synthesis.bilateralComparisons.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(248,246,242,0.55)] font-medium flex items-center gap-1.5">
            <span className="text-[11px]">↔</span> Sol–Sağ Karşılaştırma
          </span>
          {synthesis.bilateralComparisons.map(bc => {
            const lvlColor = bc.asymmetryLevel === 'symmetrical' ? '#3D9B7A'
              : bc.asymmetryLevel === 'mild_asymmetry' ? '#D6B98C' : '#C8785A'
            const lvlLabel = bc.asymmetryLevel === 'symmetrical' ? 'Simetrik'
              : bc.asymmetryLevel === 'mild_asymmetry' ? 'Hafif Fark' : 'Belirgin Fark'

            return (
              <div key={bc.regionBase} className="rounded-lg border border-[rgba(248,246,242,0.07)] bg-[rgba(248,246,242,0.025)] px-4 py-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-body text-[13px] font-medium text-[rgba(248,246,242,0.78)]">{bc.label}</span>
                  <span className="font-body text-[10px] tracking-[0.1em] uppercase px-2.5 py-0.5 rounded-full font-medium"
                    style={{ background: `${lvlColor}18`, color: lvlColor }}>
                    {lvlLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="font-mono text-[11px] text-[rgba(248,246,242,0.55)] w-6">Sol</span>
                    <div className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${bc.leftScore}%`, background: lvlColor }} />
                    </div>
                    <span className="font-mono text-[12px] text-[rgba(248,246,242,0.65)] w-6">{bc.leftScore}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="font-mono text-[11px] text-[rgba(248,246,242,0.55)] w-6">Sağ</span>
                    <div className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${bc.rightScore}%`, background: lvlColor }} />
                    </div>
                    <span className="font-mono text-[12px] text-[rgba(248,246,242,0.65)] w-6">{bc.rightScore}</span>
                  </div>
                </div>
                <p className="font-body text-[11px] text-[rgba(248,246,242,0.45)] leading-[1.65] italic">{bc.note}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Confidence notes */}
      {synthesis.confidenceNotes.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(248,246,242,0.50)] font-medium flex items-center gap-1.5">
            <span className="text-[11px]">◈</span> Güven Notları
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {synthesis.confidenceNotes.map(cn => {
              const cnColor = cn.level === 'high' ? '#3D9B7A' : cn.level === 'medium' ? '#D6B98C' : '#C8785A'
              return (
                <div key={cn.region} className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[rgba(248,246,242,0.025)] border border-[rgba(248,246,242,0.07)]">
                  <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ background: cnColor }} />
                  <div className="flex-1 min-w-0">
                    <span className="font-body text-[12px] font-medium text-[rgba(248,246,242,0.72)]">{cn.label}</span>
                    <p className="font-body text-[11px] text-[rgba(248,246,242,0.48)] leading-[1.6] mt-0.5">{cn.explanation}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* View summaries */}
      {multiView.viewSummaries && multiView.viewSummaries.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="font-body text-[11px] tracking-[0.16em] uppercase text-[rgba(248,246,242,0.50)] font-medium flex items-center gap-1.5">
            <span className="text-[11px]">◎</span> Görünüm Özetleri
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {multiView.viewSummaries.map(vs => (
              <div key={vs.view} className="rounded-lg border border-[rgba(248,246,242,0.07)] bg-[rgba(248,246,242,0.025)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-[13px] font-medium text-[rgba(248,246,242,0.78)]">{vs.label}</span>
                  {vs.usable ? (
                    <span className="font-mono text-[13px] font-medium text-[#3D9B7A]">%{vs.qualityScore}</span>
                  ) : (
                    <span className="font-mono text-[13px] font-medium text-[#C8785A]">Yetersiz</span>
                  )}
                </div>
                <p className="font-body text-[11px] text-[rgba(248,246,242,0.52)] leading-[1.7]">{vs.narrative}</p>
                {vs.limitations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vs.limitations.map((lim, i) => (
                      <span key={i} className="font-body text-[10px] text-[rgba(200,120,90,0.65)] bg-[rgba(200,120,90,0.08)] px-2 py-0.5 rounded">
                        {lim}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Scores compact card Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function ScoresPanel({ aiScores, qualityScore }: {
  aiScores: NonNullable<Lead['ai_scores']>
  qualityScore?: number
}) {
  const symColor  = aiScores.symmetry  >= 75 ? '#4AE3A7' : '#D6B98C'
  const propColor = aiScores.proportion >= 75 ? '#4AE3A7' : '#D6B98C'

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <p className="font-body text-[12px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.65)] font-medium">Yüz Geometrisi</p>
        </div>
        {qualityScore != null && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[rgba(214,185,140,0.08)] border border-[rgba(214,185,140,0.16)]">
            <span className="font-body text-[10px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.55)]">Çekim</span>
            <span className="font-mono text-[14px] font-medium text-[#D6B98C]">{qualityScore}%</span>
          </div>
        )}
      </div>

      {/* Dual radial gauges */}
      <div className="flex items-center justify-around py-2">
        <RadialGauge score={aiScores.symmetry}   label="Simetri Skoru"   color={symColor} />
        <div className="w-px h-20 bg-[rgba(248,246,242,0.06)]" />
        <RadialGauge score={aiScores.proportion} label="Altın Oran Uyumu" color={propColor} />
      </div>

      <ThinLine />

      {/* Measurements table */}
      <div>
        <p className="font-body text-[11px] sm:text-[10px] tracking-[0.20em] sm:tracking-[0.22em] uppercase text-[rgba(248,246,242,0.55)] sm:text-[rgba(248,246,242,0.50)] font-medium mb-3">Ölçümler</p>
        <MetricRow label="Yüz Genişlik / Uzunluk" value={aiScores.metrics.faceRatio.toFixed(2)} />
        <MetricRow label="Göz Mesafesi Oranı"      value={aiScores.metrics.eyeDistanceRatio.toFixed(2)} />
        <MetricRow label="Burun Genişliği Oranı"   value={aiScores.metrics.noseToFaceWidth.toFixed(2)} />
        <MetricRow label="Dudak / Burun Oranı"     value={aiScores.metrics.mouthToNoseWidth.toFixed(2)} />
        <MetricRow label="Simetri Oranı"           value={aiScores.metrics.symmetryRatio.toFixed(2)} />
      </div>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Age Estimation panel Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function AgeEstimationPanel({ estimatedAge, confidence, gender, genderConfidence, ageEstimation }: {
  estimatedAge: number | null | undefined
  confidence?: number
  gender?: string | null
  genderConfidence?: number
  ageEstimation?: Lead['age_estimation']
}) {
  const ageValue = ageEstimation?.pointEstimate ?? (estimatedAge != null ? Math.round(estimatedAge) : null)
  const hasGender = !!gender
  const genderLabel = gender === 'male' ? 'Erkek' : gender === 'female' ? 'Kadın' : gender ?? null

  if (ageValue == null && !hasGender) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-body text-[11px] tracking-[0.20em] uppercase text-[rgba(248,246,242,0.60)] font-medium">Yaş Tahmini</p>
        <p className="font-body text-[13px] text-[rgba(248,246,242,0.50)] italic">Bu görüntüde yaş tahmini sınırlı güvenle değerlendirilememiştir.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Section label */}
      <p className="font-body text-[11px] tracking-[0.20em] uppercase text-[rgba(248,246,242,0.60)] font-medium">Yaş Tahmini</p>

      {/* Content row */}
      <div className="flex items-center justify-between">
        {/* Left: hero age number */}
        {ageValue != null && (
          <div className="flex flex-col gap-1">
            <span className="font-display text-[48px] sm:text-[56px] font-semibold text-[#F8F6F2] leading-none tracking-tight">
              {ageValue}
            </span>
            <span className="font-body text-[11px] tracking-[0.12em] uppercase text-[rgba(248,246,242,0.50)]">
              AI tahmini
            </span>
          </div>
        )}

        {/* Right: gender + confidence */}
        {(hasGender || (confidence != null && confidence > 0)) && (
          <div className="flex flex-col items-end gap-1.5">
            {hasGender && (
              <span className="font-body text-[14px] text-[rgba(248,246,242,0.75)]">
                {genderLabel}
                {genderConfidence != null && genderConfidence > 0 && (
                  <span className="font-mono text-[12px] text-[rgba(248,246,242,0.40)] ml-1.5">
                    %{Math.round(genderConfidence * 100)}
                  </span>
                )}
              </span>
            )}
            {confidence != null && confidence > 0 && (
              <span className="font-mono text-[11px] text-[rgba(248,246,242,0.40)]">
                  Güven %{Math.round(confidence * 100)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Caveat */}
      <p className="font-body text-[11px] text-[rgba(248,246,242,0.38)] leading-relaxed">
        Yapay zeka destekli ön değerlendirmedir.
      </p>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Focus areas detailed panel Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function FocusAreasPanel({ focusAreas }: { focusAreas: NonNullable<Lead['focus_areas']> }) {
  if (!focusAreas || focusAreas.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
        <p className="font-body text-[12px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.65)] font-medium">Odak Bölgeleri</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {focusAreas.map((area, idx) => {
          const color = area.score >= 70 ? '#4AE3A7' : area.score >= 45 ? '#D6B98C' : '#C47A7A'
          const gradFill = area.score >= 70
            ? 'linear-gradient(90deg, #2D5F5D, #4AE3A7)'
            : area.score >= 45
              ? 'linear-gradient(90deg, #8B6B2A, #D6B98C)'
              : 'linear-gradient(90deg, #6B2828, #C47A7A)'
          return (
            <div
              key={area.region}
              className="relative rounded-lg border border-[rgba(214,185,140,0.08)] bg-[rgba(14,11,9,0.55)] pl-5 pr-4 py-4 overflow-hidden"
              style={{ animation: `cardEntrance 0.4s ease-out ${idx * 60}ms both` }}
            >
              {/* Left accent strip */}
              <div
                className="absolute left-0 inset-y-0 w-[3px] rounded-l-[14px]"
                style={{ background: gradFill }}
              />
              <div className="flex items-start justify-between mb-2">
                <span className="font-body text-[13px] font-medium text-[#F8F6F2] pr-3 leading-snug">{area.label}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {area.doctorReviewRecommended && (
                    <span className="font-body text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full bg-[rgba(214,185,140,0.08)] text-[#D6B98C] border border-[rgba(214,185,140,0.15)]">
                      Doktor
                    </span>
                  )}
                  <span className="font-mono text-[18px] font-light leading-none" style={{ color }}>{area.score}</span>
                </div>
              </div>
              <p className="font-body text-[14px] sm:text-[13px] text-[rgba(248,246,242,0.62)] sm:text-[rgba(248,246,242,0.58)] leading-[1.7] sm:leading-[1.65]">{area.insight}</p>
              <div className="h-[2px] rounded-full bg-[rgba(248,246,242,0.05)] overflow-hidden mt-3">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${area.score}%`, background: gradFill, boxShadow: `0 0 8px ${color}40` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-[rgba(214,185,140,0.04)] border border-[rgba(214,185,140,0.10)] rounded-md p-3.5">
        <p className="font-body text-[11px] text-[rgba(248,246,242,0.42)] leading-relaxed italic">
          Puanlar geometrik analiz ve yaş tahminine dayalıdır. Cilt durumu değerlendirmesi dahil değildir.
        </p>
      </div>
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Wrinkle / Skin-Line analysis (13 regions, grouped) Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function WrinkleAnalysisPanel({ wrinkleScores }: { wrinkleScores: NonNullable<Lead['wrinkle_scores']> }) {
  const levelLabel: Record<string, string> = {
    minimal: 'Minimal',
    low: 'Düşük',
    medium: 'Orta',
    high: 'Yüksek',
  }
  const levelColor: Record<string, string> = {
    minimal: '#5A8A7A',
    low: '#3D9B7A',
    medium: '#D6B98C',
    high: '#B06060',
  }

  // Group regions for organized display
  const regionGroups: { title: string; regionKeys: string[] }[] = [
    { title: 'Alın & Kaş Arası', regionKeys: ['forehead', 'glabella'] },
    { title: 'Göz Çevresi', regionKeys: ['crow_feet_left', 'crow_feet_right', 'under_eye_left', 'under_eye_right'] },
    { title: 'Orta Yüz', regionKeys: ['nasolabial_left', 'nasolabial_right', 'cheek_left', 'cheek_right'] },
    { title: 'Alt Yüz', regionKeys: ['marionette_left', 'marionette_right', 'jawline'] },
  ]

  // Merge left/right pairs into single display rows
  const mergedRegions = mergeSymmetricRegions(wrinkleScores.regions)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          <p className="font-body text-[12px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.65)] font-medium">Bölgesel Cilt & Çizgi Analizi</p>
        </div>
        {/* Overall level badge */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
          style={{
            backgroundColor: `${levelColor[wrinkleScores.overallLevel] ?? '#D6B98C'}12`,
            borderColor: `${levelColor[wrinkleScores.overallLevel] ?? '#D6B98C'}35`,
          }}
        >
          <span className="font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.55)]">Genel</span>
          <span className="font-mono text-[14px] font-medium" style={{ color: levelColor[wrinkleScores.overallLevel] ?? '#D6B98C' }}>
            {wrinkleScores.overallScore}
          </span>
          <span className="font-body text-[10px] uppercase font-medium" style={{ color: levelColor[wrinkleScores.overallLevel] ?? '#D6B98C' }}>
            {levelLabel[wrinkleScores.overallLevel] ?? wrinkleScores.overallLevel}
          </span>
        </div>
      </div>

      {/* Grouped region cards */}
      {regionGroups.map((group) => {
        const groupRegions = mergedRegions.filter(r => group.regionKeys.includes(r.key))
        if (groupRegions.length === 0) return null
        return (
          <div key={group.title} className="flex flex-col gap-2">
            <p className="font-body text-[11px] tracking-[0.18em] uppercase text-[rgba(248,246,242,0.50)] font-medium mt-1">{group.title}</p>
            {groupRegions.map((region, idx) => {
              const color = levelColor[region.level] ?? '#D6B98C'
              const stripGrad = region.level === 'minimal' || region.level === 'low'
                ? 'linear-gradient(180deg, #2D5F5D, #4AE3A7)'
                : region.level === 'medium'
                  ? 'linear-gradient(180deg, #8B6B2A, #D6B98C)'
                  : 'linear-gradient(180deg, #6B2828, #C47A7A)'
              return (
                <div
                  key={region.key}
                  className="relative rounded-lg border border-[rgba(214,185,140,0.08)] bg-[rgba(14,11,9,0.55)] pl-5 pr-4 py-3.5 overflow-hidden"
                  style={{ animation: `cardEntrance 0.4s ease-out ${idx * 45}ms both` }}
                >
                  <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-[14px]" style={{ background: stripGrad }} />
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-body text-[14px] font-medium text-[#F8F6F2] pr-3 leading-snug">{region.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {region.confidence < 0.5 && (
                        <span className="font-body text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full bg-[rgba(200,120,60,0.10)] text-[rgba(248,200,140,0.65)] border border-[rgba(200,120,60,0.18)]">
                          Sınırlı
                        </span>
                      )}
                      <span
                        className="font-body text-[10px] tracking-[0.12em] uppercase px-2.5 py-0.5 rounded-full border font-medium"
                        style={{ color, backgroundColor: `${color}14`, borderColor: `${color}30` }}
                      >
                        {levelLabel[region.level] ?? region.level}
                      </span>
                      <span className="font-mono text-[18px] font-normal leading-none" style={{ color }}>{region.score}</span>
                    </div>
                  </div>
                  <p className="font-body text-[13px] sm:text-[12px] text-[rgba(248,246,242,0.58)] sm:text-[rgba(248,246,242,0.55)] leading-[1.65]">{region.insight}</p>
                  <div className="h-[2px] rounded-full bg-[rgba(248,246,242,0.05)] overflow-hidden mt-2.5">
                    <div className="h-full rounded-full" style={{ width: `${region.score}%`, background: stripGrad, boxShadow: `0 0 8px ${color}40` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      <div className="bg-[rgba(214,185,140,0.04)] border border-[rgba(214,185,140,0.10)] rounded-md p-3.5">
        <p className="font-body text-[11px] text-[rgba(248,246,242,0.42)] leading-relaxed italic">
          Bölgesel çizgi analizi görüntü işleme tabanlı ön değerlendirmedir. Kesin sonuçlar klinik muayene gerektirir.
        </p>
      </div>
    </div>
  )
}

/** Merge left/right symmetric regions into single display entries */
function mergeSymmetricRegions(regions: NonNullable<Lead['wrinkle_scores']>['regions']): Array<{
  key: string; label: string; score: number; level: string; insight: string; confidence: number
}> {
  const pairs: Record<string, string> = {
    crow_feet_left: 'crow_feet_right',
    under_eye_left: 'under_eye_right',
    nasolabial_left: 'nasolabial_right',
    marionette_left: 'marionette_right',
    cheek_left: 'cheek_right',
  }
  const mergedLabels: Record<string, string> = {
    crow_feet_left: 'Kaz Ayağı',
    under_eye_left: 'Göz Altı',
    nasolabial_left: 'Nazolabial',
    marionette_left: 'Marionette Çizgileri',
    cheek_left: 'Yanak Dokusu',
  }

  const used = new Set<string>()
  const result: Array<{
    key: string; label: string; score: number; level: string; insight: string; confidence: number
  }> = []

  for (const r of regions) {
    if (used.has(r.region)) continue

    const pairKey = pairs[r.region]
    const pairRegion = pairKey ? regions.find(p => p.region === pairKey) : null

    if (pairRegion && mergedLabels[r.region]) {
      // Merge: average scores, use the higher-scoring insight
      used.add(r.region)
      used.add(pairRegion.region)
      const avgScore = Math.round((r.score + pairRegion.score) / 2)
      const avgConf = (r.confidence + pairRegion.confidence) / 2
      const primary = r.score >= pairRegion.score ? r : pairRegion
      const levelFromAvg = avgScore >= 55 ? 'high' : avgScore >= 30 ? 'medium' : avgScore >= 12 ? 'low' : 'minimal'
      result.push({
        key: r.region,
        label: mergedLabels[r.region],
        score: avgScore,
        level: levelFromAvg,
        insight: primary.insight.replace(/Sol |Sağ /g, ''),
        confidence: avgConf,
      })
    } else if (!Object.values(pairs).includes(r.region)) {
      // Standalone region (forehead, glabella, jawline)
      used.add(r.region)
      result.push({
        key: r.region,
        label: r.label,
        score: r.score,
        level: r.level,
        insight: r.insight,
        confidence: r.confidence,
      })
    }
  }

  return result
}

/* Ã¯¿½"?Ã¯¿½"? Skin analysis scores (PerfectCorp) Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function SkinScoreRow({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  if (value === null || value === undefined) return null
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="font-body text-[12px] text-[rgba(248,246,242,0.45)]">{label}</span>
      <span className="font-mono text-[13px] text-[#F8F6F2]">
        {display}{unit ? <span className="text-[11px] text-[rgba(248,246,242,0.42)] ml-0.5">{unit}</span> : null}
      </span>
    </div>
  )
}

function SkinScoresPanel({ skinScores }: { skinScores: NonNullable<Lead['skin_scores']> }) {
  const hasAnySkin = skinScores.skinAge !== null || skinScores.wrinkle !== null ||
    skinScores.texture !== null || skinScores.pore !== null ||
    skinScores.pigmentation !== null || skinScores.redness !== null
  const hasAnyFace = skinScores.face_symmetry !== null || skinScores.face_harmony !== null

  if (!hasAnySkin && !hasAnyFace) return null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
        <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.45)]">Cilt Analizi</p>
      </div>

      {hasAnySkin && (
        <div>
          <SkinScoreRow label="Cilt Yaşı" value={skinScores.skinAge} unit="yaş" />
          <SkinScoreRow label="Kırışıklık" value={skinScores.wrinkle} />
          <SkinScoreRow label="Doku" value={skinScores.texture} />
          <SkinScoreRow label="Gözenek" value={skinScores.pore} />
          <SkinScoreRow label="Pigmentasyon" value={skinScores.pigmentation} />
          <SkinScoreRow label="Kızarıklık" value={skinScores.redness} />
        </div>
      )}

      {hasAnySkin && hasAnyFace && <ThinLine />}

      {hasAnyFace && (
        <div>
          <p className="font-body text-[11px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.55)] font-medium mb-3">Yüz Uyumu</p>
          <SkinScoreRow label="Yüz Simetrisi" value={skinScores.face_symmetry} />
          <SkinScoreRow label="Yüz Harmonisi" value={skinScores.face_harmony} />
        </div>
      )}
    </div>
  )
}

/* Ã¯¿½"?Ã¯¿½"? Main result content Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */
function ResultContent() {
  const { leads } = useClinicStore()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const selectedLead = id ? leads.find((lead) => lead.id === id) : undefined
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Wait for Zustand store to hydrate from localStorage before rendering
  // (critical after hard navigations like browser refresh)
  useEffect(() => {
    waitForHydration().then(() => setHydrated(true))
  }, [])

  // Show loading state until store is hydrated
  if (!hydrated) {
    return (
      <div className="theme-dark min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0A0908 0%, #141110 20%, #0F1214 50%, #0A0B0D 100%)' }}>
        <div className="flex flex-col items-center gap-5">
          <div className="w-10 h-10 rounded-full border-[1.5px] border-transparent border-t-[#D6B98C] animate-spin" />
          <p className="text-label text-[rgba(248,246,242,0.48)]">
            Sonuçlar hazırlanıyor…
          </p>
        </div>
      </div>
    )
  }

  if (!selectedLead) {
    return (
      <div className="theme-dark min-h-screen flex items-center justify-center px-5" style={{ background: 'linear-gradient(160deg, #0A0908 0%, #141110 20%, #0F1214 50%, #0A0B0D 100%)' }}>
        <div className="max-w-md w-full">
          <GlassCard elevated padding="xl" rounded="xl">
            <div className="flex flex-col gap-6 text-center items-center">
              <span className="text-label text-[rgba(214,185,140,0.45)]">Sonuç Bulunamadı</span>
              <h1 className="heading-display heading-display-sm text-[#F8F6F2]">Analiz kaydına ulaşılamadı</h1>
              <p className="font-body text-[14px] text-[rgba(248,246,242,0.45)] leading-[1.7] max-w-[28ch]">
                Ön değerlendirmeyi yeniden başlatarak fotoğrafınızı tekrar yükleyebilirsiniz.
              </p>
              <Link href="/analysis" className="w-full mt-2">
                <PremiumButton size="lg" className="w-full justify-center">
                  Ön Değerlendirmeyi Yeniden Başlat
                </PremiumButton>
              </Link>
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  // ── Partial state guard ──
  // Lead exists but analysis never completed (e.g. page refresh during processing,
  // or direct URL navigation). Detect by checking for analysis_source — if it's
  // missing or fallback-only, the pipeline didn't finish.
  const analysisIncomplete = !selectedLead.analysis_source ||
    (selectedLead.analysis_source.provider === 'mock' && selectedLead.analysis_source.source === 'fallback')
  if (analysisIncomplete && selectedLead.status !== 'analysis_ready') {
    return (
      <div className="theme-dark min-h-screen flex items-center justify-center px-5" style={{ background: 'linear-gradient(160deg, #0A0908 0%, #141110 20%, #0F1214 50%, #0A0B0D 100%)' }}>
        <div className="max-w-md w-full">
          <GlassCard elevated padding="xl" rounded="xl">
            <div className="flex flex-col gap-6 text-center items-center">
              <span className="text-label text-[rgba(214,185,140,0.45)]">Analiz Tamamlanmadı</span>
              <h1 className="heading-display heading-display-sm text-[#F8F6F2]">Sonuçlar henüz hazır değil</h1>
              <p className="font-body text-[14px] text-[rgba(248,246,242,0.45)] leading-[1.7] max-w-[28ch]">
                Analiz işlemi tamamlanmadan sayfa yenilendi veya bağlantı kesildi. Lütfen tekrar deneyin.
              </p>
              <Link href={`/analysis/processing?id=${id}`} className="w-full mt-2">
                <PremiumButton size="lg" className="w-full justify-center">
                  Analizi Tekrar Başlat
                </PremiumButton>
              </Link>
              <Link href="/analysis" className="w-full">
                <PremiumButton variant="ghost" size="lg" className="w-full justify-center">
                  Baştan Başla
                </PremiumButton>
              </Link>
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  const focusAreas = selectedLead.patient_summary?.focus_areas ?? ['Genel Yüz Dengesi']
  const photoQuality = selectedLead.patient_summary?.photo_quality
  const aiScores = selectedLead.ai_scores
  const skinScores = selectedLead.skin_scores
  const analysisSource = selectedLead.analysis_source
  const hasAI = !!aiScores
  const hasSkin = !!skinScores
  const detailedFocusAreas = selectedLead.focus_areas
  const estimatedAge = selectedLead.estimated_age
  const estimatedGender = selectedLead.estimated_gender
  const estimatedGenderConfidence = selectedLead.estimated_gender_confidence
  const captureQualityScore = selectedLead.capture_quality_score ?? selectedLead.analysis_input_quality_score ?? selectedLead.quality_score
  const analysisInputQualityScore = selectedLead.analysis_input_quality_score
  const analysisConfidence = selectedLead.analysis_confidence

  const wrinkleScores = selectedLead.wrinkle_scores
  const ageEstimation = selectedLead.age_estimation
  const radarAnalysis = selectedLead.radar_analysis ?? buildFallbackRadarAnalysis(selectedLead)
  const hasRadar = !!radarAnalysis && radarAnalysis.radarScores.length > 0
  const hasWrinkle = !!wrinkleScores && wrinkleScores.regions.length > 0
  const isCombined = analysisSource?.provider === 'combined'
  const isHumanLocal = analysisSource?.provider === 'human-local'
  const isFallback = analysisSource?.provider === 'mock' || (!hasAI && !hasSkin)

  // Ã¯¿½"?Ã¯¿½"? Trust pipeline data Ã¯¿½"?Ã¯¿½"?
  const trustPipeline = selectedLead.trust_pipeline
  const hasTrust = !!trustPipeline
  const trustCaveat = trustPipeline?.quality_caveat
  const trustConfidence = selectedLead.report_confidence ?? trustPipeline?.overall_confidence ?? 0
  const limitedAreas = trustPipeline?.limited_areas
  const captureManifest = selectedLead.capture_manifest
  const livenessStatus = selectedLead.liveness_status ?? 'not_required'
  const livenessConfidence = selectedLead.liveness_confidence ?? 0
  const livenessRequired = selectedLead.liveness_required ?? false
  const livenessPassed = selectedLead.liveness_passed ?? !livenessRequired
  const overallReliabilityBand = selectedLead.overall_reliability_band
  const evidenceCoverageScore = selectedLead.evidence_coverage_score
  const suppressionCount = selectedLead.suppression_count ?? trustPipeline?.metrics_suppressed ?? 0
  const limitedRegionsCount = selectedLead.limited_regions_count ?? 0
  const recaptureRecommended = selectedLead.recapture_recommended ?? false
  const recaptureViews = selectedLead.recapture_views ?? []
  const recaptureReason = selectedLead.recapture_reason
  const captureLimitedViews = captureManifest?.views
    ?.filter(view => view.recapture_required || !view.captured)
    .map(view => view.view) ?? []
  // Photo may have been stripped from localStorage (quota protection).
  // Recover from sessionStorage bridge if needed.
  const photoUrl = selectedLead.patient_photo_url || (id ? getPhoto(id) : null)

  // Multi-view photos: [front, left, right]
  const multiViewAnalysis = selectedLead.multi_view_analysis
  const hasMultiView = !!multiViewAnalysis && (multiViewAnalysis.centralRegions.length > 0 || multiViewAnalysis.leftRegions.length > 0)
  const storedPhotos = selectedLead.doctor_frontal_photos ?? []
  const bridgePhotos = id ? getViewPhotos(id) : [null, null, null] as [string | null, string | null, string | null]
  const viewPhotos: [string | null, string | null, string | null] = [
    storedPhotos[0] || bridgePhotos[0] || photoUrl,
    storedPhotos[1] || bridgePhotos[1],
    storedPhotos[2] || bridgePhotos[2],
  ]
  const hasViewPhotos = viewPhotos[1] != null || viewPhotos[2] != null

  return (
    <div className="theme-dark min-h-screen relative" style={{ background: 'linear-gradient(160deg, #0A0908 0%, #141110 20%, #0F1214 50%, #0A0B0D 100%)' }}>
      {/* Ambient depth glows Ã¯¿½?" cinematic layering */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 25% 20%, rgba(214,185,140,0.035) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 75%, rgba(61,155,122,0.02) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 50% 50%, rgba(10,9,8,0.4) 0%, transparent 70%)' }} />
      <div className="max-w-7xl mx-auto flex flex-col px-4 sm:px-8 lg:px-14" style={{ paddingTop: 'clamp(3.5rem, 8vh, 8rem)', paddingBottom: 'clamp(2.5rem, 6vh, 5rem)', gap: 'clamp(2rem, 4vw, 4rem)' }}>
        {/* Ã¯¿½"?Ã¯¿½"? Premium Result Reveal Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
        <div className="relative text-center flex flex-col items-center" style={{ animation: 'heroFadeUp 0.8s ease-out both' }}>

          {/* Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½ AI Ambiance Layers Ã¯¿½?" background-only, never compete with content Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½ */}

          {/* Central radial glow Ã¯¿½?" soft teal wash behind the hero area */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '-10%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(600px, 90vw)',
              height: '420px',
              background: 'radial-gradient(ellipse 70% 55% at 50% 40%, rgba(61,155,122,0.045) 0%, rgba(61,155,122,0.015) 40%, transparent 70%)',
            }}
          />

          {/* Side glow Ã¯¿½?" left (desktop only, hidden on mobile) */}
          <div
            className="absolute pointer-events-none hidden lg:block"
            style={{
              top: '8%',
              left: '-14%',
              width: '280px',
              height: '360px',
              background: 'radial-gradient(ellipse 80% 70% at 60% 50%, rgba(61,155,122,0.035) 0%, transparent 65%)',
              filter: 'blur(40px)',
            }}
          />

          {/* Side glow Ã¯¿½?" right (desktop only) */}
          <div
            className="absolute pointer-events-none hidden lg:block"
            style={{
              top: '12%',
              right: '-14%',
              width: '280px',
              height: '340px',
              background: 'radial-gradient(ellipse 80% 70% at 40% 50%, rgba(214,185,140,0.025) 0%, transparent 65%)',
              filter: 'blur(40px)',
            }}
          />

          {/* Abstract mesh hint Ã¯¿½?" faint geometric contour lines (desktop only) */}
          <svg
            className="absolute pointer-events-none hidden lg:block"
            style={{
              top: '-5%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '680px',
              height: '480px',
              opacity: 0.025,
            }}
            viewBox="0 0 680 480"
            fill="none"
          >
            {/* Concentric ellipses Ã¯¿½?" hint at facial contour mapping */}
            <ellipse cx="340" cy="220" rx="200" ry="160" stroke="rgba(61,155,122,1)" strokeWidth="0.8" />
            <ellipse cx="340" cy="220" rx="260" ry="200" stroke="rgba(61,155,122,1)" strokeWidth="0.5" />
            <ellipse cx="340" cy="220" rx="320" ry="240" stroke="rgba(214,185,140,1)" strokeWidth="0.4" />
            {/* Node points at cardinal positions */}
            <circle cx="340" cy="60" r="2" fill="rgba(61,155,122,1)" />
            <circle cx="340" cy="380" r="2" fill="rgba(61,155,122,1)" />
            <circle cx="140" cy="220" r="1.5" fill="rgba(214,185,140,1)" />
            <circle cx="540" cy="220" r="1.5" fill="rgba(214,185,140,1)" />
            {/* Subtle cross-lines */}
            <line x1="340" y1="60" x2="340" y2="380" stroke="rgba(61,155,122,1)" strokeWidth="0.3" strokeDasharray="4 8" />
            <line x1="140" y1="220" x2="540" y2="220" stroke="rgba(214,185,140,1)" strokeWidth="0.3" strokeDasharray="4 8" />
            {/* Diagonal geometry hints */}
            <line x1="220" y1="100" x2="460" y2="340" stroke="rgba(61,155,122,1)" strokeWidth="0.25" strokeDasharray="3 10" />
            <line x1="460" y1="100" x2="220" y2="340" stroke="rgba(61,155,122,1)" strokeWidth="0.25" strokeDasharray="3 10" />
          </svg>

          {/* Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½ End AI Ambiance Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½Ã¯¿½.Ã¯¿½ */}

          {/* Success icon Ã¯¿½?" refined with layered glow */}
          <div className="relative mb-8 sm:mb-10">
            {/* Outer ambient glow Ã¯¿½?" slightly wider for AI feel */}
            <div
              className="absolute rounded-full"
              style={{
                inset: '-28px',
                background: 'radial-gradient(circle, rgba(61,155,122,0.10) 0%, rgba(61,155,122,0.035) 50%, transparent 75%)',
                animation: 'subtleFloat 4s ease-in-out infinite',
              }}
            />
            {/* Inner ring */}
            <div
              className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(61,155,122,0.06)',
                border: '1.5px solid rgba(61,155,122,0.22)',
                boxShadow: '0 0 40px rgba(61,155,122,0.10), 0 0 80px rgba(61,155,122,0.04), inset 0 0 20px rgba(61,155,122,0.04)',
              }}
            >
              <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Overline Ã¯¿½?" premium label */}
          <span
            className="relative font-body text-[10px] sm:text-[11px] tracking-[0.22em] uppercase mb-5 sm:mb-6"
            style={{ color: 'rgba(61,155,122,0.65)' }}
          >
            {hasMultiView ? 'Çoklu Açı AI Analizi Tamamlandı' : isHumanLocal || isCombined || hasAI || hasSkin ? 'AI Analizi Tamamlandı' : 'Ön Değerlendirme Tamamlandı'}
          </span>

          {/* Main headline Ã¯¿½?" Cormorant Garamond, larger and more present */}
          <h1
            className="relative heading-display text-[#F8F6F2]"
            style={{
              fontSize: 'clamp(1.75rem, 5vw, 2.75rem)',
              maxWidth: '20ch',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {selectedLead.full_name.split(' ')[0]}, analiz özetiniz hazır
          </h1>

          {/* Supporting description */}
          <p
            className="relative font-body text-[14px] sm:text-[15px] font-normal leading-[1.8] text-center max-w-sm sm:max-w-md mt-5 sm:mt-6"
            style={{ color: 'rgba(214,185,140,0.55)' }}
          >
            {hasMultiView
              ? 'Ön, sol ve sağ açılardan çekilen görüntüler birleştirilerek bölgesel değerlendirme yapılmıştır.'
              : 'Sonuçlar çekim kalitesi ve bölgesel görünürlüğe göre değerlendirilmiştir.'}
          </p>

          {/* Editorial divider */}
          <div className="relative flex items-center gap-4 mt-8 sm:mt-10">
            <div className="h-px w-16 sm:w-24" style={{ background: 'linear-gradient(90deg, transparent, rgba(214,185,140,0.25))', animation: 'lineExpand 0.8s ease-out 0.3s both', transformOrigin: 'right' }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(214,185,140,0.25)' }} />
            <div className="h-px w-16 sm:w-24" style={{ background: 'linear-gradient(90deg, rgba(214,185,140,0.25), transparent)', animation: 'lineExpand 0.8s ease-out 0.3s both', transformOrigin: 'left' }} />
          </div>

        </div>

        {/* Ã¯¿½"?Ã¯¿½"? Score & Confidence Capsule Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
        {hasTrust && (
          <div className="flex flex-col items-center gap-4" style={{ animation: 'sectionReveal 0.5s ease-out 0.15s both' }}>
            <div
              className="inline-flex items-center gap-4 sm:gap-5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl"
              style={{
                background: 'rgba(14,12,10,0.60)',
                border: '1px solid rgba(214,185,140,0.10)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              {/* Capture quality score */}
              {captureQualityScore != null && (
                <div className="flex flex-col items-center gap-1">
                  <span className="font-body text-[9px] sm:text-[10px] tracking-[0.14em] uppercase" style={{ color: 'rgba(214,185,140,0.62)' }}>
                    Çekim
                  </span>
                  <span className="font-mono text-[18px] sm:text-[20px] font-light tabular-nums text-[rgba(248,246,242,0.75)]">
                    {captureQualityScore}
                  </span>
                </div>
              )}

              {/* Divider between scores */}
              {captureQualityScore != null && (
                <div className="w-px h-8 sm:h-9" style={{ background: 'rgba(214,185,140,0.10)' }} />
              )}

              {analysisInputQualityScore != null && (
                <>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-body text-[9px] sm:text-[10px] tracking-[0.14em] uppercase" style={{ color: 'rgba(214,185,140,0.62)' }}>
                      Analiz
                    </span>
                    <span className="font-mono text-[18px] sm:text-[20px] font-light tabular-nums text-[rgba(248,246,242,0.72)]">
                      {analysisInputQualityScore}
                    </span>
                  </div>
                  <div className="w-px h-8 sm:h-9" style={{ background: 'rgba(214,185,140,0.10)' }} />
                </>
              )}

              {/* Confidence level */}
              <div className="flex flex-col items-center gap-1">
                <span className="font-body text-[9px] sm:text-[10px] tracking-[0.14em] uppercase" style={{ color: 'rgba(214,185,140,0.62)' }}>
                  Güven
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: trustConfidence >= 70 ? '#3D9B7A' : trustConfidence >= 55 ? '#C4A35A' : trustConfidence >= 40 ? '#C4883A' : '#A05252',
                      boxShadow: trustConfidence >= 70 ? '0 0 6px rgba(61,155,122,0.4)' : 'none',
                    }}
                  />
                  <span className="font-body text-[13px] sm:text-[14px] font-medium tracking-[0.02em] text-[rgba(248,246,242,0.70)]">
                    {trustConfidence >= 85 ? 'Yüksek' : trustConfidence >= 70 ? 'İyi' : trustConfidence >= 55 ? 'Orta' : trustConfidence >= 40 ? 'Düşük' : 'Sınırlı'}
                  </span>
                </div>
              </div>

              {/* Young face badge */}
              {trustPipeline.young_face_active && (
                <>
                  <div className="w-px h-8 sm:h-9" style={{ background: 'rgba(214,185,140,0.10)' }} />
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-body text-[9px] sm:text-[10px] tracking-[0.14em] uppercase" style={{ color: 'rgba(214,185,140,0.62)' }}>
                      Profil
                    </span>
                    <span className="font-body text-[13px] sm:text-[14px] text-[rgba(248,246,242,0.70)]">
                      Genç Yüz
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Explanatory text Ã¯¿½?" calm, readable, secondary */}
            <p
              className="font-body text-[12px] sm:text-[13px] font-normal leading-[1.8] text-center max-w-sm sm:max-w-md"
              style={{ color: 'rgba(214,185,140,0.65)' }}
            >
              Çekim puanı kabul anındaki görüntü güvenilirliğini, güven puanı ise mevcut veriden üretilen raporun güven düzeyini gösterir.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
              {overallReliabilityBand && (
                <span className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.12em] uppercase border"
                  style={{ color: 'rgba(248,246,242,0.58)', borderColor: 'rgba(248,246,242,0.08)', background: 'rgba(248,246,242,0.02)' }}>
                  Güven Bandı {overallReliabilityBand}
                </span>
              )}
              {typeof evidenceCoverageScore === 'number' && (
                <span className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.12em] uppercase border"
                  style={{ color: 'rgba(74,227,167,0.72)', borderColor: 'rgba(74,227,167,0.10)', background: 'rgba(74,227,167,0.03)' }}>
                  Kanıt Kapsamı %{evidenceCoverageScore}
                </span>
              )}
              {livenessRequired && (
                <span className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.12em] uppercase border"
                  style={{
                    color: livenessPassed ? 'rgba(74,227,167,0.72)' : 'rgba(229,168,59,0.80)',
                    borderColor: livenessPassed ? 'rgba(74,227,167,0.10)' : 'rgba(229,168,59,0.12)',
                    background: livenessPassed ? 'rgba(74,227,167,0.03)' : 'rgba(229,168,59,0.04)',
                  }}>
                  {livenessPassed ? `Canlılık Doğrulandı %${livenessConfidence}` : `Canlılık Sınırlı %${livenessConfidence}`}
                </span>
              )}
              {suppressionCount > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.12em] uppercase border"
                  style={{ color: 'rgba(200,120,90,0.74)', borderColor: 'rgba(200,120,90,0.10)', background: 'rgba(200,120,90,0.03)' }}>
                  Bastırılan Bölge {suppressionCount}
                </span>
              )}
              {limitedRegionsCount > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.12em] uppercase border"
                  style={{ color: 'rgba(214,185,140,0.72)', borderColor: 'rgba(214,185,140,0.10)', background: 'rgba(214,185,140,0.03)' }}>
                  Sınırlı Bölge {limitedRegionsCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Ã¯¿½"?Ã¯¿½"? Soft Warning Banner (if any) Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
        {/* Post-capture rule: NEVER show blocking errors. Only soft warnings. */}
        {(() => {
          const warningLines: string[] = []
          const bannerTone = recaptureRecommended ? 'strong' : 'soft'

          if (recaptureRecommended) {
            warningLines.push(recaptureReason ?? 'Bu çekimde bazı açılar yeniden alınmadan tam güvenilirlik sağlanamadı.')
          }

          if (livenessRequired && !livenessPassed) {
            warningLines.push('Canlılık doğrulaması tamamlanamadı; bu sonuç daha düşük operasyonel güven ile sunulmaktadır.')
          }

          if (isFallback) {
            warningLines.push('Sonuçlar ön değerlendirme niteliğindedir.')
          }

          if (hasTrust && trustCaveat) {
            const safeCaveat = trustCaveat
              .replace(/^Analiz yapılamadı[^.]*\.\s*/gi, '')
              .replace(/^Yüz tam olarak görüntülenemedi[^.]*\.\s*/gi, '')
              .replace(/^Yüz açısı çok yüksek[^.]*\.\s*/gi, '')
              .replace(/^Analiz için görüntü uygun değil\.\s*/gi, '')
              .trim()
            if (safeCaveat) warningLines.push(safeCaveat)
          }

          if (hasTrust && trustPipeline.metrics_suppressed > 5) {
            warningLines.push(`${trustPipeline.metrics_suppressed} bölge yetersiz güven nedeniyle gösterilmemiştir.`)
          }

          if (captureLimitedViews.length > 0 && !recaptureRecommended) {
            warningLines.push(`Sınırlı açılar: ${captureLimitedViews.join(", ")}.`)
          }

          if (recaptureViews.length > 0) {
            warningLines.push(`Yeniden çekim önerilen açılar: ${recaptureViews.join(", ")}.`)
          }

          if (warningLines.length === 0) return null
          return (
            <div className="max-w-2xl mx-auto w-full" style={{ animation: 'sectionReveal 0.6s ease-out 0.1s both' }}>
              <div
                className="flex items-start gap-3 px-5 py-4 rounded-xl"
                style={{
                  border: bannerTone === 'strong'
                    ? '1px solid rgba(196,88,88,0.18)'
                    : '1px solid rgba(229,168,59,0.10)',
                  background: bannerTone === 'strong'
                    ? 'rgba(160,82,82,0.06)'
                    : 'rgba(229,168,59,0.03)',
                }}
              >
                <svg
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: bannerTone === 'strong' ? 'rgba(224,112,112,0.82)' : 'rgba(229,168,59,0.70)' }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <div className="flex flex-col gap-1">
                  {warningLines.map((line, i) => (
                    <span
                      key={i}
                      className="font-body text-[13px] sm:text-[12px] leading-[1.7] sm:leading-[1.6]"
                      style={{ color: bannerTone === 'strong' ? 'rgba(242,188,188,0.86)' : 'rgba(229,168,59,0.75)' }}
                    >
                      {line}
                    </span>
                  ))}
                  {recaptureRecommended && id && (
                    <div className="pt-2">
                      <Link href={`/analysis/media?id=${id}`} className="inline-flex">
                        <PremiumButton size="sm">
                          Çekimi Yeniden Al
                        </PremiumButton>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Ã¯¿½"?Ã¯¿½"? Radar Analysis Section Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
        {hasRadar && radarAnalysis && (
          <RadarChartSection
            scores={radarAnalysis.radarScores}
            captureQuality={radarAnalysis.analysisMeta.captureQuality}
            summaryText={radarAnalysis.derivedInsights.summaryText}
            reportConfidence={trustConfidence}
            evidenceCoverageScore={evidenceCoverageScore}
            livenessStatus={livenessStatus}
            overallReliabilityBand={overallReliabilityBand}
          />
        )}

        {/* Ã¯¿½"?Ã¯¿½"? Multi-View Gallery + Synthesis (when 3-view data available) Ã¯¿½"?Ã¯¿½"? */}
        {hasMultiView && hasViewPhotos && (
          <div className="max-w-5xl mx-auto w-full flex flex-col" style={{ gap: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
            <GlassCard elevated padding="lg" rounded="xl">
              <ThreeViewGallery
                photos={viewPhotos}
                viewQualities={multiViewAnalysis.viewQualities}
                onPhotoClick={(src) => { setLightboxOpen(true); setLightboxSrc(src) }}
              />
            </GlassCard>
            <GlassCard elevated padding="lg" rounded="xl">
              <MultiViewSynthesisSummary multiView={multiViewAnalysis} />
            </GlassCard>
          </div>
        )}

        {/* Ã¯¿½"?Ã¯¿½"? Detail Section: Photo + Detailed Analysis Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[minmax(280px,2fr)_3fr] items-start"
          style={{ gap: 'clamp(1.5rem, 3vw, 2.5rem)', animation: 'sectionReveal 0.7s ease-out 0.15s both' }}
        >
          {/* Left: Photo Ã¯¿½?" cinematic frame */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24">
            {photoUrl ? (
              <AnalysisPhoto src={photoUrl} onClick={() => { setLightboxOpen(true); setLightboxSrc(photoUrl) }} hasAI={hasAI} wrinkleRegions={wrinkleScores?.regions} />
            ) : (
              <PhotoPlaceholder />
            )}
            {/* Photo quality badge */}
            <div className="flex items-center justify-center gap-2.5 py-2 sm:py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[rgba(61,155,122,0.35)]" />
              <span className="font-body text-[12px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.14em] text-[rgba(248,246,242,0.55)] sm:text-[rgba(248,246,242,0.50)]">
                Fotoğraf Kalitesi: {photoQuality ? photoQualityLabels[photoQuality] : "Değerlendiriliyor"}
              </span>
            </div>
          </div>

          {/* Right: Scores + Summary Ã¯¿½?" premium card stack */}
          <div className="flex flex-col" style={{ gap: 'clamp(1rem, 2vw, 1.5rem)' }}>
            {/* Age Estimation Card */}
            {isHumanLocal && (
              <GlassCard elevated padding="lg" rounded="xl" className="[animation:sectionReveal_0.6s_ease-out_0.2s_both]">
                <AgeEstimationPanel
                  estimatedAge={estimatedAge}
                  confidence={analysisConfidence}
                  gender={estimatedGender}
                  genderConfidence={estimatedGenderConfidence}
                  ageEstimation={ageEstimation}
                />
              </GlassCard>
            )}

            {/* AI Scores Card */}
            {hasAI && (
              <GlassCard elevated padding="lg" rounded="xl" className="[animation:sectionReveal_0.6s_ease-out_0.3s_both]">
                <ScoresPanel
                  aiScores={aiScores}
                  qualityScore={captureQualityScore}
                />
              </GlassCard>
            )}

            {/* Focus Areas Card */}
            {detailedFocusAreas && detailedFocusAreas.length > 0 && (
              <GlassCard elevated padding="lg" rounded="xl" className="[animation:sectionReveal_0.6s_ease-out_0.4s_both]">
                <FocusAreasPanel focusAreas={detailedFocusAreas} />
              </GlassCard>
            )}

            {/* Wrinkle Analysis Card */}
            {hasWrinkle && (
              <GlassCard elevated padding="lg" rounded="xl" className="[animation:sectionReveal_0.6s_ease-out_0.45s_both]">
                <WrinkleAnalysisPanel wrinkleScores={wrinkleScores} />
              </GlassCard>
            )}

            {/* Skin Scores Card */}
            {hasSkin && (
              <GlassCard elevated padding="lg" rounded="xl" className="[animation:sectionReveal_0.6s_ease-out_0.5s_both]">
                <SkinScoresPanel skinScores={skinScores} />
              </GlassCard>
            )}

            {/* Fallback when no analysis data */}
            {!hasAI && !hasSkin && !hasWrinkle && (
              <GlassCard elevated padding="lg" rounded="xl">
                <div className="flex flex-col gap-5 text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-[rgba(214,185,140,0.06)] border border-[rgba(214,185,140,0.12)] flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <p className="font-body text-[14px] text-[rgba(248,246,242,0.55)] leading-relaxed">
                    Analiz tamamlandı. Sonuçlar fotoğraf kalite kriterlerini karşılayan kare üzerinden oluşturuldu.
                  </p>
                  <p className="font-body text-[13px] text-[rgba(248,246,242,0.48)] leading-[1.7]">
                    Sonuçlar klinik değerlendirme yerine geçmez.
                  </p>
                </div>
              </GlassCard>
            )}

            {/* Regional Evaluations Card Ã¯¿½?" the primary value section */}
            <GlassCard elevated padding="lg" rounded="xl" className="[animation:sectionReveal_0.6s_ease-out_0.55s_both]">
              <div className="flex flex-col gap-7">

                {/* Limited Areas Ã¯¿½?" shown only when relevant */}
                {limitedAreas && (
                  <>
                    <div>
                      <span className="text-label text-[rgba(248,246,242,0.50)] mb-3 block">Sınırlı Değerlendirme Alanları</span>
                      <div className="flex gap-3 items-start rounded-md border border-[rgba(248,246,242,0.06)] bg-[rgba(248,246,242,0.015)] px-4 py-3">
                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[rgba(248,246,242,0.42)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        <span className="font-body text-[12px] text-[rgba(248,246,242,0.52)] leading-[1.7]">{limitedAreas}</span>
                      </div>
                    </div>
                    <ThinLine />
                  </>
                )}

                {/* Regional Score Cards Ã¯¿½?" multi-view preferred, specialist fallback */}
                {(selectedLead.multi_view_analysis || selectedLead.specialist_analysis?.assessments || (hasTrust && trustPipeline?.observations)) && (
                  <>
                    <RegionalScoreCards
                      observations={trustPipeline?.observations}
                      wrinkleScores={selectedLead.wrinkle_scores}
                      specialistAssessments={selectedLead.specialist_analysis?.assessments}
                      multiViewAnalysis={selectedLead.multi_view_analysis}
                    />
                    <ThinLine />
                  </>
                )}

                {/* Priority Focus Areas */}
                <div>
                  <span className="text-label text-[rgba(248,246,242,0.55)] sm:text-[rgba(248,246,242,0.50)] mb-4 block">Öncelikli Odak Alanları</span>
                  <div className="flex flex-wrap gap-2.5">
                    {focusAreas.map((area) => (
                      <span
                        key={area}
                        className="font-body text-[12px] sm:text-[11px] px-4 py-2.5 sm:py-2 rounded-full border border-[rgba(214,185,140,0.12)] sm:border-[rgba(214,185,140,0.10)] text-[rgba(214,185,140,0.70)] sm:text-[rgba(214,185,140,0.65)] bg-[rgba(214,185,140,0.04)] sm:bg-[rgba(214,185,140,0.03)]"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expert evaluation Ã¯¿½?" single clean card */}
                <div className="rounded-xl border border-[rgba(61,155,122,0.10)] bg-[rgba(61,155,122,0.02)] px-5 py-4">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[rgba(61,155,122,0.50)]" />
                    <span className="font-body text-[10px] sm:text-[11px] tracking-[0.16em] uppercase text-[rgba(61,155,122,0.55)]">
                      Uzman Değerlendirmesi
                    </span>
                  </div>
                  <p className="font-body text-[13px] sm:text-[12px] text-[rgba(248,246,242,0.50)] leading-[1.75]">
                    Öncelikli incelenebilecek bölgeler belirlenmiştir. Bu analiz, uzman görüşmesi öncesinde görsel bir ön değerlendirme sunar.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Ã¯¿½"?Ã¯¿½"? CTA Buttons Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
        <div className="flex flex-col gap-4 max-w-md mx-auto w-full px-1 sm:px-0" style={{ animation: 'sectionReveal 0.6s ease-out 0.6s both' }}>
          <a
            href={contact.whatsappBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <PremiumButton variant="gold" size="lg" className="w-full justify-center gap-3">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.847L.057 23.882a.5.5 0 00.61.61l6.035-1.466A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.661-.518-5.175-1.42l-.37-.216-3.837.932.949-3.837-.234-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              WhatsApp ile Randevu Planla
            </PremiumButton>
          </a>
          <Link href="/">
            <PremiumButton variant="ghost" size="md" className="w-full justify-center">
              Ana Sayfaya Dön
            </PremiumButton>
          </Link>
        </div>
      </div>

      {/* Ã¯¿½"?Ã¯¿½"? Footer note Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"?Ã¯¿½"? */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 pb-8">
        <p className="font-body text-[12px] sm:text-[11px] text-[rgba(248,246,242,0.42)] leading-[1.7] text-center">
          Kesin değerlendirme, klinik muayene ve uzman görüşmesi ile netleşir.
        </p>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (lightboxSrc || photoUrl) && (
        <PhotoLightbox src={lightboxSrc || photoUrl!} onClose={() => { setLightboxOpen(false); setLightboxSrc(null) }} />
      )}
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div className="theme-dark min-h-screen flex items-center justify-center" style={{ background: '#0A0908' }}>
        <div className="w-10 h-10 rounded-full border-[1.5px] border-transparent border-t-[#D6B98C] animate-spin" />
      </div>
    }>
      <ResultContent />
    </Suspense>
  )
}
