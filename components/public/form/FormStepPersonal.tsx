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

// ─── Concern card metadata ──────────────────────────────────

const CONCERN_META: Record<string, { description: string }> = {
  yuz_hatlari: { description: 'Yüz dengesi ve kontur odağı' },
  cizgiler_kirisiklik: { description: 'Alın ve göz çevresi odağı' },
  cilt: { description: 'Doku ve genel görünüm odağı' },
}

// ─── Group icons ─────────────────────────────────────────────

function GroupIcon({ groupKey, size = 20 }: { groupKey: string; size?: number }) {
  const cls = `w-[${size}px] h-[${size}px]`
  switch (groupKey) {
    case 'yuz_hatlari':
      return (
        <svg className={cls} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
        </svg>
      )
    case 'cizgiler_kirisiklik':
      return (
        <svg className={cls} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
        </svg>
      )
    case 'cilt':
      return (
        <svg className={cls} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      )
    default:
      return null
  }
}

// ─── Premium Field Wrapper ──────────────────────────────────

function FieldGroup({ label, required, error, children }: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-body text-[10px] tracking-[0.18em] uppercase font-medium" style={{ color: 'rgba(248, 246, 242, 0.45)' }}>
        {label}{required && <span style={{ color: 'rgba(214, 185, 140, 0.5)' }}> *</span>}
      </label>
      {children}
      {error && (
        <p className="font-body text-[11px] flex items-center gap-1.5" style={{ color: '#C47A7A' }}>
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────

export function FormStepPersonal() {
  const { setCurrentLead, setFormStep, currentLead } = useClinicStore()

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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">

      {/* ── Name ── */}
      <FieldGroup label="Ad Soyad" required error={errors.full_name?.message}>
        <input
          {...register('full_name')}
          placeholder="Adınız Soyadınız"
          className="field-premium"
          autoComplete="name"
        />
      </FieldGroup>

      {/* ── Phone ── */}
      <FieldGroup label="Telefon" required error={errors.phone?.message}>
        <input
          {...register('phone')}
          placeholder="05XX XXX XX XX"
          className="field-premium"
          autoComplete="tel"
          inputMode="tel"
        />
      </FieldGroup>

      {/* ── Age + Gender row ── */}
      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Yaş Aralığı" required error={errors.age_range?.message}>
          <div className="relative">
            <select {...register('age_range')} className="field-premium appearance-none pr-9">
              <option value="">Seçin</option>
              {['18-24', '25-34', '35-44', '45-54', '55+'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: 'rgba(214, 185, 140, 0.35)' }}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </FieldGroup>

        <FieldGroup label="Cinsiyet" required error={errors.gender?.message}>
          <div className="relative">
            <select {...register('gender')} className="field-premium appearance-none pr-9">
              <option value="">Seçin</option>
              <option value="female">Kadın</option>
              <option value="male">Erkek</option>
              <option value="other">Diğer</option>
            </select>
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: 'rgba(214, 185, 140, 0.35)' }}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </FieldGroup>
      </div>

      {/* ═══ Concern Area — Premium Cards ═══ */}
      <div className="flex flex-col gap-3">
        <label
          className="font-body text-[10px] tracking-[0.18em] uppercase font-medium"
          style={{ color: 'rgba(248, 246, 242, 0.45)' }}
        >
          İlgilendiğiniz Alan <span style={{ color: 'rgba(214, 185, 140, 0.5)' }}>*</span>
        </label>

        {/* Group cards — premium selectable */}
        <div className="grid grid-cols-3 gap-3">
          {CONCERN_GROUPS.map(g => {
            const isActive = selectedGroup === g.key
            const meta = CONCERN_META[g.key]
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => handleGroupSelect(g.key)}
                className="relative flex flex-col items-center gap-2.5 py-5 px-3 rounded-[16px] transition-all duration-400 cursor-pointer text-center group"
                style={{
                  background: isActive
                    ? 'rgba(214, 185, 140, 0.07)'
                    : 'rgba(248, 246, 242, 0.015)',
                  border: isActive
                    ? '1px solid rgba(214, 185, 140, 0.30)'
                    : '1px solid rgba(248, 246, 242, 0.06)',
                  boxShadow: isActive
                    ? '0 4px 24px rgba(214, 185, 140, 0.10), inset 0 1px 0 rgba(214, 185, 140, 0.06)'
                    : 'none',
                  transform: isActive ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div
                    className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full"
                    style={{
                      background: '#D6B98C',
                      boxShadow: '0 0 8px rgba(214, 185, 140, 0.4)',
                    }}
                  />
                )}

                {/* Icon */}
                <div
                  className="transition-colors duration-300"
                  style={{
                    color: isActive ? '#D6B98C' : 'rgba(248, 246, 242, 0.25)',
                  }}
                >
                  <GroupIcon groupKey={g.key} size={22} />
                </div>

                {/* Title */}
                <span
                  className="font-body text-[11px] sm:text-[12px] tracking-[0.02em] font-medium leading-tight transition-colors duration-300"
                  style={{
                    color: isActive ? '#F8F6F2' : 'rgba(248, 246, 242, 0.40)',
                  }}
                >
                  {g.label}
                </span>

                {/* Description */}
                {meta && (
                  <span
                    className="font-body text-[9px] leading-snug transition-colors duration-300"
                    style={{
                      color: isActive ? 'rgba(214, 185, 140, 0.55)' : 'rgba(248, 246, 242, 0.18)',
                    }}
                  >
                    {meta.description}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Sub-selections (animated expand) */}
        <div
          className="overflow-hidden transition-all duration-400 ease-out"
          style={{
            maxHeight: activeGroup ? '160px' : '0px',
            opacity: activeGroup ? 1 : 0,
          }}
        >
          {activeGroup && (
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center justify-between">
                <span
                  className="font-body text-[9px] tracking-[0.15em] uppercase"
                  style={{ color: 'rgba(248, 246, 242, 0.28)' }}
                >
                  Detay seçin (opsiyonel, en fazla {MAX_SUB_SELECTIONS})
                </span>
                {selectedSubs.length > 0 && (
                  <span className="font-mono text-[9px]" style={{ color: 'rgba(214, 185, 140, 0.45)' }}>
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
                      className="px-4 py-2 rounded-full font-body text-[11px] tracking-[0.02em] transition-all duration-250 cursor-pointer"
                      style={{
                        background: isSelected ? 'rgba(214, 185, 140, 0.10)' : 'transparent',
                        border: isSelected
                          ? '1px solid rgba(214, 185, 140, 0.30)'
                          : '1px solid rgba(248, 246, 242, 0.07)',
                        color: isSelected
                          ? '#F8F6F2'
                          : isDisabled
                            ? 'rgba(248, 246, 242, 0.15)'
                            : 'rgba(248, 246, 242, 0.42)',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        boxShadow: isSelected ? '0 2px 12px rgba(214, 185, 140, 0.08)' : 'none',
                      }}
                    >
                      {concernSubAreaLabels[sub]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {concernError && (
          <p className="font-body text-[11px] flex items-center gap-1.5" style={{ color: '#C47A7A' }}>
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {concernError}
          </p>
        )}
      </div>

      {/* ── Expectation note ── */}
      <FieldGroup label="Beklenti Notunuz">
        <textarea
          {...register('expectation_note')}
          rows={3}
          placeholder="Ne tür bir sonuç beklediğinizi kısaca belirtin..."
          className="field-premium resize-none"
          maxLength={300}
        />
      </FieldGroup>

      {/* ── CTA ── */}
      <PremiumButton type="submit" variant="gold" size="lg" className="mt-3 justify-center w-full">
        Değerlendirmeye Devam Et
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </PremiumButton>
    </form>
  )
}
