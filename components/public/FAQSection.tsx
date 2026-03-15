'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading } from '@/components/design-system/EditorialHeading'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const faqs = [
  { q: 'Ön değerlendirme ücretsiz mi?', a: 'Evet, platforma yapılan ön değerlendirme tamamen ücretsizdir. Klinik konsültasyon ücretleri için ekibimizle iletişime geçin.' },
  { q: 'Fotoğrafım güvende mi?', a: 'Fotoğrafınız KVKK kapsamında korunur ve yalnızca doktor incelemesi amacıyla kullanılır. Üçüncü taraflarla paylaşılmaz.' },
  { q: 'AI analizi ne kadar doğru?', a: 'Sistemimiz doktor kararını destekleyen bir ön değerlendirme aracıdır. Kesin tanı ve tedavi kararı her zaman klinik muayene sonrasında verilir.' },
  { q: 'Analiz sonrasında ne olacak?', a: 'Sonuç sayfanızda odak alanlarınızı göreceksiniz. Ardından WhatsApp veya telefon ile randevu alarak doktorunuzla görüşebilirsiniz.' },
  { q: 'Hangi tedaviler sunulmaktadır?', a: 'Botoks, dolgu, lazer, PRP, iplik askı ve daha fazlası. Tedavi seçimi kişisel analiz ve doktor değerlendirmesine göre belirlenir.' },
]

function FAQItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      whileInView={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.6, delay: i * 0.08, ease }}
      viewport={{ once: true }}
      className="border-b border-[rgba(196,163,90,0.15)]"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-5 text-left gap-4 group"
      >
        <span className="font-display text-[18px] font-light text-[#1A1A2E] group-hover:text-[#2D5F5D] transition-colors">
          {q}
        </span>
        <span className="text-[#C4A35A] text-xl flex-shrink-0 transition-transform duration-300" style={{ transform: open ? 'rotate(45deg)' : 'none' }}>
          +
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden"
          >
            <p className="font-body text-[13px] text-[rgba(26,26,46,0.6)] leading-relaxed pb-5">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function FAQSection() {
  return (
    <section id="faq" className="py-[100px] px-10 bg-[#FFFEF9]">
      <div className="container-main max-w-3xl mx-auto">
        <div className="text-center mb-14">
          <SectionLabel className="justify-center mb-4">Sık Sorulanlar</SectionLabel>
          <EditorialHeading>Merak Ettikleriniz</EditorialHeading>
        </div>
        <div>
          {faqs.map((item, i) => (
            <FAQItem key={item.q} q={item.q} a={item.a} i={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
