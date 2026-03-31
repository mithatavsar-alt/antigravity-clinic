'use client'

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading } from '@/components/design-system/EditorialHeading'
import { GlassCard } from '@/components/design-system/GlassCard'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const items = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'KVKK Uyumlu',
    desc: 'Verileriniz yasal mevzuata uygun şekilde işlenir ve korunur.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    title: 'Uzman Doktor',
    desc: 'Tüm değerlendirmeler deneyimli medikal estetik uzmanı tarafından yapılır.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    title: 'Klinik Onaylı',
    desc: 'Sistem yalnızca doktor kararını destekler; hiçbir zaman yerine geçmez.',
  },
]

export function TrustSection() {
  return (
    <section className="py-20 sm:py-28 px-6 sm:px-10 bg-[var(--color-bg-secondary)]">
      <div className="container-main">
        <div className="text-center mb-12">
          <motion.div
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, ease }}
            viewport={{ once: true }}
          >
            <SectionLabel className="mb-4">Güven</SectionLabel>
            <EditorialHeading as="h2">Mahremiyet & Güvenlik</EditorialHeading>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {items.map(({ icon, title, desc }, i) => (
            <motion.div
              key={title}
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.7, delay: i * tokens.motion.staggerGap, ease }}
              viewport={{ once: true }}
            >
              <GlassCard strong className="flex flex-col gap-5 h-full shadow-soft">
                <div className="w-12 h-12 rounded-full bg-[rgba(45,95,93,0.06)] flex items-center justify-center text-medical-trust">
                  {icon}
                </div>
                <h3 className="font-display text-[22px] font-light text-[var(--color-text)]">{title}</h3>
                <p className="font-body text-[14px] text-[var(--color-text-muted)] leading-[1.7]">{desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
