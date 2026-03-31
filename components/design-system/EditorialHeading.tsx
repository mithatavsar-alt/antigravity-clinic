import { cn } from '@/lib/utils'

interface EditorialHeadingProps {
  children: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  /** Use true on dark backgrounds — switches to inverse text color */
  light?: boolean
}

/**
 * Editorial Heading — Cormorant Garamond, light weight.
 * Typography scale from design-tokens: hero / h1 / h2.
 * Responds to theme via CSS variable for text color.
 */
export function EditorialHeading({
  children,
  className,
  as: Tag = 'h2',
  light = false,
}: EditorialHeadingProps) {
  const sizeMap = {
    h1: 'text-[clamp(2.5rem,5.5vw,4.5rem)] tracking-[-0.03em] leading-[1.0]',
    h2: 'text-[clamp(2rem,4.5vw,3.5rem)] tracking-[-0.02em] leading-[1.08]',
    h3: 'text-[clamp(1.5rem,3vw,2.25rem)] tracking-[-0.01em] leading-[1.15]',
  }

  return (
    <Tag
      className={cn(
        'font-display font-light',
        sizeMap[Tag],
        light ? 'text-[var(--color-text,#F8F6F2)]' : 'text-[var(--color-text)]',
        className
      )}
    >
      {children}
    </Tag>
  )
}

/** Gradient italic span for gold emphasis inside headings */
export function GoldItalic({ children }: { children: React.ReactNode }) {
  return <em className="not-italic text-gradient-gold">{children}</em>
}
