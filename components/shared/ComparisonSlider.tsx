'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ComparisonSliderProps {
  beforeSrc: string
  afterSrc: string
  beforeLabel?: string
  afterLabel?: string
  className?: string
  initialPosition?: number // 0–100, default 50
}

export function ComparisonSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Önce',
  afterLabel = 'Sonra',
  className,
  initialPosition = 50,
}: ComparisonSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(initialPosition)
  const dragging = useRef(false)

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    setPosition((x / rect.width) * 100)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    updatePosition(e.clientX)
  }, [updatePosition])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragging.current = true
    updatePosition(e.touches[0].clientX)
  }, [updatePosition])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { if (dragging.current) updatePosition(e.clientX) }
    const onTouchMove = (e: TouchEvent) => { if (dragging.current) updatePosition(e.touches[0].clientX) }
    const onUp = () => { dragging.current = false }
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement !== containerRef.current) return
      if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 2))
      if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 2))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [updatePosition])

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden rounded-[14px] select-none cursor-ew-resize', className)}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      role="slider"
      aria-label="Önce/Sonra karşılaştırma"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${Math.round(position)}% ${beforeLabel}`}
      tabIndex={0}
    >
      {/* After image (full) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterSrc} alt={afterLabel} className="w-full h-full object-cover block" draggable={false} />

      {/* Before image (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ width: position > 0 ? `${(100 / position) * 100}%` : '100%', maxWidth: 'none' }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute inset-y-0 w-px bg-white/80 pointer-events-none"
        style={{ left: `${position}%` }}
      />

      {/* Handle */}
      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <svg className="w-4 h-4 text-[#1A1A2E]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
        </svg>
      </div>

      {/* Labels */}
      <span className="absolute top-3 left-3 font-body text-[10px] tracking-[0.15em] uppercase text-white/80 bg-black/30 px-2 py-1 rounded-full pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 font-body text-[10px] tracking-[0.15em] uppercase text-white/80 bg-black/30 px-2 py-1 rounded-full pointer-events-none">
        {afterLabel}
      </span>
    </div>
  )
}
