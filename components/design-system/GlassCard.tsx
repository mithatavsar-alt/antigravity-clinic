import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg' | 'xl'
  hover?: boolean
  strong?: boolean
  elevated?: boolean
  rounded?: 'md' | 'lg' | 'xl'
}

const paddingMap = { sm: 'p-4', md: 'p-6', lg: 'p-8', xl: 'p-10' }
const roundedMap = { md: 'rounded-[16px]', lg: 'rounded-[20px]', xl: 'rounded-[24px]' }

export function GlassCard({
  children,
  className,
  padding = 'md',
  hover = false,
  strong = false,
  elevated = false,
  rounded = 'lg',
}: GlassCardProps) {
  const glassClass = elevated
    ? 'glass-elevated'
    : strong
      ? 'glass-strong'
      : 'glass'

  return (
    <div
      className={cn(
        glassClass,
        roundedMap[rounded],
        paddingMap[padding],
        hover && 'glass-hover transition-all duration-300 cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
