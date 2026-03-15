'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { FaceMarker } from '@/components/design-system/FaceMarker'
import { GlassCard } from '@/components/design-system/GlassCard'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

export function HeroSection() {
  return (
    <section className="relative min-h-screen bg-gradient-to-br from-[#FAF6F1] via-[#F5E6D3] to-[#E8E4EF] overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-[rgba(139,127,168,0.08)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full bg-[rgba(196,163,90,0.07)] blur-3xl pointer-events-none" />

      <div className="container-main grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 min-h-screen items-center pt-24 pb-16">
        {/* LEFT — Editorial text */}
        <div className="flex flex-col gap-7 order-1">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
          >
            <SectionLabel>AI-Destekli Medikal Estetik</SectionLabel>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, delay: 0.15, ease }}
          >
            <EditorialHeading as="h1">
              Bilimin<br />
              <GoldItalic>Sanatla</GoldItalic><br />
              Buluştuğu<br />
              Nokta
            </EditorialHeading>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className="font-body text-[14px] text-[rgba(26,26,46,0.6)] leading-relaxed max-w-md"
          >
            47 parametreli AI yüz analizi ile kişiselleştirilmiş estetik tedavi planı. Veri destekli kararlar, sanat düzeyinde uygulama.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease }}
            className="flex flex-wrap gap-3"
          >
            <Link href="/analysis">
              <PremiumButton size="lg">Ön Değerlendirme Başlat</PremiumButton>
            </Link>
            <a href="#how-it-works">
              <PremiumButton variant="secondary" size="lg">Nasıl Çalışır</PremiumButton>
            </a>
          </motion.div>

          {/* Trust micro-badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6, ease }}
            className="flex flex-wrap gap-6 pt-2"
          >
            {[
              { num: '47', label: 'AI Parametresi' },
              { num: '98%', label: 'Memnuniyet' },
              { num: '3 sn', label: 'Analiz Süresi' },
            ].map(({ num, label }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="font-mono text-[20px] font-medium text-gradient-gold">{num}</span>
                <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[rgba(26,26,46,0.4)]">{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* RIGHT — Cinematic portrait + AI overlay */}
        <motion.div
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease }}
          className="relative order-2 h-[420px] md:h-[580px]"
        >
          {/* Portrait placeholder */}
          <div className="absolute inset-0 rounded-[24px] bg-gradient-to-b from-[#F5E6D3] via-[#F0DDD5] to-[#E8E4EF] overflow-hidden">
            {/* Scan lines decoration */}
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(196,163,90,0.3) 24px, rgba(196,163,90,0.3) 25px)' }}
            />
            {/* Scan line animation */}
            <div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(196,163,90,0.5)] to-transparent"
              style={{ animation: 'scanDown 4s ease-in-out infinite' }}
            />
            {/* Face silhouette */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 rounded-[50%_50%_42%_42%_/_32%_32%_40%_40%] bg-gradient-to-b from-[#E8D5C4] to-[#C8B4A0] opacity-50" />
            {/* Inner glow */}
            <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-[rgba(240,221,213,0.6)] blur-2xl" />

            {/* Face markers */}
            <FaceMarker x={35} y={25} label="Periorbital" score={0.42} />
            <FaceMarker x={60} y={25} label="Temporal" score={0.35} />
            <FaceMarker x={28} y={48} label="Göz Altı" score={0.71} />
            <FaceMarker x={68} y={48} label="Kaz Ayağı" score={0.63} />
            <FaceMarker x={50} y={62} label="Nazolabial" score={0.67} />
            <FaceMarker x={50} y={75} label="Dudak" score={0.49} />

            {/* Face outline frame */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-72 rounded-[50%_50%_42%_42%_/_32%_32%_40%_40%] border border-[rgba(196,163,90,0.35)]" />

            {/* Corner brackets */}
            {[
              'top-6 left-6 border-t border-l',
              'top-6 right-6 border-t border-r',
              'bottom-6 left-6 border-b border-l',
              'bottom-6 right-6 border-b border-r',
            ].map((pos, i) => (
              <div key={i} className={`absolute ${pos} w-5 h-5 border-[rgba(196,163,90,0.5)]`} />
            ))}
          </div>

          {/* Floating AI analysis card — left */}
          <GlassCard className="absolute -left-6 bottom-16 w-44 z-10" padding="sm">
            <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[#8B7FA8] mb-1.5">Cilt Sağlığı</p>
            <p className="font-mono text-[28px] font-light text-[#1A1A2E] leading-none">9.4</p>
            <p className="font-body text-[9px] text-[rgba(26,26,46,0.45)] mt-1">47 parametreden</p>
            <div className="mt-2.5 h-0.5 bg-[#E7E5E4] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#C4A35A] to-[#8B7FA8]" style={{ width: '94%' }} />
            </div>
          </GlassCard>

          {/* Floating AI analysis card — right */}
          <GlassCard className="absolute -right-4 top-12 w-44 z-10" padding="sm">
            <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[#8B7FA8] mb-1.5">AI Güveni</p>
            <p className="font-mono text-[28px] font-light text-[#1A1A2E] leading-none">97<span className="text-base">%</span></p>
            <p className="font-body text-[9px] text-[rgba(26,26,46,0.45)] mt-1">Analiz doğruluğu</p>
            <div className="mt-2.5 h-0.5 bg-[#E7E5E4] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#2D5F5D] to-[#C4A35A]" style={{ width: '97%' }} />
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <style jsx>{`
        @keyframes scanDown {
          0% { top: 5%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 95%; opacity: 0; }
        }
      `}</style>
    </section>
  )
}
