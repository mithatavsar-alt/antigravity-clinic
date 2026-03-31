import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dr. Müjde Ocak Aesthetic Clinic — Advanced Aesthetics & Beauty',
  description: 'Yapay zeka destekli medikal estetik klinik platformu. Ön değerlendirme ve kişiselleştirilmiş tedavi planlaması.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
