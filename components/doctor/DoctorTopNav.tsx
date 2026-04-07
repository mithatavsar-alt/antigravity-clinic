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
    <header className="bg-[rgba(18,15,12,0.88)] backdrop-blur-md border-b border-[rgba(214,185,140,0.10)] px-6 h-14 flex items-center justify-between sticky top-0 z-40">
      <Link href="/doctor/dashboard" className="font-display text-[17px] font-light tracking-[0.04em] text-[#F8F6F2]">
        Dr. Müjde Ocak <span className="text-[#D6B98C]">Clinic</span>
        <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.52)] ml-3">
          Doktor Paneli
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <Link
          href="/doctor/leads"
          className="lg:hidden font-body text-[10px] tracking-[0.12em] uppercase text-[#D6B98C] hover:text-[#F8F6F2] transition-colors"
        >
          Leads
        </Link>
        <span className="hidden sm:inline font-body text-[11px] text-[rgba(248,246,242,0.58)]">Dr. Müjde Ocak</span>
        <button
          onClick={handleLogout}
          className="font-body text-[10px] tracking-[0.12em] uppercase text-[rgba(248,246,242,0.48)] hover:text-[#C47A7A] transition-colors"
        >
          Çıkış
        </button>
      </div>
    </header>
  )
}
