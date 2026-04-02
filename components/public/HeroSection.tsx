'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ImageWithFallback } from '@/components/public/ImageWithFallback'
import { HeroTrustStrip } from '@/components/public/HeroTrustStrip'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { contact } from '@/lib/contact'

const ease = [0.16, 1, 0.3, 1] as const

export function HeroSection() {
  return (
    <section
      className="hero-section relative flex items-center justify-center overflow-hidden bg-[var(--color-bg)]"
      style={{ minHeight: 'clamp(640px, 92vh, 960px)' }}
    >
      {/* Warm gradient wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(160deg, var(--color-bg) 0%, #F5EDE2 35%, #F0E6DA 60%, var(--color-bg-secondary) 100%)',
        }}
      />

      {/* Subtle ambient orb */}
      <div
        className="absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--color-gold-glow) 0%, transparent 70%)' }}
      />

      {/* Film grain texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.018]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }}
      />

      {/* Decorative vertical gold accent — desktop only */}
      <div className="hidden lg:block absolute top-[15%] left-[48px] w-px h-[70%] pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(196,163,90,0.12) 30%, rgba(196,163,90,0.12) 70%, transparent)' }} />

      <div className="relative z-10 container-main grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center py-28 sm:py-32 lg:py-16">
        {/* Mobile hero portrait — visible only below lg */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease }}
          className="lg:hidden relative w-full max-w-xs mx-auto aspect-[3/4] rounded-2xl overflow-hidden"
        >
          <ImageWithFallback
            src="/images/Hero/home.png"
            alt="Doğal güzellik — medikal estetik"
            className="object-cover object-top"
            sizes="(max-width: 1024px) 320px, 0vw"
            priority
            fallbackIcon="face"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, transparent 55%, rgba(245,230,211,0.2) 100%)',
            }}
          />
        </motion.div>

        {/* Left — Text content */}
        <div className="flex flex-col items-start text-left">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
          >
            <SectionLabel>DR. MÜJDE OCAK AESTHETIC CLINIC</SectionLabel>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="mt-6"
          >
            <EditorialHeading as="h1">
              <span className="text-[var(--color-text)]">Doğal Güzelliğinizi</span>
              <br />
              <GoldItalic>Keşfedin</GoldItalic>
            </EditorialHeading>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease }}
            className="mt-7 font-body font-light text-[var(--color-text-secondary)] max-w-lg leading-[1.75]"
            style={{ fontSize: 'clamp(15px, 1.6vw, 18px)' }}
          >
            AI destekli yüz analizi ile kişiselleştirilmiş estetik değerlendirme.
            Bilimsel verilerle desteklenen öneriler.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease }}
            className="mt-10 flex flex-col sm:flex-row items-start gap-4"
          >
            <Link href="/analysis">
              <PremiumButton variant="primary" size="lg">
                Ön Değerlendirme Başlat
              </PremiumButton>
            </Link>
            <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer">
              <PremiumButton variant="ghost" size="lg">
                WhatsApp ile İletişim
              </PremiumButton>
            </a>
          </motion.div>

          {/* Trust Strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5, ease }}
            className="mt-14"
          >
            <HeroTrustStrip />
          </motion.div>
        </div>

        {/* Right — Hero portrait */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.0, delay: 0.2, ease }}
          className="relative hidden lg:flex justify-center items-center"
        >
          {/* Decorative ring */}
          <div
            className="absolute -inset-4 rounded-3xl pointer-events-none"
            style={{
              background: 'linear-gradient(160deg, rgba(196,163,90,0.08) 0%, rgba(196,163,90,0.02) 100%)',
            }}
          />
          {/* Image container with elegant crop */}
          <div className="relative w-full max-w-[520px] aspect-[3/4] rounded-3xl overflow-hidden group">
            <ImageWithFallback
              src="/images/Hero/home.png"
              alt="Doğal güzellik — medikal estetik"
              className="object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              sizes="(max-width: 1024px) 0vw, 520px"
              priority
              fallbackIcon="face"
            />
            {/* Subtle warm overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, transparent 50%, rgba(245,230,211,0.15) 100%)',
              }}
            />
            {/* Subtle AI overlay */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.07]"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 30% 40%, rgba(45,95,93,0.4) 0%, transparent 50%),
                  radial-gradient(circle at 70% 60%, rgba(196,163,90,0.3) 0%, transparent 50%)
                `,
                mixBlendMode: 'soft-light',
              }}
            />
          </div>
        </motion.div>
      </div>
      {/* Bottom decorative divider */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <div className="container-main relative">
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(196,163,90,0.18) 20%, rgba(196,163,90,0.18) 80%, transparent)' }} />
        </div>
      </div>
    </section>
  )
}
