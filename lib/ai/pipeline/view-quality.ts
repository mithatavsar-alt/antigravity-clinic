/**
 * Per-View Quality Scoring
 *
 * Computes a ViewQualityProfile for each captured image.
 * This replaces the ad-hoc quality checks scattered across the pipeline
 * with a unified, per-view quality assessment.
 *
 * Quality bands:
 * - high (≥0.75): Full trust in analysis from this view
 * - usable (≥0.50): Proceed with moderate confidence penalties
 * - weak (≥0.25): Analysis runs but all findings get low confidence
 * - reject (<0.25): View is too poor to contribute — findings suppressed
 */

import type { Landmark, ImageQualityAssessment } from '../types'
import type { CaptureView, ViewQualityProfile, ROILocalQualitySummary } from './types'
import { assessImageQuality, assessROIQuality } from '../image-quality'
import { clamp } from '../utils'

/** Quality band thresholds */
const BAND_HIGH = 0.75
const BAND_USABLE = 0.50
const BAND_WEAK = 0.25

function toBand(score: number): ViewQualityProfile['band'] {
  if (score >= BAND_HIGH) return 'high'
  if (score >= BAND_USABLE) return 'usable'
  if (score >= BAND_WEAK) return 'weak'
  return 'reject'
}

/**
 * Assess quality of a single captured view.
 *
 * @param view - Which view this is (front, left, right)
 * @param landmarks - Detected landmarks for this view
 * @param confidence - Detection confidence 0–1
 * @param image - The captured image element
 * @param captureQuality - Optional capture-time quality score 0–1 (from face-guide)
 * @param temporalRegionStability - Optional per-region temporal stability from aggregation
 */
export function assessViewQuality(
  view: CaptureView,
  landmarks: Landmark[],
  confidence: number,
  image: HTMLImageElement | HTMLCanvasElement,
  captureQuality?: number,
  temporalRegionStability?: Record<string, number>,
): ViewQualityProfile {
  // Run image quality assessment
  let iq: ImageQualityAssessment | null = null
  try {
    iq = assessImageQuality(landmarks, confidence, image)
  } catch {
    return {
      view,
      quality: 0,
      band: 'reject',
      usable: false,
      factors: { framing: 0, sharpness: 0, exposure: 0, posefit: 0, landmarkConf: 0, stability: 0 },
      rejectReason: 'Görüntü kalitesi değerlendirilemedi',
    }
  }

  if (!iq || landmarks.length < 200) {
    return {
      view,
      quality: 0,
      band: 'reject',
      usable: false,
      factors: { framing: 0, sharpness: 0, exposure: 0, posefit: 0, landmarkConf: 0, stability: 0 },
      rejectReason: landmarks.length < 200 ? 'Yetersiz yüz algılama' : 'Kalite değerlendirmesi başarısız',
    }
  }

  // Compute ROI-local quality for this view
  let roiQualities: ROILocalQualitySummary[] | undefined
  try {
    const roiMap = assessROIQuality(landmarks, image)
    roiQualities = roiMap.regions.map(r => ({
      region: r.region,
      sharpness: r.sharpness,
      exposure: r.exposure,
      completeness: r.completeness,
      measurable: r.measurable,
    }))
  } catch {
    // Non-fatal: ROI quality is supplementary
  }

  // ── Compute individual factors ──

  // Framing: face centering + appropriate size
  // Use angleDeviation as proxy for centering (lower = better centered)
  const framing = clamp(1 - iq.angleDeviation * 1.5, 0, 1) * 0.6 +
    clamp(iq.resolution, 0, 1) * 0.4

  // Sharpness
  const sharpness = clamp(iq.sharpness, 0, 1)

  // Exposure: combine brightness and contrast
  const brightOk = iq.brightness >= 0.20 && iq.brightness <= 0.85
  const exposure = brightOk
    ? clamp(iq.contrast * 2, 0, 1) * 0.6 + 0.4
    : clamp(1 - Math.abs(iq.brightness - 0.5) * 3, 0, 1) * 0.5

  // Pose fit: how well the detected pose matches the expected view
  const posefit = computePoseFit(view, landmarks, iq.angleDeviation)

  // Landmark confidence
  const landmarkConf = clamp(confidence, 0, 1)

  // Stability: use capture-time quality if available.
  // Without capture metadata we cannot know if the frame was stable — assume weak.
  // This prevents inflating view quality for images without live-capture data.
  const stability = captureQuality != null ? clamp(captureQuality, 0, 1) : 0.10

  // ── Weighted composite ──
  // Weights differ by view type: side views weight posefit more heavily
  const isSide = view !== 'front'
  const weights = isSide
    ? { framing: 0.15, sharpness: 0.20, exposure: 0.15, posefit: 0.25, landmarkConf: 0.15, stability: 0.10 }
    : { framing: 0.20, sharpness: 0.20, exposure: 0.15, posefit: 0.15, landmarkConf: 0.20, stability: 0.10 }

  const quality = clamp(
    framing * weights.framing +
    sharpness * weights.sharpness +
    exposure * weights.exposure +
    posefit * weights.posefit +
    landmarkConf * weights.landmarkConf +
    stability * weights.stability,
    0, 1,
  )

  const band = toBand(quality)
  const usable = band !== 'reject'

  // Build rejection reason
  let rejectReason: string | undefined
  if (!usable) {
    const issues: string[] = []
    if (sharpness < 0.15) issues.push('bulanık görüntü')
    if (!brightOk) issues.push(iq.brightness < 0.20 ? 'karanlık' : 'aşırı parlak')
    if (posefit < 0.3) issues.push('uygun olmayan poz')
    if (landmarkConf < 0.3) issues.push('düşük algılama')
    rejectReason = issues.length > 0 ? issues.join(', ') : 'düşük genel kalite'
  }

  return {
    view,
    quality,
    band,
    usable,
    factors: { framing, sharpness, exposure, posefit, landmarkConf, stability },
    roiQualities,
    temporalRegionStability,
    rejectReason,
  }
}

