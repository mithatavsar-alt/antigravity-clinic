'use client'

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { GlassCard } from '@/components/design-system/GlassCard'
import { ThinLine } from '@/components/design-system/ThinLine'
import { tokens } from '@/lib/design-tokens'
import Link from 'next/link'
import { PremiumButton } from '@/components/design-system/PremiumButton'

const ease = tokens.motion.easing

const steps = [
  { n: '01', title: 'Bilgilerini Paylaş', desc: 'Kişisel bilgilerini, yaşını ve estetik beklentilerini 3 adımlı formla ilet.' },
  { n: '02', title: 'Fotoğraf Yükle', desc: 'Önden bir fotoğraf yükle. AI anında 47 parametreyi analiz eder.' },
  { n: '03', title: 'Randevuna Gel', desc: 'Doktorun analizi inceler ve kişiselleştirilmiş tedavi planını seninle paylaşır.' },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-[100px] px-10 bg-gradient-to-b from-[#0E0B09] to-[#14110E]">
      <div className="container-main grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        {/* Left text */}
        <motion.div
          whileInView={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.8, ease }}
          viewport={{ once: true }}
          className="flex flex-col gap-6"
        >
          <SectionLabel>Süreç</SectionLabel>
          <EditorialHeading light>
            Ön Değerlendirme<br />
            <GoldItalic>Nasıl</GoldItalic> Çalışır?
          </EditorialHeading>
          <ThinLine />
          <p className="font-body text-[14px] text-[rgba(248,246,242,0.55)] leading-relaxed">
            3 basit adımla yapay zeka destekli ön değerlendirmeni tamamla. Doktorun analizi inceleyerek sana özel tedavi planı oluşturur.
          </p>
          <Link href="/analysis">
            <PremiumButton variant="gold">Hemen Başla</PremiumButton>
          </Link>
        </motion.div>

        {/* Right steps */}
        <div className="flex flex-col gap-4">
          {steps.map(({ n, title, desc }, i) => (
            <motion.div
              key={n}
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: i * tokens.motion.staggerGap, ease }}
              viewport={{ once: true }}
            >
              <GlassCard className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-full border border-[rgba(214,185,140,0.2)] flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-[12px] text-gradient-gold">{n}</span>
                </div>
                <div>
                  <h4 className="font-display text-[18px] font-light text-[#F8F6F2] mb-1">{title}</h4>
                  <p className="font-body text-[12px] text-[rgba(248,246,242,0.5)] leading-relaxed">{desc}</p>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
