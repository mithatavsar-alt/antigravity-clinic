'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClinicStore } from '@/lib/store'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { concernAreaLabels } from '@/types/lead'

const schema = z.object({
  full_name: z.string().min(2, 'Ad soyad en az 2 karakter'),
  // Accepts "05XXXXXXXXX" (no spaces) or "05XX XXX XX XX" (Turkish standard format)
  phone: z.string().regex(
    /^0[5][0-9]{2}[\s]?[0-9]{3}[\s]?[0-9]{2}[\s]?[0-9]{2}$/,
    'Geçerli bir Türk telefon numarası girin (05XX XXX XX XX)'
  ),
  age_range: z.enum(['18-24', '25-34', '35-44', '45-54', '55+']),
  gender: z.enum(['female', 'male', 'other']),
  concern_area: z.enum(['goz_cevresi', 'dudak', 'alt_yuz_jawline', 'cilt_gorunumu', 'genel_yuz_dengesi']),
  expectation_note: z.string().max(300).optional(),
})

type FormData = z.infer<typeof schema>

export function FormStepPersonal() {
  const { setCurrentLead, setFormStep, currentLead } = useClinicStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: currentLead?.full_name ?? '',
      phone: currentLead?.phone ?? '',
      age_range: currentLead?.age_range,
      gender: currentLead?.gender,
      concern_area: currentLead?.concern_area,
      expectation_note: currentLead?.expectation_note ?? '',
    },
  })

  const onSubmit = (data: FormData) => {
    setCurrentLead(data)
    setFormStep(2)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          Ad Soyad *
        </label>
        <input {...register('full_name')} placeholder="Adınız Soyadınız" className="field-input" />
        {errors.full_name?.message && <p className="font-body text-[11px] text-[#C47A7A]">{errors.full_name.message}</p>}
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          Telefon *
        </label>
        <input {...register('phone')} placeholder="05XX XXX XX XX" className="field-input" />
        {errors.phone?.message && <p className="font-body text-[11px] text-[#C47A7A]">{errors.phone.message}</p>}
      </div>

      {/* Age + Gender */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
            Yaş Aralığı *
          </label>
          <select {...register('age_range')} className="field-input">
            <option value="">Seçin</option>
            {['18-24', '25-34', '35-44', '45-54', '55+'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {errors.age_range?.message && <p className="font-body text-[11px] text-[#C47A7A]">{errors.age_range.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
            Cinsiyet *
          </label>
          <select {...register('gender')} className="field-input">
            <option value="">Seçin</option>
            <option value="female">Kadın</option>
            <option value="male">Erkek</option>
            <option value="other">Diğer</option>
          </select>
          {errors.gender?.message && <p className="font-body text-[11px] text-[#C47A7A]">{errors.gender.message}</p>}
        </div>
      </div>

      {/* Concern area */}
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          İlgilendiğiniz Alan *
        </label>
        <select {...register('concern_area')} className="field-input">
          <option value="">Seçin</option>
          {(Object.entries(concernAreaLabels) as [string, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        {errors.concern_area?.message && <p className="font-body text-[11px] text-[#C47A7A]">{errors.concern_area.message}</p>}
      </div>

      {/* Expectation note */}
      <div className="flex flex-col gap-1.5">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          Beklenti Notunuz
        </label>
        <textarea
          {...register('expectation_note')}
          rows={3}
          placeholder="Ne tür bir sonuç beklediğinizi kısaca belirtin..."
          className="field-input resize-none"
          maxLength={300}
        />
      </div>

      <PremiumButton type="submit" variant="gold" size="lg" className="mt-2 justify-center">
        Devam Et
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </PremiumButton>
    </form>
  )
}
