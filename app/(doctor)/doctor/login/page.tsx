'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ThinLine } from '@/components/design-system/ThinLine'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { FormField } from '@/components/design-system/FormField'

export default function LoginPage() {
  const { login } = useClinicStore()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (document.cookie.includes('ag_auth_token=')) {
      router.replace('/doctor/leads')
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 400))
    const success = login({ email, password })

    if (success) {
      router.push('/doctor/leads')
      return
    }

    setError('E-posta veya şifre hatalı.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="font-display text-2xl font-light tracking-[0.06em] text-[#1A1A2E] mb-1">
            Dr. Müjde Ocak <span className="text-gradient-gold">Aesthetic Clinic</span>
          </div>
          <SectionLabel>Doktor Girişi</SectionLabel>
        </div>

        <GlassCard strong padding="lg" rounded="xl">
          <div className="flex justify-center mb-6">
            <ThinLine width={40} />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="E-posta">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                autoComplete="email"
                className="field-input"
                required
              />
            </FormField>

            <FormField label="Şifre">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="field-input"
                required
              />
            </FormField>

            {error && (
              <div className="bg-[rgba(160,82,82,0.06)] border border-[rgba(160,82,82,0.2)] rounded-[10px] px-4 py-3">
                <p className="font-body text-[12px] text-[#A05252]">{error}</p>
              </div>
            )}

            <PremiumButton type="submit" size="lg" disabled={loading} className="mt-2 justify-center">
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </PremiumButton>
          </form>

          <p className="font-mono text-[9px] text-[rgba(26,26,46,0.3)] text-center mt-5 tracking-[0.1em]">
            Doktor girişi
          </p>
        </GlassCard>
      </div>
    </div>
  )
}
