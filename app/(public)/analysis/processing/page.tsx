'use client'

import { Suspense } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClinicStore, waitForHydration } from '@/lib/store'
import { GlassCard } from '@/components/design-system/GlassCard'
import { SectionLabel } from '@/components/design-system/SectionLabel'
import { ThinLine } from '@/components/design-system/ThinLine'
import { init as initFaceMesh, analyzeImage, destroy as destroyFaceMesh } from '@/lib/ai/facemesh'
import { savePhoto } from '@/lib/photo-bridge'
import { run as runAnalysis } from '@/lib/ai/analysis'
import { deriveDoctorAnalysis, derivePatientSummary, deriveConsultationReadiness } from '@/lib/ai/derive-doctor-analysis'
import type { AnalysisResult } from '@/lib/ai/types'
import type { ExternalAnalysisResult } from '@/lib/external-analysis/types'

type StepStatus = 'waiting' | 'active' | 'done' | 'error'

const STEPS = [
  'Yüz yapınız analiz ediliyor',
  'Cilt detayları inceleniyor',
  'Veriler işleniyor',
  'Kişisel analiz raporunuz hazırlanıyor',
] as const

function navigateToResult(id: string) {
  const url = `/analysis/result?id=${id}`
  console.log('[Pipeline] Navigating to:', url)
  window.location.replace(url)
}

// ─── Parallel task runners ──────────────────────────────────

/** Run FaceMesh locally: init → load image → detect landmarks → compute metrics */
async function runFaceMeshPipeline(
  photoUrl: string,
  withTimeout: <T>(p: Promise<T>, ms: number, label: string) => Promise<T>
): Promise<AnalysisResult | null> {
  console.log('[FaceMesh] Starting...')
  const t0 = performance.now()

  await withTimeout(initFaceMesh(), 20000, 'FaceMesh init')
  console.log('[FaceMesh] Model initialized')

  const img = new Image()
  img.crossOrigin = 'anonymous'
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Fotoğraf yüklenemedi'))
      img.src = photoUrl
    }),
    10000,
    'Image loading'
  )
  console.log('[FaceMesh] Image loaded:', img.naturalWidth, 'x', img.naturalHeight)

  let result: AnalysisResult | null = null
  await analyzeImage(img, (landmarks) => {
    if (!landmarks) {
      console.warn('[FaceMesh] No landmarks returned')
      return
    }
    console.log('[FaceMesh] Got', landmarks.length, 'landmarks')
    result = runAnalysis(landmarks)
    console.log('[FaceMesh] Metrics computed:', result ? 'success' : 'null')
  })

  console.log('[FaceMesh] Done in', Math.round(performance.now() - t0), 'ms')
  return result
}

