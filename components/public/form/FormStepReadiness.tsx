'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClinicStore } from '@/lib/store'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { desiredResultLabels, consultationTimingLabels } from '@/types/lead'

const schema = z.object({
  desired_result_style: z.enum(['cok_dogal', 'dogal_fark_edilir', 'belirgin', 'emin_degil']),
  prior_treatment: z.enum(['true', 'false']),
  consultation_timing: z.enum(['bilgi_almak', 'bir_ay', 'iki_hafta', 'asap']),
})

type FormData = z.infer<typeof schema>

// ─── Premium Radio Option ───────────────────────────────────

function PremiumRadio({ name, value, label, register, isSelected }: {
  name: string
  value: string
  label: string
  register: ReturnType<typeof useForm<FormData>>['register']
  isSelected: boolean
}) {
  return (
    <label
      className="flex items-center gap-3.5 p-3.5 rounded-[14px] cursor-pointer transition-all duration-300"
      style={{
        background: isSelected
          ? 'rgba(214, 185, 140, 0.06)'
          : 'rgba(248, 246, 242, 0.012)',
        border: isSelected
          ? '1px solid rgba(214, 185, 140, 0.25)'
          : '1px solid rgba(248, 246, 242, 0.06)',
        boxShadow: isSelected
          ? '0 2px 16px rgba(214, 185, 140, 0.06), inset 0 1px 0 rgba(214, 185, 140, 0.04)'
          : 'none',
      }}
    >
      {/* Custom radio circle */}
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
        style={{
          border: isSelected
            ? '2px solid #D6B98C'
            : '1.5px solid rgba(248, 246, 242, 0.15)',
          background: 'transparent',
        }}
      >
        <div
          className="rounded-full transition-all duration-300"
          style={{
            width: isSelected ? 8 : 0,
            height: isSelected ? 8 : 0,
            background: isSelected ? '#D6B98C' : 'transparent',
            boxShadow: isSelected ? '0 0 8px rgba(214, 185, 140, 0.3)' : 'none',
          }}
        />
      </div>

      <input
        type="radio"
        value={value}
        {...register(name as keyof FormData)}
        className="sr-only"
      />

      <span
        className="font-body text-[13px] transition-colors duration-300"
        style={{
          color: isSelected ? '#F8F6F2' : 'rgba(248, 246, 242, 0.50)',
        }}
      >
        {label}
      </span>
    </label>
  )
}

// ─── Component ───────────────────────────────────────────────

export function FormStepReadiness() {
  const { setCurrentLead, setFormStep, currentLead } = useClinicStore()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      desired_result_style: currentLead?.desired_result_style,
      prior_treatment: currentLead?.prior_treatment != null ? String(currentLead.prior_treatment) as 'true' | 'false' : undefined,
      consultation_timing: currentLead?.consultation_timing,
    },
  })

  const watchedStyle = watch('desired_result_style')
  const watchedTreatment = watch('prior_treatment')
  const watchedTiming = watch('consultation_timing')

  const onSubmit = (data: FormData) => {
    setCurrentLead({ ...data, prior_treatment: data.prior_treatment === 'true' })
    setFormStep(3)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-7">

      {/* ── Desired result ── */}
      <div className="flex flex-col gap-3">
        <label
          className="font-body text-[12px] tracking-[0.18em] uppercase font-medium"
          style={{ color: 'rgba(248, 246, 242, 0.45)' }}
        >
          Nasıl bir sonuç bekliyorsunuz? <span style={{ color: 'rgba(214, 185, 140, 0.5)' }}>*</span>
        </label>
        <div className="flex flex-col gap-2">
          {Object.entries(desiredResultLabels).map(([value, label]) => (
            <PremiumRadio
              key={value}
              name="desired_result_style"
              value={value}
              label={label}
              register={register}
              isSelected={watchedStyle === value}
            />
          ))}
        </div>
        {errors.desired_result_style?.message && (
          <p className="font-body text-[11px] flex items-center gap-1.5" style={{ color: '#C47A7A' }}>
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Lütfen bir seçenek belirtin
          </p>
        )}
      </div>

      {/* ── Prior treatment ── */}
      <div className="flex flex-col gap-3">
        <label
          className="font-body text-[12px] tracking-[0.18em] uppercase font-medium"
          style={{ color: 'rgba(248, 246, 242, 0.45)' }}
        >
          Daha önce estetik işlem yaptırdınız mı? <span style={{ color: 'rgba(214, 185, 140, 0.5)' }}>*</span>
        </label>
        <div className="flex flex-col gap-2">
          <PremiumRadio name="prior_treatment" value="true" label="Evet" register={register} isSelected={watchedTreatment === 'true'} />
          <PremiumRadio name="prior_treatment" value="false" label="Hayır" register={register} isSelected={watchedTreatment === 'false'} />
        </div>
        {errors.prior_treatment?.message && (
          <p className="font-body text-[11px] flex items-center gap-1.5" style={{ color: '#C47A7A' }}>
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Lütfen bir seçenek belirtin
          </p>
        )}
      </div>

      {/* ── Consultation timing ── */}
      <div className="flex flex-col gap-3">
        <label
          className="font-body text-[12px] tracking-[0.18em] uppercase font-medium"
          style={{ color: 'rgba(248, 246, 242, 0.45)' }}
        >
          Doktor görüşmesini ne zaman düşünüyorsunuz? <span style={{ color: 'rgba(214, 185, 140, 0.5)' }}>*</span>
        </label>
        <div className="flex flex-col gap-2">
          {Object.entries(consultationTimingLabels).map(([value, label]) => (
            <PremiumRadio
              key={value}
              name="consultation_timing"
              value={value}
              label={label}
              register={register}
              isSelected={watchedTiming === value}
            />
          ))}
        </div>
        {errors.consultation_timing?.message && (
          <p className="font-body text-[11px] flex items-center gap-1.5" style={{ color: '#C47A7A' }}>
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Lütfen bir seçenek belirtin
          </p>
        )}
      </div>

      {/* ── CTA row ── */}
      <div className="flex gap-3 mt-2">
        <PremiumButton type="button" variant="ghost" size="md" onClick={() => setFormStep(1)} className="flex-1 justify-center">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Geri
        </PremiumButton>
        <PremiumButton type="submit" variant="gold" size="md" className="flex-[2] justify-center">
          Bir Sonraki Aşama
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </PremiumButton>
      </div>
    </form>
  )
}
