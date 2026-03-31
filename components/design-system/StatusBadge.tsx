import { cn } from '@/lib/utils'
import type { LeadStatus, ReadinessBand } from '@/types/lead'

interface StatusBadgeProps {
  status: LeadStatus | ReadinessBand | string
  type?: 'lead' | 'readiness' | 'risk'
  className?: string
}

const leadStatusConfig: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Yeni', color: 'var(--color-emerald)', bg: 'rgba(45,95,93,0.1)' },
  consented: { label: 'Rıza Verildi', color: 'var(--color-gold)', bg: 'var(--color-gold-glow)' },
  analysis_ready: { label: 'Analiz Hazır', color: '#8B7FA8', bg: 'rgba(139,127,168,0.1)' },
  doctor_reviewed: { label: 'İncelendi', color: '#3D7A5F', bg: 'rgba(61,122,95,0.1)' },
  contacted: { label: 'İletişime Geçildi', color: '#C4883A', bg: 'rgba(196,136,58,0.1)' },
  booked: { label: 'Randevu Alındı', color: 'var(--color-emerald)', bg: 'rgba(45,95,93,0.12)' },
  archived: { label: 'Arşivlendi', color: '#78716C', bg: 'rgba(120,113,108,0.1)' },
}

const readinessConfig: Record<ReadinessBand, { label: string; color: string; bg: string }> = {
  very_high: { label: 'Çok Yüksek', color: '#3D7A5F', bg: 'rgba(61,122,95,0.1)' },
  high: { label: 'Yüksek', color: '#2D5F5D', bg: 'rgba(45,95,93,0.1)' },
  medium: { label: 'Orta', color: '#C4883A', bg: 'rgba(196,136,58,0.1)' },
  low: { label: 'Düşük', color: '#78716C', bg: 'rgba(120,113,108,0.1)' },
}

const riskConfig: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Düşük Risk', color: '#3D7A5F', bg: 'rgba(61,122,95,0.1)' },
  medium: { label: 'Orta Risk', color: '#C4883A', bg: 'rgba(196,136,58,0.1)' },
  high: { label: 'Yüksek Risk', color: '#A05252', bg: 'rgba(160,82,82,0.1)' },
}

export function StatusBadge({ status, type = 'lead', className }: StatusBadgeProps) {
  let config: { label: string; color: string; bg: string } | undefined

  if (type === 'lead') config = leadStatusConfig[status as LeadStatus]
  else if (type === 'readiness') config = readinessConfig[status as ReadinessBand]
  else if (type === 'risk') config = riskConfig[status]

  if (!config) config = { label: status, color: '#78716C', bg: 'rgba(120,113,108,0.1)' }

  return (
    <span
      className={cn('inline-flex items-center px-2.5 py-1 rounded-full font-body text-[10px] font-medium tracking-[0.08em] uppercase', className)}
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  )
}
