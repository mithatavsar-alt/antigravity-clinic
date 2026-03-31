/**
 * Input Quality Gate (Stage 1 of Trust Pipeline)
 *
 * CRITICAL BLOCKER: This module decides whether analysis should proceed at all.
 * It checks for conditions that would produce unreliable results and blocks
 * or degrades analysis accordingly.
 *
 * If verdict is 'block' → DO NOT ANALYZE → Show rejection message.
 * If verdict is 'degrade' → Proceed with elevated thresholds and caveats.
 * If verdict is 'pass' → Full analysis.
 */

import type { Landmark, ImageQualityAssessment } from '../types'
import type {
  QualityGateResult,
  QualityBlocker,
  QualityWarning,
  QualityGateVerdict,
  PipelineConfig,
} from './types'
import { assessImageQuality } from '../image-quality'
import { clamp } from '../utils'

/**
 * Run the quality gate on an image + detection result.
 *
 * This is the FIRST stage of the pipeline. If it returns 'block',
 * no further analysis should be attempted.
 */
export function runQualityGate(
  landmarks: Landmark[],
  confidence: number,
  image: HTMLImageElement | HTMLCanvasElement,
  config: PipelineConfig,
): QualityGateResult {
  const blockers: QualityBlocker[] = []
  const warnings: QualityWarning[] = []

  // ── Run base quality assessment ──
  let rawAssessment: ImageQualityAssessment | null = null
  try {
    rawAssessment = assessImageQuality(landmarks, confidence, image)
  } catch {
    // If assessment itself fails, that's a blocker
    blockers.push('no_face')
  }

  if (!rawAssessment) {
    return {
      verdict: 'block',
      score: 0,
      blockers: ['no_face'],
      warnings: [],
      blockMessage: 'Analiz için görüntü uygun değil. Lütfen yüzünüzün net göründüğü bir fotoğraf ile tekrar deneyin.',
      rawAssessment: null,
    }
  }

  const iq = rawAssessment

  // ── BLOCKERS: Hard failures that prevent analysis ──

  // 1. No face / partial face
  if (landmarks.length < 400) {
    blockers.push('partial_face')
  }

  // 2. Extreme angle (>0.35 deviation)
  if (iq.angleDeviation > 0.35) {
    blockers.push('extreme_angle')
  } else if (iq.angleDeviation > 0.20) {
    warnings.push('moderate_angle')
  }

  // 3. Too dark (brightness < 0.15)
  if (iq.brightness < 0.15) {
    blockers.push('too_dark')
  }

  // 4. Too bright / overexposed (brightness > 0.88)
  if (iq.brightness > 0.88) {
    blockers.push('too_bright')
  }

  // 5. Heavy blur (sharpness < 0.08)
  if (iq.sharpness < 0.08) {
    blockers.push('too_blurry')
  } else if (iq.sharpness < 0.18) {
    warnings.push('mild_blur')
  }

  // 6. Resolution too low (< 320px min dimension)
  if (iq.resolution < 0.3) {
    blockers.push('too_low_resolution')
  }

  // 7. Heavy beauty filter detected
  // Very low sharpness + low contrast + normal brightness = smoothing
  if (iq.sharpness < 0.06 && iq.contrast < 0.30 && iq.brightness > 0.30) {
    blockers.push('heavy_filter')
  } else if (iq.flags.includes('smoothing_detected')) {
    warnings.push('mild_filter')
  }

  // ── WARNINGS: Non-fatal quality issues ──

  if (iq.contrast < 0.25 && !blockers.includes('too_dark')) {
    warnings.push('low_contrast')
  }

  // Uneven lighting: check if the image quality flags suggest it
  // (We detect this via the combination of normal brightness but flags)
  if (iq.brightness >= 0.15 && iq.brightness <= 0.88 && iq.contrast < 0.30) {
    warnings.push('uneven_lighting')
  }

  // ── VERDICT ──
  let verdict: QualityGateVerdict

  if (blockers.length > 0) {
    verdict = 'block'
  } else if (warnings.length >= 3 || iq.overallScore < config.minQualityScore) {
    verdict = 'degrade'
  } else {
    verdict = 'pass'
  }

  // ── Messages ──
  const blockMessage = verdict === 'block'
    ? buildBlockMessage(blockers)
    : undefined

  const degradeMessage = verdict === 'degrade'
    ? buildDegradeMessage(warnings)
    : undefined

  return {
    verdict,
    score: iq.overallScore,
    blockers,
    warnings,
    blockMessage,
    degradeMessage,
    rawAssessment: iq,
  }
}

// ─── Expression Detection ──────────────────────────────────

