'use client'

import { useState, useEffect, useRef } from 'react'

interface TreatmentSectionProps {
  heading: string
  children: React.ReactNode
  index?: number
}

export function TreatmentSection({ heading, children, index = 0 }: TreatmentSectionProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section
      ref={ref}
      className="flex flex-col gap-5"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.6s ease ${index * 0.08}s, transform 0.6s ease ${index * 0.08}s`,
      }}
    >
      <h2
        className="font-display font-light"
        style={{
          color: 'var(--color-text)',
          fontSize: 'clamp(22px, 4vw, 30px)',
          letterSpacing: '-0.015em',
          lineHeight: 1.2,
        }}
      >
        {heading}
      </h2>

      <div
        className="flex flex-col gap-4 font-body leading-[1.85]"
        style={{ fontSize: 'clamp(14px, 1.8vw, 15px)', color: 'var(--color-text-secondary)' }}
      >
        {children}
      </div>
    </section>
  )
}
