import Link from 'next/link'

export function PublicFooter() {
  return (
    <footer className="bg-[#1A1A2E] text-white px-10 py-16">
      <div className="container-main">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-12 pb-12 border-b border-[rgba(255,255,255,0.06)]">
          <div className="sm:col-span-2">
            <div className="font-display text-2xl font-light tracking-[0.06em] mb-4">
              Dr. Müjde Ocak <span className="text-gradient-gold">Aesthetic Clinic</span>
            </div>
            <p className="font-body text-[13px] text-[rgba(255,255,255,0.45)] leading-relaxed max-w-xs mb-6">
              Dr. Müjde Ocak Aesthetic Clinic bünyesinde yapay zeka destekli medikal estetik platformu.
            </p>
            <div className="font-mono text-[10px] tracking-[0.15em] text-[rgba(139,127,168,0.6)] uppercase">
              Advanced Aesthetics & Beauty · AI v1.0
            </div>
          </div>

          <div>
            <h5 className="font-body text-[10px] tracking-[0.25em] uppercase text-[rgba(255,255,255,0.35)] mb-5">Platform</h5>
            <ul className="flex flex-col gap-3">
              {[['Ön Değerlendirme', '/analysis'], ['KVKK', '/privacy'], ['Açık Rıza', '/consent']].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="font-body text-[12px] text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.75)] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="font-body text-[10px] tracking-[0.25em] uppercase text-[rgba(255,255,255,0.35)] mb-5">Tedaviler</h5>
            <ul className="flex flex-col gap-3">
              {[['Botoks', '/treatments/botox'], ['Dolgu', '/treatments/filler'], ['Mezoterapi', '/treatments/mesotherapy']].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="font-body text-[12px] text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.75)] transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="font-body text-[10px] tracking-[0.25em] uppercase text-[rgba(255,255,255,0.35)] mb-5">İletişim</h5>
            <ul className="flex flex-col gap-3">
              <li className="font-body text-[12px] text-[rgba(255,255,255,0.4)]">info@drmujdeocak.com</li>
              <li className="font-body text-[12px] text-[rgba(255,255,255,0.4)]">İstanbul, Türkiye</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-mono text-[10px] tracking-[0.1em] text-[rgba(255,255,255,0.2)]">
            © 2026 Dr. Müjde Ocak Aesthetic Clinic. Tüm hakları saklıdır.
          </p>
          <div className="flex gap-4">
            {['KVKK', 'Gizlilik', 'Rıza'].map((item) => (
              <span key={item} className="font-body text-[10px] text-[rgba(255,255,255,0.2)] tracking-[0.1em] uppercase">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
