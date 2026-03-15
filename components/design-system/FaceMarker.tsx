'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface FaceMarkerProps {
  x: number // % from left
  y: number // % from top
  label: string
  score?: number
  className?: string
}

export function FaceMarker({ x, y, label, score, className }: FaceMarkerProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={cn('absolute z-10', className)}
      style={{ left: `${x}%`, top: `${y}%` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pulse ring */}
      <div
        className="absolute left-1/2 top-1/2 w-5 h-5 rounded-full border border-[rgba(196,163,90,0.5)]"
        style={{
          transform: 'translate(-50%, -50%)',
          animation: 'markerRing 2.5s ease-out infinite',
        }}
      />
      {/* Dot */}
      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#C4A35A] to-[#8B7FA8] ai-marker relative -translate-x-1/2 -translate-y-1/2" />

      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 glass-strong rounded-[10px] px-3 py-2 whitespace-nowrap z-20 pointer-events-none">
          <p className="font-body text-[9px] uppercase tracking-[0.15em] text-[#8B7FA8] mb-0.5">{label}</p>
          {score !== undefined && (
            <p className="font-mono text-[12px] font-medium text-[#1A1A2E]">{Math.round(score * 100)}</p>
          )}
        </div>
      )}
    </div>
  )
}
