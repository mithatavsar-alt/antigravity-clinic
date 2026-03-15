'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { cn } from '@/lib/utils'

export function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        scrolled
          ? 'bg-[rgba(250,246,241,0.9)] backdrop-blur-[20px] border-b border-[rgba(196,163,90,0.12)]'
          : 'bg-transparent'
      )}
    >
      <div className="container-main flex items-center justify-between h-20">
        {/* Logo */}
        <Link href="/" className="font-display text-xl font-light tracking-[0.08em] text-[#1A1A2E] hover:opacity-80 transition-opacity">
          Antigravity <span className="text-gradient-gold">AI</span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-8">
          {[
            ['Tedaviler', '#treatments'],
            ['AI Analiz', '#ai-analysis'],
            ['Nasıl Çalışır', '#how-it-works'],
            ['SSS', '#faq'],
          ].map(([label, href]) => (
            <li key={label}>
              <a
                href={href}
                className="font-body text-[12px] tracking-[0.1em] uppercase text-[#78716C] hover:text-[#1A1A2E] transition-colors"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/analysis">
            <PremiumButton size="sm">Ön Değerlendirme</PremiumButton>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#78716C]"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menü"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            }
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden glass-strong border-t border-[rgba(196,163,90,0.1)] px-6 py-6 flex flex-col gap-4">
          {[['Tedaviler', '#treatments'], ['AI Analiz', '#ai-analysis'], ['Nasıl Çalışır', '#how-it-works'], ['SSS', '#faq']].map(([label, href]) => (
            <a key={label} href={href} onClick={() => setMenuOpen(false)}
              className="font-body text-[13px] tracking-[0.1em] uppercase text-[#78716C] py-1">
              {label}
            </a>
          ))}
          <Link href="/analysis" onClick={() => setMenuOpen(false)}>
            <PremiumButton size="sm" className="mt-2 w-full justify-center">Ön Değerlendirme</PremiumButton>
          </Link>
        </div>
      )}
    </nav>
  )
}
