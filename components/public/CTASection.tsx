'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

export function CTASection() {
  return (
    <section className="py-[100px] px-10 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #14110E 0%, #1A1410 50%, #0E0B09 100%)' }}>
      {/* Ambient orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[rgba(214,185,140,0.06)] blur-3xl pointer-events-none" />

      <div className="container-main relative z-10 text-center flex flex-col items-center gap-8">
        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease }}
          viewport={{ once: true }}
        >
          <EditorialHeading light className="text-white">
            Dönüşümünüze<br />
            <GoldItalic>Bugün</GoldItalic> Başlayın
          </EditorialHeading>
        </motion.div>

        <motion.p
          whileInView={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          viewport={{ once: true }}
          className="font-body text-[14px] text-[rgba(248,246,242,0.45)] max-w-md leading-relaxed"
        >
          Ücretsiz AI ön değerlendirmenizi yapın. 3 dakikada kişiselleştirilmiş odak alanlarınızı keşfedin.
        </motion.p>

        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.7, delay: 0.35, ease }}
          viewport={{ once: true }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <Link href="/analysis">
            <PremiumButton variant="gold" size="lg">Ön Değerlendirmeye Başla</PremiumButton>
          </Link>
          <a href="https://wa.me/905321234567" target="_blank" rel="noopener noreferrer">
            <PremiumButton variant="ghost" size="lg" className="text-[#D6B98C] border-[rgba(214,185,140,0.25)] hover:border-[rgba(214,185,140,0.4)] hover:text-white">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.847L.057 23.882a.5.5 0 00.61.61l6.035-1.466A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.661-.518-5.175-1.42l-.37-.216-3.837.932.949-3.837-.234-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              WhatsApp ile Ulaş
            </PremiumButton>
          </a>
        </motion.div>
      </div>
    </section>
  )
}
