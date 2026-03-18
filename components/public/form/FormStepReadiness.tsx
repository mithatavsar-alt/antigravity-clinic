'use client'

import { useForm, type UseFormRegister } from 'react-hook-form'
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

const RadioGroup = ({ name, options, register, error }: {
  name: keyof FormData
  options: { value: string; label: string }[]
  register: UseFormRegister<FormData>
  error?: string
}) => (
  <div className="flex flex-col gap-2">
    {options.map(({ value, label }) => (
      <label key={value} className="flex items-center gap-3 p-3 rounded-[10px] border border-[rgba(214,185,140,0.12)] cursor-pointer hover:bg-[rgba(214,185,140,0.04)] transition-colors">
        <input type="radio" value={value} {...register(name)} className="accent-[#D6B98C]" />
        <span className="font-body text-[13px] text-[#F8F6F2]">{label}</span>
      </label>
    ))}
    {error && <p className="font-body text-[11px] text-[#C47A7A]">{error}</p>}
  </div>
)

export function FormStepReadiness() {
  const { setCurrentLead, setFormStep, currentLead } = useClinicStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      desired_result_style: currentLead?.desired_result_style,
      prior_treatment: currentLead?.prior_treatment != null ? String(currentLead.prior_treatment) as 'true' | 'false' : undefined,
      consultation_timing: currentLead?.consultation_timing,
    },
  })

  const onSubmit = (data: FormData) => {
    setCurrentLead({ ...data, prior_treatment: data.prior_treatment === 'true' })
    setFormStep(3)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Desired result */}
      <div className="flex flex-col gap-2.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          Nasıl bir sonuç bekliyorsunuz? *
        </label>
        <RadioGroup
          name="desired_result_style"
          options={Object.entries(desiredResultLabels).map(([v, l]) => ({ value: v, label: l }))}
          register={register}
          error={errors.desired_result_style?.message}
        />
      </div>

      {/* Prior treatment */}
      <div className="flex flex-col gap-2.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          Daha önce estetik işlem yaptırdınız mı? *
        </label>
        <RadioGroup
          name="prior_treatment"
          options={[{ value: 'true', label: 'Evet' }, { value: 'false', label: 'Hayır' }]}
          register={register}
          error={errors.prior_treatment?.message}
        />
      </div>

      {/* Consultation timing */}
      <div className="flex flex-col gap-2.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          Doktor görüşmesini ne zaman düşünüyorsunuz? *
        </label>
        <RadioGroup
          name="consultation_timing"
          options={Object.entries(consultationTimingLabels).map(([v, l]) => ({ value: v, label: l }))}
          register={register}
          error={errors.consultation_timing?.message}
        />
      </div>

      <div className="flex gap-3 mt-2">
        <PremiumButton type="button" variant="ghost" size="md" onClick={() => setFormStep(1)} className="flex-1 justify-center">
          Geri
        </PremiumButton>
        <PremiumButton type="submit" variant="gold" size="md" className="flex-1 justify-center">
          Devam Et
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </PremiumButton>
      </div>
    </form>
  )
}
