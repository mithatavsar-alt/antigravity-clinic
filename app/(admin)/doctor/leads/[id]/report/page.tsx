'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { formatDate, formatDateTime } from '@/lib/utils'
import { readinessBandConfig } from '@/lib/readiness'
import { sessionToLead } from '@/lib/supabase/queries'
import { scoreColor } from '@/lib/ui/score-colors'
import {
  concernAreaLabels,
  consultationTimingLabels,
  desiredResultLabels,
  goalClarityLabels,
  timeIntentLabels,
} from '@/types/lead'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[rgba(214,185,140,0.10)] print:border-[rgba(0,0,0,0.08)]">
      <span className="font-body text-[12px] text-[rgba(248,246,242,0.58)] print:text-[rgba(0,0,0,0.5)]">{label}</span>
      <span className="font-body text-[12px] text-[#F8F6F2] font-medium print:text-[#1A1A2E]">{value}</span>
    </div>
  )
}

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { leads } = useClinicStore()
  const router = useRouter()
  const zustandLead = leads.find((l) => l.id === id)
  const [sbLead, setSbLead] = useState<ReturnType<typeof sessionToLead> | null>(null)
  const lead = zustandLead ?? sbLead

  useEffect(() => {
    if (!zustandLead) {
      fetch(`/api/doctor/leads/${id}`)
        .then(async (res) => {
          if (!res.ok) return
          const { data } = await res.json()
          if (data) setSbLead(sessionToLead(data as Record<string, unknown>))
        })
        .catch(() => {})
    }
  }, [id, zustandLead])

  if (!lead) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[rgba(214,185,140,0.12)] border-t-[#D6B98C] animate-spin" />
          <p className="font-body text-[12px] text-[rgba(248,246,242,0.48)]">Rapor yükleniyor...</p>
        </div>
      </div>
    )
  }

  const analysis = lead.doctor_analysis
  const readiness = lead.consultation_readiness
  const readinessConfig = lead.readiness_band ? readinessBandConfig[lead.readiness_band] : null
  const aiScores = lead.ai_scores

  const radarAnalysis = lead.radar_analysis as { radarScores?: Array<{ key: string; label: string; score: number; confidence?: number }> } | undefined
  const wrinkleScores = lead.wrinkle_scores as { regions?: Array<{ region: string; label: string; score: number; level?: string }>; overallScore?: number } | undefined
  const overallScore = wrinkleScores?.overallScore ?? (radarAnalysis?.radarScores ? Math.round(radarAnalysis.radarScores.reduce((s, r) => s + r.score, 0) / radarAnalysis.radarScores.length) : undefined)

  const upperFace = ['alin', 'glabella', 'kaz_ayagi']
  const midFace = ['goz_alti', 'yanak_orta_yuz', 'nazolabial']
  const lowerFace = ['dudak', 'marionette', 'jawline', 'cene_ucu']
  const general = ['cilt_kalitesi', 'simetri_gozlemi']

  return (
    <div className="min-h-screen print:bg-white">
      {/* Print Controls — hidden in print */}
      <div className="print:hidden sticky top-0 z-10 bg-[rgba(14,11,9,0.92)] backdrop-blur-md border-b border-[rgba(214,185,140,0.10)] px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="font-body text-[12px] text-[rgba(248,246,242,0.58)] hover:text-[#D6B98C] transition-colors"
        >
          ← Geri Dön
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(214,185,140,0.1)] border border-[rgba(214,185,140,0.35)] font-body text-[11px] tracking-[0.08em] uppercase text-[#D6B98C] hover:bg-[rgba(214,185,140,0.22)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
          </svg>
          Yazdır / PDF
        </button>
      </div>

      {/* Report Content */}
      <div className="max-w-[800px] mx-auto px-8 py-10 print:px-0 print:py-6 print:max-w-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-[rgba(214,185,140,0.10)] print:border-[#1A1A2E]">
          <div>
            <h1 className="font-display text-[24px] font-light tracking-tight text-[#F8F6F2] print:text-[#1A1A2E]">
              Dr. Müjde Ocak Aesthetic Clinic
            </h1>
            <p className="font-body text-[10px] text-[#D6B98C] tracking-[0.2em] uppercase mt-1 print:text-[rgba(0,0,0,0.5)]">
              AI Destekli Yüz Analiz Raporu
            </p>
          </div>
          <div className="text-right">
            <p className="font-body text-[11px] text-[rgba(248,246,242,0.52)] print:text-[rgba(0,0,0,0.5)]">Rapor Tarihi</p>
            <p className="font-body text-[13px] text-[#F8F6F2] print:text-[#1A1A2E]">{formatDate(new Date().toISOString())}</p>
            <p className="font-mono text-[10px] text-[rgba(248,246,242,0.38)] mt-1 print:text-[rgba(0,0,0,0.4)]">ID: {lead.id.slice(0, 12)}</p>
          </div>
        </div>

        {/* Overall Score Hero — screen only */}
        {overallScore != null && (
          <div className="mb-8 rounded-xl border border-[rgba(214,185,140,0.10)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-6 flex items-center gap-6 print:border-[rgba(0,0,0,0.1)] print:bg-[rgba(0,0,0,0.02)]">
            <div className="flex-shrink-0 w-16 h-16 relative">
              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(248,246,242,0.10)" strokeWidth="3" className="print:stroke-[rgba(0,0,0,0.08)]" />
                <circle cx="32" cy="32" r="28" fill="none" stroke={scoreColor(overallScore)} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(overallScore / 100) * 176} 176`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[18px] font-light text-[#F8F6F2] print:text-[#1A1A2E]">
                {overallScore}
              </span>
            </div>
            <div>
              <p className="font-body text-[9px] tracking-[0.15em] uppercase text-[rgba(248,246,242,0.48)] mb-1 print:text-[rgba(0,0,0,0.4)]">Genel Skor</p>
              <p className="font-body text-[13px] text-[rgba(248,246,242,0.72)] print:text-[rgba(0,0,0,0.6)]">
                {overallScore >= 70 ? 'Belirgin bulgular — klinik değerlendirme önerilir' :
                 overallScore >= 40 ? 'Orta seviye bulgular tespit edildi' :
                 'Minimal bulgular — genel bakım önerileri uygulanabilir'}
              </p>
            </div>
          </div>
        )}

        {/* Patient Info */}
        <section className="mb-8">
          <h2 className="font-body text-[12px] font-medium text-[#D6B98C] tracking-[0.15em] uppercase mb-4 print:text-[#1A1A2E]">Hasta Bilgileri</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
            <InfoRow label="Ad Soyad" value={lead.full_name} />
            <InfoRow label="Cinsiyet" value={lead.gender === 'female' ? 'Kadın' : lead.gender === 'male' ? 'Erkek' : 'Diğer'} />
            <InfoRow label="Yaş Aralığı" value={lead.age_range} />
            <InfoRow label="Telefon" value={lead.phone} />
            <InfoRow label="İlgi Alanı" value={concernAreaLabels[lead.concern_area]} />
            <InfoRow label="Sonuç Beklentisi" value={desiredResultLabels[lead.desired_result_style]} />
            <InfoRow label="Zamanlama" value={consultationTimingLabels[lead.consultation_timing]} />
            <InfoRow label="Önceki İşlem" value={lead.prior_treatment ? 'Evet' : 'Hayır'} />
            <InfoRow label="Başvuru Tarihi" value={formatDateTime(lead.created_at)} />
            <InfoRow label="Rıza Durumu" value={lead.consent_given ? `Verildi (v${lead.consent_text_version})` : 'Verilmedi'} />
          </div>
          {lead.expectation_note && (
            <div className="mt-3 p-3 rounded-lg bg-[rgba(16,14,11,0.55)] backdrop-blur-lg border border-[rgba(214,185,140,0.10)] print:bg-[rgba(0,0,0,0.02)] print:border-[rgba(0,0,0,0.08)]">
              <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-1 print:text-[rgba(0,0,0,0.4)]">Beklenti Notu</p>
              <p className="font-body text-[12px] text-[rgba(248,246,242,0.72)] leading-relaxed print:text-[rgba(0,0,0,0.7)]">{lead.expectation_note}</p>
            </div>
          )}
        </section>

        {/* AI Scores */}
        {aiScores && (
          <section className="mb-8">
            <h2 className="font-body text-[12px] font-medium text-[#D6B98C] tracking-[0.15em] uppercase mb-4 print:text-[#1A1A2E]">AI Analiz Skorları</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-[rgba(214,185,140,0.10)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-4 print:border-[rgba(0,0,0,0.1)] print:bg-transparent">
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-2 print:text-[rgba(0,0,0,0.4)]">Simetri Skoru</p>
                <p className="font-mono text-[32px] font-light text-[#F8F6F2] print:text-[#1A1A2E]">
                  {aiScores.symmetry}<span className="text-[14px] text-[rgba(248,246,242,0.48)] print:text-[rgba(0,0,0,0.4)]">/100</span>
                </p>
              </div>
              <div className="rounded-xl border border-[rgba(214,185,140,0.10)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-4 print:border-[rgba(0,0,0,0.1)] print:bg-transparent">
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-2 print:text-[rgba(0,0,0,0.4)]">Altın Oran Uyumu</p>
                <p className="font-mono text-[32px] font-light text-[#F8F6F2] print:text-[#1A1A2E]">
                  {aiScores.proportion}<span className="text-[14px] text-[rgba(248,246,242,0.48)] print:text-[rgba(0,0,0,0.4)]">/100</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
              <InfoRow label="Yüz Genişlik / Uzunluk" value={aiScores.metrics.faceRatio.toFixed(2)} />
              <InfoRow label="Göz Mesafesi Oranı" value={aiScores.metrics.eyeDistanceRatio.toFixed(2)} />
              <InfoRow label="Burun Genişliği Oranı" value={aiScores.metrics.noseToFaceWidth.toFixed(2)} />
              <InfoRow label="Dudak / Burun Oranı" value={aiScores.metrics.mouthToNoseWidth.toFixed(2)} />
              <InfoRow label="Simetri Oranı" value={aiScores.metrics.symmetryRatio.toFixed(2)} />
            </div>

            {aiScores.suggestions.length > 0 && (
              <div className="mt-4">
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-2 print:text-[rgba(0,0,0,0.4)]">Estetik Tespitler</p>
                <ul className="space-y-1.5">
                  {aiScores.suggestions.map((s: string, i: number) => (
                    <li key={i} className="font-body text-[12px] text-[rgba(248,246,242,0.68)] leading-relaxed flex gap-2 print:text-[rgba(0,0,0,0.7)]">
                      <span className="text-[#D6B98C] flex-shrink-0 print:text-[rgba(0,0,0,0.35)]">·</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Radar Scores — print-friendly table */}
        {radarAnalysis?.radarScores && radarAnalysis.radarScores.length > 0 && (
          <section className="mb-8">
            <h2 className="font-body text-[12px] font-medium text-[#D6B98C] tracking-[0.15em] uppercase mb-4 print:text-[#1A1A2E]">Radar Analiz Skorları</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {radarAnalysis.radarScores.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-[rgba(214,185,140,0.08)] print:border-[rgba(0,0,0,0.06)]">
                  <span className="font-body text-[11px] text-[rgba(248,246,242,0.65)] print:text-[rgba(0,0,0,0.6)]">{r.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-[rgba(248,246,242,0.06)] overflow-hidden print:bg-[rgba(0,0,0,0.06)]">
                      <div className="h-full rounded-full" style={{ width: `${r.score}%`, backgroundColor: scoreColor(r.score) }} />
                    </div>
                    <span className="font-mono text-[11px] w-6 text-right" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Regional Assessment */}
        {analysis && (
          <section className="mb-8">
            <h2 className="font-body text-[12px] font-medium text-[#D6B98C] tracking-[0.15em] uppercase mb-4 print:text-[#1A1A2E]">Bölgesel Değerlendirme</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { title: 'Üst Yüz', keys: upperFace },
                { title: 'Orta Yüz', keys: midFace },
                { title: 'Alt Yüz', keys: lowerFace },
                { title: 'Genel', keys: general },
              ].map(({ title, keys }) => (
                <div key={title}>
                  <p className="font-body text-[11px] font-medium text-[rgba(248,246,242,0.62)] mb-2 print:text-[rgba(0,0,0,0.55)]">{title}</p>
                  <div className="space-y-2">
                    {keys
                      .filter((key) => analysis.region_scores[key] != null)
                      .map((key) => {
                        const score = analysis.region_scores[key]
                        return (
                          <div key={key} className="flex items-center justify-between gap-3">
                            <span className="font-body text-[11px] text-[rgba(248,246,242,0.58)] capitalize print:text-[rgba(0,0,0,0.5)]">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-[rgba(248,246,242,0.06)] overflow-hidden print:bg-[rgba(0,0,0,0.06)]">
                                <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
                              </div>
                              <span className="font-mono text-[11px] w-6 text-right" style={{ color: scoreColor(score) }}>{score}</span>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[rgba(214,185,140,0.10)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-3 print:border-[rgba(0,0,0,0.1)] print:bg-transparent">
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-1 print:text-[rgba(0,0,0,0.4)]">Risk Seviyesi</p>
                <p className="font-body text-[14px] font-medium text-[#F8F6F2] capitalize print:text-[#1A1A2E]">{analysis.dose_recommendation.risk_level}</p>
              </div>
              <div className="rounded-xl border border-[rgba(214,185,140,0.10)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-3 print:border-[rgba(0,0,0,0.1)] print:bg-transparent">
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-1 print:text-[rgba(0,0,0,0.4)]">Doz Aralığı</p>
                <p className="font-body text-[14px] font-medium text-[#F8F6F2] print:text-[#1A1A2E]">{analysis.dose_recommendation.range_cc}</p>
              </div>
              <div className="rounded-xl border border-[rgba(214,185,140,0.10)] bg-[rgba(16,14,11,0.55)] backdrop-blur-lg p-3 print:border-[rgba(0,0,0,0.1)] print:bg-transparent">
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mb-1 print:text-[rgba(0,0,0,0.4)]">Üst Limit</p>
                <p className="font-body text-[14px] font-medium text-[#C47A7A] print:text-[#A05252]">{analysis.dose_recommendation.upper_limit_cc}</p>
              </div>
            </div>
          </section>
        )}

        {/* Consultation Readiness */}
        {readiness && (
          <section className="mb-8">
            <h2 className="font-body text-[12px] font-medium text-[#D6B98C] tracking-[0.15em] uppercase mb-4 print:text-[#1A1A2E]">Konsültasyon Hazırlığı</h2>
            <div className="flex items-center gap-6 mb-4">
              <div>
                <p className="font-mono text-[48px] font-light leading-none" style={{ color: readinessConfig?.color }}>
                  {readiness.readiness_score}
                </p>
                <p className="font-body text-[9px] text-[rgba(248,246,242,0.48)] uppercase tracking-[0.15em] mt-1 print:text-[rgba(0,0,0,0.4)]">Skor</p>
              </div>
              <div>
                <p className="font-body text-[13px] font-medium text-[#F8F6F2] print:text-[#1A1A2E]">{readinessConfig?.label}</p>
                <p className="font-body text-[12px] text-[rgba(248,246,242,0.62)] print:text-[rgba(0,0,0,0.5)]">{readinessConfig?.action}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
              <InfoRow label="Motivasyon" value={readiness.primary_motivation} />
              <InfoRow label="Hedef Netliği" value={goalClarityLabels[readiness.goal_clarity]} />
              <InfoRow label="Zamanlama Niyeti" value={timeIntentLabels[readiness.time_intent]} />
              <InfoRow label="Önceki Deneyim" value={readiness.prior_experience ? 'Evet' : 'Hayır'} />
              <InfoRow label="Önerilen Takip" value={readiness.recommended_followup} />
            </div>
          </section>
        )}

        {/* Doctor Notes */}
        {lead.doctor_notes && (
          <section className="mb-8">
            <h2 className="font-body text-[12px] font-medium text-[#D6B98C] tracking-[0.15em] uppercase mb-4 print:text-[#1A1A2E]">Doktor Notları</h2>
            <div className="p-4 rounded-xl bg-[rgba(16,14,11,0.55)] backdrop-blur-lg border border-[rgba(214,185,140,0.10)] print:bg-[rgba(0,0,0,0.02)] print:border-[rgba(0,0,0,0.08)]">
              <p className="font-body text-[12px] text-[rgba(248,246,242,0.72)] leading-relaxed whitespace-pre-wrap print:text-[rgba(0,0,0,0.7)]">{lead.doctor_notes}</p>
              {lead.doctor_notes_updated_at && (
                <p className="font-mono text-[10px] text-[rgba(248,246,242,0.38)] mt-2 print:text-[rgba(0,0,0,0.4)]">{formatDateTime(lead.doctor_notes_updated_at)}</p>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-[rgba(214,185,140,0.10)] print:border-[rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-end">
            <div>
              <p className="font-body text-[10px] text-[rgba(248,246,242,0.48)] leading-relaxed print:text-[rgba(0,0,0,0.4)]">
                Bu rapor AI destekli ön değerlendirme çıktısıdır.<br />
                Kesin tedavi planı klinik muayene ve doktor değerlendirmesi sonrasında oluşturulur.
              </p>
            </div>
            <div className="text-right">
              <p className="font-body text-[10px] text-[rgba(248,246,242,0.48)] print:text-[rgba(0,0,0,0.4)]">Dr. Müjde Ocak Aesthetic Clinic · AI</p>
              <p className="font-mono text-[9px] text-[rgba(248,246,242,0.38)] print:text-[rgba(0,0,0,0.3)]">v1.0.0 · {formatDate(new Date().toISOString())}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
