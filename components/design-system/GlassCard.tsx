import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  hover?: boolean
  strong?: boolean
  rounded?: 'md' | 'lg' | 'xl'
}

const paddingMap = { sm: 'p-4', md: 'p-6', lg: 'p-8' }
const roundedMap = { md: 'rounded-[14px]', lg: 'rounded-[16px]', xl: 'rounded-[20px]' }

export function GlassCard({
  children,
  className,
  padding = 'md',
  hover = false,
  strong = false,
  rounded = 'lg',
}: GlassCardProps) {
  return (
    <div
      className={cn(
        strong ? 'glass-strong' : 'glass',
        roundedMap[rounded],
        paddingMap[padding],
        hover && 'glass-hover transition-shadow duration-300 hover:shadow-[0_16px_48px_rgba(26,26,46,0.10)] cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
