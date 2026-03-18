import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon && <div className="mb-4 text-[rgba(26,26,46,0.25)]">{icon}</div>}
      <h3 className="font-display text-xl font-light text-[#1A1A2E] mb-2">{title}</h3>
      {description && (
        <p className="font-body text-[13px] text-[rgba(26,26,46,0.5)] italic max-w-xs">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