/** Call the backend /api/analyze-face route which proxies to PerfectCorp */
async function runPerfectCorpPipeline(
  photoUrl: string,
  withTimeout: <T>(p: Promise<T>, ms: number, label: string) => Promise<T>
): Promise<ExternalAnalysisResult | null> {
  console.log('[PerfectCorp] Starting API call...')
  const t0 = performance.now()

  try {
    const response = await withTimeout(
      fetch('/api/analyze-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoUrl }),
      }),
      20000,
      'PerfectCorp API'
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('[PerfectCorp] API error:', response.status, text.slice(0, 200))
      return null
    }

    const data = await response.json()
    console.log('[PerfectCorp] Response received, success:', data.success)
    console.log('[PerfectCorp] Done in', Math.round(performance.now() - t0), 'ms')

    if (!data.success) {
      console.warn('[PerfectCorp] Analysis failed:', data.error)
      return null
    }

    return data as ExternalAnalysisResult
  } catch (err) {
    console.warn('[PerfectCorp] Pipeline failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Main component ─────────────────────────────────────────

function ProcessingContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const ran = useRef(false)

  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    STEPS.map(() => 'waiting')
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const updateStep = (index: number, status: StepStatus) => {
    setStepStatuses((prev) => {
      const next = [...prev]
      next[index] = status
      return next
    })
  }

  useEffect(() => {
    if (!id) {
      window.location.replace('/analysis')
      return
    }

    if (ran.current) return
    ran.current = true

    const leadId = id

    // Safety net: guarantee navigation within 45s
    const maxTimer = setTimeout(() => {
      console.warn('[Pipeline] Max timeout reached (45s) — force navigating')
      navigateToResult(leadId)
    }, 45000)

    function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı (${ms / 1000}s)`)), ms)
        ),
      ])
    }

    async function runPipeline() {
      try {
        // ── Hydration ──
        console.log('[Pipeline] Waiting for store hydration...')
        await withTimeout(waitForHydration(), 5000, 'Store hydration')

        const { leads, updateLeadAnalysis, clearCurrentLead } = useClinicStore.getState()
        const lead = leads.find((l) => l.id === leadId)

        if (!lead) {
          console.error('[Pipeline] Lead not found:', leadId)
          window.location.replace('/analysis')
          return
        }

        clearCurrentLead()

        const photoUrl = lead.patient_photo_url
        if (photoUrl) savePhoto(leadId, photoUrl)

        if (!photoUrl) {
          console.log('[Pipeline] No photo — skipping AI')
          await delay(800)
          navigateToResult(leadId)
          return
        }

        // ── Steps 1 + 2: PARALLEL — FaceMesh + PerfectCorp ──
        updateStep(0, 'active')
        updateStep(1, 'active')

        console.log('[Pipeline] Starting parallel analysis...')
        const t0 = performance.now()

        const [faceMeshSettled, perfectCorpSettled] = await Promise.allSettled([
          runFaceMeshPipeline(photoUrl, withTimeout),
          runPerfectCorpPipeline(photoUrl, withTimeout),
        ])

        const geometry = faceMeshSettled.status === 'fulfilled' ? faceMeshSettled.value : null
        const faceMeshOk = !!geometry
        if (faceMeshSettled.status === 'rejected') {
          console.error('[Pipeline] FaceMesh rejected:', faceMeshSettled.reason)
        }
        updateStep(0, faceMeshOk ? 'done' : 'error')

        const skinData = perfectCorpSettled.status === 'fulfilled' ? perfectCorpSettled.value : null
        const perfectCorpOk = !!skinData
        if (perfectCorpSettled.status === 'rejected') {
          console.error('[Pipeline] PerfectCorp rejected:', perfectCorpSettled.reason)
        }
        updateStep(1, perfectCorpOk ? 'done' : 'error')

        console.log('[Pipeline] Parallel phase:', Math.round(performance.now() - t0), 'ms')
        console.log('[Pipeline] FaceMesh:', faceMeshOk ? 'OK' : 'FAILED', '| PerfectCorp:', perfectCorpOk ? 'OK' : 'FAILED')

        if (!perfectCorpOk) {
          setErrorMsg('Cilt analizi şu anda sınırlı gerçekleştirildi.')
        }

        // ── Step 3: Merge results ──
        updateStep(2, 'active')

        const provider = faceMeshOk && perfectCorpOk
          ? 'combined' as const
          : perfectCorpOk ? 'perfectcorp' as const
          : faceMeshOk ? 'facemesh-local' as const
          : 'mock' as const

        const source = faceMeshOk && perfectCorpOk
          ? 'combined' as const
          : perfectCorpOk ? 'real-api' as const
          : faceMeshOk ? 'real-client-side' as const
          : 'fallback' as const

        const skinScores = skinData ? {
          skinAge: skinData.skin.skinAge,
          wrinkle: skinData.skin.wrinkle,
          texture: skinData.skin.texture,
          pore: skinData.skin.pore,
          pigmentation: skinData.skin.pigmentation,
          redness: skinData.skin.redness,
          face_symmetry: skinData.face.symmetry,
          face_harmony: skinData.face.harmony,
        } : undefined

        updateStep(2, 'done')

        // ── Step 4: Doctor report ──
        updateStep(3, 'active')

        const readiness = deriveConsultationReadiness(lead)
        const analysisSource = {
          provider,
          source,
          facemesh_ok: faceMeshOk,
          perfectcorp_ok: perfectCorpOk,
          analyzed_at: new Date().toISOString(),
        }

        if (geometry) {
          const doctorAnalysis = deriveDoctorAnalysis(leadId, geometry, lead)
          const patientSummary = derivePatientSummary(geometry, lead.concern_area)

          updateLeadAnalysis(leadId, {
            doctor_analysis: doctorAnalysis,
            patient_summary: patientSummary,
            consultation_readiness: readiness,
            ai_scores: {
              symmetry: geometry.scores.symmetry,
              proportion: geometry.scores.proportion,
              suggestions: geometry.suggestions,
              metrics: geometry.metrics,
            },
            skin_scores: skinScores,
            analysis_source: analysisSource,
            status: 'analysis_ready',
          })
        } else {
          updateLeadAnalysis(leadId, {
            consultation_readiness: readiness,
            skin_scores: skinScores,
            analysis_source: analysisSource,
            status: 'analysis_ready',
          })
        }

        updateStep(3, 'done')
        console.log('[Pipeline] Complete. Provider:', provider, '| Source:', source)

        await delay(800)
        navigateToResult(leadId)
      } catch (err) {
        console.error('[Pipeline] Error:', err)
        setStepStatuses((prev) => {
          const next = [...prev]
          const activeIdx = next.findIndex((s) => s === 'active')
          if (activeIdx >= 0) next[activeIdx] = 'error'
          return next
        })
        setErrorMsg(err instanceof Error ? err.message : 'Analiz sırasında bir hata oluştu')

        try {
          const { leads, updateLeadAnalysis } = useClinicStore.getState()
          const lead = leads.find((l) => l.id === leadId)
          if (lead) {
            updateLeadAnalysis(leadId, {
              consultation_readiness: deriveConsultationReadiness(lead),
              status: 'analysis_ready',
              analysis_source: {
                provider: 'mock', source: 'fallback',
                facemesh_ok: false, perfectcorp_ok: false,
                analyzed_at: new Date().toISOString(),
              },
            })
          }
        } catch { /* best effort */ }

        await delay(2000)
        navigateToResult(leadId)
      } finally {
        clearTimeout(maxTimer)
        destroyFaceMesh()
      }
    }

    runPipeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const stepIcons: Record<StepStatus, React.ReactNode> = {
    waiting: <span className="w-2.5 h-2.5 rounded-full bg-[rgba(248,246,242,0.15)]" />,
    active: (
      <span className="w-2.5 h-2.5 rounded-full border-2 border-[#D6B98C] border-t-transparent animate-spin" />
    ),
    done: (
      <svg className="w-3.5 h-3.5 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-3.5 h-3.5 text-[#B06060]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  }

  return (
    <div className="theme-dark min-h-screen py-28 px-5" style={{ background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)' }}>
      <div className="max-w-lg mx-auto">
        <GlassCard strong padding="lg" rounded="xl">
          <div className="flex flex-col items-center text-center gap-6">
            <SectionLabel className="justify-center">AI Analizi</SectionLabel>
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-[rgba(214,185,140,0.12)] bg-[rgba(20,18,15,0.5)]">
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#D6B98C] border-r-[#3D9B7A] animate-spin" />
              <div className="w-12 h-12 rounded-full bg-[rgba(214,185,140,0.06)]" />
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="font-display text-[clamp(28px,4vw,40px)] font-light text-[#F8F6F2] tracking-[-0.02em]">
                Yüz analizi yapılıyor
              </h1>
              <p className="font-body text-[14px] text-[rgba(248,246,242,0.55)] leading-relaxed">
                Yüz geometrisi ve cilt detayları eş zamanlı analiz ediliyor.
              </p>
            </div>

            <ThinLine width={64} />

            <div className="w-full flex flex-col gap-3">
              {STEPS.map((step, index) => (
                <div
                  key={step}
                  className={`flex items-center gap-3 rounded-[12px] border px-4 py-3 transition-all duration-300 ${
                    stepStatuses[index] === 'active'
                      ? 'border-[rgba(214,185,140,0.25)] bg-[rgba(214,185,140,0.06)]'
                      : stepStatuses[index] === 'done'
                        ? 'border-[rgba(61,155,122,0.2)] bg-[rgba(61,155,122,0.06)]'
                        : stepStatuses[index] === 'error'
                          ? 'border-[rgba(176,96,96,0.25)] bg-[rgba(176,96,96,0.06)]'
                          : 'border-[rgba(214,185,140,0.08)] bg-[rgba(20,18,15,0.4)]'
                  }`}
                >
                  {stepIcons[stepStatuses[index]]}
                  <span className={`font-body text-[13px] ${
                    stepStatuses[index] === 'done'
                      ? 'text-[#3D9B7A]'
                      : stepStatuses[index] === 'error'
                        ? 'text-[#B06060]'
                        : 'text-[rgba(248,246,242,0.55)]'
                  }`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>

            {errorMsg && (
              <p className="font-body text-[12px] text-[#B06060] bg-[rgba(176,96,96,0.06)] rounded-[10px] px-4 py-3 w-full text-left">
                {errorMsg} — Mevcut verilerle devam ediliyor.
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function AnalysisProcessingPage() {
  return (
    <Suspense fallback={
      <div className="theme-dark min-h-screen flex items-center justify-center" style={{ background: '#0E0B09' }}>
        <div className="w-12 h-12 rounded-full border-2 border-transparent border-t-[#D6B98C] animate-spin" />
      </div>
    }>
      <ProcessingContent />
    </Suspense>
  )
}
