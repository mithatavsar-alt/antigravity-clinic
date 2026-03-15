'use client'

import { motion } from 'framer-motion'
import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { ThinLine } from '@/components/design-system/ThinLine'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const treatments = [
  { icon: '◉', title: 'Botoks Tedavisi', desc: 'Mimik çizgilerini hedef alan hassas uygulama protokolü.' },
  { icon: '◎', title: 'Dolgu & Hacim', desc: 'Yüz konturlarını yeniden şekillendiren hiyalüronik asit tedavileri.' },
  { icon: '◇', title: 'Lazer Resurfacing', desc: 'Cilt yenileme ve ton eşitleme için fraksiyonel lazer teknolojisi.' },
  { icon: '○', title: 'PRP Tedavisi', desc: 'Platelet zengin plazma ile doğal rejenerasyon ve canlılık.' },
]

export function TreatmentsSection() {
  return (
    <section id="treatments" className="py-[100px] px-10 bg-[#FFFEF9]">
      <div className="container-main">
        <div className="text-center mb-16">
          <motion.div whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.7, ease }} viewport={{ once: true }}>
            <SectionLabel className="justify-center mb-4">Tedavi Portföyü</SectionLabel>
            <EditorialHeading><GoldItalic>Uzman</GoldItalic> Tedaviler</EditorialHeading>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {treatments.map(({ icon, title, desc }, i) => (
            <motion.div
              key={title}
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.7, delay: i * tokens.motion.staggerGap, ease }}
              viewport={{ once: true }}
            >
              <GlassCard hover className="flex flex-col gap-5 h-full">
                <ThinLine width={48} />
                <span className="text-4xl text-[rgba(196,163,90,0.6)]">{icon}</span>
                <div>
                  <h3 className="font-display text-[20px] font-light text-[#1A1A2E] mb-2">{title}</h3>
                  <p className="font-body text-[13px] text-[rgba(26,26,46,0.55)] leading-relaxed">{desc}</p>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
