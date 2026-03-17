import { cn } from '@/lib/utils'

interface SectionLabelProps {
  children: React.ReactNode
  className?: string
  light?: boolean
}

export function SectionLabel({ children, className, light = false }: SectionLabelProps) {
  return (
    <p
      className={cn(
        'section-label font-body text-[11px] font-medium tracking-[0.2em] uppercase',
        light ? 'text-[#A89BC4]' : 'text-[#8B7FA8]',
        className
      )}
    >
      {children}
    </p>
  )
}
