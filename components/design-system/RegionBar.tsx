'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface RegionBarProps {
  label: string
  score: number // 0.0 - 1.0
  className?: string
  showScore?: boolean
}

function getColor(score: number): string {
  if (score < 0.3) return '#3D7A5F'
  if (score < 0.6) return '#C4883A'
  return '#A05252'
}

const regionLabels: Record<string, string> = {
  alin: 'Alın',
  glabella: 'Glabella',
  goz_alti: 'Göz Altı',
  kaz_ayagi: 'Kaz Ayağı',
  yanak_orta_yuz: 'Yanak / Orta Yüz',
  nazolabial: 'Nazolabial',
  dudak: 'Dudak',
  marionette: 'Marionette',
  jawline: 'Jawline',
  cene_ucu: 'Çene Ucu',
  cilt_kalitesi: 'Cilt Kalitesi',
  simetri_gozlemi: 'Simetri',
  goz_cevresi: 'Göz Çevresi',
}

export { regionLabels }

export function RegionBar({ label, score, className, showScore = true }: RegionBarProps) {
  const color = getColor(score)
  const pct = Math.round(score * 100)
  const ref = useRef<HTMLDivElement>(null)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setAnimated(true); obs.disconnect() } },
      { threshold: 0.4 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex justify-between items-center">
        <span className="font-body text-[12px] text-[#78716C]">
          {regionLabels[label] ?? label}
        </span>
        {showScore && (
          <span
            className="font-mono text-[11px] font-medium"
            style={{ color }}
          >
            {pct}
          </span>
        )}
      </div>
      <div className="h-1 bg-[#E7E5E4] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[1500ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: animated ? `${pct}%` : '0%',
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}
