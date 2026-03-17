'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ThinLine } from '@/components/design-system/ThinLine'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { photoQualityLabels } from '@/types/lead'
import type { Lead } from '@/types/lead'
import { getPhoto, removePhoto } from '@/lib/photo-bridge'
import { LandmarkOverlay } from '@/components/analysis/LandmarkOverlay'

const fallbackFocusAreas = ['Göz Çevresi', 'Orta Yüz', 'Alt Yüz', 'Cilt Görünümü']

/* ── Score bar ─────────────────────────────────────────────── */
function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? '#3D9B7A' : score >= 50 ? '#D6B98C' : '#B06060'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="font-body text-[12px] text-[rgba(248,246,242,0.45)]">{label}</span>
        <span className="font-mono text-[16px] font-medium" style={{ color }}>
          {score}<span className="text-[11px] text-[rgba(248,246,242,0.25)]">/100</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[rgba(248,246,242,0.06)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="font-body text-[12px] text-[rgba(248,246,242,0.45)]">{label}</span>
      <span className="font-mono text-[13px] text-[#F8F6F2]">{value}</span>
    </div>
  )
}

/* ── Lightbox ──────────────────────────────────────────────── */
function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,26,46,0.75)] backdrop-blur-md p-4 cursor-pointer"
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Analiz görseli — büyük önizleme"
          className="max-w-full max-h-[85vh] rounded-[20px] shadow-[0_32px_80px_rgba(26,26,46,0.35)] object-contain"
        />
        <button
          type="button"
          aria-label="Önizlemeyi kapat"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center hover:bg-white transition-colors"
        >
          <svg className="w-5 h-5 text-[#1A1A2E]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ── Hero photo card with landmark overlay ─────────────────── */
