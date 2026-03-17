'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { HeroTrustStrip } from '@/components/public/HeroTrustStrip'
import { HeroWireframe } from '@/components/public/HeroWireframe'

const ease = [0.16, 1, 0.3, 1] as const

export function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)',
        backgroundSize: '400% 400%',
        animation: 'heroGradient 30s ease infinite',
      }}
    >
      <HeroWireframe />

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center flex flex-col items-center">
        {/* Section label */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="font-body text-[11px] font-medium tracking-[0.25em] uppercase text-[#D6B98C]"
        >
          ANTIGRAVITY
        </motion.p>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease }}
          className="mt-5 font-display font-normal leading-[0.95] tracking-[-0.035em]"
          style={{ fontSize: 'clamp(44px, 6vw, 80px)' }}
        >
          <span className="text-[#F8F6F2]">Doğal Güzelliğinizi</span>
          <br />
          <span className="text-[#D6B98C]">Keşfedin</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease }}
          className="mt-6 font-body font-light text-[rgba(248,246,242,0.55)] max-w-md leading-relaxed"
          style={{ fontSize: 'clamp(15px, 1.8vw, 18px)' }}
        >
          AI destekli yüz analizi ile kişiselleştirilmiş estetik değerlendirme.
          Bilimsel verilerle desteklenen öneriler.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-5 w-full sm:w-auto"
        >
          <Link href="/analysis" className="w-full sm:w-auto">
            <button
              className="w-full sm:w-auto px-9 py-4 rounded-[14px] font-body text-[13px] font-medium tracking-[0.15em] uppercase text-[#0E0B09] transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, #D6B98C, #C4A35A)',
                boxShadow: '0 0 30px rgba(214, 185, 140, 0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 40px rgba(214, 185, 140, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(214, 185, 140, 0.15)'
              }}
            >
              Ön Değerlendirme Başlat
            </button>
          </Link>
          <a
            href="https://wa.me/905551234567"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <button
              className="w-full sm:w-auto px-9 py-4 rounded-[14px] font-body text-[13px] font-medium tracking-[0.15em] uppercase text-[#D6B98C] bg-transparent border border-[rgba(214,185,140,0.25)] transition-all duration-300 cursor-pointer hover:-translate-y-px hover:border-[rgba(214,185,140,0.4)] hover:bg-[rgba(214,185,140,0.05)]"
            >
              WhatsApp ile İletişim
            </button>
          </a>
        </motion.div>

        {/* Trust Strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5, ease }}
          className="mt-14"
        >
          <HeroTrustStrip />
        </motion.div>
      </div>
    </section>
  )
}
