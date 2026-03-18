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
    <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex justify-between items-center px-5 py-4 bg-[rgba(255,254,249,0.7)] hover:bg-[rgba(196,163,90,0.03)] transition-colors"
      >
        <h3 className="font-display text-[18px] font-light text-[#1A1A2E]">{title}</h3>
        <svg
          className="w-4 h-4 text-[#C4A35A] transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-5 py-5 border-t border-[rgba(196,163,90,0.1)]">{children}</div>}
    </div>
  )
}
