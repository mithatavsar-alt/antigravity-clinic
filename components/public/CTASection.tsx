'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ImageWithFallback } from '@/components/public/ImageWithFallback'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { tokens } from '@/lib/design-tokens'
import { contact } from '@/lib/contact'

const ease = tokens.motion.easing

export function CTASection() {
  return (
    <section className="relative overflow-hidden" style={{ background: 'var(--color-bg-secondary)' }}>
      {/* Top divider — warm gold gradient line */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-10">
        <div className="container-main">
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.12) 20%, rgba(196,163,90,0.12) 80%, transparent)' }}
          />
        </div>
      </div>

      {/* ─── Full-bleed editorial card ────────────────────── */}
      <div className="container-main py-14 sm:py-20 px-6 sm:px-10">
        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 28 }}
          transition={{ duration: 0.9, ease }}
          viewport={{ once: true, amount: 0.12 }}
          className="relative overflow-hidden rounded-[28px] sm:rounded-[32px]"
          style={{
            background: 'linear-gradient(155deg, #FAF6F1 0%, #F5EDE2 25%, #F0E6DA 50%, #EDE0D4 75%, #F2EBE3 100%)',
            boxShadow: '0 16px 64px rgba(26,26,46,0.06), 0 0 0 1px rgba(196,163,90,0.08)',
          }}
        >
          {/* Ambient grain — barely visible texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.015] rounded-[inherit]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '180px 180px',
            }}
          />

          {/* Warm ambient orb — top-left champagne wash */}
          <div
            className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(196,163,90,0.06) 0%, rgba(196,163,90,0.02) 45%, transparent 70%)' }}
          />

          {/* Soft warm orb — bottom-right rose/beige glow */}
          <div
            className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(240,221,213,0.25) 0%, transparent 60%)' }}
          />

          {/* ─── Grid: Image + Content ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] items-stretch min-h-[280px] sm:min-h-[320px] lg:min-h-[380px]">

            {/* Left — Portrait */}
            <div className="relative overflow-hidden lg:order-1">
              {/* The portrait */}
              <div className="relative h-[240px] sm:h-[280px] lg:h-full w-full">
                <ImageWithFallback
                  src="/images/AIAnaliz/AIAnaliz3.jpg"
                  alt="AI yüz analizi — kişiselleştirilmiş değerlendirme"
                  className="object-cover object-[center_22%] lg:object-[center_20%]"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  fallbackIcon="face"
                />

                {/* Soft warm overlay — integrates portrait with cream background */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, rgba(245,237,226,0.10) 0%, rgba(245,237,226,0.03) 30%, rgba(240,230,218,0.12) 70%, rgba(237,224,212,0.45) 100%)',
                  }}
                />

                {/* Right-edge blend into content — desktop */}
                <div
                  className="absolute inset-0 pointer-events-none hidden lg:block"
                  style={{
                    background: 'linear-gradient(90deg, transparent 40%, rgba(242,235,227,0.55) 80%, rgba(240,230,218,0.90) 100%)',
                  }}
                />

                {/* Bottom fade — mobile */}
                <div
                  className="absolute inset-0 pointer-events-none lg:hidden"
                  style={{
                    background: 'linear-gradient(180deg, transparent 40%, rgba(242,235,227,0.65) 85%, rgba(240,230,218,0.92) 100%)',
                  }}
                />

                {/* Warm golden light leak — top-left corner, editorial feel */}
                <div
                  className="absolute top-0 left-0 w-[280px] h-[280px] pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 80% 80% at 15% 15%, rgba(214,185,140,0.06) 0%, transparent 60%)' }}
                />
              </div>

              {/* Decorative corner accent — muted gold hairline */}
              <div className="absolute top-6 left-6 w-10 h-10 pointer-events-none hidden lg:block">
                <div className="absolute top-0 left-0 w-full h-px" style={{ background: 'linear-gradient(90deg, rgba(196,163,90,0.22), transparent)' }} />
                <div className="absolute top-0 left-0 w-px h-full" style={{ background: 'linear-gradient(180deg, rgba(196,163,90,0.22), transparent)' }} />
              </div>
            </div>

            {/* Right — Content */}
            <div className="relative z-10 flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-20 py-8 sm:py-10 lg:py-12 lg:order-2">
              {/* Section label */}
              <motion.p
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.5, delay: 0.1, ease }}
                viewport={{ once: true }}
                className="font-body text-[11px] font-medium tracking-[0.20em] uppercase mb-4 sm:mb-5"
                style={{ color: 'var(--color-gold)' }}
              >
                Kişiselleştirilmiş Analiz
              </motion.p>

              {/* Heading — dark text on light surface */}
              <motion.div
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.7, delay: 0.15, ease }}
                viewport={{ once: true }}
              >
                <EditorialHeading as="h2" className="relative">
                  AI Destekli{' '}
                  <GoldItalic>Ön Değerlendirme</GoldItalic>
                </EditorialHeading>
              </motion.div>

              {/* Description — warm taupe-grey for readability on cream */}
              <motion.p
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.6, delay: 0.25, ease }}
                viewport={{ once: true }}
                className="mt-4 sm:mt-5 font-body text-[15px] sm:text-[16px] max-w-md leading-[1.75]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Yüz geometriniz, cilt dokunuz ve bölgesel yapınız üç farklı açıdan analiz
                edilir. Kişiselleştirilmiş odak alanlarınızı keşfedin — yalnızca 3 dakika.
              </motion.p>

              {/* Feature micro-list */}
              <motion.div
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.5, delay: 0.35, ease }}
                viewport={{ once: true }}
                className="mt-5 sm:mt-6 flex flex-col gap-2"
              >
                {[
                  'Çoklu açı yüz taraması',
                  'Bölgesel skor & güven haritası',
                  'Uzman görüşmesi öncesi hazırlık',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-1 h-1 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(196,163,90,0.40)' }}
                    />
                    <span
                      className="font-body text-[14px]"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </motion.div>

              {/* Decorative rule */}
              <motion.div
                whileInView={{ opacity: 1, scaleX: 1 }}
                initial={{ opacity: 0, scaleX: 0 }}
                transition={{ duration: 0.6, delay: 0.4, ease }}
                viewport={{ once: true }}
                className="mt-6 sm:mt-7 w-16 h-px origin-left"
                style={{ background: 'linear-gradient(90deg, rgba(196,163,90,0.20), transparent)' }}
              />

              {/* CTA buttons */}
              <motion.div
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 14 }}
                transition={{ duration: 0.6, delay: 0.45, ease }}
                viewport={{ once: true }}
                className="mt-6 sm:mt-7 flex flex-wrap gap-4"
              >
                <Link href="/analysis">
                  <PremiumButton variant="primary" size="lg">Ön Değerlendirmeye Başla</PremiumButton>
                </Link>
                <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <PremiumButton variant="ghost" size="lg" className="!text-[rgba(26,26,46,0.45)] !border-[rgba(26,26,46,0.10)] hover:!text-[rgba(26,26,46,0.60)] hover:!border-[rgba(26,26,46,0.18)] hover:!bg-[rgba(26,26,46,0.02)]">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.847L.057 23.882a.5.5 0 00.61.61l6.035-1.466A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.661-.518-5.175-1.42l-.37-.216-3.837.932.949-3.837-.234-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    WhatsApp ile Ulaş
                  </PremiumButton>
                </a>
              </motion.div>
            </div>
          </div>

          {/* Bottom gold accent line — interior */}
          <div
            className="absolute bottom-0 left-[8%] right-[8%] h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.08), transparent)' }}
          />
        </motion.div>
      </div>
    </section>
  )
}
