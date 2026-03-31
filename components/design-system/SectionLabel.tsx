import { cn } from '@/lib/utils'

interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

/**
 * Section overline label — consistent gold micro text.
 * Uses the .section-label CSS class (backed by --color-gold variable).
 * Theme-responsive: gold on both light and dark surfaces.
 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <p className={cn('section-label', className)}>
      {children}
    </p>
  )
}
