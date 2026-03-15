import { cn } from '@/lib/utils'

interface EditorialHeadingProps {
  children: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  light?: boolean
}

export function EditorialHeading({
  children,
  className,
  as: Tag = 'h2',
  light = false,
}: EditorialHeadingProps) {
  const sizeMap = {
    h1: 'text-[clamp(40px,6vw,72px)] tracking-[-0.03em] leading-[1.0]',
    h2: 'text-[clamp(32px,5vw,56px)] tracking-[-0.02em] leading-[1.08]',
    h3: 'text-[clamp(24px,3vw,36px)] tracking-[-0.01em] leading-[1.15]',
  }

  return (
    <Tag
      className={cn(
        'font-display font-light',
        sizeMap[Tag],
        light ? 'text-white' : 'text-[#1A1A2E]',
        className
      )}
    >
      {children}
    </Tag>
  )
}

// Gradient italic span for use inside EditorialHeading
export function GoldItalic({ children }: { children: React.ReactNode }) {
  return <em className="not-italic text-gradient-gold">{children}</em>
}
