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
    <header className="bg-[rgba(255,254,249,0.95)] backdrop-blur-sm border-b border-[rgba(196,163,90,0.1)] px-6 h-16 flex items-center justify-between sticky top-0 z-40">
      <Link href="/doctor/leads" className="font-display text-lg font-light tracking-[0.05em] text-[#1A1A2E]">
        Antigravity <span className="text-gradient-gold">AI</span>
        <span className="font-body text-[11px] tracking-[0.15em] uppercase text-[#78716C] ml-3">
          · Doktor Paneli
        </span>
      </Link>

      <div className="flex items-center gap-4">
        {/* Lead Listesi — only visible on mobile where sidebar is hidden */}
        <Link
          href="/doctor/leads"
          className="lg:hidden font-body text-[11px] tracking-[0.12em] uppercase text-[#2D5F5D] hover:text-[#1A1A2E] transition-colors"
        >
          Leads
        </Link>
        <span className="hidden sm:inline font-body text-[12px] text-[#78716C]">Dr. Müjde Ocak</span>
        <button
          onClick={handleLogout}
          className="font-body text-[11px] tracking-[0.12em] uppercase text-[rgba(160,82,82,0.7)] hover:text-[#1A1A2E] transition-colors"
        >
          Çıkış
        </button>
      </div>
    </header>
  )
}
