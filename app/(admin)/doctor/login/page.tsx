'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import Link from 'next/link'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { ThinLine } from '@/components/design-system/ThinLine'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { FormField } from '@/components/design-system/FormField'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const configured = isSupabaseConfigured()

  // If already authenticated, redirect
  useEffect(() => {
    if (!configured) return
    const sb = createClient()
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/doctor/dashboard')
    })
  }, [router, configured])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!configured) {
        setError('Sistem yapılandırması eksik. Lütfen yönetici ile iletişime geçin.')
        setLoading(false)
        return
      }

      const sb = createClient()

      // Authenticate with Supabase Auth
      const { data, error: authError } = await sb.auth.signInWithPassword({ email, password })
      if (authError || !data.user) {
        setError('E-posta veya şifre hatalı.')
        setLoading(false)
        return
      }

      // Verify admin role via server API (reads identity from session cookies, not body)
      const verifyRes = await fetch('/api/doctor/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.authorized) {
        await sb.auth.signOut()
        const reason = verifyData.reason
        if (reason === 'inactive') {
          setError('Bu hesap devre dışı bırakılmış. Yönetici ile iletişime geçin.')
        } else if (reason === 'wrong_role') {
          setError('Bu hesabın doktor paneline erişim rolü yok.')
        } else {
          setError('Bu hesap doktor paneline erişim yetkisine sahip değil.')
        }
        setLoading(false)
        return
      }

      router.push('/doctor/dashboard')
    } catch {
      setError('Giriş sırasında bir hata oluştu.')
      setLoading(false)
    }
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

        <div className="text-center mt-6">
          <Link
            href="/"
            className="font-body text-[11px] text-[rgba(26,26,46,0.35)] hover:text-[#C4A35A] transition-colors tracking-[0.04em]"
          >
            ← Hasta sayfasına dön
          </Link>
        </div>
      </div>
    </div>
  )
}
