'use client'

import { useClinicStore } from '@/lib/store'
import { AnimatePresence, motion } from 'framer-motion'
import { tokens } from '@/lib/design-tokens'
import { FormStepPersonal } from './form/FormStepPersonal'
import { FormStepReadiness } from './form/FormStepReadiness'
import { FormStepPhotoConsent } from './form/FormStepPhotoConsent'
import Image from 'next/image'

const ease = tokens.motion.easing

const steps = [
  { num: 1, label: 'Kişisel Bilgiler' },
  { num: 2, label: 'Beklentileriniz' },
  { num: 3, label: 'Fotoğraf & Onay' },
] as const

// ─── Premium Stepper ────────────────────────────────────────

function PremiumStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-col gap-5 mb-10">
      {/* Step circles + labels */}
      <div className="flex items-center justify-between">
        {steps.map((s, i) => {
          const isActive = step === s.num
          const isCompleted = step > s.num

          return (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex items-center gap-3">
                {/* Circle */}
                <motion.div
                  animate={{
                    scale: isActive ? 1 : 1,
                    boxShadow: isActive
                      ? '0 0 24px rgba(214, 185, 140, 0.30), 0 0 8px rgba(214, 185, 140, 0.15)'
                      : 'none',
                  }}
                  transition={{ duration: 0.5 }}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, #D6B98C, #C4A35A)'
                      : isCompleted
                        ? 'rgba(214, 185, 140, 0.12)'
                        : 'rgba(248, 246, 242, 0.03)',
                    border: isActive
                      ? '1px solid rgba(214, 185, 140, 0.4)'
                      : isCompleted
                        ? '1px solid rgba(214, 185, 140, 0.25)'
                        : '1px solid rgba(248, 246, 242, 0.08)',
                  }}
                >
                  {isCompleted ? (
                    <motion.svg
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      className="w-3.5 h-3.5 text-[#D6B98C]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </motion.svg>
                  ) : (
                    <span
                      className="font-mono text-[11px] font-medium"
                      style={{ color: isActive ? '#0E0B09' : 'rgba(248, 246, 242, 0.25)' }}
                    >
                      {s.num}
                    </span>
                  )}
                </motion.div>

                {/* Label */}
                <span
                  className="font-body text-[11px] tracking-[0.06em] uppercase transition-all duration-500 hidden sm:block"
                  style={{
                    color: isActive
                      ? '#D6B98C'
                      : isCompleted
                        ? 'rgba(214, 185, 140, 0.55)'
                        : 'rgba(248, 246, 242, 0.20)',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {s.label}
                </span>
              </div>

              {/* Connector */}
              {i < steps.length - 1 && (
                <div className="flex-1 mx-4 h-px overflow-hidden" style={{ background: 'rgba(214, 185, 140, 0.08)' }}>
                  <motion.div
                    className="h-full"
                    initial={{ width: '0%' }}
                    animate={{ width: step > s.num ? '100%' : '0%' }}
                    transition={{ duration: 0.7, ease }}
                    style={{
                      background: 'linear-gradient(90deg, rgba(214,185,140,0.45), rgba(214,185,140,0.10))',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1 h-[2px] rounded-full overflow-hidden bg-[rgba(248,246,242,0.04)]">
            <motion.div
              className="h-full rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: step >= s ? '100%' : '0%' }}
              transition={{ duration: 0.7, delay: 0.1, ease }}
              style={{
                background: 'linear-gradient(90deg, #D6B98C, #C4A35A)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Trust Row ──────────────────────────────────────────────

function TrustRow() {
  const items = [
    { icon: '🔒', text: 'Gizlilikle işlenir' },
    { icon: '3', text: 'adım' },
    { icon: '~1', text: 'dakika' },
  ]

  return (
    <div className="flex items-center justify-center gap-4 sm:gap-6">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i === 0 ? (
            <svg className="w-3 h-3" style={{ color: 'rgba(214, 185, 140, 0.50)' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          ) : null}
          <span
            className="font-body text-[10px] tracking-[0.04em]"
            style={{ color: 'rgba(248, 246, 242, 0.30)' }}
          >
            {i === 0 ? item.text : `${item.icon} ${item.text}`}
          </span>
          {i < items.length - 1 && (
            <span className="ml-2 sm:ml-4 text-[8px]" style={{ color: 'rgba(248, 246, 242, 0.12)' }}>•</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function AnalysisForm() {
  const { formStep } = useClinicStore()

  return (
    <div
      className="theme-dark min-h-screen py-24 sm:py-28 px-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)',
      }}
    >
      {/* ═══ Atmospheric layers ═══ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(196, 163, 90, 0.04) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 40% 40% at 70% 70%, rgba(91, 127, 168, 0.02) 0%, transparent 60%)',
        }}
      />

      {/* Ambient portrait background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[700px] h-[470px] opacity-[0.05]">
          <Image
            src="/images/AIAnaliz/AIAnaliz.png"
            alt=""
            fill
            className="object-cover object-center"
            sizes="700px"
            aria-hidden="true"
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 10%, #0E0B09 60%)',
          }}
        />
      </div>

      {/* Noise texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.012]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      <div className="max-w-xl mx-auto relative z-10">

        {/* ═══ Hero header ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className="text-center mb-6"
        >
          <p
            className="font-body text-[12px] font-medium tracking-[0.25em] uppercase mb-4"
            style={{ color: 'rgba(214, 185, 140, 0.60)' }}
          >
            Adım {formStep} / 3
          </p>

          <h1
            className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-light tracking-[-0.01em] leading-[1.1]"
            style={{ color: '#F8F6F2' }}
          >
            Ön Değerlendirme
          </h1>

          {/* Gold accent line */}
          <div className="flex justify-center mt-5">
            <div
              className="h-px w-12"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(214, 185, 140, 0.40), transparent)',
              }}
            />
          </div>

          {/* Premium subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="font-body text-[13px] leading-relaxed mt-4 max-w-sm mx-auto"
            style={{ color: 'rgba(248, 246, 242, 0.40)' }}
          >
            Kişiye özel değerlendirme süreciniz için birkaç kısa bilgi paylaşabilirsiniz.
          </motion.p>
        </motion.div>

        {/* ═══ Trust micro-row ═══ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mb-10"
        >
          <TrustRow />
        </motion.div>

        {/* ═══ Form card ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(16, 14, 11, 0.65)',
            border: '1px solid rgba(214, 185, 140, 0.10)',
            backdropFilter: 'blur(32px)',
            boxShadow: `
              0 8px 48px rgba(0, 0, 0, 0.35),
              0 2px 16px rgba(0, 0, 0, 0.20),
              inset 0 1px 0 rgba(214, 185, 140, 0.05)
            `,
          }}
        >
          {/* Top gold edge light */}
          <div
            className="absolute top-0 left-[15%] right-[15%] h-px pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(214, 185, 140, 0.18), transparent)',
            }}
          />

          {/* Inner ambient glow */}
          <div
            className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-64 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse, rgba(196, 163, 90, 0.04) 0%, transparent 70%)',
            }}
          />

          <div className="relative p-7 sm:p-10">
            <PremiumStepper step={formStep} />

            <AnimatePresence mode="wait">
              {formStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <FormStepPersonal />
                </motion.div>
              )}
              {formStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <FormStepReadiness />
                </motion.div>
              )}
              {formStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <FormStepPhotoConsent />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom gold edge light */}
          <div
            className="absolute bottom-0 left-[20%] right-[20%] h-px pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(214, 185, 140, 0.08), transparent)',
            }}
          />
        </motion.div>

        {/* ═══ Footer trust text ═══ */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center font-body text-[10.5px] mt-7 leading-relaxed"
          style={{ color: 'rgba(248, 246, 242, 0.22)' }}
        >
          Verileriniz KVKK kapsamında korunmaktadır. Herhangi bir ücret talep edilmez.
        </motion.p>
      </div>
    </div>
  )
}
