import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTreatment, getRelatedTreatments, getAllSlugs } from '@/lib/data/treatments'
import { TreatmentHero } from '@/components/public/treatments/TreatmentHero'
import { TreatmentSection } from '@/components/public/treatments/TreatmentSection'
import { TreatmentLayout } from '@/components/public/treatments/TreatmentLayout'

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
  gold: 'rgba(196,163,90,0.40)',
  green: 'rgba(45,95,93,0.45)',
  red: 'rgba(160,82,82,0.45)',
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
                        <strong className="text-[var(--color-text)] font-medium">{item.title}</strong>
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
