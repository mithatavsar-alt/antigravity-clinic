'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { cn } from '@/lib/utils'

export function PublicNavbar() {
  const navRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const main = document.querySelector('main')
    const firstChild = main?.firstElementChild
    setIsDark(firstChild?.classList.contains('theme-dark') ?? false) // eslint-disable-line react-hooks/set-state-in-effect -- DOM read on mount

    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrolledBg = isDark
    ? 'bg-[rgba(14,11,9,0.85)] backdrop-blur-[24px] border-b border-[rgba(214,185,140,0.08)]'
    : 'bg-[rgba(250,246,241,0.90)] backdrop-blur-[24px]'

  const logoColor = isDark ? 'text-[#F8F6F2]' : 'text-[#1A1A2E]'
  const linkColor = isDark
    ? 'text-[rgba(248,246,242,0.6)] hover:text-[#F8F6F2]'
    : 'text-[rgba(26,26,46,0.50)] hover:text-[#1A1A2E]'
  const hamburgerColor = isDark ? 'text-[rgba(248,246,242,0.7)]' : 'text-[rgba(26,26,46,0.5)]'
  const mobileOverlay = isDark
    ? 'bg-[rgba(14,11,9,0.95)] backdrop-blur-[24px] border-t border-[rgba(214,185,140,0.08)]'
    : 'bg-[rgba(250,246,241,0.96)] backdrop-blur-[24px]'

  // Scrolled shadow for light mode (no border — "No-Line Rule")
  const scrolledShadow = !isDark && scrolled ? 'shadow-[0_2px_20px_rgba(26,26,46,0.05)]' : ''

  return (
    <nav
      ref={navRef}
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        scrolled ? scrolledBg : 'bg-transparent',
        scrolledShadow
      )}
    >
      <div className="container-main flex items-center justify-between h-20">
        <Link
          href="/"
          className={cn(
            'font-display text-xl font-light tracking-[0.08em] hover:opacity-80 transition-opacity',
            logoColor
          )}
        >
          Dr. Müjde Ocak{' '}
          <span
            className={isDark ? 'text-[#D6B98C]' : ''}
            style={isDark ? undefined : { background: 'linear-gradient(135deg, #C4A35A, #D4B96A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            Aesthetic Clinic
          </span>
        </Link>

        <ul className="hidden md:flex items-center gap-8">
          {[
            ['Tedaviler', '#treatments'],
            ['AI Analiz', '#ai-analysis'],
            ['SSS', '#faq'],
          ].map(([label, href]) => (
            <li key={label}>
              <a
                href={href}
                className={cn(
                  'font-body text-[12px] tracking-[0.1em] uppercase transition-colors',
                  linkColor
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/doctor/login"
            className={cn(
              'font-body text-[11px] tracking-[0.1em] uppercase transition-colors',
              linkColor
            )}
          >
            Doktor Girişi
          </Link>
          <Link href="/analysis">
            <PremiumButton variant="primary" size="sm">Ön Değerlendirme</PremiumButton>
          </Link>
        </div>

        <button
          type="button"
          className={cn('md:hidden p-2', hamburgerColor)}
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

      {menuOpen && (
        <div className={cn('md:hidden px-6 py-6 flex flex-col gap-4', mobileOverlay)}>
          {[['Tedaviler', '#treatments'], ['AI Analiz', '#ai-analysis'], ['SSS', '#faq']].map(([label, href]) => (
            <a
              key={label}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={cn('font-body text-[13px] tracking-[0.1em] uppercase py-1', linkColor)}
            >
              {label}
            </a>
          ))}
          <Link href="/analysis" onClick={() => setMenuOpen(false)}>
            <PremiumButton variant="primary" size="sm" className="mt-2 w-full justify-center">
              Ön Değerlendirme
            </PremiumButton>
          </Link>
          <Link
            href="/doctor/login"
            onClick={() => setMenuOpen(false)}
            className={cn(
              'font-body text-[11px] tracking-[0.1em] uppercase text-center py-1',
              linkColor
            )}
          >
            Doktor Girişi
          </Link>
        </div>
      )}
    </nav>
  )
}
