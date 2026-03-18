'use client'

import { useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { ThinLine } from '@/components/design-system/ThinLine'
import type { ExternalAnalysisResult, ExternalAnalysisError } from '@/lib/external-analysis/types'

type PageState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error'

const GUIDANCE_ITEMS = [
  { icon: '👤', text: 'Yüzünüz tam karşıdan ve merkezde olsun' },
  { icon: '💡', text: 'İyi aydınlatılmış bir ortamda çekin' },
  { icon: '👁', text: 'Göz hizasında, düz açıyla çekim yapın' },
  { icon: '🚫', text: 'Gözlük, saç veya maske yüzü kapatmasın' },
]

const SKIN_LABELS: Record<string, string> = {
  skinAge: 'Cilt Yaşı',
  wrinkle: 'Kırışıklık',
  texture: 'Cilt Dokusu',
  pore: 'Gözenek',
  pigmentation: 'Pigmentasyon',
  redness: 'Kızarıklık',
}

const FACE_LABELS: Record<string, string> = {
  symmetry: 'Simetri',
  harmony: 'Uyum',
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function AIAnalysisPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<PageState>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ExternalAnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  const reset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setState('idle')
    setPreview(null)
    setResult(null)
    setErrorMsg(null)
    setImageFile(null)
  }, [preview])

  function handleFileSelect(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMsg('Geçersiz dosya türü. JPG, PNG veya WebP yükleyin.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg(`Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum 10 MB.`)
      return
    }
    setErrorMsg(null)
    if (preview) URL.revokeObjectURL(preview)
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  async function handleCameraCapture() {
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      })

      const video = document.createElement('video')
      video.srcObject = stream
      video.playsInline = true
      await video.play()

      // Wait for video dimensions to be available
      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) { resolve(); return }
        video.onloadeddata = () => resolve()
      })

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)

      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
          handleFileSelect(file)
        },
        'image/jpeg',
        0.92
      )
    } catch {
      setErrorMsg('Kameraya erişim sağlanamadı. Tarayıcı izinlerini kontrol edin.')
    } finally {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }

  async function handleAnalyze() {
    if (!imageFile) return

    setState('uploading')
    setErrorMsg(null)

    try {
      const formData = new FormData()
      formData.append('image', imageFile)

      setState('analyzing')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)

      const res = await fetch('/api/analyze-face', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const data: ExternalAnalysisResult | ExternalAnalysisError = await res.json()

      if (!data.success) {
        const errData = data as ExternalAnalysisError
        setErrorMsg(errData.error || 'Analiz başarısız oldu.')
        setState('error')
        return
      }

      setResult(data as ExternalAnalysisResult)
      setState('success')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('Analiz zaman aşımına uğradı. Lütfen tekrar deneyin.')
      } else {
        setErrorMsg('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.')
      }
      setState('error')
    }
  }

  const isLoading = state === 'uploading' || state === 'analyzing'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="text-center">
          <SectionLabel className="justify-center mb-3">Gelişmiş Analiz</SectionLabel>
          <h1 className="font-display text-[clamp(28px,4vw,44px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
            AI Ön Değerlendirme
          </h1>
          <p className="font-body text-[14px] text-[rgba(26,26,46,0.6)] leading-relaxed mt-3 max-w-md mx-auto">
            PerfectCorp teknolojisi ile cilt ve yüz yapısı ön analizi. Sonuçlar doktor değerlendirmesini desteklemek içindir.
          </p>
        </div>

        {/* Guidance */}
        <GlassCard strong padding="md" rounded="xl">
          <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[#8B7FA8] mb-4">Çekim Rehberi</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GUIDANCE_ITEMS.map((item) => (
              <div
                key={item.text}
                className="flex items-start gap-3 rounded-[12px] border border-[rgba(196,163,90,0.12)] bg-[rgba(255,254,249,0.55)] px-4 py-3"
              >
                <span className="text-[18px] flex-shrink-0 mt-0.5">{item.icon}</span>
                <span className="font-body text-[12px] text-[rgba(26,26,46,0.7)] leading-relaxed">{item.text}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Upload area */}
        {state !== 'success' && (
          <GlassCard strong padding="lg" rounded="xl">
            <div className="flex flex-col gap-5">
              {!preview ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex flex-col items-center justify-center gap-4 py-16 rounded-[16px] border-2 border-dashed border-[rgba(196,163,90,0.3)] bg-[rgba(196,163,90,0.03)] hover:border-[rgba(196,163,90,0.5)] hover:bg-[rgba(196,163,90,0.06)] transition-all cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-[rgba(196,163,90,0.1)] flex items-center justify-center">
                    <svg className="w-7 h-7 text-[#C4A35A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="font-body text-[13px] text-[#1A1A2E]">
                      Fotoğrafı sürükleyip bırakın veya <span className="text-[#C4A35A] font-medium">seçmek için tıklayın</span>
                    </p>
                    <p className="font-body text-[11px] text-[rgba(26,26,46,0.4)] mt-1">
                      JPG, PNG, WebP — Maks. 10 MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelect(file)
                    }}
                  />
                </div>
              ) : (
                <div className="relative">
                  <div className="aspect-[4/5] max-h-[420px] w-full rounded-[16px] overflow-hidden shadow-[0_8px_32px_rgba(26,26,46,0.1)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Yüklenen fotoğraf" className="w-full h-full object-cover object-[center_25%]" />
                  </div>
                  {!isLoading && (
                    <button
                      type="button"
                      onClick={reset}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm shadow-lg flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#A05252]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Camera + Analyze buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {!preview && (
                  <PremiumButton variant="ghost" size="md" onClick={handleCameraCapture} className="flex-1 justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                    </svg>
                    Kamera ile Çek
                  </PremiumButton>
                )}

                {preview && (
                  <PremiumButton
                    variant="primary"
                    size="lg"
                    onClick={handleAnalyze}
                    disabled={isLoading}
                    className="flex-1 justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        {state === 'uploading' ? 'Yükleniyor...' : 'Analiz yapılıyor...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        Analizi Başlat
                      </>
                    )}
                  </PremiumButton>
                )}
              </div>
            </div>
          </GlassCard>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-[14px] border border-[rgba(160,82,82,0.2)] bg-[rgba(160,82,82,0.05)] px-5 py-4">
            <p className="font-body text-[13px] text-[#A05252] leading-relaxed">{errorMsg}</p>
            {state === 'error' && (
              <button
                type="button"
                onClick={reset}
                className="font-body text-[12px] text-[#C4A35A] mt-2 underline underline-offset-2 hover:text-[#1A1A2E] transition-colors"
              >
                Yeniden dene
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {state === 'success' && result && (
          <>
            {/* Quality check */}
            <GlassCard strong padding="md" rounded="xl">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  result.quality.passed
                    ? 'bg-[rgba(61,122,95,0.1)] border border-[rgba(61,122,95,0.25)]'
                    : 'bg-[rgba(160,82,82,0.1)] border border-[rgba(160,82,82,0.25)]'
                }`}>
                  {result.quality.passed ? (
                    <svg className="w-5 h-5 text-[#3D7A5F]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#A05252]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-body text-[10px] tracking-[0.18em] uppercase text-[rgba(26,26,46,0.4)]">Fotoğraf Kalitesi</p>
                  <p className="font-body text-[14px] text-[#1A1A2E]">{result.quality.message}</p>
                </div>
              </div>
            </GlassCard>

            {/* Photo + Results side by side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
              {/* Photo */}
              {preview && (
                <div className="aspect-[4/5] rounded-[20px] overflow-hidden shadow-[0_8px_32px_rgba(26,26,46,0.12)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Analiz edilen fotoğraf" className="w-full h-full object-cover object-[center_25%]" />
                </div>
              )}

              {/* Analysis cards */}
              <div className="flex flex-col gap-6">
                {/* Skin analysis */}
                <GlassCard strong padding="lg" rounded="xl">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#C4A35A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[#8B7FA8]">Cilt Analizi</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {Object.entries(SKIN_LABELS).map(([key, label]) => {
                        const value = result.skin[key as keyof typeof result.skin]
                        return (
                          <div key={key} className="flex justify-between items-center py-2 border-b border-[rgba(196,163,90,0.08)] last:border-0">
                            <span className="font-body text-[12px] text-[rgba(26,26,46,0.6)]">{label}</span>
                            {value !== null ? (
                              <span className="font-mono text-[14px] text-[#1A1A2E] font-medium">
                                {key === 'skinAge' ? value : `${value}/100`}
                              </span>
                            ) : (
                              <span className="font-body text-[11px] text-[rgba(26,26,46,0.3)] italic">Veri yok</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </GlassCard>

                {/* Face analysis */}
                <GlassCard strong padding="lg" rounded="xl">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#2D5F5D]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[#8B7FA8]">Yüz Yapısı</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {Object.entries(FACE_LABELS).map(([key, label]) => {
                        const value = result.face[key as keyof typeof result.face]
                        return (
                          <div key={key} className="flex justify-between items-center py-2 border-b border-[rgba(196,163,90,0.08)] last:border-0">
                            <span className="font-body text-[12px] text-[rgba(26,26,46,0.6)]">{label}</span>
                            {value !== null ? (
                              <span className="font-mono text-[14px] text-[#1A1A2E] font-medium">{value}/100</span>
                            ) : (
                              <span className="font-body text-[11px] text-[rgba(26,26,46,0.3)] italic">Veri yok</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>

            {/* Notes & disclaimer */}
            <GlassCard strong padding="md" rounded="xl">
              <div className="flex flex-col gap-4">
                {result.notes.map((note, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#C4A35A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span className="font-body text-[12px] text-[rgba(26,26,46,0.65)] leading-relaxed">{note}</span>
                  </div>
                ))}

                <ThinLine />

                <div className="bg-[rgba(196,163,90,0.05)] border border-[rgba(196,163,90,0.15)] rounded-[10px] p-4">
                  <p className="font-body text-[11px] text-[rgba(26,26,46,0.5)] leading-relaxed italic">
                    Bu analiz doktor ön değerlendirmesini desteklemek içindir. Nihai değerlendirme klinik muayene ile yapılmalıdır.
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <PremiumButton variant="primary" size="lg" onClick={reset} className="w-full justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Yeni Analiz Yap
              </PremiumButton>
              <Link href="/">
                <PremiumButton variant="ghost" size="md" className="w-full justify-center">
                  Ana Sayfaya Dön
                </PremiumButton>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
