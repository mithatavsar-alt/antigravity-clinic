'use client'

import { motion } from 'framer-motion'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const items = [
  {
    number: '01',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'KVKK Uyumlu',
    desc: 'Verileriniz yasal mevzuata uygun şekilde işlenir ve korunur.',
  },
  {
    number: '02',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    title: 'Uzman Doktor',
    desc: 'Tüm değerlendirmeler deneyimli medikal estetik uzmanı tarafından yapılır.',
  },
  {
    number: '03',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    title: 'Klinik Onaylı',
    desc: 'Sistem yalnızca doktor kararını destekler; hiçbir zaman yerine geçmez.',
  },
]

export function TrustSection() {
  return (
    <section className="relative py-20 sm:py-28 px-6 sm:px-10 bg-[var(--color-bg-secondary)] overflow-hidden">
      {/* Ambient grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      <div className="container-main relative z-10">
        {/* Section header */}
        <div className="text-center mb-14 sm:mb-16">
          <motion.div
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, ease }}
            viewport={{ once: true }}
          >
            <p className="font-body text-[10px] font-medium tracking-[0.22em] uppercase text-[var(--color-gold)] mb-4">
              Güven & Kalite
            </p>
            <h2 className="font-display font-light text-[clamp(2rem,4.5vw,3.5rem)] tracking-[-0.02em] leading-[1.08] text-[var(--color-text)]">
              Mahremiyet & Güvenlik
            </h2>
            <div className="flex items-center justify-center gap-3 mt-5">
              <div className="h-px w-12" style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.25))' }} />
              <div className="w-1 h-1 rounded-full bg-[rgba(196,163,90,0.3)]" />
              <div className="h-px w-12" style={{ background: 'linear-gradient(90deg, rgba(196,163,90,0.25), transparent)' }} />
            </div>
          </motion.div>
        </div>

        {/* Editorial trust grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-0 max-w-4xl mx-auto">
          {items.map(({ number, icon, title, desc }, i) => (
            <motion.div
              key={title}
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.7, delay: i * tokens.motion.staggerGap, ease }}
              viewport={{ once: true }}
              className="group relative flex flex-col items-center text-center px-8 py-10 sm:py-12"
            >
              {/* Vertical divider between cards — desktop */}
              {i > 0 && (
                <div
                  className="hidden md:block absolute left-0 top-[15%] bottom-[15%] w-px"
                  style={{ background: 'linear-gradient(180deg, transparent, rgba(196,163,90,0.15), transparent)' }}
                />
              )}
              {/* Horizontal divider between cards — mobile */}
              {i > 0 && (
                <div
                  className="md:hidden absolute top-0 left-[15%] right-[15%] h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.15), transparent)' }}
                />
              )}

              {/* Ordinal number */}
              <span className="font-mono text-[11px] tracking-[0.2em] text-[rgba(196,163,90,0.35)] mb-5">
                {number}
              </span>

              {/* Icon circle */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(45,95,93,0.06), rgba(45,95,93,0.02))',
                  border: '1px solid rgba(45,95,93,0.08)',
                  boxShadow: '0 2px 12px rgba(45,95,93,0.04)',
                }}
              >
                <span className="text-medical-trust">{icon}</span>
              </div>

              {/* Title */}
              <h3 className="font-display text-[20px] sm:text-[22px] font-light text-[var(--color-text)] mb-3 tracking-[-0.01em]">
                {title}
              </h3>

              {/* Description */}
              <p className="font-body text-[13px] sm:text-[14px] text-[var(--color-text-muted)] leading-[1.7] max-w-[240px]">
                {desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
