import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Antigravity Clinic — Dr. Müjde Ocak',
  description: 'Yapay zeka destekli medikal estetik analiz platformu. Yüz analizi, kişiselleştirilmiş tedavi önerileri ve uzman konsültasyonu.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
