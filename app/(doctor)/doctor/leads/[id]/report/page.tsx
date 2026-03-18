'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import { RegionBar } from '@/components/design-system/RegionBar'
import { formatDate, formatDateTime } from '@/lib/utils'
import { readinessBandConfig } from '@/lib/readiness'
import {
  concernAreaLabels,
  consultationTimingLabels,
  desiredResultLabels,
  goalClarityLabels,
  photoQualityLabels,
  timeIntentLabels,
} from '@/types/lead'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[rgba(196,163,90,0.08)]">
      <span className="font-body text-[12px] text-[rgba(26,26,46,0.5)]">{label}</span>
      <span className="font-body text-[12px] text-[#1A1A2E] font-medium">{value}</span>
    </div>
  )
}

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { leads } = useClinicStore()
  const router = useRouter()
  const lead = leads.find((l) => l.id === id)

  if (!lead) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAF6F1]">
        <p className="font-body text-[14px] text-[rgba(26,26,46,0.5)]">Rapor bulunamadı</p>
      </div>
    )
  }

  const analysis = lead.doctor_analysis
  const readiness = lead.consultation_readiness
  const readinessConfig = lead.readiness_band ? readinessBandConfig[lead.readiness_band] : null
  const aiScores = lead.ai_scores

  const upperFace = ['alin', 'glabella', 'kaz_ayagi']
  const midFace = ['goz_alti', 'yanak_orta_yuz', 'nazolabial']
  const lowerFace = ['dudak', 'marionette', 'jawline', 'cene_ucu']
  const general = ['cilt_kalitesi', 'simetri_gozlemi']

  return (
    <div className="min-h-screen bg-[#FAF6F1] print:bg-white">
      {/* Print Controls - hidden in print */}
      <div className="print:hidden sticky top-0 z-10 bg-[#FFFEF9] border-b border-[rgba(196,163,90,0.12)] px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="font-body text-[12px] text-[rgba(26,26,46,0.45)] hover:text-[#1A1A2E] transition-colors"
        >
          ← Geri Dön
        </button>
        <div className="flex gap-3">
          <PremiumButton size="sm" variant="ghost" onClick={() => router.back()}>
            İptal
          </PremiumButton>
          <PremiumButton size="sm" onClick={() => window.print()}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Yazdır / PDF
          </PremiumButton>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-[800px] mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-[#1A1A2E]">
          <div>
            <h1 className="text-[24px] font-light tracking-tight text-[#1A1A2E]">Antigravity Clinic</h1>
            <p className="text-[11px] text-[rgba(26,26,46,0.4)] tracking-[0.2em] uppercase mt-1">AI Destekli Yüz Analiz Raporu</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[rgba(26,26,46,0.5)]">Rapor Tarihi</p>
            <p className="text-[13px] text-[#1A1A2E]">{formatDate(new Date().toISOString())}</p>
            <p className="text-[11px] text-[rgba(26,26,46,0.4)] mt-1">ID: {lead.id}</p>
          </div>
        </div>

        {/* Patient Info */}
        <section className="mb-8">
          <h2 className="font-body text-[14px] font-medium text-[#1A1A2E] tracking-[0.1em] uppercase mb-4">Hasta Bilgileri</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-0">
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
            <div className="mt-3 p-3 bg-[rgba(255,254,249,0.6)] rounded-[14px] border border-[rgba(196,163,90,0.1)]">
              <p className="text-[10px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-1">Beklenti Notu</p>
              <p className="text-[12px] text-[rgba(26,26,46,0.7)] leading-relaxed">{lead.expectation_note}</p>
            </div>
          )}
        </section>

        {/* AI Scores */}
        {aiScores && (
          <section className="mb-8">
            <h2 className="font-body text-[14px] font-medium text-[#1A1A2E] tracking-[0.1em] uppercase mb-4">AI Analiz Skorları</h2>
            <div className="grid grid-cols-2 gap-6 mb-4">
              <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] bg-[rgba(255,254,249,0.5)] p-4">
                <p className="text-[10px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-2">Simetri Skoru</p>
                <p className="text-[32px] font-light text-[#1A1A2E]">{aiScores.symmetry}<span className="text-[14px] text-[rgba(26,26,46,0.4)]">/100</span></p>
              </div>
              <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] bg-[rgba(255,254,249,0.5)] p-4">
                <p className="text-[10px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-2">Altın Oran Uyumu</p>
                <p className="text-[32px] font-light text-[#1A1A2E]">{aiScores.proportion}<span className="text-[14px] text-[rgba(26,26,46,0.4)]">/100</span></p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
              <InfoRow label="Yüz Genişlik / Uzunluk" value={aiScores.metrics.faceRatio.toFixed(2)} />
              <InfoRow label="Göz Mesafesi Oranı" value={aiScores.metrics.eyeDistanceRatio.toFixed(2)} />
              <InfoRow label="Burun Genişliği Oranı" value={aiScores.metrics.noseToFaceWidth.toFixed(2)} />
              <InfoRow label="Dudak / Burun Oranı" value={aiScores.metrics.mouthToNoseWidth.toFixed(2)} />
              <InfoRow label="Simetri Oranı" value={aiScores.metrics.symmetryRatio.toFixed(2)} />
            </div>

            {aiScores.suggestions.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-2">Estetik Tespitler</p>
                <ul className="space-y-1.5">
                  {aiScores.suggestions.map((s, i) => (
                    <li key={i} className="text-[12px] text-[rgba(26,26,46,0.7)] leading-relaxed flex gap-2">
                      <span className="text-[rgba(26,26,46,0.35)] flex-shrink-0">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Regional Assessment */}
        {analysis && (
          <section className="mb-8">
            <h2 className="font-body text-[14px] font-medium text-[#1A1A2E] tracking-[0.1em] uppercase mb-4">Bölgesel Değerlendirme</h2>
            <div className="grid grid-cols-2 gap-6">
              {[
                { title: 'Üst Yüz', keys: upperFace },
                { title: 'Orta Yüz', keys: midFace },
                { title: 'Alt Yüz', keys: lowerFace },
                { title: 'Genel', keys: general },
              ].map(({ title, keys }) => (
                <div key={title}>
                  <p className="text-[11px] font-medium text-[rgba(26,26,46,0.55)] mb-2">{title}</p>
                  <div className="space-y-2">
                    {keys
                      .filter((key) => analysis.region_scores[key] != null)
                      .map((key) => (
                        <RegionBar key={key} label={key} score={analysis.region_scores[key]} />
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] bg-[rgba(255,254,249,0.5)] p-3">
                <p className="text-[9px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-1">Risk Seviyesi</p>
                <p className="text-[14px] font-medium text-[#1A1A2E] capitalize">{analysis.dose_recommendation.risk_level}</p>
              </div>
              <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] bg-[rgba(255,254,249,0.5)] p-3">
                <p className="text-[9px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-1">Doz Aralığı</p>
                <p className="text-[14px] font-medium text-[#1A1A2E]">{analysis.dose_recommendation.range_cc}</p>
              </div>
              <div className="border border-[rgba(196,163,90,0.15)] rounded-[14px] bg-[rgba(255,254,249,0.5)] p-3">
                <p className="text-[9px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mb-1">Üst Limit</p>
                <p className="text-[14px] font-medium text-[#A05252]">{analysis.dose_recommendation.upper_limit_cc}</p>
              </div>
            </div>
          </section>
        )}

        {/* Consultation Readiness */}
        {readiness && (
          <section className="mb-8">
            <h2 className="font-body text-[14px] font-medium text-[#1A1A2E] tracking-[0.1em] uppercase mb-4">Konsültasyon Hazırlığı</h2>
            <div className="flex items-center gap-6 mb-4">
              <div>
                <p className="text-[48px] font-light leading-none" style={{ color: readinessConfig?.color }}>
                  {readiness.readiness_score}
                </p>
                <p className="text-[10px] text-[rgba(26,26,46,0.4)] uppercase tracking-[0.15em] mt-1">Skor</p>
              </div>
              <div>
                <p className="text-[13px] font-medium text-[#1A1A2E]">{readinessConfig?.label}</p>
                <p className="text-[12px] text-[rgba(26,26,46,0.5)]">{readinessConfig?.action}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
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
            <h2 className="font-body text-[14px] font-medium text-[#1A1A2E] tracking-[0.1em] uppercase mb-4">Doktor Notları</h2>
            <div className="p-4 bg-[rgba(255,254,249,0.6)] rounded-[14px] border border-[rgba(196,163,90,0.1)]">
              <p className="text-[12px] text-[rgba(26,26,46,0.7)] leading-relaxed whitespace-pre-wrap">{lead.doctor_notes}</p>
              {lead.doctor_notes_updated_at && (
                <p className="text-[10px] text-[rgba(26,26,46,0.4)] mt-2">{formatDateTime(lead.doctor_notes_updated_at)}</p>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-[rgba(196,163,90,0.15)]">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] text-[rgba(26,26,46,0.4)] leading-relaxed">
                Bu rapor AI destekli ön değerlendirme çıktısıdır.<br />
                Kesin tedavi planı klinik muayene ve doktor değerlendirmesi sonrasında oluşturulur.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[rgba(26,26,46,0.4)]">Antigravity Dynamic Face AI™</p>
              <p className="text-[9px] text-[rgba(26,26,46,0.3)]">v1.0.0 · {formatDate(new Date().toISOString())}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
