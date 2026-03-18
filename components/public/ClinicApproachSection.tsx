'use client'

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { ThinLine } from '@/components/design-system/ThinLine'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PlaceholderImage } from '@/components/design-system/PlaceholderImage'
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
    <section className="py-[100px] px-10 bg-[#0E0B09]">
      <div className="container-main grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
        {/* Left — Decorative placeholder + badge */}
        <motion.div
          whileInView={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.9, ease }}
          viewport={{ once: true }}
          className="relative"
        >
          <GlassCard padding="lg" className="relative overflow-hidden">
            <PlaceholderImage variant="editorial" className="w-full h-72" />
            {/* Dr. badge */}
            <div className="absolute bottom-8 left-8 glass-strong rounded-[12px] px-4 py-3">
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-[rgba(214,185,140,0.6)] mb-0.5">Uzman Hekim</p>
              <p className="font-display text-[15px] font-light text-[#F8F6F2]">Dr. Müjde Ocak</p>
              <p className="font-body text-[10px] text-[rgba(248,246,242,0.45)]">Medikal Estetik Uzmanı</p>
            </div>
          </GlassCard>
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
          <EditorialHeading light>
            Bilim,<br />
            <GoldItalic>Hassasiyet</GoldItalic>,<br />
            Sanat
          </EditorialHeading>
          <ThinLine />
          <p className="font-body text-[14px] text-[rgba(248,246,242,0.55)] leading-relaxed">
            Her yüz eşsizdir. Antigravity Dynamic Face AI™ sistemi doktorun klinik sezgisini veri ile güçlendirir; doğal, kişiye özel sonuçlar elde etmenizi sağlar.
          </p>
          <ul className="flex flex-col gap-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span className="text-[#D6B98C] mt-0.5 flex-shrink-0">◈</span>
                <span className="font-body text-[13px] text-[rgba(248,246,242,0.6)]">{f}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}
