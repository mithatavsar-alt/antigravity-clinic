/**
 * Image Quality Assessment
 *
 * Evaluates capture quality to gate analysis confidence.
 * Poor-quality images get lower confidence, softer wording,
 * and degraded severity claims — never false certainty.
 */

import type { Landmark, ImageQualityAssessment, QualityFlag } from './types'
import type { ReliabilityRegion } from './pipeline/types'
import { clamp } from './utils'

// ─── ROI-local quality types ───────────────────────────────

export interface ROILocalQuality {
  /** Which reliability region this measurement covers */
  region: ReliabilityRegion
  /** Local sharpness 0–1 (Laplacian variance within the ROI) */
  sharpness: number
  /** Local brightness 0–1 (mean luminance within the ROI) */
  brightness: number
  /** Local contrast 0–1 (luminance std dev within the ROI) */
  contrast: number
  /** Local exposure quality 0–1 (penalizes under/overexposure) */
  exposure: number
  /** ROI completeness 0–1 (fraction of expected landmark points visible) */
  completeness: number
  /** Whether the ROI had enough pixels to measure reliably */
  measurable: boolean
}

export interface ROIQualityMap {
  /** Per-region local quality measurements */
  regions: ROILocalQuality[]
  /** Lookup helper */
  get(region: ReliabilityRegion): ROILocalQuality | undefined
}

// ─── Landmark index sets per reliability region ────────────
// These map each ReliabilityRegion to the landmark indices that define
// its ROI bounding box. Shared with roi-extraction.ts where possible.

const ROI_LANDMARK_INDICES: Partial<Record<ReliabilityRegion, number[]>> = {
  forehead: [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109],
  glabella: [70, 63, 105, 66, 107, 9, 336, 296, 334, 293, 300],
  periocular_left: [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25],
  periocular_right: [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255],
  under_eye_left: [33, 7, 163, 144, 145, 153, 154, 155, 133],
  under_eye_right: [362, 382, 381, 380, 374, 373, 390, 249, 263],
  cheek_left: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148],
  cheek_right: [454, 323, 361, 288, 397, 365, 379, 378, 400, 377],
  nasolabial_left: [92, 165, 167, 164, 2, 98, 240, 64],
  nasolabial_right: [206, 205, 36, 142, 126, 217, 174, 327],
  lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  chin: [152, 148, 176, 149, 150, 136, 172, 58],
  jawline_left: [234, 127, 162, 21, 54, 103, 67, 109],
  jawline_right: [356, 454, 323, 361, 288, 397, 365, 379],
  profile_left: [234, 127, 162, 21],
  profile_right: [454, 356, 389, 251],
}

// Minimum ROI pixel area to consider measurable
const MIN_ROI_PIXELS = 400 // 20×20

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

    // Smoothing detection: high brightness + very low sharpness + low contrast
    // indicates beautify filter. Also check Laplacian variance directly.
    if (sharpness < 0.08 && contrast < 0.35 && brightness > 0.35) {
      flags.push('smoothing_detected')
    }
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

// ─── ROI-local quality assessment ──────────────────────────

/**
 * Compute ROI bounding box from landmark indices.
 * Returns pixel coordinates [x, y, w, h] in the image.
 */
function computeROIBounds(
  landmarks: Landmark[],
  indices: number[],
  imgW: number,
  imgH: number,
  padding = 0.15,
): { sx: number; sy: number; sw: number; sh: number; completeness: number } | null {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  let found = 0
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    if (lm.x < minX) minX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.x > maxX) maxX = lm.x
    if (lm.y > maxY) maxY = lm.y
    found++
  }
  if (found < 3) return null

  const completeness = found / indices.length
  const w = maxX - minX
  const h = maxY - minY
  const padX = w * padding
  const padY = h * padding

  const x0 = Math.max(0, minX - padX)
  const y0 = Math.max(0, minY - padY)
  const x1 = Math.min(1, maxX + padX)
  const y1 = Math.min(1, maxY + padY)

  return {
    sx: Math.round(x0 * imgW),
    sy: Math.round(y0 * imgH),
    sw: Math.max(1, Math.round((x1 - x0) * imgW)),
    sh: Math.max(1, Math.round((y1 - y0) * imgH)),
    completeness,
  }
}

