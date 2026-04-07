'use client'

import Link from 'next/link'
import { MedicalDisclaimer } from './MedicalDisclaimer'

interface TreatmentLayoutProps {
  children: React.ReactNode
  relatedLinks?: Array<{ label: string; href: string }>
}

export function TreatmentLayout({ children, relatedLinks }: TreatmentLayoutProps) {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(160deg, var(--color-bg) 0%, #F5EDE2 35%, #F0E6DA 60%, var(--color-bg-secondary) 100%)',
      }}
    >
      <article className="max-w-[720px] mx-auto px-6 sm:px-8">
        <div className="flex flex-col" style={{ gap: 'clamp(2.5rem, 5vw, 3.5rem)' }}>
          {children}
        </div>

        {/* ── Thin separator ── */}
        <div className="my-12 sm:my-16 flex justify-center">
          <div className="h-px w-32" style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.20), transparent)' }} />
        </div>

        {/* ── Related treatments ── */}
        {relatedLinks && relatedLinks.length > 0 && (
          <div className="flex flex-col items-center gap-6 mb-10">
            <span
              className="font-body text-[11px] font-medium tracking-[0.20em] uppercase"
              style={{ color: 'var(--color-gold)' }}
            >
              Diğer Uygulamalar
            </span>
            <div className="flex flex-wrap justify-center gap-3">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-body text-[12px] px-5 py-2.5 rounded-full border transition-all duration-300"
                  style={{
                    color: 'var(--color-text-secondary)',
                    background: 'rgba(196,163,90,0.03)',
                    borderColor: 'rgba(26,26,46,0.08)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(196,163,90,0.25)'
                    e.currentTarget.style.color = 'var(--color-text)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(26,26,46,0.08)'
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Disclaimer ── */}
        <div className="pb-16 sm:pb-20">
          <MedicalDisclaimer />
        </div>

        {/* ── CTA ── */}
        <div className="pb-16 sm:pb-24 flex justify-center">
          <Link
            href="/analysis"
            className="inline-flex items-center gap-2.5 font-body text-[13px] font-medium tracking-[0.04em] px-7 py-3.5 rounded-full transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #2D5F5D 0%, #3A7F6A 100%)',
              color: '#FFFEF9',
              boxShadow: '0 4px 16px rgba(45,95,93,0.20)',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            Ücretsiz AI Ön Değerlendirme
          </Link>
        </div>
      </article>
    </div>
  )
}
