'use client'

import { usePathname } from 'next/navigation'
import { DoctorTopNav } from '@/components/doctor/DoctorTopNav'
import { DoctorSidebar } from '@/components/doctor/DoctorSidebar'

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/doctor/login' || pathname.endsWith('/report')) {
    return <main>{children}</main>
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(160deg, #100D0B 0%, #1A1510 30%, #151318 55%, #100E0C 100%)' }}
    >
      <DoctorTopNav />
      <div className="flex">
        <DoctorSidebar />
        <main className="flex-1 min-w-0 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