/**
 * Measure sharpness, brightness, contrast within a pixel region.
 */
function measureLocalQuality(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { sharpness: number; brightness: number; contrast: number } {
  const total = width * height
  if (total < 4) return { sharpness: 0, brightness: 0, contrast: 0 }

  // Convert to grayscale luminance
  const lum = new Float32Array(total)
  let lumSum = 0
  for (let i = 0; i < total; i++) {
    const l = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]
    lum[i] = l
    lumSum += l
  }
  const meanLum = lumSum / total
  const brightness = clamp(meanLum / 255, 0, 1)

  // Contrast: std dev
  let lumVar = 0
  for (let i = 0; i < total; i++) {
    const d = lum[i] - meanLum
    lumVar += d * d
  }
  const contrast = clamp(Math.sqrt(lumVar / total) / 64, 0, 1)

  // Sharpness: Laplacian variance
  let lapSum = 0
  let lapCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const lap = -4 * lum[idx] + lum[idx - 1] + lum[idx + 1] + lum[idx - width] + lum[idx + width]
      lapSum += lap * lap
      lapCount++
    }
  }
  const sharpness = lapCount > 0 ? clamp((lapSum / lapCount) / 800, 0, 1) : 0

  return { sharpness, brightness, contrast }
}

/**
 * Compute exposure quality from local brightness.
 * Penalizes under-exposure (< 0.20) and over-exposure (> 0.85).
 */
function computeExposureQuality(brightness: number, contrast: number): number {
  const brightOk = brightness >= 0.20 && brightness <= 0.85
  if (brightOk) {
    return clamp(contrast * 1.5 + 0.4, 0, 1)
  }
  // Penalize extremes
  return clamp(1 - Math.abs(brightness - 0.5) * 3, 0, 1) * 0.6
}

/**
 * Assess quality within each facial region (ROI-local).
 *
 * This extracts local sharpness, brightness, contrast, and exposure
 * for each reliability region defined by landmark bounding boxes.
 * Used to compute evidence-based per-region confidence.
 */
export function assessROIQuality(
  landmarks: Landmark[],
  image: HTMLImageElement | HTMLCanvasElement,
): ROIQualityMap {
  const imgW = image instanceof HTMLImageElement
    ? (image.naturalWidth || image.width)
    : image.width
  const imgH = image instanceof HTMLImageElement
    ? (image.naturalHeight || image.height)
    : image.height

  // Draw image to canvas once for pixel access
  const canvas = document.createElement('canvas')
  canvas.width = imgW
  canvas.height = imgH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const regions: ROILocalQuality[] = []

  const entries = Object.entries(ROI_LANDMARK_INDICES) as [ReliabilityRegion, number[]][]

  for (const [region, indices] of entries) {
    const bounds = computeROIBounds(landmarks, indices, imgW, imgH)
    if (!bounds || !ctx) {
      regions.push({
        region,
        sharpness: 0,
        brightness: 0,
        contrast: 0,
        exposure: 0,
        completeness: bounds?.completeness ?? 0,
        measurable: false,
      })
      continue
    }

    const pixelArea = bounds.sw * bounds.sh
    if (pixelArea < MIN_ROI_PIXELS) {
      regions.push({
        region,
        sharpness: 0,
        brightness: 0,
        contrast: 0,
        exposure: 0,
        completeness: bounds.completeness,
        measurable: false,
      })
      continue
    }

    // Extract pixels for this ROI
    ctx.drawImage(image, 0, 0, imgW, imgH)
    const roiData = ctx.getImageData(bounds.sx, bounds.sy, bounds.sw, bounds.sh)
    const local = measureLocalQuality(roiData.data, bounds.sw, bounds.sh)
    const exposure = computeExposureQuality(local.brightness, local.contrast)

    regions.push({
      region,
      sharpness: local.sharpness,
      brightness: local.brightness,
      contrast: local.contrast,
      exposure,
      completeness: bounds.completeness,
      measurable: true,
    })
  }

  return {
    regions,
    get(r: ReliabilityRegion) {
      return regions.find(q => q.region === r)
    },
  }
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
