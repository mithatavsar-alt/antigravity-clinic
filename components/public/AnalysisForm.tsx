'use client'

import { useClinicStore } from '@/lib/store'
import { AnimatePresence, motion } from 'framer-motion'
import { tokens } from '@/lib/design-tokens'
import { FormStepPersonal } from './form/FormStepPersonal'
import { FormStepReadiness } from './form/FormStepReadiness'
import { FormStepPhotoConsent } from './form/FormStepPhotoConsent'
import { ThinLine } from '@/components/design-system/ThinLine'

const ease = tokens.motion.easing

const stepLabels = ['Kişisel Bilgiler', 'Beklentileriniz', 'Fotoğraf & Onay']

function PremiumStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-col gap-4 mb-10">
      {/* Step indicators */}
      <div className="flex items-center justify-between gap-3">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1
          const isActive = step === stepNum
          const isCompleted = step > stepNum
          return (
            <div key={label} className="flex items-center gap-3 flex-1">
              <div className="flex items-center gap-3 flex-1">
                {/* Circle */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, #D6B98C, #C4A35A)'
                      : isCompleted
                        ? 'rgba(214, 185, 140, 0.15)'
                        : 'rgba(248, 246, 242, 0.04)',
                    border: isActive
                      ? 'none'
                      : isCompleted
                        ? '1px solid rgba(214, 185, 140, 0.3)'
                        : '1px solid rgba(248, 246, 242, 0.1)',
                    boxShadow: isActive ? '0 0 20px rgba(214, 185, 140, 0.2)' : 'none',
                  }}
                >
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5 text-[#D6B98C]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span
                      className="font-mono text-[11px] font-medium"
                      style={{ color: isActive ? '#0E0B09' : 'rgba(248, 246, 242, 0.3)' }}
                    >
                      {stepNum}
                    </span>
                  )}
                </div>
                {/* Label */}
                <span
                  className="font-body text-[11px] tracking-[0.08em] uppercase transition-colors duration-300 hidden sm:block"
                  style={{
                    color: isActive
                      ? '#D6B98C'
                      : isCompleted
                        ? 'rgba(214, 185, 140, 0.6)'
                        : 'rgba(248, 246, 242, 0.25)',
                  }}
                >
                  {label}
                </span>
              </div>
              {/* Connector line */}
              {i < stepLabels.length - 1 && (
                <div className="flex-1 h-px max-w-12 overflow-hidden" style={{ background: 'rgba(214, 185, 140, 0.1)' }}>
                  <div
                    className="h-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      width: step > stepNum ? '100%' : '0%',
                      background: 'linear-gradient(90deg, rgba(214,185,140,0.4), rgba(214,185,140,0.15))',
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
          <div key={s} className="flex-1 h-[2px] rounded-full overflow-hidden bg-[rgba(248,246,242,0.06)]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: step >= s ? '100%' : '0%',
                background: 'linear-gradient(90deg, #D6B98C, #C4A35A)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalysisForm() {
  const { formStep } = useClinicStore()

  return (
    <div
      className="theme-dark min-h-screen py-28 px-5"
      style={{
        background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)',
      }}
    >
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="font-body text-[11px] font-medium tracking-[0.25em] uppercase text-[#D6B98C] mb-3">
            Adım {formStep} / 3
          </p>
          <h1 className="font-display text-[clamp(32px,5vw,48px)] font-light text-[#F8F6F2] tracking-[-0.02em]">
            Ön Değerlendirme
          </h1>
          <div className="flex justify-center mt-4">
            <ThinLine width={48} light />
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-[20px] p-8 sm:p-10"
          style={{
            background: 'rgba(20, 18, 15, 0.7)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(214, 185, 140, 0.1)',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.3)',
          }}
        >
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

        <p className="text-center font-body text-[11px] text-[rgba(248,246,242,0.25)] mt-6 leading-relaxed">
          Verileriniz KVKK kapsamında korunmaktadır. Herhangi bir ücret talep edilmez.
        </p>
      </div>
    </div>
  )
}
