'use client'

import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)' }}
    >
      <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-[rgba(176,96,96,0.1)] border border-[rgba(176,96,96,0.2)] flex items-center justify-center">
          <svg className="w-7 h-7 text-[#B06060]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>

        <div>
          <h2 className="font-display text-[28px] font-light text-[#F8F6F2] mb-2">
            Bir hata oluştu
          </h2>
          <p className="font-body text-[14px] text-[rgba(248,246,242,0.5)] leading-relaxed">
            Sayfa yüklenirken beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.
          </p>
          {process.env.NODE_ENV === 'development' && error.message && (
            <p className="mt-3 font-mono text-[11px] text-[rgba(176,96,96,0.7)] bg-[rgba(176,96,96,0.05)] rounded-lg p-3 text-left break-all">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-[14px] font-body text-[12px] font-medium tracking-[0.1em] uppercase bg-gradient-to-br from-[#2D5F5D] to-[#3D7A5F] text-white hover:shadow-[0_4px_20px_rgba(45,95,93,0.4)] transition-all active:scale-[0.98]"
          >
            Tekrar Dene
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-[14px] font-body text-[12px] font-medium tracking-[0.1em] uppercase border border-[rgba(214,185,140,0.2)] text-[#D6B98C] hover:border-[rgba(214,185,140,0.4)] transition-all"
          >
            Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  )
}
