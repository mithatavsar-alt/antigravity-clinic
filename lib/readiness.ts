import type { Lead, ReadinessBand } from '@/types/lead'

export function calculateReadiness(lead: Partial<Lead>): { score: number; band: ReadinessBand } {
  let score = 15 // base

  if (lead.consultation_timing === 'asap') score += 25
  else if (lead.consultation_timing === 'iki_hafta') score += 15
  else if (lead.consultation_timing === 'bir_ay') score += 5

  if (lead.prior_treatment) score += 15
  if (lead.desired_result_style && lead.desired_result_style !== 'emin_degil') score += 10
  if (lead.expectation_note?.trim()) score += 10
  if (lead.patient_photo_url) score += 10
  if (lead.concern_area && lead.concern_area !== 'genel_yuz_dengesi') score += 5

  const band: ReadinessBand =
    score >= 80 ? 'very_high' :
    score >= 60 ? 'high' :
    score >= 35 ? 'medium' : 'low'

  return { score: Math.min(score, 100), band }
}

export const readinessBandConfig: Record<ReadinessBand, {
  label: string
  color: string
  bgColor: string
  action: string
}> = {
  very_high: {
    label: 'Çok Yüksek',
    color: '#3D7A5F',
    bgColor: 'rgba(61,122,95,0.1)',
    action: 'Aynı gün iletişim',
  },
  high: {
    label: 'Yüksek',
    color: '#2D5F5D',
    bgColor: 'rgba(45,95,93,0.1)',
    action: '24 saat içinde WhatsApp',
  },
  medium: {
    label: 'Orta',
    color: '#C4883A',
    bgColor: 'rgba(196,136,58,0.1)',
    action: '2 gün içinde takip',
  },
  low: {
    label: 'Düşük',
    color: '#78716C',
    bgColor: 'rgba(120,113,108,0.1)',
    action: 'Nurture listesine al',
  },
}
