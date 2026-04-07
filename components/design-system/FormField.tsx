import { cn } from '@/lib/utils'

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  className?: string
}

export function FormField({ label, required, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label className="font-body text-[11px] tracking-[0.18em] uppercase text-[var(--color-text-muted)] font-medium">
        {label}{required && ' *'}
      </label>
      {children}
      {error && (
        <p className="font-body text-[12px] text-medical-danger">{error}</p>
      )}
    </div>
  )
}
