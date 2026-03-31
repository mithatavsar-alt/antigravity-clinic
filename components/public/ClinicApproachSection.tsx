'use client'

import { motion } from 'framer-motion'
import { ImageWithFallback } from '@/components/public/ImageWithFallback'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { ThinLine } from '@/components/design-system/ThinLine'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const features = [
  'AI destekli 47 parametreli yüz haritalama',
  'Doktor onaylı kişiselleştirilmiş protokol',
  'Şeffaf, veri tabanlı tedavi planı',
  'KVKK uyumlu güvenli veri yönetimi',
]

export function ClinicApproachSection() {
  return (
    <section className="py-20 sm:py-28 px-6 sm:px-10 bg-[var(--color-bg)]">
      <div className="container-main grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Left — Portrait image */}
        <motion.div
          whileInView={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.9, ease }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="relative rounded-2xl overflow-hidden group">
            {/* Image */}
            <div className="relative aspect-[4/5] w-full">
              <ImageWithFallback
                src="/images/Doctor/Doctor2.jpg"
                alt="Dr. Müjde Ocak — medikal estetik uzmanı"
                className="object-cover object-[center_20%] transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 100vw, 50vw"
                fallbackIcon="face"
              />
              {/* Bottom gradient veil */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(180deg, transparent 55%, rgba(26,26,46,0.35) 100%)',
                }}
              />
            </div>
            {/* Dr. badge — overlaid on image */}
            <div
              className="absolute bottom-6 left-6 right-6 sm:right-auto rounded-lg px-5 py-3.5"
              style={{
                background: 'var(--glass-bg-strong)',
                backdropFilter: 'blur(var(--glass-blur))',
                boxShadow: 'var(--glass-shadow)',
              }}
            >
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--color-gold-dim)] mb-0.5">Uzman Hekim</p>
              <p className="font-display text-[16px] font-light text-[var(--color-text)]">Dr. Müjde Ocak</p>
              <p className="font-body text-[11px] text-[var(--color-text-muted)]">Medikal Estetik Uzmanı</p>
            </div>
          </div>
        </motion.div>

        {/* Right — Editorial text */}
        <motion.div
          whileInView={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.9, delay: 0.15, ease }}
          viewport={{ once: true }}
          className="flex flex-col gap-7"
        >
          <SectionLabel>Klinik Yaklaşımı</SectionLabel>
          <EditorialHeading as="h2">
            Bilim,{' '}
            <GoldItalic>Hassasiyet</GoldItalic>,{' '}
            Sanat
          </EditorialHeading>
          <ThinLine />
          <p className="font-body text-[15px] sm:text-[16px] text-[var(--color-text-secondary)] leading-[1.75]">
            Her yüz eşsizdir. Antigravity Dynamic Face AI™ sistemi doktorun klinik sezgisini veri ile güçlendirir; doğal, kişiye özel sonuçlar elde etmenizi sağlar.
          </p>
          <ul className="flex flex-col gap-3.5">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span className="text-[var(--color-gold)] mt-0.5 flex-shrink-0 text-sm">◈</span>
                <span className="font-body text-[14px] text-[var(--color-text-secondary)]">{f}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}
