'use client'

import { useEffect, useRef, useState } from 'react'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { GlassCard } from '@/components/design-system/GlassCard'

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void
  onClose: () => void
}

function diagnoseCameraError(err: unknown): string {
  if (!(err instanceof DOMException)) return 'Kamera başlatılamadı'
  switch (err.name) {
    case 'NotAllowedError': return 'Kamera izni reddedildi. Lütfen tarayıcı ayarlarından kamera iznini açın.'
    case 'NotFoundError': return 'Kamera bulunamadı. Lütfen bir kamera bağlayın.'
    case 'NotReadableError': return 'Kamera başka bir uygulama tarafından kullanılıyor. Diğer uygulamaları kapatıp tekrar deneyin.'
    case 'OverconstrainedError': return 'Kamera istenen çözünürlüğü desteklemiyor.'
    case 'SecurityError': return 'Kamera güvenli bağlantı (HTTPS) gerektirir.'
    default: return `Kamera hatası: ${err.message}`
  }
}

async function acquireCamera(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new DOMException('Kamera yalnızca güvenli bağlantılarda çalışır.', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Bu tarayıcı kamera erişimini desteklemiyor.', 'NotFoundError')
  }

  // Attempt 1: front camera with ideal resolution
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }

  // Attempt 2: front camera, no resolution
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') throw err
  }

  // Attempt 3: enumerate and try each device
  const devices = await navigator.mediaDevices.enumerateDevices()
  const videoDevices = devices.filter((d) => d.kind === 'videoinput')
  if (videoDevices.length === 0) throw new DOMException('Kamera bulunamadı.', 'NotFoundError')

  for (const device of videoDevices) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } })
    } catch { /* try next */ }
  }

  // Attempt 4: bare minimum
  return await navigator.mediaDevices.getUserMedia({ video: true })
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    acquireCamera()
      .then(async (stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try { await videoRef.current.play() } catch { /* autoPlay attr handles it */ }
        }
      })
      .catch((err) => setError(diagnoseCameraError(err)))
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const takeSnapshot = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirror the image
    ctx.resetTransform()
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPreview(dataUrl)
  }

  const confirm = () => {
    if (preview) onCapture(preview)
  }

  const retake = () => setPreview(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,26,46,0.7)] backdrop-blur-sm p-4">
      <GlassCard strong padding="lg" rounded="xl" className="w-full max-w-md">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-light text-[#1A1A2E]">Fotoğraf Çek</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[rgba(26,26,46,0.5)] hover:bg-[rgba(26,26,46,0.05)] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error ? (
            <p className="font-body text-[12px] text-[#A05252] bg-[rgba(160,82,82,0.06)] rounded-[10px] px-4 py-3">{error}</p>
          ) : preview ? (
            <div className="rounded-[12px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Önizleme" className="w-full" />
            </div>
          ) : (
            <div className="rounded-[12px] overflow-hidden bg-[#1A1A2E] aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-3">
            {preview ? (
              <>
                <PremiumButton variant="ghost" size="md" onClick={retake} className="flex-1 justify-center">Yeniden Çek</PremiumButton>
                <PremiumButton size="md" onClick={confirm} className="flex-1 justify-center">Kullan</PremiumButton>
              </>
            ) : (
              <>
                <PremiumButton variant="ghost" size="md" onClick={onClose} className="flex-1 justify-center">İptal</PremiumButton>
                <PremiumButton size="md" onClick={takeSnapshot} disabled={!!error} className="flex-1 justify-center">Fotoğraf Çek</PremiumButton>
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
