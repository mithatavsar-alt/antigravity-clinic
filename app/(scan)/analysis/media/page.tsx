'use client'

import { Suspense, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { FaceGuideCapture, type CaptureMetadata, type MultiCaptureResult } from '@/components/analysis/FaceGuideCapture'

export default function AnalysisMediaPage() {
  return (
    <Suspense fallback={null}>
      <MediaContent />
    </Suspense>
  )
}

function MediaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const recaptureId = searchParams.get('id')
  const { currentLead, setCurrentLead, leads } = useClinicStore()
  const navigatingRef = useRef(false)

  // Recapture: if arriving with ?id=, restore the lead into currentLead
  // so the capture flow resumes without restarting the wizard.
  useEffect(() => {
    if (recaptureId && !currentLead?.full_name) {
      const existingLead = leads.find((l) => l.id === recaptureId)
      if (existingLead) {
        setCurrentLead({
          id: existingLead.id,
          full_name: existingLead.full_name,
          age_range: existingLead.age_range,
          gender: existingLead.gender,
          phone: existingLead.phone,
          concern_area: existingLead.concern_area,
        })
      }
    }
  }, [recaptureId, currentLead?.full_name, leads, setCurrentLead])

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      // If recaptureId exists, wait for the restore effect above
      if (recaptureId) return
      router.replace('/analysis')
      return
    }

    // Workflow: entering capture phase.
    const { scanWorkflow, transitionWorkflow, resetWorkflow } = useClinicStore.getState()
    if (scanWorkflow.phase === 'result' || scanWorkflow.phase === 'recapture') {
      transitionWorkflow('start_recapture')
      transitionWorkflow('start_capture')
    } else if (scanWorkflow.phase !== 'capture') {
      resetWorkflow()
      transitionWorkflow('start_capture')
    }
  }, [currentLead, router, recaptureId])

  const handleMultiCapture = useCallback((photos: MultiCaptureResult, meta?: CaptureMetadata) => {
    if (navigatingRef.current) return
    navigatingRef.current = true

    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: photos.front,
      captured_frames: meta?.capturedFrames,
      doctor_frontal_photos: [photos.front, photos.left, photos.right],
      doctor_mimic_photos: [],
      capture_confidence: confidence,
      capture_quality_score: meta?.captureQualityScore,
      recapture_recommended: meta?.recaptureRecommended,
      recapture_views: meta?.recaptureViews,
      capture_manifest: meta?.captureManifest,
      liveness_status: meta?.livenessStatus,
      liveness_confidence: meta?.livenessConfidence,
      liveness_required: meta?.livenessRequired,
      liveness_passed: meta?.livenessPassed,
      liveness_signals: meta?.livenessSignals,
    })

    // Navigate to consent page — user must confirm KVKK checkboxes before proceeding
    router.push('/analysis/consent')
  }, [setCurrentLead, router])

  // Single-capture fallback: same flow — save metadata, go to consent
  const handleCapture = useCallback((dataUrl: string, meta?: CaptureMetadata) => {
    if (navigatingRef.current) return
    navigatingRef.current = true

    const confidence = meta?.confidence ?? 'high'

    setCurrentLead({
      patient_photo_url: dataUrl,
      captured_frames: meta?.capturedFrames,
      doctor_frontal_photos: [dataUrl],
      capture_confidence: confidence,
      capture_quality_score: meta?.captureQualityScore,
      recapture_recommended: meta?.recaptureRecommended,
      recapture_views: meta?.recaptureViews,
      capture_manifest: meta?.captureManifest,
      liveness_status: meta?.livenessStatus,
      liveness_confidence: meta?.livenessConfidence,
      liveness_required: meta?.livenessRequired,
      liveness_passed: meta?.livenessPassed,
      liveness_signals: meta?.livenessSignals,
    })

    router.push('/analysis/consent')
  }, [setCurrentLead, router])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  if (!currentLead?.full_name) return null

  return (
    <div
      className="theme-dark fixed inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0E0B09 0%, #14110E 40%, #0B0E10 100%)' }}
    >
      <FaceGuideCapture
        mode="multi"
        onCapture={handleCapture}
        onMultiCapture={handleMultiCapture}
        onClose={handleBack}
      />
    </div>
  )
}
