import { cn } from '@/lib/utils'

interface ThinLineProps {
  className?: string
  width?: number
  light?: boolean
}

export function ThinLine({ className, width = 60, light = false }: ThinLineProps) {
  return (
    <div
      className={cn('h-px', light ? 'bg-[rgba(196,163,90,0.4)]' : 'bg-[#C4A35A]', className)}
      style={{ width }}
    />
  )
}
