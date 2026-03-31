import Link from 'next/link'
import type { Metadata } from 'next'
import { getActiveConsentVersion } from '@/data/consent-versions'
import { GlassCard } from '@/components/design-system/GlassCard'
import { PrintButton } from '@/components/shared/PrintButton'
import { SectionLabel } from '@/components/design-system/SectionLabel'

export const metadata: Metadata = {
  title: 'KVKK Aydınlatma Metni — Dr. Müjde Ocak Aesthetic Clinic',
  description:
    '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanan KVKK Aydınlatma Metni.',
}

// Turkish uppercase check — includes Ç Ğ İ Ö Ş Ü
function isTurkishUppercase(s: string) {
  return s === s.toLocaleUpperCase('tr-TR') && s.length > 2 && /\S/.test(s)
}

interface KVKKSection {
  key: string
  label: string
  value: string
}

const sectionLabels: Record<string, string> = {
  'VERİ SORUMLUSU': 'Veri Sorumlusu',
  'İŞLENEN KİŞİSEL VERİLER': 'İşlenen Kişisel Veriler',
  'VERİLERİN İŞLENME AMACI': 'Verilerin İşlenme Amacı',
  'VERİLERİN AKTARIMI': 'Verilerin Aktarımı',
  'SAKLAMA SÜRESİ': 'Saklama Süresi',
  HAKLARINIZ: 'Haklarınız',
  'İLETİŞİM': 'İletişim',
}

function parseKVKK(text: string): { intro: string; sections: KVKKSection[] } {
  const lines = text.split('\n')
  let intro = ''
  const sections: KVKKSection[] = []
  let pastTitle = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // First non-empty line is the document title — skip it
    if (!pastTitle) {
      pastTitle = true
      continue
    }

    // Detect "KEY: value" pattern — key must be Turkish uppercase
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 2) {
      const potentialKey = trimmed.slice(0, colonIdx).trim()
      if (isTurkishUppercase(potentialKey)) {
        sections.push({
          key: potentialKey,
          label: sectionLabels[potentialKey] ?? potentialKey,
          value: trimmed.slice(colonIdx + 1).trim(),
        })
        continue
      }
    }

    // First non-section text is the intro paragraph
    if (!intro) intro = trimmed
  }

  return { intro, sections }
}

export default function PrivacyPage() {
  const version = getActiveConsentVersion()
  const { intro, sections } = parseKVKK(version.kvkk_text)
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
            KVKK Aydınlatma Metni
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.12em] text-[rgba(26,26,46,0.4)] bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.2)] rounded-full px-3 py-1">
              v{version.version}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-[rgba(26,26,46,0.35)]">
              Yürürlük: {effectiveDate}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-[rgba(26,26,46,0.35)]">
              6698 Sayılı KVKK
            </span>
          </div>
        </div>

        {/* Intro paragraph */}
        {intro && (
          <p className="font-body text-[14px] text-[rgba(26,26,46,0.65)] leading-relaxed italic border-l-2 border-[rgba(196,163,90,0.4)] pl-5">
            {intro}
          </p>
        )}

        {/* Sections */}
        <GlassCard padding="lg" rounded="xl">
          <div className="flex flex-col divide-y divide-[rgba(196,163,90,0.1)]">
            {sections.map((section, i) => (
              <div
                key={section.key}
                className="flex flex-col sm:flex-row sm:gap-8 py-5 first:pt-0 last:pb-0"
              >
                {/* Number + section label */}
                <div className="flex items-start gap-3 sm:w-52 flex-shrink-0 mb-2 sm:mb-0">
                  <span className="font-mono text-[10px] text-[rgba(196,163,90,0.45)] mt-0.5 select-none tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="font-body text-[11px] tracking-[0.12em] uppercase text-[#C4A35A] font-medium leading-snug">
                    {section.label}
                  </h2>
                </div>

                {/* Value */}
                <p className="font-body text-[13px] text-[rgba(26,26,46,0.75)] leading-relaxed flex-1">
                  {section.key === 'İLETİŞİM' ? (
                    <a
                      href={`mailto:${section.value}`}
                      className="text-[#2D5F5D] hover:underline underline-offset-2"
                    >
                      {section.value}
                    </a>
                  ) : (
                    section.value
                  )}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 print:hidden">
          <p className="font-body text-[11px] text-[rgba(26,26,46,0.4)] leading-relaxed">
            Sorularınız için{' '}
            <a
              href="mailto:info@drmujdeocak.com"
              className="text-[#2D5F5D] hover:underline underline-offset-2"
            >
              info@drmujdeocak.com
            </a>
          </p>
          <Link
            href="/consent"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-body text-[11px] tracking-[0.12em] uppercase text-[#C4A35A] hover:text-[#1A1A2E] border border-[rgba(196,163,90,0.3)] hover:border-[rgba(196,163,90,0.5)] rounded-[10px] px-4 py-2.5 transition-all flex-shrink-0"
          >
            Açık Rıza Metni
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
