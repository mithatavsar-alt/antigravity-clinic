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
      style={{ background: 'linear-gradient(160deg, #0A0908 0%, #14110E 20%, #0F1214 50%, #0A0B0D 100%)' }}
    >
      <DoctorTopNav />
      <div className="flex">
        <DoctorSidebar />
        <main className="flex-1 min-w-0 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
