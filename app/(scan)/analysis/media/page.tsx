'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useClinicStore } from '@/lib/store'
import { FaceGuideCapture, type CaptureMetadata, type MultiCaptureResult } from '@/components/analysis/FaceGuideCapture'

export default function AnalysisMediaPage() {
  const router = useRouter()
  const { currentLead, setCurrentLead } = useClinicStore()
  const navigatingRef = useRef(false)

  // Step guard: must have completed step 1 (personal info)
  useEffect(() => {
    if (!currentLead?.full_name) {
      router.replace('/analysis')
      return
    }

    // Workflow: entering capture phase.
    const { scanWorkflow, transitionWorkflow, resetWorkflow } = useClinicStore.getState()
    if (scanWorkflow.phase === 'result') {
      transitionWorkflow('start_recapture')
      transitionWorkflow('start_capture')
    } else if (scanWorkflow.phase !== 'capture') {
      resetWorkflow()
      transitionWorkflow('start_capture')
    }
  }, [currentLead, router])

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
