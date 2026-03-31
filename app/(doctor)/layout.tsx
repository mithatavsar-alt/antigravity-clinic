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
    <div className="min-h-screen bg-[var(--color-bg)]">
      <DoctorTopNav />
      <div className="flex">
        <DoctorSidebar />
        <main className="flex-1 min-w-0 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
