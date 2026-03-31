'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ImageWithFallback } from '@/components/public/ImageWithFallback'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const treatments = [
  {
    title: 'Botoks',
    subtitle: 'MİMİK KİRİŞİKLİK TEDAVİSİ',
    desc: 'Mimik çizgilerini hedef alan hassas uygulama protokolü.',
    image: '/images/Treatments/Botoks.png',
    href: '/treatments/botox',
  },
  {
    title: 'Dolgu',
    subtitle: 'HACİM VE HAT BELİRLEME',
    desc: 'Yüz konturlarını yeniden şekillendiren hyalüronik asit tedavileri.',
    image: '/images/Treatments/Dolgu.png',
    href: '/treatments/filler',
  },
  {
    title: 'Mezoterapi',
    subtitle: 'CİLT YENİLEME VE PARLALIK',
    desc: 'Cilt yenileme ve rejenerasyon için vitamin kokteyli tedavisi.',
    image: '/images/Treatments/Mezoterapi.png',
    href: '/treatments/mesotherapy',
  },
]

export function TreatmentsSection() {
  return (
    <section id="treatments" className="py-20 sm:py-28 px-6 sm:px-10 bg-[var(--color-bg-secondary)]">
      <div className="container-main">
        {/* Section header */}
        <div className="text-center mb-12">
          <motion.div whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.7, ease }} viewport={{ once: true }}>
            <SectionLabel className="mb-4">Öne Çıkan Tedaviler</SectionLabel>
            <EditorialHeading as="h2">
              <GoldItalic>Uzman</GoldItalic> Tedaviler
            </EditorialHeading>
          </motion.div>
        </div>

        {/* Treatment cards — image on top */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {treatments.map(({ title, subtitle, desc, image, href }, i) => (
            <motion.div
              key={title}
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.7, delay: i * tokens.motion.staggerGap, ease }}
              viewport={{ once: true }}
            >
              <Link href={href} className="block h-full cursor-pointer group">
                <div className="flex flex-col h-full rounded-xl bg-[var(--color-bg-elevated)] overflow-hidden transition-all duration-300 group-hover:-translate-y-1.5 shadow-soft group-hover:shadow-glass-hover">
                  {/* Image — dominant, ~70% of card height */}
                  <div className="relative h-[300px] sm:h-[330px] lg:h-[360px] w-full overflow-hidden">
                    <ImageWithFallback
                      src={image}
                      alt={title}
                      className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      fallbackIcon="face"
                    />
                    {/* Bottom gradient for text readability */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(180deg, transparent 40%, rgba(26,26,46,0.6) 100%)',
                      }}
                    />
                    {/* Title overlaid on image bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <p className="font-display text-[22px] font-light text-white">{title}</p>
                      <p className="font-body text-[9px] tracking-[0.15em] uppercase text-white/50 mt-0.5">{subtitle}</p>
                    </div>
                  </div>

                  {/* Card body — compact */}
                  <div className="flex flex-col gap-2 px-5 py-4">
                    <p className="font-body text-[13px] text-[var(--color-text-muted)] leading-[1.65]">{desc}</p>
                    <span className="font-body text-[11px] text-[var(--color-gold-dim)] tracking-[0.06em] flex items-center gap-1.5 group-hover:text-[var(--color-gold)] transition-colors">
                      Detaylı bilgi
                      <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
