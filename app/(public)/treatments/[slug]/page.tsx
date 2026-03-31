import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTreatment, getRelatedTreatments, getAllSlugs } from '@/data/treatments'
import { TreatmentHero } from '@/components/treatments/TreatmentHero'
import { TreatmentSection } from '@/components/treatments/TreatmentSection'
import { TreatmentLayout } from '@/components/treatments/TreatmentLayout'

// ─── Static params for pre-rendering ────────────────────────

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

// ─── Dynamic SEO metadata ───────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const treatment = getTreatment(slug)
  if (!treatment) return {}
  return {
    title: treatment.seo.title,
    description: treatment.seo.description,
  }
}

// ─── Item dot color ─────────────────────────────────────────

const DOT_COLORS: Record<string, string> = {
  gold: 'rgba(214,185,140,0.35)',
  green: 'rgba(74,227,167,0.40)',
  red: 'rgba(196,122,122,0.40)',
}

// ─── Page ───────────────────────────────────────────────────

export default async function TreatmentPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const treatment = getTreatment(slug)
  if (!treatment) notFound()

  const related = getRelatedTreatments(slug)

  return (
    <TreatmentLayout relatedLinks={related}>
      <TreatmentHero
        label={treatment.heroLabel}
        title={treatment.title}
        subtitle={treatment.heroSubtitle}
      />

      {treatment.sections.map((section, i) => (
        <TreatmentSection key={i} heading={section.heading} index={i}>
          {section.paragraphs.map((p, j) => (
            <p key={j}>{p}</p>
          ))}

          {section.items && section.items.length > 0 && (
            <ul className="list-none flex flex-col gap-2 pl-0">
              {section.items.map((item) => (
                <li key={item.title} className="flex gap-3 items-start">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0"
                    style={{ background: DOT_COLORS[section.itemColor ?? 'gold'] }}
                  />
                  <span>
                    {item.desc ? (
                      <>
                        <strong className="text-[rgba(248,246,242,0.65)] font-medium">{item.title}</strong>
                        {' — '}{item.desc}
                      </>
                    ) : (
                      item.title
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {section.afterParagraphs?.map((p, j) => (
            <p key={`after-${j}`}>{p}</p>
          ))}
        </TreatmentSection>
      ))}
    </TreatmentLayout>
  )
}
