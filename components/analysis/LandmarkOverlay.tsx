'use client'

import { useEffect, useRef, useState } from 'react'
import type { Landmark } from '@/lib/ai/types'
import { drawMesh } from './FaceGuideCapture'

// ─── Single source of truth: overlay state machine ──────────
// idle      → initial, waiting to start
// analyzing → FaceMesh running (shows spinner)
// mapped    → landmarks ready, canvas drawn (shows mesh)
// error     → analysis failed or timed out (nothing shown)
type OverlayState = 'idle' | 'analyzing' | 'mapped' | 'error'

const ANALYSIS_TIMEOUT_MS = 8000

interface LandmarkOverlayProps {
  src: string
  landmarks?: Landmark[]
  visible?: boolean
  className?: string
  objectPositionY?: number
}

/**
 * Compute the transform that CSS `object-cover` applies, so we can map
 * normalized landmark coordinates (0-1 in original image space) to
 * the visible canvas area.
 */
function computeObjectCoverTransform(
  naturalW: number,
  naturalH: number,
  containerW: number,
  containerH: number,
  posX = 0.5,
  posY = 0.25
) {
  const imgAspect = naturalW / naturalH
  const ctrAspect = containerW / containerH

  let scale: number
  let offsetX: number
  let offsetY: number

  if (imgAspect > ctrAspect) {
    // Image wider than container — scale by height, crop sides
    scale = containerH / naturalH
    const renderedW = naturalW * scale
    offsetX = (renderedW - containerW) * posX
    offsetY = 0
  } else {
    // Image taller than container — scale by width, crop top/bottom
    scale = containerW / naturalW
    const renderedH = naturalH * scale
    offsetX = 0
    offsetY = (renderedH - containerH) * posY
  }

  return { scale, offsetX, offsetY }
}

/**
 * Transform landmarks from original image space to canvas/container space,
 * accounting for the object-cover crop and offset.
 */
function transformLandmarks(
  landmarks: Landmark[],
  naturalW: number,
  naturalH: number,
  containerW: number,
  containerH: number,
  posY: number
): Landmark[] {
  const { scale, offsetX, offsetY } = computeObjectCoverTransform(
    naturalW, naturalH, containerW, containerH, 0.5, posY
  )

  return landmarks.map((lm) => ({
    x: (lm.x * naturalW * scale - offsetX) / containerW,
    y: (lm.y * naturalH * scale - offsetY) / containerH,
    z: lm.z,
  }))
}

export function LandmarkOverlay({
  src,
  landmarks: propLandmarks,
  visible = true,
  className = '',
  objectPositionY = 0.25,
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Single state machine — prevents conflicting UI
  const [state, setState] = useState<OverlayState>(
    propLandmarks && propLandmarks.length > 0 ? 'mapped' : 'idle'
  )
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(propLandmarks ?? null)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)

  // Debug logging
  useEffect(() => {
    console.log('[LandmarkOverlay] state:', state, '| visible:', visible, '| landmarks:', landmarks?.length ?? 0)
  }, [state, visible, landmarks])

  // ── Run FaceMesh (ONE attempt, never retries) ─────────────
  useEffect(() => {
    if (propLandmarks) return
    if (state !== 'idle') return

    let cancelled = false
    setState('analyzing')
    console.log('[LandmarkOverlay] → analyzing')

    // Failsafe: never spin forever
    const failsafe = setTimeout(() => {
      if (!cancelled) {
        console.warn('[LandmarkOverlay] Timeout after', ANALYSIS_TIMEOUT_MS, 'ms → error')
        cancelled = true
        setState('error')
      }
    }, ANALYSIS_TIMEOUT_MS)

    async function analyze() {
      try {
        const { init, analyzeImage, destroy } = await import('@/lib/ai/facemesh')
        if (cancelled) return

        await init()
        if (cancelled) { destroy(); return }

        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Image load failed'))
          img.src = src
        })
        if (cancelled) { destroy(); return }

        setImageDims({ w: img.naturalWidth, h: img.naturalHeight })

        await analyzeImage(img, (lm) => {
          if (cancelled) return
          if (lm && lm.length > 0) {
            console.log('[LandmarkOverlay] Got', lm.length, 'landmarks → mapped')
            setLandmarks(lm)
            setState('mapped')
          } else {
            console.warn('[LandmarkOverlay] No face detected → error')
            setState('error')
          }
        })

        destroy()
      } catch (err) {
        if (!cancelled) {
          console.warn('[LandmarkOverlay] Analysis failed:', err)
          setState('error')
        }
      } finally {
        clearTimeout(failsafe)
      }
    }

    analyze()
    return () => {
      cancelled = true
      clearTimeout(failsafe)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, propLandmarks, state])

  // ── Sync prop landmarks → mapped ──────────────────────────
  useEffect(() => {
    if (propLandmarks && propLandmarks.length > 0) {
      setLandmarks(propLandmarks)
      setState('mapped')
    }
  }, [propLandmarks])

  // ── Load image dims when propLandmarks given ──────────────
  useEffect(() => {
    if (!propLandmarks || imageDims) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImageDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src, propLandmarks, imageDims])

  // ── Draw canvas (only when mapped) ────────────────────────
  useEffect(() => {
    if (state !== 'mapped' || !landmarks || !imageDims) return

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const draw = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      const adjusted = transformLandmarks(
        landmarks, imageDims.w, imageDims.h,
        rect.width, rect.height, objectPositionY
      )
      drawMesh(ctx, adjusted, rect.width, rect.height, true, false, false, 1.0)
    }

    const raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [state, landmarks, imageDims, objectPositionY])

  // ── Redraw on resize ──────────────────────────────────────
  useEffect(() => {
    if (state !== 'mapped' || !landmarks || !imageDims) return

    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      const adjusted = transformLandmarks(
        landmarks, imageDims.w, imageDims.h,
        rect.width, rect.height, objectPositionY
      )
      drawMesh(ctx, adjusted, rect.width, rect.height, true, false, false, 1.0)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [state, landmarks, imageDims, objectPositionY])

  // ── Render ────────────────────────────────────────────────
  // RULE: spinner ONLY when state === 'analyzing'
  // RULE: canvas ONLY when state === 'mapped'
  // RULE: never both simultaneously

  const isAnalyzing = state === 'analyzing'
  const isMapped = state === 'mapped'

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {/* Canvas — only visible when state === mapped */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${
          isMapped ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Spinner — ONLY when state === analyzing AND visible */}
      {isAnalyzing && visible && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#4AE3A7] border-t-transparent animate-spin" />
          <span className="font-body text-[9px] tracking-[0.1em] uppercase text-white/70">AI Haritalanıyor…</span>
        </div>
      )}
    </div>
  )
}
