'use client'

import { useState, useEffect } from 'react'

interface TreatmentHeroProps {
  label: string
  title: string
  subtitle: string
}

export function TreatmentHero({ label, title, subtitle }: TreatmentHeroProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <section className="relative overflow-hidden" style={{ paddingTop: 'clamp(100px, 18vw, 160px)', paddingBottom: 'clamp(60px, 10vw, 100px)' }}>
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 20%, rgba(214,185,140,0.04) 0%, transparent 60%)',
        }}
      />

      <div className="relative max-w-[720px] mx-auto px-6 sm:px-8 flex flex-col items-center text-center gap-6">
        {/* Label */}
        <span
          className="text-label text-[rgba(214,185,140,0.50)]"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          {label}
        </span>

        {/* Title */}
        <h1
          className="font-display font-light text-[#F8F6F2]"
          style={{
            fontSize: 'clamp(36px, 7vw, 64px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s',
          }}
        >
          {title}
        </h1>

        {/* Divider */}
        <div
          className="flex items-center gap-4"
          style={{
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.6s ease 0.25s',
          }}
        >
          <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, transparent, rgba(214,185,140,0.25))' }} />
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(214,185,140,0.30)' }} />
          <div className="h-px w-14" style={{ background: 'linear-gradient(90deg, rgba(214,185,140,0.25), transparent)' }} />
        </div>

        {/* Subtitle */}
        <p
          className="font-body text-[rgba(248,246,242,0.45)] leading-[1.8] max-w-[540px]"
          style={{
            fontSize: 'clamp(14px, 2vw, 16px)',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s',
          }}
        >
          {subtitle}
        </p>
      </div>
    </section>
  )
}
