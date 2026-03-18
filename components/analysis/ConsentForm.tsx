'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { GlassCard } from '@/components/design-system/GlassCard'

interface ConsentFormProps {
  onConfirm: () => void
  onBack: () => void
  loading?: boolean
}

export function ConsentForm({ onConfirm, onBack, loading = false }: ConsentFormProps) {
  const [kvkk, setKvkk] = useState(false)
  const [riza, setRiza] = useState(false)
  const [ai, setAi] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allChecked = kvkk && riza && ai

  const handleConfirm = () => {
    if (!allChecked) {
      setError('Devam etmek için tüm onayları işaretlemelisiniz.')
      return
    }
    setError(null)
    onConfirm()
  }

  const checkboxClass = 'mt-0.5 accent-[#D6B98C] flex-shrink-0 w-4 h-4'
  const labelClass = 'flex items-start gap-3 cursor-pointer'
  const textClass = 'font-body text-[12px] text-[rgba(248,246,242,0.55)] leading-relaxed'
  const linkClass = 'text-[#D6B98C] hover:underline'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 border-b border-[rgba(214,185,140,0.1)] pb-5">
        <label className={labelClass}>
          <input type="checkbox" checked={kvkk} onChange={(e) => { setKvkk(e.target.checked); setError(null) }} className={checkboxClass} />
          <span className={textClass}>
            <Link href="/privacy" target="_blank" className={linkClass}>KVKK Aydınlatma Metni</Link>
            &rsquo;ni okudum ve anladım. *
          </span>
        </label>

        <label className={labelClass}>
          <input type="checkbox" checked={riza} onChange={(e) => { setRiza(e.target.checked); setError(null) }} className={checkboxClass} />
          <span className={textClass}>
            <Link href="/consent" target="_blank" className={linkClass}>Açık Rıza Metni</Link>
            &rsquo;ni okudum, kişisel verilerimin işlenmesine onay veriyorum. *
          </span>
        </label>

        <label className={labelClass}>
          <input type="checkbox" checked={ai} onChange={(e) => { setAi(e.target.checked); setError(null) }} className={checkboxClass} />
          <span className={textClass}>
            Fotoğrafımın yapay zeka destekli ön analiz için kullanılmasına onay veriyorum. *
          </span>
        </label>
      </div>

      <GlassCard padding="sm" rounded="md">
        <p className="font-body text-[10px] text-[rgba(248,246,242,0.45)] leading-relaxed">
          Verileriniz KVKK kapsamında korunmaktadır. Hiçbir ücret talep edilmez. Dilediğiniz zaman geri çekebilirsiniz.
        </p>
      </GlassCard>

      {error && (
        <p className="font-body text-[12px] text-[#C47A7A] bg-[rgba(160,82,82,0.1)] rounded-[10px] px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <PremiumButton type="button" variant="ghost" size="md" onClick={onBack} className="flex-1 justify-center">
          Geri
        </PremiumButton>
        <PremiumButton
          type="button"
          variant="gold"
          size="md"
          onClick={handleConfirm}
          disabled={loading}
          className="flex-1 justify-center"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Analiz başlatılıyor...
            </span>
          ) : 'Analizi Başlat'}
        </PremiumButton>
      </div>
    </div>
  )
}