/**
 * Detect if eyebrows are raised (forehead distortion).
 * Uses brow-to-eye distance ratio as indicator.
 *
 * Returns 0–1 where >0.6 indicates significant brow raise.
 */
export function detectBrowRaise(landmarks: Landmark[]): number {
  if (landmarks.length < 468) return 0

  // Left brow outer (46) to left eye top (159)
  const leftBrowY = landmarks[46]?.y ?? 0
  const leftEyeTopY = landmarks[159]?.y ?? 0

  // Right brow outer (276) to right eye top (386)
  const rightBrowY = landmarks[276]?.y ?? 0
  const rightEyeTopY = landmarks[386]?.y ?? 0

  // Forehead top (10) to chin (152) for normalization
  const foreheadY = landmarks[10]?.y ?? 0
  const chinY = landmarks[152]?.y ?? 1

  const faceHeight = Math.abs(chinY - foreheadY)
  if (faceHeight < 0.01) return 0

  // Brow-to-eye gap as ratio of face height
  const leftGap = Math.abs(leftEyeTopY - leftBrowY) / faceHeight
  const rightGap = Math.abs(rightEyeTopY - rightBrowY) / faceHeight

  const avgGap = (leftGap + rightGap) / 2

  // Normal brow-eye gap is ~0.04-0.06 of face height
  // Raised brows push this to ~0.08+
  return clamp((avgGap - 0.04) / 0.06, 0, 1)
}

/**
 * Detect mouth opening (expression that affects nasolabial).
 * Returns 0–1 where >0.5 indicates significant mouth opening.
 */
export function detectMouthOpen(landmarks: Landmark[]): number {
  if (landmarks.length < 468) return 0

  const upperLip = landmarks[13]?.y ?? 0  // Upper lip center
  const lowerLip = landmarks[14]?.y ?? 0  // Lower lip center
  const foreheadY = landmarks[10]?.y ?? 0
  const chinY = landmarks[152]?.y ?? 1

  const faceHeight = Math.abs(chinY - foreheadY)
  if (faceHeight < 0.01) return 0

  const mouthGap = Math.abs(lowerLip - upperLip) / faceHeight

  // Normal closed mouth: ~0.02-0.03 of face height
  // Open mouth: ~0.06+
  return clamp((mouthGap - 0.025) / 0.05, 0, 1)
}

// ─── Message builders ──────────────────────────────────────

function buildBlockMessage(blockers: QualityBlocker[]): string {
  const reasons: string[] = []

  for (const b of blockers) {
    switch (b) {
      case 'no_face':
        reasons.push('yüz tespit edilemedi')
        break
      case 'partial_face':
        reasons.push('yüz tam olarak görüntülenemedi')
        break
      case 'extreme_angle':
        reasons.push('yüz açısı çok yüksek — lütfen kameraya doğrudan bakın')
        break
      case 'too_dark':
        reasons.push('görüntü çok karanlık')
        break
      case 'too_bright':
        reasons.push('görüntü aşırı parlak')
        break
      case 'too_blurry':
        reasons.push('görüntü çok bulanık')
        break
      case 'too_low_resolution':
        reasons.push('görüntü çözünürlüğü çok düşük')
        break
      case 'heavy_filter':
        reasons.push('güzellik filtresi tespit edildi — filtresiz fotoğraf gereklidir')
        break
    }
  }

  if (reasons.length === 0) {
    return 'Analiz için görüntü uygun değil. Lütfen tekrar deneyin.'
  }

  return `Analiz yapılamadı: ${reasons.join(', ')}. Lütfen dengeli ışıkta, filtresiz ve doğrudan kameraya bakarak tekrar deneyin.`
}

function buildDegradeMessage(warnings: QualityWarning[]): string {
  const parts: string[] = []

  for (const w of warnings) {
    switch (w) {
      case 'moderate_angle':
        parts.push('hafif açı sapması')
        break
      case 'low_contrast':
        parts.push('düşük kontrast')
        break
      case 'mild_blur':
        parts.push('hafif bulanıklık')
        break
      case 'mild_filter':
        parts.push('olası görüntü düzeltme')
        break
      case 'uneven_lighting':
        parts.push('dengesiz aydınlatma')
        break
    }
  }

  if (parts.length === 0) {
    return 'Bu değerlendirme sınırlı görüntü kalitesi ile oluşturulmuştur — sonuçlar referans niteliğindedir.'
  }

  return `Görüntüde ${parts.join(', ')} tespit edildi — bu değerlendirme sınırlı veri içerir. Uzman değerlendirmesi önerilir.`
}
