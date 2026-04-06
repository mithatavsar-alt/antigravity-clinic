'use client'

import { useEffect, useRef, useState } from 'react'
import type { Landmark, WrinkleRegionResult } from '@/lib/ai/types'
import { drawMesh } from './FaceGuideCapture'
import type { OverlayRegionHighlight } from './FaceGuideCapture'

// ─── Single source of truth: overlay state machine ──────────
// idle      → initial, waiting for visibility trigger
// analyzing → FaceMesh running (shows spinner)
// mapped    → landmarks ready, canvas drawn (shows mesh)
// error     → analysis failed or timed out
export type OverlayState = 'idle' | 'analyzing' | 'mapped' | 'error'

const ANALYSIS_TIMEOUT_MS = 12_000

interface LandmarkOverlayProps {
  src: string
  landmarks?: Landmark[]
  visible?: boolean
  className?: string
  objectPositionY?: number
  /** Called whenever overlay state changes — lets parent update button text */
  onStateChange?: (state: OverlayState) => void
  /** Optional: wrinkle region results to highlight detected regions */
  wrinkleRegions?: WrinkleRegionResult[]
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
  onStateChange,
  wrinkleRegions,
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Single state machine — prevents conflicting UI
  const [state, setState] = useState<OverlayState>(
    propLandmarks && propLandmarks.length > 0 ? 'mapped' : 'idle'
  )
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(propLandmarks ?? null)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)

  // Ref mirror of state — read inside effects without adding `state` to deps.
  // Prevents the effect cleanup→re-run cycle that kills ongoing analysis.
  const stateRef = useRef(state)
  stateRef.current = state

  // Stable ref for callback to avoid re-triggering effects
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange

  // ── Notify parent of state changes ──────────────────────────
  useEffect(() => {
    onStateChangeRef.current?.(state)
  }, [state])

  // ── Run FaceMesh — LAZY: only when visible + idle ───────────
  // Analysis starts when user first toggles the overlay on.
  // If it fails, parent can retry via key-based remount.
  //
  // CRITICAL: `state` is read via stateRef (not in deps) to prevent the
  // effect cleanup→re-run cycle that would cancel the failsafe + analysis
  // when setState('analyzing') triggers a re-render.
  useEffect(() => {
    if (propLandmarks) return
    if (!visible) return                  // Don't analyze until user requests
    if (stateRef.current !== 'idle') return  // Already started or completed

    let cancelled = false
    setState('analyzing')

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
  }, [src, propLandmarks, visible])

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
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { if (!cancelled) setImageDims({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.src = src
    return () => { cancelled = true }
  }, [src, propLandmarks, imageDims])

  // ── Draw canvas — fires when mapped AND visible ─────────────
  // Includes `visible` so toggling ON guarantees a fresh draw.
  // ResizeObserver handles container size changes (replaces window resize).
  useEffect(() => {
    if (state !== 'mapped' || !landmarks || !imageDims) return
    if (!visible) return

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const draw = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const dpr = window.devicePixelRatio || 1
      // Round to device pixels for crisp sub-pixel alignment
      const cw = Math.round(rect.width * dpr)
      const ch = Math.round(rect.height * dpr)

      // Only resize canvas when dimensions actually change (avoids clearing)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Use setTransform to avoid accumulating scale transforms
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const adjusted = transformLandmarks(
        landmarks, imageDims.w, imageDims.h,
        rect.width, rect.height, objectPositionY
      )
      // Build detected region highlights from wrinkle analysis — only real detections
      const highlights: OverlayRegionHighlight[] | undefined = wrinkleRegions
        ?.filter(r => r.detected)
        .map(r => ({ region: r.region, score: r.score, detected: r.detected }))

      drawMesh(ctx, adjusted, rect.width, rect.height, true, false, false, 1.0, highlights)
    }

    // Initial draw
    const raf = requestAnimationFrame(draw)

    // Redraw on container resize (replaces window 'resize' listener)
    const observer = new ResizeObserver(() => requestAnimationFrame(draw))
    observer.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [state, landmarks, imageDims, objectPositionY, visible, wrinkleRegions])

  // ── Render ────────────────────────────────────────────────
  const isAnalyzing = state === 'analyzing'
  const isMapped = state === 'mapped'
  const isError = state === 'error'

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-[2] pointer-events-none transition-opacity duration-300 ${
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

      {/* Spinner — ONLY when analyzing AND visible */}
      {isAnalyzing && visible && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#4AE3A7] border-t-transparent animate-spin" />
          <span className="font-body text-[9px] tracking-[0.1em] uppercase text-white/70">AI Haritalanıyor…</span>
        </div>
      )}

      {/* Error message — ONLY when error AND visible */}
      {isError && visible && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md">
          <span className="font-body text-[9px] tracking-[0.1em] uppercase text-white/40">Harita oluşturulamadı</span>
        </div>
      )}
    </div>
  )
}
