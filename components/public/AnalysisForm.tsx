'use client'

import { useClinicStore } from '@/lib/store'
import { AnimatePresence, motion } from 'framer-motion'
import { tokens } from '@/lib/design-tokens'
import { FormStepPersonal } from './form/FormStepPersonal'
import { FormStepReadiness } from './form/FormStepReadiness'
import { FormStepPhotoConsent } from './form/FormStepPhotoConsent'
import { GlassCard } from '@/components/design-system/GlassCard'
import { ThinLine } from '@/components/design-system/ThinLine'

const ease = tokens.motion.easing

function FormProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-col gap-3 mb-10">
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1 h-0.5 rounded-full overflow-hidden bg-[#E7E5E4]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: step >= s ? '100%' : '0%',
                background: 'linear-gradient(90deg, #C4A35A, #D4B96A)',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {['Kişisel Bilgiler', 'Beklentileriniz', 'Fotoğraf & Onay'].map((label, i) => (
          <span
            key={label}
            className="font-body text-[10px] tracking-[0.12em] uppercase transition-colors"
            style={{ color: step >= i + 1 ? '#C4A35A' : 'rgba(26,26,46,0.3)' }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function AnalysisForm() {
  const { formStep } = useClinicStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] to-[#F5E6D3] py-28 px-5">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="font-body text-[10px] tracking-[0.25em] uppercase text-[#8B7FA8] mb-3">
            Adım {formStep} / 3
          </p>
          <h1 className="font-display text-[clamp(32px,5vw,48px)] font-light text-[#1A1A2E] tracking-[-0.02em]">
            Ön Değerlendirme
          </h1>
          <div className="flex justify-center mt-4">
            <ThinLine width={48} />
          </div>
        </div>

        <GlassCard strong padding="lg" rounded="xl">
          <FormProgressBar step={formStep} />

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
        </GlassCard>

        <p className="text-center font-body text-[11px] text-[rgba(26,26,46,0.35)] mt-6 leading-relaxed">
          Verileriniz KVKK kapsamında korunmaktadır. Herhangi bir ücret talep edilmez.
        </p>
      </div>
    </div>
  )
}
