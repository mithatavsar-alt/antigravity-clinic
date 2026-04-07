'use client'

import Link from 'next/link'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function DoctorTopNav() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured()) {
        const sb = createClient()
        await sb.auth.signOut()
      }
    } catch (e) {
      console.error('[Auth] Logout error:', e)
    } finally {
      router.push('/doctor/login')
    }
  }

  return (
    <header
      className="doctor-card-strong border-x-0 border-t-0 rounded-none px-6 h-16 flex items-center justify-between sticky top-0 z-40"
    >
      <Link href="/doctor/dashboard" className="font-display text-[17px] font-light tracking-[0.04em] text-[#1A1A2E]">
        Dr. Müjde Ocak <span className="text-[#C4A35A]">Clinic</span>
        <span className="font-body text-[12px] tracking-[0.15em] uppercase text-[rgba(26,26,46,0.50)] ml-3">
          Doktor Paneli
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <Link
          href="/doctor/leads"
          className="lg:hidden font-body text-[12px] tracking-[0.12em] uppercase text-[#C4A35A] hover:text-[#1A1A2E] transition-colors"
        >
          Leads
        </Link>
        <span className="hidden sm:inline font-body text-[11px] text-[rgba(26,26,46,0.55)]">Dr. Müjde Ocak</span>
        <button
          onClick={handleLogout}
          className="font-body text-[12px] tracking-[0.12em] uppercase text-[rgba(26,26,46,0.45)] hover:text-[#A05252] transition-colors"
        >
          Çıkış
        </button>
      </div>
    </header>
  )
}