function AnalysisPhoto({ src, onClick, hasAI }: { src: string; onClick: () => void; hasAI: boolean }) {
  const [showLandmarks, setShowLandmarks] = useState(hasAI)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-[20px] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
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
          {/* Landmark overlay on the photo */}
          {hasAI && <LandmarkOverlay src={src} visible={showLandmarks} />}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-[rgba(0,0,0,0.0)] group-hover:bg-[rgba(0,0,0,0.2)] transition-colors duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg">
              <svg className="w-5 h-5 text-[#1A1A2E]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
              </svg>
            </div>
          </div>
          {/* Bottom gradient for label */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[rgba(10,10,15,0.7)] to-transparent pt-10 pb-4 px-4">
            <p className="font-body text-[11px] tracking-[0.18em] uppercase text-white/90 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              {showLandmarks ? 'AI Harita Görünümü' : 'Analiz Edilen Görüntü'}
            </p>
          </div>
        </button>

        {/* Landmark toggle button */}
        {hasAI && (
          <button
            type="button"
            onClick={() => setShowLandmarks((v) => !v)}
            className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-medium tracking-[0.1em] uppercase border backdrop-blur-md transition-all duration-300 ${
              showLandmarks
                ? 'bg-[rgba(0,255,102,0.15)] text-[#00FF66] border-[rgba(0,255,102,0.3)]'
                : 'bg-[rgba(255,255,255,0.1)] text-white/60 border-[rgba(255,255,255,0.15)] hover:text-white hover:border-[rgba(255,255,255,0.3)]'
            }`}
            aria-label={showLandmarks ? 'Haritayı gizle' : 'Haritayı göster'}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              {showLandmarks ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              )}
            </svg>
            {showLandmarks ? '468 Nokta' : 'Harita'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── No-photo placeholder ──────────────────────────────────── */
function PhotoPlaceholder() {
  return (
    <div className="aspect-[4/5] w-full rounded-[20px] bg-gradient-to-br from-[rgba(20,18,15,0.5)] to-[rgba(20,18,15,0.3)] flex flex-col items-center justify-center gap-3 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
      <div className="w-16 h-16 rounded-full bg-[rgba(248,246,242,0.05)] flex items-center justify-center">
        <svg className="w-8 h-8 text-[rgba(248,246,242,0.2)]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <p className="font-body text-[11px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.25)]">Fotoğraf yüklenmedi</p>
    </div>
  )
}

/* ── Scores compact card (for desktop sidebar) ─────────────── */
function ScoresPanel({ aiScores }: { aiScores: NonNullable<Lead['ai_scores']> }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.45)]">Yüz Geometrisi</p>
      </div>

      <ScoreBar label="Simetri Skoru" score={aiScores.symmetry} />
      <ScoreBar label="Altın Oran Uyumu" score={aiScores.proportion} />

      <ThinLine />

      <div>
        <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.35)] mb-3">Ölçümler</p>
        <MetricRow label="Yüz Genişlik / Uzunluk" value={aiScores.metrics.faceRatio.toFixed(2)} />
        <MetricRow label="Göz Mesafesi Oranı" value={aiScores.metrics.eyeDistanceRatio.toFixed(2)} />
        <MetricRow label="Burun Genişliği Oranı" value={aiScores.metrics.noseToFaceWidth.toFixed(2)} />
        <MetricRow label="Dudak / Burun Oranı" value={aiScores.metrics.mouthToNoseWidth.toFixed(2)} />
        <MetricRow label="Simetri Oranı" value={aiScores.metrics.symmetryRatio.toFixed(2)} />
      </div>
    </div>
  )
}

/* ── Skin analysis scores (PerfectCorp) ────────────────────── */
function SkinScoreRow({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  if (value === null || value === undefined) return null
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="font-body text-[12px] text-[rgba(248,246,242,0.45)]">{label}</span>
      <span className="font-mono text-[13px] text-[#F8F6F2]">
        {display}{unit ? <span className="text-[10px] text-[rgba(248,246,242,0.25)] ml-0.5">{unit}</span> : null}
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
          <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.35)] mb-3">Yüz Uyumu</p>
          <SkinScoreRow label="Yüz Simetrisi" value={skinScores.face_symmetry} />
          <SkinScoreRow label="Yüz Harmonisi" value={skinScores.face_harmony} />
        </div>
      )}
    </div>
  )
}

/* ── Main result content ───────────────────────────────────── */
function ResultContent() {
  const { leads } = useClinicStore()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const selectedLead = id ? leads.find((lead) => lead.id === id) : undefined
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (!selectedLead) {
    return (
      <div className="theme-dark min-h-screen py-28 px-5" style={{ background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)' }}>
        <div className="max-w-lg mx-auto">
          <GlassCard strong padding="lg" rounded="xl">
            <div className="flex flex-col gap-4 text-center">
              <SectionLabel className="justify-center">Sonuç Bulunamadı</SectionLabel>
              <h1 className="font-display text-[32px] font-light text-[#F8F6F2]">Analiz kaydına ulaşılamadı</h1>
              <p className="font-body text-[14px] text-[rgba(248,246,242,0.55)] leading-relaxed">
                Ön değerlendirmeyi yeniden başlatarak fotoğrafınızı tekrar yükleyebilirsiniz.
              </p>
              <Link href="/analysis">
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

  const focusAreas = selectedLead.patient_summary?.focus_areas ?? fallbackFocusAreas
  const photoQuality = selectedLead.patient_summary?.photo_quality
  const aiScores = selectedLead.ai_scores
  const skinScores = selectedLead.skin_scores
  const analysisSource = selectedLead.analysis_source
  const hasAI = !!aiScores
  const hasSkin = !!skinScores
  const isCombined = analysisSource?.provider === 'combined'
  const isFallback = analysisSource?.provider === 'mock' || (!hasAI && !hasSkin)
  // Photo may have been stripped from localStorage (quota protection).
  // Recover from sessionStorage bridge if needed.
  const photoUrl = selectedLead.patient_photo_url || (id ? getPhoto(id) : null)

  return (
    <div className="theme-dark min-h-screen py-28 px-5 relative" style={{ background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)' }}>
      {/* Subtle radial glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(214,185,140,0.04) 0%, transparent 60%)' }} />
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[rgba(61,155,122,0.1)] border border-[rgba(61,155,122,0.2)] flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <SectionLabel className="justify-center mb-3">
            {isCombined ? 'AI Analiz Tamamlandı' : isFallback ? 'Ön Değerlendirme (Sınırlı)' : hasAI || hasSkin ? 'AI Analiz Tamamlandı' : 'Ön Değerlendirme Tamamlandı'}
          </SectionLabel>
          <h1 className="font-display text-[clamp(28px,4vw,44px)] font-light text-[#F8F6F2] tracking-[-0.02em]">
            {selectedLead.full_name.split(' ')[0]}, analiz özetiniz hazır
          </h1>
        </div>

        {/* ── Hero section: Photo + Scores ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,2fr)_3fr] gap-6 items-start">
          {/* Left: Photo */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-28">
            {photoUrl ? (
              <AnalysisPhoto src={photoUrl} onClick={() => setLightboxOpen(true)} hasAI={hasAI} />
            ) : (
              <PhotoPlaceholder />
            )}
            {/* Photo quality badge below photo */}
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-2 h-2 rounded-full bg-[rgba(61,155,122,0.4)]" />
              <span className="font-body text-[11px] tracking-[0.12em] text-[rgba(248,246,242,0.35)]">
                Fotoğraf Kalitesi: {photoQuality ? photoQualityLabels[photoQuality] : 'Değerlendiriliyor'}
              </span>
            </div>
          </div>

          {/* Right: Scores + Summary */}
          <div className="flex flex-col gap-6">
            {/* AI Scores Card */}
            {hasAI && (
              <GlassCard strong padding="lg" rounded="xl">
                <ScoresPanel aiScores={aiScores} />
              </GlassCard>
            )}

            {/* Skin Scores Card */}
            {hasSkin && (
              <GlassCard strong padding="lg" rounded="xl">
                <SkinScoresPanel skinScores={skinScores} />
              </GlassCard>
            )}

            {/* Summary Card */}
            <GlassCard strong padding="lg" rounded="xl">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.45)] mb-2">Ön Değerlendirme</p>
                  <p className="font-body text-[14px] text-[rgba(248,246,242,0.6)] leading-relaxed">
                    {selectedLead.patient_summary?.summary_text ??
                      'Yüklediğiniz görsel ve paylaştığınız bilgiler üzerinden yapılan ön incelemede, doktor değerlendirmesine uygun odak alanları çıkarıldı.'}
                  </p>
                </div>

                <ThinLine />

                {/* AI Suggestions */}
                {hasAI && aiScores.suggestions.length > 0 && (
                  <>
                    <div>
                      <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.35)] mb-3">Estetik Tespitler</p>
                      <div className="flex flex-col gap-2">
                        {aiScores.suggestions.map((suggestion, i) => (
                          <div
                            key={i}
                            className="flex gap-2.5 items-start rounded-[10px] border border-[rgba(214,185,140,0.12)] bg-[rgba(214,185,140,0.04)] px-3.5 py-2.5"
                          >
                            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            <span className="font-body text-[12px] text-[rgba(248,246,242,0.6)] leading-relaxed">{suggestion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <ThinLine />
                  </>
                )}

                {/* Focus areas */}
                <div>
                  <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.35)] mb-3">Odak Alanları</p>
                  <div className="flex flex-wrap gap-2">
                    {focusAreas.map((area) => (
                      <span
                        key={area}
                        className="font-body text-[11px] px-3 py-1.5 rounded-full border border-[rgba(214,185,140,0.15)] text-[#D6B98C] bg-[rgba(214,185,140,0.04)]"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Next step info */}
                <div className="rounded-[12px] border border-[rgba(214,185,140,0.1)] bg-[rgba(20,18,15,0.4)] px-4 py-3">
                  <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(248,246,242,0.35)] mb-1">
                    Sonraki Adım
                  </p>
                  <p className="font-body text-[14px] text-[#F8F6F2]">Doktor ön incelemesi ve randevu planlama</p>
                </div>

                {/* Disclaimer */}
                <div className="bg-[rgba(214,185,140,0.03)] border border-[rgba(214,185,140,0.08)] rounded-[10px] p-4">
                  <p className="font-body text-[11px] text-[rgba(248,246,242,0.35)] leading-relaxed italic">
                    Bu sistem doktor kararını destekler, yerine geçmez. Kesin tedavi planı klinik muayene ve doktor değerlendirmesi sonrasında oluşturulur.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Dev-mode: Analysis Source Debug Panel */}
        {process.env.NODE_ENV === 'development' && (
          <div className="rounded-[12px] border-2 border-dashed border-[rgba(196,163,90,0.4)] bg-[rgba(196,163,90,0.05)] p-4 font-mono text-[11px] text-[rgba(26,26,46,0.7)] flex flex-col gap-1.5">
            <p className="font-body font-semibold text-[12px] text-[#C4A35A] tracking-[0.15em] uppercase mb-1">Debug: Analysis Source</p>
            <p>Provider: <strong>{analysisSource?.provider ?? 'unknown'}</strong></p>
            <p>Source: <strong>{analysisSource?.source ?? 'unknown'}</strong></p>
            <p>FaceMesh: <strong className={analysisSource?.facemesh_ok ? 'text-[#3D7A5F]' : 'text-[#A05252]'}>{analysisSource?.facemesh_ok ? 'OK' : 'FAILED'}</strong></p>
            <p>PerfectCorp: <strong className={analysisSource?.perfectcorp_ok ? 'text-[#3D7A5F]' : 'text-[#A05252]'}>{analysisSource?.perfectcorp_ok ? 'OK' : 'FAILED'}</strong></p>
            <p>Analyzed at: {analysisSource?.analyzed_at ?? 'N/A'}</p>
            <p>Lead ID: {selectedLead.id}</p>
            <p>Photo available: {photoUrl ? 'yes' : 'no'}{photoUrl?.startsWith('data:') ? ' (data URI)' : photoUrl?.startsWith('blob:') ? ' (blob URL)' : photoUrl ? ' (URL)' : ''}</p>
            <p>AI scores (FaceMesh): {hasAI ? 'yes' : 'no'}</p>
            <p>Skin scores (PerfectCorp): {hasSkin ? 'yes' : 'no'}</p>
            <p>Created: {selectedLead.created_at}</p>
            {!analysisSource && (
              <p className="text-[#A05252] font-semibold mt-1">
                WARNING: No analysis_source field — this lead was created before source tracking was added, or analysis failed before saving source info.
              </p>
            )}
          </div>
        )}

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 max-w-lg mx-auto w-full">
          <a
            href="https://wa.me/905321234567?text=Merhaba%2C%20AI%20%C3%B6n%20de%C4%9Ferlendirmemi%20tamamlad%C4%B1m.%20Randevu%20planlamak%20istiyorum."
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

      {/* Lightbox */}
      {lightboxOpen && photoUrl && (
        <PhotoLightbox src={photoUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div className="theme-dark min-h-screen flex items-center justify-center" style={{ background: '#0E0B09' }}>
        <div className="w-12 h-12 rounded-full border-2 border-transparent border-t-[#D6B98C] animate-spin" />
      </div>
    }>
      <ResultContent />
    </Suspense>
  )
}
