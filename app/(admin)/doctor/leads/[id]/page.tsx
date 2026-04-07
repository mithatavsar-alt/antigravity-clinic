'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { logAuditEvent } from '@/lib/audit'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { insertDoctorNote, updateSession, sessionToLead } from '@/lib/supabase/queries'
import { StatusBadge } from '@/components/design-system/StatusBadge'
import type { LeadStatus } from '@/types/lead'
import { formatDateTime } from '@/lib/utils'

// Doctor analysis components
import { AnalysisHeroSummary } from '@/components/doctor/analysis/AnalysisHeroSummary'
import { RegionAnalysisGrid } from '@/components/doctor/analysis/RegionAnalysisGrid'
import { PatientImageReview } from '@/components/doctor/analysis/PatientImageReview'
import { QualityBadges } from '@/components/doctor/analysis/QualityBadges'
import { DoctorRadarSection } from '@/components/doctor/analysis/DoctorRadarSection'
import { IntakeContextPanel } from '@/components/doctor/analysis/IntakeContextPanel'
import { DoctorActionPanel } from '@/components/doctor/analysis/DoctorActionPanel'

// ── Section wrapper ──
function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-display text-[18px] font-light text-[#F8F6F2]">{title}</h3>
        <div className="flex-1 h-px bg-[rgba(18,16,13,0.55)]" />
        {badge}
      </div>
      {children}
    </section>
  )
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { leads, updateLeadStatus, updateDoctorNotes, generateReport } = useClinicStore()
  const router = useRouter()
  const zustandLead = leads.find((item) => item.id === id)
  const [sbLead, setSbLead] = useState<ReturnType<typeof sessionToLead> | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const lead = zustandLead ?? sbLead

  useEffect(() => {
    if (!zustandLead) {
      fetch(`/api/doctor/leads/${id}`)
        .then(async (res) => {
          if (!res.ok) {
            setFetchError('Lead verileri yüklenemedi.')
            return
          }
          const { data } = await res.json()
          if (data) setSbLead(sessionToLead(data as Record<string, unknown>))
        })
        .catch(() => setFetchError('Sunucuya bağlanılamadı.'))
    }
  }, [id, zustandLead])

  useEffect(() => {
    if (lead) logAuditEvent('lead_viewed', { lead_id: lead.id })
  }, [lead])

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-[rgba(20,18,14,0.55)] flex items-center justify-center">
          {fetchError ? (
            <svg className="w-6 h-6 text-[#C47A7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-[rgba(248,246,242,0.1)] border-t-[#D6B98C] animate-spin" />
          )}
        </div>
        <p className="font-display text-[20px] font-light text-[#F8F6F2]">{fetchError ?? 'Yükleniyor...'}</p>
        {fetchError && (
          <button onClick={() => window.location.reload()} className="font-body text-[11px] text-[#D6B98C] hover:underline">
            Tekrar Dene
          </button>
        )}
      </div>
    )
  }

  // Extract analysis data safely
  const radarAnalysis = lead.radar_analysis as { radarScores?: Array<{ key: string; label: string; score: number; confidence?: number; category?: string; insight?: string }>; derivedInsights?: { strongestAreas?: string[]; improvementAreas?: string[]; summaryText?: string } } | undefined
  const focusAreas = lead.focus_areas as Array<{ region: string; label: string; score: number; insight?: string; doctorReviewRecommended?: boolean }> | undefined
  const wrinkleScores = lead.wrinkle_scores as { regions?: Array<{ region: string; label: string; score: number; level?: string; confidence?: number; insight?: string; evidenceStrength?: string }>; overallScore?: number } | undefined
  const ageEstimation = lead.age_estimation as { pointEstimate?: number; estimatedRange?: [number, number]; confidence?: string } | undefined
  const patientSummary = lead.patient_summary as { summary_text?: string } | undefined

  const overallScore = wrinkleScores?.overallScore ?? (radarAnalysis?.radarScores ? Math.round(radarAnalysis.radarScores.reduce((s, r) => s + r.score, 0) / radarAnalysis.radarScores.length) : undefined)

  const handleStatusChange = (status: LeadStatus) => {
    updateLeadStatus(lead.id, status)
    logAuditEvent('lead_status_changed', { lead_id: lead.id, status })
    if (isSupabaseConfigured()) {
      try {
        const sessionId = sbLead ? lead.id : lead.id
        const sb = createClient()
        updateSession(sb, sessionId, { status }).catch(() => {})
      } catch { /* best-effort */ }
    }
  }

  const handleSaveNotes = async (notes: string): Promise<boolean> => {
    updateDoctorNotes(lead.id, notes)
    logAuditEvent('doctor_note_added', { lead_id: lead.id })
    if (!isSupabaseConfigured()) return true
    try {
      const sb = createClient()
      const { error } = await insertDoctorNote(sb, lead.id, notes)
      if (error) {
        console.error('[DoctorNotes] Save error:', error.message)
        return false
      }
      return true
    } catch {
      return false
    }
  }

  const handleGenerateReport = () => {
    generateReport(lead.id, `/doctor/leads/${lead.id}/report`)
    logAuditEvent('report_generated', { lead_id: lead.id })
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/doctor/leads')}
          className="font-body text-[10px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)] hover:text-[#D6B98C] transition-colors"
        >
          ← Lead Listesi
        </button>
        <span className="text-[rgba(248,246,242,0.20)]">/</span>
        <span className="font-mono text-[10px] text-[rgba(248,246,242,0.38)]">{lead.id.slice(0, 8)}</span>
      </div>

      {/* ── Patient Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-light text-[#F8F6F2] mb-2">{lead.full_name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={lead.status} type="lead" />
            {lead.readiness_band && <StatusBadge status={lead.readiness_band} type="readiness" />}
            {lead.age_range && (
              <span className="font-mono text-[10px] text-[rgba(248,246,242,0.52)] px-2 py-0.5 rounded-md bg-[rgba(20,18,14,0.55)]">
                {lead.age_range}
              </span>
            )}
            {lead.phone && (
              <span className="font-mono text-[10px] text-[rgba(248,246,242,0.52)]">{lead.phone}</span>
            )}
          </div>
          <p className="font-body text-[11px] text-[rgba(248,246,242,0.42)] mt-1">{formatDateTime(lead.created_at)}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerateReport}
            className="px-4 py-2 rounded-lg bg-[rgba(214,185,140,0.08)] border border-[rgba(214,185,140,0.22)] font-body text-[10px] tracking-[0.1em] uppercase text-[#D6B98C] hover:bg-[rgba(214,185,140,0.18)] transition-colors"
          >
            Rapor
          </button>
          {lead.report_url && (
            <Link
              href={lead.report_url}
              className="px-4 py-2 rounded-lg bg-[rgba(61,155,122,0.08)] border border-[rgba(61,155,122,0.15)] font-body text-[10px] tracking-[0.1em] uppercase text-[#4AE3A7] hover:bg-[rgba(61,155,122,0.12)] transition-colors"
            >
              Raporu Aç
            </Link>
          )}
        </div>
      </div>

      {/* ── 1. Analysis Hero Summary ── */}
      {(overallScore != null || radarAnalysis) && (
        <Section title="Analiz Özeti">
          <AnalysisHeroSummary
            overallScore={overallScore}
            confidence={lead.analysis_confidence}
            captureQuality={lead.capture_quality_score != null ? (lead.capture_quality_score >= 80 ? 'high' : lead.capture_quality_score >= 50 ? 'medium' : 'low') : undefined}
            reliabilityBand={lead.overall_reliability_band}
            evidenceCoverage={lead.evidence_coverage_score}
            suppressionCount={lead.suppression_count}
            limitedRegions={lead.limited_regions_count}
            summaryText={patientSummary?.summary_text ?? radarAnalysis?.derivedInsights?.summaryText}
            estimatedAge={ageEstimation?.pointEstimate ?? lead.estimated_age}
            estimatedGender={lead.estimated_gender}
            recaptureRecommended={lead.recapture_recommended}
          />
        </Section>
      )}

      {/* ── 2. Quality Badges ── */}
      <QualityBadges
        captureConfidence={lead.capture_confidence}
        captureQualityScore={lead.capture_quality_score}
        analysisInputQuality={lead.analysis_input_quality_score}
        reportConfidence={lead.report_confidence}
        livenessStatus={lead.liveness_status}
        livenessConfidence={lead.liveness_confidence}
        livenessPassed={lead.liveness_passed}
        outputDegraded={lead.output_degraded}
        qualityScore={lead.quality_score}
      />

      {/* ── 3. Face Images ── */}
      <Section title="Çekim Görselleri">
        <PatientImageReview
          frontPhoto={lead.doctor_frontal_photos?.[0] ?? lead.patient_photo_url}
          leftPhoto={lead.doctor_frontal_photos?.[1]}
          rightPhoto={lead.doctor_frontal_photos?.[2]}
        />
      </Section>

      {/* ── 4. Radar Analysis ── */}
      {radarAnalysis?.radarScores && (
        <Section title="Radar Analizi">
          <DoctorRadarSection radarAnalysis={radarAnalysis} />
        </Section>
      )}

      {/* ── 5. Region Analysis Grid ── */}
      <Section title="Bölgesel Değerlendirme">
        <RegionAnalysisGrid
          radarScores={radarAnalysis?.radarScores}
          focusAreas={focusAreas}
          wrinkleScores={wrinkleScores}
        />
      </Section>

      {/* ── 6. AI Scores (if available) ── */}
      {lead.ai_scores && (
        <Section title="AI Geometrik Analiz">
          <AIScoresPanel aiScores={lead.ai_scores as Record<string, unknown>} />
        </Section>
      )}

      {/* ── 7. Intake & Context ── */}
      <Section title="Hasta Bilgileri & Form">
        <IntakeContextPanel lead={lead} />
      </Section>

      {/* ── 8. Doctor Actions ── */}
      <Section title="Doktor Aksiyonları">
        <DoctorActionPanel
          lead={lead}
          onStatusChange={handleStatusChange}
          onSaveNotes={handleSaveNotes}
        />
      </Section>
    </div>
  )
}

