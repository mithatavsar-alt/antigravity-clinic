import Link from 'next/link'
import type { Metadata } from 'next'
import { getActiveConsentVersion } from '@/data/consent-versions'
import { GlassCard } from '@/components/design-system/GlassCard'
import { ThinLine } from '@/components/design-system/ThinLine'
import { PrintButton } from '@/components/shared/PrintButton'
import { SectionLabel } from '@/components/design-system/SectionLabel'

export const metadata: Metadata = {
  title: 'Açık Rıza Metni — Dr. Müjde Ocak Aesthetic Clinic',
  description:
    '6698 sayılı KVKK kapsamında kişisel veri işlenmesine ilişkin Açık Rıza Metni.',
}

// Parse consent_text into an array of non-empty paragraphs (skip the title line)
function parseConsentParagraphs(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  // First line is the title — skip it
  return lines.slice(1)
}

// Items explicitly consented to (shown as a checklist)
const consentItems = [
  'Yüz fotoğrafı dahil kişisel verilerin işlenmesi',
  'Ön değerlendirme analizi amacıyla kullanımı',
  'Kliniğin yetkili doktorları tarafından incelenmesi',
  'Tıbbi değerlendirme kapsamında kullanımı',
]

export default function ConsentPage() {
  const version = getActiveConsentVersion()
  const paragraphs = parseConsentParagraphs(version.consent_text)
  const effectiveDate = new Date(version.effective_date).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[#FAF6F1] py-28 px-5 print:py-8 print:px-8 print:bg-white">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        {/* Top navigation bar */}
        <div className="flex items-center justify-between print:hidden">
          <Link
            href="/analysis"
            className="inline-flex items-center gap-2 font-body text-[11px] tracking-[0.12em] uppercase text-[rgba(26,26,46,0.45)] hover:text-[#1A1A2E] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Forma Dön
          </Link>
          <PrintButton />
        </div>

        {/* Page header */}
        <div className="border-b border-[rgba(196,163,90,0.2)] pb-8">
          <SectionLabel className="mb-3">Yasal Bilgilendirme</SectionLabel>
          <h1 className="font-display text-[clamp(28px,4vw,42px)] font-light text-[#1A1A2E] tracking-[-0.02em] mb-4">
            Açık Rıza Metni
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.12em] text-[rgba(26,26,46,0.4)] bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.2)] rounded-full px-3 py-1">
              v{version.version}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-[rgba(26,26,46,0.35)]">
              Yürürlük: {effectiveDate}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-[rgba(26,26,46,0.35)]">
              6698 Sayılı KVKK · Md. 5-6
            </span>
          </div>
        </div>

        {/* Consent scope — what the user is agreeing to */}
        <GlassCard strong padding="lg" rounded="xl">
          <div className="flex flex-col gap-5">
            <div>
              <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)] mb-3">
                Bu Metni Onayladığınızda İzin Vermiş Olursunuz
              </p>
              <ul className="flex flex-col gap-2.5">
                {consentItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 flex-shrink-0 w-4 h-4 rounded-full bg-[rgba(45,95,93,0.1)] border border-[rgba(45,95,93,0.25)] flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-[#2D5F5D]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                    <span className="font-body text-[13px] text-[rgba(26,26,46,0.75)] leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <ThinLine />

            <p className="font-body text-[11px] text-[rgba(26,26,46,0.45)] leading-relaxed">
              Rızanızı istediğiniz zaman geri alabilirsiniz. Geri alma talepleriniz için{' '}
              <a
                href="mailto:info@drmujdeocak.com"
                className="text-[#2D5F5D] hover:underline underline-offset-2"
              >
                info@drmujdeocak.com
              </a>{' '}
              adresine yazabilirsiniz.
            </p>
          </div>
        </GlassCard>

        {/* Full consent text */}
        <GlassCard padding="lg" rounded="xl">
          <div className="flex flex-col gap-5">
            <p className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.4)]">
              Tam Metin
            </p>
            <div className="flex flex-col gap-4">
              {paragraphs.map((para, i) => (
                <p
                  key={i}
                  className="font-body text-[13px] text-[rgba(26,26,46,0.75)] leading-relaxed"
                >
                  {para}
                </p>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-[rgba(196,163,90,0.12)]">
              <span className="font-mono text-[10px] tracking-[0.1em] text-[rgba(26,26,46,0.3)]">
                Belge referansı:
              </span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-[rgba(26,26,46,0.35)]">
                CONSENT-v{version.version}-{new Date(version.effective_date).getFullYear()}
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 print:hidden">
          <p className="font-body text-[11px] text-[rgba(26,26,46,0.4)] leading-relaxed">
            Kişisel verilerinizin nasıl işlendiğini öğrenmek için{' '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#2D5F5D] hover:underline underline-offset-2">
              KVKK Aydınlatma Metni
            </Link>
            {`'ni`} inceleyebilirsiniz.
          </p>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-body text-[11px] tracking-[0.12em] uppercase text-[#C4A35A] hover:text-[#1A1A2E] border border-[rgba(196,163,90,0.3)] hover:border-[rgba(196,163,90,0.5)] rounded-[10px] px-4 py-2.5 transition-all flex-shrink-0"
          >
            KVKK Aydınlatma Metni
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
        </div>

        {/* Print-only footer */}
        <div className="hidden print:block pt-8 border-t border-[rgba(196,163,90,0.15)] mt-4">
          <p className="text-[11px] text-[rgba(26,26,46,0.4)] text-center">
            Dr. Müjde Ocak Aesthetic Clinic · v{version.version} · {effectiveDate}
          </p>
        </div>

      </div>
    </div>
  )
}
