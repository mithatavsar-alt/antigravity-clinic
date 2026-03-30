/**
 * Image Quality Assessment
 *
 * Evaluates capture quality to gate analysis confidence.
 * Poor-quality images get lower confidence, softer wording,
 * and degraded severity claims — never false certainty.
 */

import type { Landmark, ImageQualityAssessment, QualityFlag } from './types'
import { clamp } from './utils'

/**
 * Assess image quality from landmarks, image dimensions, and pixel data.
 *
 * @param landmarks Normalized 0–1 FaceMesh landmarks
 * @param confidence Detection confidence 0–1
 * @param image Source image element (for pixel analysis)
 */
export function assessImageQuality(
  landmarks: Landmark[],
  confidence: number,
  image: HTMLImageElement | HTMLCanvasElement,
): ImageQualityAssessment {
  const flags: QualityFlag[] = []

  const imgW = image instanceof HTMLImageElement
    ? (image.naturalWidth || image.width)
    : image.width
  const imgH = image instanceof HTMLImageElement
    ? (image.naturalHeight || image.height)
    : image.height

  // ── Resolution ──
  const minDim = Math.min(imgW, imgH)
  const resolution = clamp(minDim / 720, 0, 1)
  if (resolution < 0.4) flags.push('low_resolution')

  // ── Landmark completeness ──
  const detectionConfidence = confidence
  if (landmarks.length < 400) flags.push('partial_face')

  // ── Pixel analysis (brightness, contrast, sharpness) ──
  const canvas = document.createElement('canvas')
  // Downsample for performance — 200px wide is enough for quality stats
  const scale = Math.min(1, 200 / imgW)
  const sw = Math.round(imgW * scale)
  const sh = Math.round(imgH * scale)
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  let brightness = 0.5
  let contrast = 0.5
  let sharpness = 0.5

  if (ctx) {
    ctx.drawImage(image, 0, 0, sw, sh)
    const imageData = ctx.getImageData(0, 0, sw, sh)
    const px = imageData.data
    const total = sw * sh

    // Grayscale luminance
    const lum = new Float32Array(total)
    let lumSum = 0
    for (let i = 0; i < total; i++) {
      const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
      lum[i] = l
      lumSum += l
    }
    const meanLum = lumSum / total
    brightness = clamp(meanLum / 255, 0, 1)

    // Contrast: std dev of luminance
    let lumVar = 0
    for (let i = 0; i < total; i++) {
      const d = lum[i] - meanLum
      lumVar += d * d
    }
    const lumStd = Math.sqrt(lumVar / total)
    contrast = clamp(lumStd / 64, 0, 1) // 64 stddev = full contrast

    // Sharpness: Laplacian variance (simplified)
    let lapSum = 0
    let lapCount = 0
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = y * sw + x
        const lap = -4 * lum[idx]
          + lum[idx - 1] + lum[idx + 1]
          + lum[idx - sw] + lum[idx + sw]
        lapSum += lap * lap
        lapCount++
      }
    }
    const lapVar = lapCount > 0 ? lapSum / lapCount : 0
    sharpness = clamp(lapVar / 800, 0, 1) // 800 = very sharp

    if (brightness < 0.2) flags.push('low_light')
    if (brightness > 0.85) flags.push('overexposed')
    if (sharpness < 0.15) flags.push('blurry')
  }

  // ── Face angle deviation ──
  const angleDeviation = estimateAngleDeviation(landmarks)
  if (angleDeviation > 0.25) flags.push('strong_angle')

  // ── Overall score ──
  // Weighted combination of all quality factors
  const overallScore = clamp(Math.round(
    detectionConfidence * 25 +
    resolution * 20 +
    brightness * 10 + // Penalize extremes via flags, not raw score
    contrast * 15 +
    sharpness * 15 +
    (1 - angleDeviation) * 15
  ), 0, 100)

  const sufficient = overallScore >= 35 && flags.length <= 2 && !flags.includes('partial_face')

  return {
    overallScore,
    sufficient,
    flags,
    brightness,
    contrast,
    sharpness,
    resolution,
    angleDeviation,
    detectionConfidence,
  }
}

/**
 * Estimate how far the face is from frontal view.
 * Returns 0 (perfect frontal) to 1 (extreme angle).
 */
function estimateAngleDeviation(landmarks: Landmark[]): number {
  if (landmarks.length < 468) return 0.5

  // Use nose tip (4) and face contour midpoints
  const noseTip = landmarks[4]
  const leftContour = landmarks[234]  // left face edge
  const rightContour = landmarks[454] // right face edge

  if (!noseTip || !leftContour || !rightContour) return 0.3

  const faceCenterX = (leftContour.x + rightContour.x) / 2
  const faceWidth = Math.abs(rightContour.x - leftContour.x)

  if (faceWidth < 0.01) return 0.5

  // How far nose deviates from geometric center — indicates yaw
  const xDeviation = Math.abs(noseTip.x - faceCenterX) / faceWidth

  // Vertical: use forehead (10) and chin (152) to detect pitch
  const forehead = landmarks[10]
  const chin = landmarks[152]
  if (!forehead || !chin) return clamp(xDeviation * 2, 0, 1)

  const faceHeight = Math.abs(chin.y - forehead.y)
  const noseMidY = (forehead.y + chin.y) / 2
  const yDeviation = faceHeight > 0.01
    ? Math.abs(noseTip.y - noseMidY) / faceHeight
    : 0

  return clamp((xDeviation + yDeviation) * 1.5, 0, 1)
}

/**
 * Generate quality caveat text in Turkish based on flags.
 * Returns null if quality is acceptable.
 */
export function getQualityCaveat(quality: ImageQualityAssessment): string | null {
  if (quality.sufficient && quality.flags.length === 0) return null

  const parts: string[] = []

  if (quality.flags.includes('low_light')) {
    parts.push('düşük aydınlatma')
  }
  if (quality.flags.includes('overexposed')) {
    parts.push('aşırı parlak görüntü')
  }
  if (quality.flags.includes('blurry')) {
    parts.push('bulanık görüntü')
  }
  if (quality.flags.includes('low_resolution')) {
    parts.push('düşük çözünürlük')
  }
  if (quality.flags.includes('strong_angle')) {
    parts.push('güçlü açı sapması')
  }

  if (parts.length === 0 && !quality.sufficient) {
    return 'Bu değerlendirme mevcut görüntü kalitesine göre yaklaşık olarak oluşturulmuştur.'
  }

  if (parts.length > 0) {
    return `Görüntüde ${parts.join(', ')} tespit edildi — sonuçlar referans niteliğindedir. Daha net sonuç için dengeli ışıkta tekrar analiz önerilir.`
  }

  return null
}
