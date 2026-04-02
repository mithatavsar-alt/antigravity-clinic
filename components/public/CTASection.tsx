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
    <section className="relative py-20 sm:py-28 px-6 sm:px-10 bg-[var(--color-bg-secondary)]">
      {/* Top decorative divider */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none">
        <div className="container-main">
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.15) 20%, rgba(196,163,90,0.15) 80%, transparent)' }} />
        </div>
      </div>

      <div className="container-main">
        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease }}
          viewport={{ once: true, amount: 0.15 }}
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, #1A1A2E 0%, #22223A 40%, #1A1A2E 100%)',
          }}
        >
          {/* Ambient grain */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '180px 180px',
            }}
          />

          {/* Ambient gold glow */}
          <div
            className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(196,163,90,0.06) 0%, transparent 65%)' }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 items-center">
            {/* Left — Image */}
            <div className="relative h-[280px] sm:h-[340px] lg:h-full lg:min-h-[460px] overflow-hidden">
              <ImageWithFallback
                src="/images/AIAnaliz/AIAnaliz2.jpg"
                alt="AI yüz analizi — yüz haritası"
                className="object-contain object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
                fallbackIcon="face"
              />
              {/* Gradient blend into dark side — desktop */}
              <div
                className="absolute inset-0 pointer-events-none hidden lg:block"
                style={{
                  background: 'linear-gradient(90deg, transparent 20%, rgba(26,26,46,0.85) 95%)',
                }}
              />
              {/* Bottom fade — mobile */}
              <div
                className="absolute inset-0 pointer-events-none lg:hidden"
                style={{
                  background: 'linear-gradient(180deg, transparent 35%, rgba(26,26,46,0.85) 100%)',
                }}
              />
            </div>

            {/* Right — Text content */}
            <div className="relative z-10 px-8 sm:px-12 lg:px-14 py-10 sm:py-14 lg:py-20 flex flex-col items-start gap-6 lg:-ml-12">
              <p className="font-body text-[10px] font-medium tracking-[0.22em] uppercase text-[rgba(214,185,140,0.55)]">
                Randevu
              </p>

              <EditorialHeading as="h2" light className="relative">
                Dönüşümünüze{' '}
                <GoldItalic>Bugün</GoldItalic> Başlayın
              </EditorialHeading>

              <p className="relative font-body text-[15px] text-[rgba(248,246,242,0.40)] max-w-sm leading-[1.75]">
                Ücretsiz AI ön değerlendirmenizi yapın. 3 dakikada kişiselleştirilmiş odak alanlarınızı keşfedin.
              </p>

              {/* Decorative rule */}
              <div className="w-12 h-px bg-[rgba(214,185,140,0.15)]" />

              <div className="relative flex flex-wrap gap-4">
                <Link href="/analysis">
                  <PremiumButton variant="gold" size="lg">Ön Değerlendirmeye Başla</PremiumButton>
                </Link>
                <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <PremiumButton variant="secondary" size="lg">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.847L.057 23.882a.5.5 0 00.61.61l6.035-1.466A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.661-.518-5.175-1.42l-.37-.216-3.837.932.949-3.837-.234-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    WhatsApp ile Ulaş
                  </PremiumButton>
                </a>
              </div>
            </div>
          </div>

          {/* Bottom gold accent line */}
          <div
            className="absolute bottom-0 left-[10%] right-[10%] h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(214,185,140,0.12), transparent)' }}
          />
        </motion.div>
      </div>
    </section>
  )
}
