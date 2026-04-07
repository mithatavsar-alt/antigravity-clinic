'use client'

import { usePathname } from 'next/navigation'
import { DoctorTopNav } from '@/components/doctor/DoctorTopNav'
import { DoctorSidebar } from '@/components/doctor/DoctorSidebar'

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/doctor/login' || pathname.endsWith('/report')) {
    return <main className="theme-light">{children}</main>
  }

  return (
    <div className="doctor-shell theme-light min-h-screen">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.018]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }}
      />
      <div className="relative z-10">
        <DoctorTopNav />
        <div className="flex">
          <DoctorSidebar />
          <main className="flex-1 min-w-0 p-4 lg:px-8 lg:py-7">{children}</main>
        </div>
      </div>
    </div>
  )
}
