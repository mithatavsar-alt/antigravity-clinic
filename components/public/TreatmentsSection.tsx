'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { ThinLine } from '@/components/design-system/ThinLine'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const treatments = [
  { icon: '◉', title: 'Botoks Tedavisi', desc: 'Mimik çizgilerini hedef alan hassas uygulama protokolü.', href: '/treatments/botox' },
  { icon: '◎', title: 'Dolgu & Hacim', desc: 'Yüz konturlarını yeniden şekillendiren hyalüronik asit tedavileri.', href: '/treatments/filler' },
  { icon: '◇', title: 'Mezoterapi', desc: 'Cilt yenileme ve rejenerasyon için vitamin kokteyli tedavisi.', href: '/treatments/mesotherapy' },
]

export function TreatmentsSection() {
  return (
    <section id="treatments" className="py-[100px] px-10 bg-[#0E0B09]">
      <div className="container-main">
        <div className="text-center mb-16">
          <motion.div whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.7, ease }} viewport={{ once: true }}>
            <SectionLabel className="justify-center mb-4">Tedavi Portf&ouml;y&uuml;</SectionLabel>
            <EditorialHeading light><GoldItalic>Uzman</GoldItalic> Tedaviler</EditorialHeading>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {treatments.map(({ icon, title, desc, href }, i) => (
            <motion.div
              key={title}
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.7, delay: i * tokens.motion.staggerGap, ease }}
              viewport={{ once: true }}
            >
              <Link href={href} className="block h-full cursor-pointer">
                <GlassCard hover className="flex flex-col gap-5 h-full">
                  <ThinLine width={48} />
                  <span className="text-4xl text-[rgba(214,185,140,0.5)]">{icon}</span>
                  <div>
                    <h3 className="font-display text-[20px] font-light text-[#F8F6F2] mb-2">{title}</h3>
                    <p className="font-body text-[13px] text-[rgba(248,246,242,0.5)] leading-relaxed">{desc}</p>
                  </div>
                  <span className="font-body text-[11px] text-[rgba(214,185,140,0.45)] tracking-[0.06em] mt-auto flex items-center gap-1.5">
                    Detaylı bilgi
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </GlassCard>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
