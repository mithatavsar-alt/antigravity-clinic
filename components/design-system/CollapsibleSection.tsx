'use client'

import { useState } from 'react'

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function CollapsibleSection({ title, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-[var(--color-border-gold)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex justify-between items-center px-5 py-4 bg-[var(--glass-bg)] hover:bg-[var(--color-gold-glow)] transition-colors"
      >
        <h3 className="font-display text-[18px] font-light text-[var(--color-text)]">{title}</h3>
        <svg
          className="w-4 h-4 text-[var(--color-gold)] transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-5 py-5 border-t border-[var(--color-border)]">{children}</div>}
    </div>
  )
}
