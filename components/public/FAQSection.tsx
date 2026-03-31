'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const faqs = [
  {
    q: 'Ön değerlendirme ücretsiz mi?',
    a: 'Evet, platforma yapılan ön değerlendirme tamamen ücretsizdir. Klinik konsültasyon ücretleri için ekibimizle iletişime geçin.',
  },
  {
    q: 'Fotoğrafım güvende mi?',
    a: 'Fotoğrafınız KVKK kapsamında korunur ve yalnızca doktor incelemesi amacıyla kullanılır. Üçüncü taraflarla paylaşılmaz.',
  },
  {
    q: 'AI analizi ne kadar doğru?',
    a: 'Sistemimiz doktor kararını destekleyen bir ön değerlendirme aracıdır. Kesin tanı ve tedavi kararı her zaman klinik muayene sonrasında verilir.',
  },
  {
    q: 'Analiz sonrasında ne olacak?',
    a: 'Sonuç sayfanızda odak alanlarınızı göreceksiniz. Ardından WhatsApp veya telefon ile randevu alarak doktorunuzla görüşebilirsiniz.',
  },
  {
    q: 'Hangi tedaviler sunulmaktadır?',
    a: 'Botoks, dolgu, lazer, PRP, iplik askı ve daha fazlası. Tedavi seçimi kişisel analiz ve doktor değerlendirmesine göre belirlenir.',
  },
]

/* ── Chevron icon — rotates on open ── */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <div
      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-400"
      style={{
        background: open ? 'rgba(196,163,90,0.12)' : 'rgba(196,163,90,0.06)',
        boxShadow: open ? 'inset 0 0 12px rgba(196,163,90,0.08)' : 'none',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="transition-transform duration-400 ease-out"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#C4A35A]"
        />
      </svg>
    </div>
  )
}

function FAQItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      whileInView={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.6, delay: i * 0.08, ease }}
      viewport={{ once: true }}
    >
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.25, ease }}
        className="group relative rounded-[18px] sm:rounded-[20px] transition-all duration-400"
        style={{
          background: open ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: open
            ? '0 8px 32px rgba(26,26,46,0.06), 0 1px 3px rgba(26,26,46,0.03), inset 0 1px 0 rgba(255,255,255,0.8)'
            : '0 2px 12px rgba(26,26,46,0.03), 0 1px 2px rgba(26,26,46,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
          border: open ? '1px solid rgba(196,163,90,0.15)' : '1px solid rgba(26,26,46,0.04)',
        }}
      >
        {/* Question button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex justify-between items-center gap-4 sm:gap-5 px-6 sm:px-8 py-5 sm:py-6 text-left cursor-pointer"
        >
          <span className="font-display text-[17px] sm:text-[20px] font-light text-[#1A1A2E] transition-colors duration-300 group-hover:text-[#C4A35A] leading-[1.35]">
            {q}
          </span>
          <ChevronIcon open={open} />
        </button>

        {/* Answer area */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-6 sm:px-8 pb-6 sm:pb-7">
                {/* subtle separator */}
                <div className="w-10 h-px bg-[rgba(196,163,90,0.20)] mb-4 sm:mb-5" />
                <p className="font-body text-[14px] sm:text-[15px] text-[rgba(26,26,46,0.58)] leading-[1.8]">
                  {a}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

export function FAQSection() {
  return (
    <section
      id="faq"
      className="relative py-20 sm:py-28 px-6 sm:px-10 overflow-hidden"
      style={{ background: 'linear-gradient(172deg, #FAF6F1 0%, #F5F0E8 40%, #F3EDE5 100%)' }}
    >
      {/* ambient radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 20%, rgba(196,163,90,0.05) 0%, transparent 70%)',
        }}
      />

      {/* noise */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }}
      />

      <div className="container-main relative z-10 max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          viewport={{ once: true }}
          className="text-center mb-14 sm:mb-16"
        >
          <p className="font-body text-[10px] font-medium tracking-[0.22em] uppercase text-[#C4A35A] mb-4">
            Sık Sorulanlar
          </p>
          <h2 className="font-display font-light text-[clamp(2rem,4.5vw,3.25rem)] tracking-[-0.02em] leading-[1.08] text-[#1A1A2E] mb-5">
            Merak Ettikleriniz
          </h2>
          <p className="font-body text-[14px] sm:text-[15px] text-[rgba(26,26,46,0.48)] leading-[1.7] max-w-md mx-auto">
            Süreç hakkında en çok sorulan konuları sizin için sade ve şeffaf şekilde derledik.
          </p>
        </motion.div>

        {/* FAQ items */}
        <div className="flex flex-col gap-3 sm:gap-3.5">
          {faqs.map((item, i) => (
            <FAQItem key={item.q} q={item.q} a={item.a} i={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
