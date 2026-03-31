import { cn } from '@/lib/utils'

interface ThinLineProps {
  className?: string
  width?: number
}

export function ThinLine({ className, width = 60 }: ThinLineProps) {
  return (
    <div
      className={cn('thin-line h-px', className)}
      style={{ width }}
    />
  )
}
