'use client'

interface QualityBadgesProps {
  captureConfidence?: number | string
  captureQualityScore?: number
  analysisInputQuality?: number
  reportConfidence?: number
  livenessStatus?: string
  livenessConfidence?: number
  livenessPassed?: boolean
  outputDegraded?: boolean
  qualityScore?: number
}

function badge(label: string, value: string | number, color: string) {
  return (
    <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(16,14,11,0.55)] backdrop-blur-lg border border-[rgba(214,185,140,0.08)]">
      <span className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)]">{label}</span>
      <span className="font-mono text-[11px]" style={{ color }}>{value}</span>
    </div>
  )
}

function pctColor(v: number): string {
  if (v >= 80) return '#4AE3A7'
  if (v >= 60) return '#D6B98C'
  if (v >= 40) return '#C4883A'
  return '#C47A7A'
}

export function QualityBadges({
  captureConfidence,
  captureQualityScore,
  analysisInputQuality,
  reportConfidence,
  livenessStatus,
  livenessConfidence,
  livenessPassed,
  outputDegraded,
  qualityScore,
}: QualityBadgesProps) {
  const badges: React.ReactNode[] = []

  if (captureConfidence != null) {
    if (typeof captureConfidence === 'string') {
      const label = captureConfidence === 'high' ? 'Yüksek' : captureConfidence === 'medium' ? 'Orta' : 'Düşük'
      const color = captureConfidence === 'high' ? '#4AE3A7' : captureConfidence === 'medium' ? '#D6B98C' : '#C47A7A'
      badges.push(badge('Çekim Güveni', label, color))
    } else {
      const pct = Math.round(captureConfidence * 100)
      badges.push(badge('Çekim Güveni', `${pct}%`, pctColor(pct)))
    }
  }
  if (captureQualityScore != null) {
    badges.push(badge('Çekim Kalitesi', captureQualityScore, pctColor(captureQualityScore)))
  }
  if (analysisInputQuality != null) {
    badges.push(badge('Girdi Kalitesi', analysisInputQuality, pctColor(analysisInputQuality)))
  }
  if (reportConfidence != null) {
    const pct = Math.round(reportConfidence * 100)
    badges.push(badge('Rapor Güveni', `${pct}%`, pctColor(pct)))
  }
  if (qualityScore != null) {
    badges.push(badge('Kalite Skoru', qualityScore, pctColor(qualityScore)))
  }
  if (livenessStatus) {
    const passed = livenessPassed ?? livenessStatus === 'passed'
    badges.push(badge('Canlılık', passed ? 'Geçti' : livenessStatus === 'skipped' ? 'Atlandı' : 'Başarısız', passed ? '#4AE3A7' : '#C47A7A'))
  }
  if (livenessConfidence != null) {
    const pct = Math.round(livenessConfidence * 100)
    badges.push(badge('Canlılık Güveni', `${pct}%`, pctColor(pct)))
  }
  if (outputDegraded) {
    badges.push(badge('Çıktı', 'Düşürüldü', '#C4883A'))
  }

  if (badges.length === 0) return null

  return <div className="flex flex-wrap gap-2">{badges}</div>
}
