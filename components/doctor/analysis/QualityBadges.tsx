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
    <div key={label} className="doctor-card-soft flex items-center gap-2 px-3 py-1.5 rounded-lg">
      <span className="font-body text-[13px] tracking-[0.1em] uppercase text-[rgba(26,26,46,0.38)]">{label}</span>
      <span className="font-mono text-[13px]" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function pctColor(value: number): string {
  if (value >= 80) return '#3D7A5F'
  if (value >= 60) return '#C4A35A'
  if (value >= 40) return '#C4883A'
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
      const color = captureConfidence === 'high' ? '#3D7A5F' : captureConfidence === 'medium' ? '#C4A35A' : '#C47A7A'
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
    badges.push(badge('Canlılık', passed ? 'Geçti' : livenessStatus === 'skipped' ? 'Atlandı' : 'Başarısız', passed ? '#3D7A5F' : '#C47A7A'))
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
