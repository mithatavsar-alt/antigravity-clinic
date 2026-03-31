'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClinicStore } from '@/lib/store'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { CONCERN_GROUPS, concernSubAreaLabels } from '@/types/lead'
import type { ConcernArea, ConcernSubArea } from '@/types/lead'

// ─── Schema ──────────────────────────────────────────────────

const schema = z.object({
  full_name: z.string().min(2, 'Ad soyad en az 2 karakter'),
  phone: z.string().regex(
    /^0[5][0-9]{2}[\s]?[0-9]{3}[\s]?[0-9]{2}[\s]?[0-9]{2}$/,
    'Geçerli bir Türk telefon numarası girin (05XX XXX XX XX)'
  ),
  age_range: z.enum(['18-24', '25-34', '35-44', '45-54', '55+']),
  gender: z.enum(['female', 'male', 'other']),
  expectation_note: z.string().max(300).optional(),
})

type FormData = z.infer<typeof schema>

const MAX_SUB_SELECTIONS = 3

// ─── Group icons ─────────────────────────────────────────────

function GroupIcon({ groupKey }: { groupKey: string }) {
  const cls = "w-5 h-5"
  switch (groupKey) {
    case 'yuz_hatlari':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
        </svg>
      )
    case 'cizgiler_kirisiklik':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
        </svg>
      )
    case 'cilt':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      )
    default:
      return null
  }
}

// ─── Component ───────────────────────────────────────────────

export function FormStepPersonal() {
  const { setCurrentLead, setFormStep, currentLead } = useClinicStore()

  // Concern area state (managed outside react-hook-form for custom UI)
  const [selectedGroup, setSelectedGroup] = useState<ConcernArea | null>(
    currentLead?.concern_area ?? null
  )
  const [selectedSubs, setSelectedSubs] = useState<ConcernSubArea[]>(
    currentLead?.concern_sub_areas ?? []
  )
  const [concernError, setConcernError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: currentLead?.full_name ?? '',
      phone: currentLead?.phone ?? '',
      age_range: currentLead?.age_range,
      gender: currentLead?.gender,
      expectation_note: currentLead?.expectation_note ?? '',
    },
  })

  const handleGroupSelect = useCallback((key: ConcernArea) => {
    if (selectedGroup === key) return
    setSelectedGroup(key)
    setSelectedSubs([])
    setConcernError(null)
  }, [selectedGroup])

  const handleSubToggle = useCallback((sub: ConcernSubArea) => {
    setSelectedSubs(prev => {
      if (prev.includes(sub)) return prev.filter(s => s !== sub)
      if (prev.length >= MAX_SUB_SELECTIONS) return prev
      return [...prev, sub]
    })
  }, [])

  const onSubmit = (data: FormData) => {
    if (!selectedGroup) {
      setConcernError('Lütfen bir alan seçin')
      return
    }
    setCurrentLead({
      ...data,
      concern_area: selectedGroup,
      concern_sub_areas: selectedSubs.length > 0 ? selectedSubs : undefined,
    })
    setFormStep(2)
  }

  const activeGroup = CONCERN_GROUPS.find(g => g.key === selectedGroup)

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

      {/* ═══ Concern Area — Hybrid Group + Sub-Select ═══ */}
      <div className="flex flex-col gap-3">
        <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(248,246,242,0.4)]">
          İlgilendiğiniz Alan *
        </label>

        {/* Step 1: Group cards */}
        <div className="grid grid-cols-3 gap-2.5">
          {CONCERN_GROUPS.map(g => {
            const isActive = selectedGroup === g.key
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => handleGroupSelect(g.key)}
                className={`relative flex flex-col items-center gap-2 py-4 px-2 rounded-[14px] transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'bg-[rgba(214,185,140,0.08)] border-[rgba(214,185,140,0.30)] scale-[1.02]'
                    : 'bg-[rgba(248,246,242,0.02)] border-[rgba(248,246,242,0.06)] hover:bg-[rgba(248,246,242,0.04)] hover:border-[rgba(248,246,242,0.10)]'
                } border`}
              >
                <div className={`transition-colors duration-300 ${
                  isActive ? 'text-[#D6B98C]' : 'text-[rgba(248,246,242,0.3)]'
                }`}>
                  <GroupIcon groupKey={g.key} />
                </div>
                <span className={`font-body text-[10px] sm:text-[11px] tracking-[0.04em] text-center leading-tight transition-colors duration-300 ${
                  isActive ? 'text-[#F8F6F2]' : 'text-[rgba(248,246,242,0.45)]'
                }`}>
                  {g.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Step 2: Sub-selections (animated expand) */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            maxHeight: activeGroup ? '160px' : '0px',
            opacity: activeGroup ? 1 : 0,
          }}
        >
          {activeGroup && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-body text-[9px] tracking-[0.18em] uppercase text-[rgba(248,246,242,0.3)]">
                  Detay seçin (opsiyonel, en fazla {MAX_SUB_SELECTIONS})
                </span>
                {selectedSubs.length > 0 && (
                  <span className="font-mono text-[9px] text-[rgba(214,185,140,0.5)]">
                    {selectedSubs.length}/{MAX_SUB_SELECTIONS}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeGroup.subs.map(sub => {
                  const isSelected = selectedSubs.includes(sub)
                  const isDisabled = !isSelected && selectedSubs.length >= MAX_SUB_SELECTIONS
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => !isDisabled && handleSubToggle(sub)}
                      className={`px-3.5 py-1.5 rounded-full font-body text-[11px] tracking-[0.03em] border transition-all duration-200 ${
                        isSelected
                          ? 'bg-[rgba(214,185,140,0.10)] border-[rgba(214,185,140,0.30)] text-[#F8F6F2]'
                          : isDisabled
                            ? 'bg-transparent border-[rgba(248,246,242,0.04)] text-[rgba(248,246,242,0.18)] cursor-not-allowed'
                            : 'bg-transparent border-[rgba(248,246,242,0.08)] text-[rgba(248,246,242,0.45)] hover:border-[rgba(248,246,242,0.15)] hover:text-[rgba(248,246,242,0.6)] cursor-pointer'
                      }`}
                    >
                      {concernSubAreaLabels[sub]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {concernError && <p className="font-body text-[11px] text-[#C47A7A]">{concernError}</p>}
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
