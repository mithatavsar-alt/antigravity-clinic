import { cn } from '@/lib/utils'
import type { LeadStatus, ReadinessBand } from '@/types/lead'

interface StatusBadgeProps {
  status: LeadStatus | ReadinessBand | string
  type?: 'lead' | 'readiness' | 'risk'
  className?: string
}

type BadgeTone = {
  label: string
  color: string
  bg: string
  border: string
}

const leadStatusConfig: Record<LeadStatus, BadgeTone> = {
  new: { label: 'Yeni', color: '#2D5F5D', bg: 'rgba(45,95,93,0.08)', border: 'rgba(45,95,93,0.14)' },
  consented: { label: 'Rıza Verildi', color: '#B38C4B', bg: 'rgba(196,163,90,0.10)', border: 'rgba(196,163,90,0.18)' },
  analysis_ready: { label: 'Analiz Hazır', color: '#83759B', bg: 'rgba(131,117,155,0.10)', border: 'rgba(131,117,155,0.18)' },
  doctor_reviewed: { label: 'İncelendi', color: '#3D7A5F', bg: 'rgba(61,122,95,0.09)', border: 'rgba(61,122,95,0.16)' },
  contacted: { label: 'İletişime Geçildi', color: '#B87941', bg: 'rgba(184,121,65,0.10)', border: 'rgba(184,121,65,0.16)' },
  booked: { label: 'Randevu Alındı', color: '#2D5F5D', bg: 'rgba(45,95,93,0.11)', border: 'rgba(45,95,93,0.18)' },
  archived: { label: 'Arşivlendi', color: '#6F685F', bg: 'rgba(111,104,95,0.08)', border: 'rgba(111,104,95,0.14)' },
}

const readinessConfig: Record<ReadinessBand, BadgeTone> = {
  very_high: { label: 'Çok Yüksek', color: '#3D7A5F', bg: 'rgba(61,122,95,0.09)', border: 'rgba(61,122,95,0.17)' },
  high: { label: 'Yüksek', color: '#2D5F5D', bg: 'rgba(45,95,93,0.09)', border: 'rgba(45,95,93,0.16)' },
  medium: { label: 'Orta', color: '#B87941', bg: 'rgba(184,121,65,0.10)', border: 'rgba(184,121,65,0.15)' },
  low: { label: 'Düşük', color: '#6F685F', bg: 'rgba(111,104,95,0.08)', border: 'rgba(111,104,95,0.14)' },
}

const riskConfig: Record<string, BadgeTone> = {
  low: { label: 'Düşük Risk', color: '#3D7A5F', bg: 'rgba(61,122,95,0.09)', border: 'rgba(61,122,95,0.17)' },
  medium: { label: 'Orta Risk', color: '#B87941', bg: 'rgba(184,121,65,0.10)', border: 'rgba(184,121,65,0.15)' },
  high: { label: 'Yüksek Risk', color: '#A05252', bg: 'rgba(160,82,82,0.10)', border: 'rgba(160,82,82,0.17)' },
}

export function StatusBadge({ status, type = 'lead', className }: StatusBadgeProps) {
  let config: BadgeTone | undefined

  if (type === 'lead') config = leadStatusConfig[status as LeadStatus]
  else if (type === 'readiness') config = readinessConfig[status as ReadinessBand]
  else if (type === 'risk') config = riskConfig[status]

  if (!config) {
    config = { label: status, color: '#6F685F', bg: 'rgba(111,104,95,0.08)', border: 'rgba(111,104,95,0.14)' }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border',
        'font-body text-[10px] font-medium tracking-[0.12em] uppercase',
        'backdrop-blur-sm transition-colors duration-200',
        className
      )}
      style={{
        color: config.color,
        backgroundColor: config.bg,
        borderColor: config.border,
        boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  )
}