// ── AI Scores Sub-panel ──
function AIScoresPanel({ aiScores }: { aiScores: Record<string, unknown> }) {
  const symmetry = aiScores.symmetry as number | undefined
  const proportion = aiScores.proportion as number | undefined
  const metrics = aiScores.metrics as Record<string, number> | undefined
  const suggestions = aiScores.suggestions as string[] | undefined

  return (
    <div className="rounded-xl border border-[rgba(214,185,140,0.08)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {symmetry != null && (
          <div>
            <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)] mb-1">Simetri</p>
            <p className="font-mono text-[20px] font-light text-[#F8F6F2]">{symmetry}<span className="text-[11px] text-[rgba(248,246,242,0.48)]">%</span></p>
          </div>
        )}
        {proportion != null && (
          <div>
            <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)] mb-1">Altın Oran</p>
            <p className="font-mono text-[20px] font-light text-[#F8F6F2]">{proportion}<span className="text-[11px] text-[rgba(248,246,242,0.48)]">%</span></p>
          </div>
        )}
        {metrics && Object.entries(metrics).slice(0, 4).map(([key, val]) => (
          <div key={key}>
            <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.48)] mb-1">
              {key === 'faceRatio' ? 'Yüz Oranı' : key === 'eyeDistanceRatio' ? 'Göz Mesafesi' : key === 'noseToFaceWidth' ? 'Burun/Yüz' : key === 'symmetryRatio' ? 'Simetri Oranı' : key}
            </p>
            <p className="font-mono text-[14px] text-[rgba(248,246,242,0.72)]">{typeof val === 'number' ? val.toFixed(3) : String(val)}</p>
          </div>
        ))}
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="pt-3 border-t border-[rgba(214,185,140,0.08)]">
          <p className="font-body text-[9px] tracking-[0.1em] uppercase text-[rgba(248,246,242,0.42)] mb-2">Bulgular</p>
          <ul className="flex flex-col gap-1">
            {suggestions.map((s, i) => (
              <li key={i} className="font-body text-[11px] text-[rgba(248,246,242,0.62)] flex items-start gap-2">
                <span className="text-[#D6B98C] mt-0.5">·</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
