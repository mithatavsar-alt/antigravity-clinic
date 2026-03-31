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
      className="border-b border-[var(--color-border)]"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-7 sm:py-8 text-left gap-5 group cursor-pointer"
      >
        <span className="font-display text-[19px] sm:text-[21px] font-medium text-[var(--color-text)] group-hover:text-[var(--color-gold)] transition-colors">
          {q}
        </span>
        <span className="text-[var(--color-gold)] text-xl flex-shrink-0 transition-transform duration-300" style={{ transform: open ? 'rotate(45deg)' : 'none' }}>
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
            <p className="font-body text-[15px] sm:text-[16px] text-[var(--color-text-secondary)] leading-[1.75] pb-7 sm:pb-8">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function FAQSection() {
  return (
    <section id="faq" className="py-20 sm:py-28 px-6 sm:px-10 bg-[var(--color-bg)]">
      <div className="container-main max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <SectionLabel className="mb-4">Sık Sorulanlar</SectionLabel>
          <EditorialHeading as="h2">Merak Ettikleriniz</EditorialHeading>
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
