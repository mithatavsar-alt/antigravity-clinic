'use client'

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { EditorialHeading, GoldItalic } from '@/components/design-system/EditorialHeading'
import { GlassCard } from '@/components/design-system/GlassCard'
import { RegionBar } from '@/components/design-system/RegionBar'
import { tokens } from '@/lib/design-tokens'

const ease = tokens.motion.easing

const mockRegions = [
  { label: 'goz_alti', score: 0.71 },
  { label: 'nazolabial', score: 0.67 },
  { label: 'kaz_ayagi', score: 0.63 },
  { label: 'yanak_orta_yuz', score: 0.58 },
  { label: 'alin', score: 0.42 },
  { label: 'dudak', score: 0.49 },
]

export function AIAnalysisPreview() {
  return (
    <section id="ai-analysis" className="py-[100px] px-10 bg-gradient-platinum relative overflow-hidden">
      <div className="absolute inset-0 opacity-30"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(196,163,90,0.12) 0%, transparent 70%)' }}
      />

      <div className="container-main relative z-10">
        <div className="text-center mb-14">
          <motion.div
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, ease }}
            viewport={{ once: true }}
            className="flex flex-col items-center gap-4"
          >
            <SectionLabel>AI Analiz Sistemi</SectionLabel>
            <EditorialHeading>
              <GoldItalic>Akıllı</GoldItalic> Tanı,<br />
              Kesin Sonuç
            </EditorialHeading>
          </motion.div>
        </div>

        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          viewport={{ once: true }}
          className="max-w-lg mx-auto"
        >
          <GlassCard strong padding="lg" rounded="xl">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="font-body text-[9px] tracking-[0.2em] uppercase text-[#8B7FA8] mb-1">Örnek Analiz</p>
                <p className="font-display text-[18px] font-light text-[#1A1A2E]">Bölgesel Değerlendirme</p>
              </div>
              <div className="text-right">
                <span className="font-mono text-[9px] text-[rgba(139,127,168,0.6)] tracking-[0.12em] block">MODEL</span>
                <span className="font-mono text-[11px] text-[#8B7FA8]">mock-v1</span>
              </div>
            </div>

            {/* Region bars */}
            <div className="flex flex-col gap-4">
              {mockRegions.map((r) => (
                <RegionBar key={r.label} label={r.label} score={r.score} />
              ))}
            </div>

            {/* Disclaimer */}
            <div className="mt-6 border border-[rgba(196,163,90,0.2)] rounded-[10px] p-3">
              <p className="font-body text-[10px] text-[rgba(26,26,46,0.5)] leading-relaxed italic">
                Bu önizleme örnek verilerle oluşturulmuştur. Gerçek analiz fotoğraf yüklenmesi ve doktor onayı ile tamamlanır.
              </p>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  )
}
