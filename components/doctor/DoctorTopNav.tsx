'use client'

import Link from 'next/link'
import { useClinicStore } from '@/lib/store'
import { useRouter } from 'next/navigation'

export function DoctorTopNav() {
  const { logout } = useClinicStore()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    document.cookie = 'ag_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    router.push('/doctor/login')
  }

  return (
    <header className="bg-[var(--glass-bg-strong)] backdrop-blur-sm border-b border-[var(--color-border-gold)] px-6 h-16 flex items-center justify-between sticky top-0 z-40">
      <Link href="/doctor/leads" className="font-display text-lg font-light tracking-[0.05em] text-[var(--color-text)]">
        Antigravity <span className="text-gradient-gold">AI</span>
        <span className="font-body text-[11px] tracking-[0.15em] uppercase text-[var(--color-text-muted)] ml-3">
          · Doktor Paneli
        </span>
      </Link>

      <div className="flex items-center gap-4">
        {/* Lead Listesi — only visible on mobile where sidebar is hidden */}
        <Link
          href="/doctor/leads"
          className="lg:hidden font-body text-[11px] tracking-[0.12em] uppercase text-medical-trust hover:text-[var(--color-text)] transition-colors"
        >
          Leads
        </Link>
        <span className="hidden sm:inline font-body text-[12px] text-[var(--color-text-muted)]">Dr. Müjde Ocak</span>
        <button
          onClick={handleLogout}
          className="font-body text-[11px] tracking-[0.12em] uppercase text-medical-danger/70 hover:text-[var(--color-text)] transition-colors"
        >
          Çıkış
        </button>
      </div>
    </header>
  )
}
