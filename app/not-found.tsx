import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)' }}
    >
      <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-[rgba(214,185,140,0.06)] border border-[rgba(214,185,140,0.12)] flex items-center justify-center">
          <span className="font-mono text-[24px] font-light text-[#D6B98C]">404</span>
        </div>

        <div>
          <h2 className="font-display text-[28px] font-light text-[#F8F6F2] mb-2">
            Sayfa bulunamadı
          </h2>
          <p className="font-body text-[14px] text-[rgba(248,246,242,0.5)] leading-relaxed">
            Aradığınız sayfa mevcut değil veya taşınmış olabilir.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="px-6 py-3 rounded-[14px] font-body text-[12px] font-medium tracking-[0.1em] uppercase bg-gradient-to-br from-[#2D5F5D] to-[#3D7A5F] text-white hover:shadow-[0_4px_20px_rgba(45,95,93,0.4)] transition-all active:scale-[0.98]"
          >
            Ana Sayfaya Dön
          </Link>
          <Link
            href="/analysis"
            className="px-6 py-3 rounded-[14px] font-body text-[12px] font-medium tracking-[0.1em] uppercase border border-[rgba(214,185,140,0.2)] text-[#D6B98C] hover:border-[rgba(214,185,140,0.4)] transition-all"
          >
            Ön Değerlendirme
          </Link>
        </div>
      </div>
    </div>
  )
}