/**
 * Compute pose fitness: how well the actual head pose matches the expected view.
 *
 * Front view: expect low yaw deviation
 * Left view: expect nose offset < 0 (head turned right, showing left cheek)
 * Right view: expect nose offset > 0 (head turned left, showing right cheek)
 */
function computePoseFit(
  expectedView: CaptureView,
  landmarks: Landmark[],
  angleDeviation: number,
): number {
  if (landmarks.length < 468) return 0.3

  // Estimate yaw from nose offset
  const noseTip = landmarks[4]
  const noseBridge = landmarks[6]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]

  if (!noseTip || !noseBridge || !leftCheek || !rightCheek) return 0.3

  const faceWidth = Math.abs(rightCheek.x - leftCheek.x) || 0.01
  const noseOffset = (noseTip.x - noseBridge.x) / faceWidth

  if (expectedView === 'front') {
    // Front: want low yaw (|noseOffset| < 0.08 ideal)
    const yawFit = clamp(1 - Math.abs(noseOffset) * 8, 0, 1)
    const angleFit = clamp(1 - angleDeviation * 3, 0, 1)
    return yawFit * 0.6 + angleFit * 0.4
  }

  if (expectedView === 'left') {
    // Left view: nose should be offset negative (showing left cheek)
    // Ideal range: -0.15 to -0.35
    if (noseOffset > 0) return 0.1 // Wrong direction
    const absOffset = Math.abs(noseOffset)
    if (absOffset < 0.08) return 0.3 // Too frontal
    if (absOffset > 0.50) return 0.3 // Too extreme
    return clamp(1 - Math.abs(absOffset - 0.25) * 5, 0.3, 1)
  }

  // Right view: nose should be offset positive
  if (noseOffset < 0) return 0.1
  const absOffset = Math.abs(noseOffset)
  if (absOffset < 0.08) return 0.3
  if (absOffset > 0.50) return 0.3
  return clamp(1 - Math.abs(absOffset - 0.25) * 5, 0.3, 1)
}

/**
 * Build quality profiles for all captured views.
 * Convenience function for the pipeline orchestrator.
 */
export function assessAllViewQualities(
  views: { view: CaptureView; landmarks: Landmark[]; confidence: number; image: HTMLImageElement | HTMLCanvasElement; captureQuality?: number; temporalRegionStability?: Record<string, number> }[],
): ViewQualityProfile[] {
  return views.map(v => assessViewQuality(v.view, v.landmarks, v.confidence, v.image, v.captureQuality, v.temporalRegionStability))
}
