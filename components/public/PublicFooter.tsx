import Link from 'next/link'
import { contact } from '@/lib/contact'

export function PublicFooter() {
  return (
    <footer className="relative bg-[#1A1A2E] text-white px-6 sm:px-10 pt-16 pb-10 overflow-hidden">
      {/* Top gold accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(196,163,90,0.25) 30%, rgba(196,163,90,0.25) 70%, transparent 95%)' }}
      />

      {/* Ambient grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }}
      />

      <div className="container-main relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-10 sm:gap-12 pb-12 border-b border-[rgba(255,255,255,0.06)]">
          {/* Brand block */}
          <div className="sm:col-span-2">
            <div className="font-display text-2xl font-light tracking-[0.06em] mb-4">
              Dr. Müjde Ocak{' '}
              <span className="text-gradient-gold">Aesthetic Clinic</span>
            </div>
            <p className="font-body text-[13px] text-[rgba(255,255,255,0.40)] leading-[1.7] max-w-xs mb-6">
              Yapay zeka destekli medikal estetik platformu. Bilimsel analiz, kişiselleştirilmiş öneriler.
            </p>
            {/* Social / WhatsApp link */}
            <a
              href={contact.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-body text-[11px] tracking-[0.1em] uppercase text-[rgba(214,185,140,0.50)] hover:text-[rgba(214,185,140,0.80)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.847L.057 23.882a.5.5 0 00.61.61l6.035-1.466A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.661-.518-5.175-1.42l-.37-.216-3.837.932.949-3.837-.234-.383A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              WhatsApp
            </a>
          </div>

          {/* Platform links */}
          <div>
            <h5 className="font-body text-[12px] tracking-[0.25em] uppercase text-[rgba(255,255,255,0.30)] mb-5">Platform</h5>
            <ul className="flex flex-col gap-3">
              {[['Ön Değerlendirme', '/analysis'], ['KVKK', '/privacy'], ['Açık Rıza', '/consent']].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="font-body text-[12px] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.70)] transition-colors duration-200">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Treatments */}
          <div>
            <h5 className="font-body text-[12px] tracking-[0.25em] uppercase text-[rgba(255,255,255,0.30)] mb-5">Tedaviler</h5>
            <ul className="flex flex-col gap-3">
              {[['Botoks', '/treatments/botox'], ['Dolgu', '/treatments/filler'], ['Mezoterapi', '/treatments/mesotherapy']].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="font-body text-[12px] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.70)] transition-colors duration-200">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h5 className="font-body text-[12px] tracking-[0.25em] uppercase text-[rgba(255,255,255,0.30)] mb-5">İletişim</h5>
            <ul className="flex flex-col gap-3">
              <li className="font-body text-[12px] text-[rgba(255,255,255,0.35)]">info@drmujdeocak.com</li>
              <li className="font-body text-[12px] text-[rgba(255,255,255,0.35)]">İstanbul, Türkiye</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-mono text-[12px] tracking-[0.1em] text-[rgba(255,255,255,0.18)]">
            © 2026 Dr. Müjde Ocak Aesthetic Clinic. Tüm hakları saklıdır.
          </p>
          <div className="flex gap-6">
            {[['KVKK', '/privacy'], ['Gizlilik', '/privacy'], ['Rıza', '/consent']].map(([item, href]) => (
              <Link
                key={item}
                href={href}
                className="font-body text-[12px] text-[rgba(255,255,255,0.18)] tracking-[0.1em] uppercase hover:text-[rgba(255,255,255,0.40)] transition-colors duration-200"
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
