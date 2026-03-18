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
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="font-body text-[10px] tracking-[0.2em] uppercase text-[rgba(26,26,46,0.5)]">
        {label}{required && ' *'}
      </label>
      {children}
      {error && (
        <p className="font-body text-[11px] text-[#A05252]">{error}</p>
      )}
    </div>
  )
}
