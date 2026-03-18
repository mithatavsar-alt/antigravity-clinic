/**
 * Wrinkle / Skin-Line Analysis
 *
 * Extracts facial regions using FaceMesh landmark coordinates,
 * converts to grayscale, applies Sobel edge detection, and
 * computes wrinkle density scores.
 *
 * All outputs are presented as "ön değerlendirme" — never diagnosis.
 * This module does NOT use external APIs.
 */

import type { Landmark, WrinkleRegion, WrinkleLevel, WrinkleRegionResult, WrinkleAnalysisResult } from './types'
import { clamp } from './utils'

// ─── Landmark indices (MediaPipe 468 compatible) ────────────

const REGIONS: Record<WrinkleRegion, {
  label: string
  /** Landmark indices defining a polygon for the region */
  landmarks: number[]
  /** Weight in overall score */
  weight: number
}> = {
  forehead: {
    label: 'Alın Çizgileri',
    // Forehead polygon: top center → left brow → right brow
    landmarks: [10, 67, 109, 108, 107, 55, 8, 285, 336, 337, 338, 297],
    weight: 0.35,
  },
  glabella: {
    label: 'Kaş Arası (Glabella)',
    // Glabella: between inner brows
    landmarks: [107, 9, 336, 296, 334, 293, 283, 282, 295, 55, 65, 52, 53, 66],
    weight: 0.25,
  },
  crow_feet_left: {
    label: 'Sol Göz Kenarı',
    // Left crow's feet: outer eye area
    landmarks: [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25],
    weight: 0.20,
  },
  crow_feet_right: {
    label: 'Sağ Göz Kenarı',
    // Right crow's feet: outer eye area (mirror of left)
    landmarks: [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255],
    weight: 0.20,
  },
}

// ─── Boost mode: zoom crop + contrast + edge enhancement ────

/** Upscale factor for boost-mode regions (forehead) */
const BOOST_SCALE = 2

/**
 * Apply CLAHE-like contrast enhancement on grayscale data.
 * Stretches the histogram to use full 0–255 range with slight edge boost.
 */
function enhanceContrast(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const total = width * height
  if (total === 0) return gray

  // Find min/max for histogram stretching
  let min = 255, max = 0
  for (let i = 0; i < total; i++) {
    if (gray[i] < min) min = gray[i]
    if (gray[i] > max) max = gray[i]
  }

  const range = max - min
  if (range < 10) return gray // flat image, nothing to enhance

  // Contrast stretch + slight gamma boost for edge visibility
  const enhanced = new Uint8ClampedArray(total)
  const gamma = 0.85 // < 1 = brighter midtones, better wrinkle visibility
  for (let i = 0; i < total; i++) {
    const normalized = (gray[i] - min) / range // 0–1
    const boosted = Math.pow(normalized, gamma)
    enhanced[i] = Math.round(boosted * 255)
  }

  return enhanced
}

/**
 * Apply unsharp-mask sharpening on grayscale data.
 * Enhances fine edge details (wrinkle lines).
 */
function unsharpMask(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 1.5,
): Uint8ClampedArray {
  const total = width * height
  const blurred = new Float32Array(total)

  // Simple 3x3 box blur
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += gray[(y + dy) * width + (x + dx)]
        }
      }
      blurred[y * width + x] = sum / 9
    }
  }

  // Unsharp: original + amount * (original - blurred)
  const sharpened = new Uint8ClampedArray(total)
  for (let i = 0; i < total; i++) {
    const val = gray[i] + amount * (gray[i] - blurred[i])
    sharpened[i] = Math.max(0, Math.min(255, Math.round(val)))
  }

  return sharpened
}

// ─── Image processing helpers ───────────────────────────────

/**
 * Extract a rectangular region from the source image using landmark polygon bounds.
 * Returns grayscale pixel data for the region.
 * When boost=true, upscales the region and applies contrast + edge enhancement.
 */
function extractRegionGrayscale(
  sourceCanvas: HTMLCanvasElement,
  landmarks: Landmark[],
  regionIndices: number[],
  imgWidth: number,
  imgHeight: number,
  boost = false,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  // Get bounding box from polygon landmarks
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of regionIndices) {
    const lm = landmarks[idx]
    if (!lm) continue
    const px = lm.x * imgWidth
    const py = lm.y * imgHeight
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }

  // Add padding (larger for boost mode)
  const pad = boost ? 8 : 2
  minX = Math.max(0, Math.floor(minX) - pad)
  minY = Math.max(0, Math.floor(minY) - pad)
  maxX = Math.min(imgWidth, Math.ceil(maxX) + pad)
  maxY = Math.min(imgHeight, Math.ceil(maxY) + pad)

  const rw = maxX - minX
  const rh = maxY - minY
  if (rw < 10 || rh < 10) return null

  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // For boost mode, use a separate canvas to upscale the crop
  if (boost) {
    const boostCanvas = document.createElement('canvas')
    const bw = rw * BOOST_SCALE
    const bh = rh * BOOST_SCALE
    boostCanvas.width = bw
    boostCanvas.height = bh
    const bctx = boostCanvas.getContext('2d', { willReadFrequently: true })
    if (!bctx) return null

    // Use bicubic-like interpolation via CSS
    bctx.imageSmoothingEnabled = true
    bctx.imageSmoothingQuality = 'high'
    bctx.drawImage(sourceCanvas, minX, minY, rw, rh, 0, 0, bw, bh)

    const imageData = bctx.getImageData(0, 0, bw, bh)
    const rawGray = new Uint8ClampedArray(bw * bh)
    for (let i = 0; i < bw * bh; i++) {
      const r = imageData.data[i * 4]
      const g = imageData.data[i * 4 + 1]
      const b = imageData.data[i * 4 + 2]
      rawGray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    }

    // Apply contrast enhancement + unsharp mask
    const enhanced = enhanceContrast(rawGray, bw, bh)
    const sharpened = unsharpMask(enhanced, bw, bh, 1.5)

    return { data: sharpened, width: bw, height: bh }
  }

  const imageData = ctx.getImageData(minX, minY, rw, rh)
  const gray = new Uint8ClampedArray(rw * rh)

  // Convert to grayscale using luminance formula
  for (let i = 0; i < rw * rh; i++) {
    const r = imageData.data[i * 4]
    const g = imageData.data[i * 4 + 1]
    const b = imageData.data[i * 4 + 2]
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  return { data: gray, width: rw, height: rh }
}

/**
 * Apply Sobel edge detection on grayscale image data.
 * Returns edge magnitude array (0–255).
 */
function sobelEdgeDetection(
  gray: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(width * height)

  // Sobel kernels
  // Gx: [[-1,0,1],[-2,0,2],[-1,0,1]]
  // Gy: [[-1,-2,-1],[0,0,0],[1,2,1]]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x

      // Sample 3x3 neighborhood
      const tl = gray[(y - 1) * width + (x - 1)]
      const tc = gray[(y - 1) * width + x]
      const tr = gray[(y - 1) * width + (x + 1)]
      const ml = gray[y * width + (x - 1)]
      const mr = gray[y * width + (x + 1)]
      const bl = gray[(y + 1) * width + (x - 1)]
      const bc = gray[(y + 1) * width + x]
      const br = gray[(y + 1) * width + (x + 1)]

      // Horizontal gradient (detects vertical edges / horizontal lines)
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      // Vertical gradient (detects horizontal edges / wrinkle lines)
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br

      const magnitude = Math.sqrt(gx * gx + gy * gy)
      edges[idx] = Math.min(255, Math.round(magnitude))
    }
  }

  return edges
}

/**
 * Calculate wrinkle density from edge-detected image.
 * Uses adaptive thresholding to count significant edge pixels.
 */
function calculateWrinkleDensity(
  edges: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const totalPixels = width * height
  if (totalPixels === 0) return 0

  // Calculate mean edge intensity
  let sum = 0
  for (let i = 0; i < totalPixels; i++) {
    sum += edges[i]
  }
  const mean = sum / totalPixels

  // Adaptive threshold: edges above mean + offset are considered wrinkle candidates
  const threshold = Math.max(30, mean + 15)
  let edgePixels = 0
  for (let i = 0; i < totalPixels; i++) {
    if (edges[i] > threshold) edgePixels++
  }

  return edgePixels / totalPixels
}

// ─── Classification ─────────────────────────────────────────

function classifyWrinkleLevel(score: number): WrinkleLevel {
  if (score >= 55) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

function getInsight(region: WrinkleRegion, level: WrinkleLevel): string {
  const insights: Record<WrinkleRegion, Record<WrinkleLevel, string>> = {
    forehead: {
      low: 'Alın bölgesinde belirgin çizgi gözlemlenmedi.',
      medium: 'Alın bölgesinde hafif çizgi belirtileri mevcut — botoks değerlendirilebilir.',
      high: 'Alın bölgesinde belirgin çizgiler gözlemlendi — botoks veya dolgu tedavisi değerlendirilebilir.',
    },
    glabella: {
      low: 'Kaş arası bölgede belirgin çizgi yok.',
      medium: 'Kaş arası bölgede hafif kırışıklık belirtileri — botoks değerlendirilebilir.',
      high: 'Kaş arası bölgede belirgin çizgiler — botoks tedavisi değerlendirilebilir.',
    },
    crow_feet_left: {
      low: 'Sol göz kenarında belirgin çizgi gözlemlenmedi.',
      medium: 'Sol göz kenarında hafif kaz ayağı belirtileri mevcut.',
      high: 'Sol göz kenarında belirgin kaz ayağı çizgileri — botoks değerlendirilebilir.',
    },
    crow_feet_right: {
      low: 'Sağ göz kenarında belirgin çizgi gözlemlenmedi.',
      medium: 'Sağ göz kenarında hafif kaz ayağı belirtileri mevcut.',
      high: 'Sağ göz kenarında belirgin kaz ayağı çizgileri — botoks değerlendirilebilir.',
    },
  }
  return insights[region][level]
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Analyze wrinkle lines from an image using FaceMesh landmarks.
 *
 * Process:
 * 1. Draw image onto a canvas
 * 2. For each region, extract the landmark-defined area
 * 3. Convert to grayscale
 * 4. Apply Sobel edge detection
 * 5. Calculate edge density as wrinkle indicator
 * 6. Classify and score, modulated by estimated age
 *
 * @param image - Source image element
 * @param landmarks - Normalized FaceMesh landmarks (0–1)
 * @param estimatedAge - Age from Human engine (used to modulate scores)
 */
export function analyzeWrinkles(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmark[],
  estimatedAge: number | null
): WrinkleAnalysisResult | null {
  if (landmarks.length < 400) {
    console.warn('[Wrinkle] Insufficient landmarks:', landmarks.length)
    return null
  }

  // Create working canvas from the source image
  const canvas = document.createElement('canvas')
  let imgWidth: number
  let imgHeight: number

  if (image instanceof HTMLImageElement) {
    imgWidth = image.naturalWidth || image.width
    imgHeight = image.naturalHeight || image.height
  } else {
    imgWidth = image.width
    imgHeight = image.height
  }

  if (imgWidth < 50 || imgHeight < 50) {
    console.warn('[Wrinkle] Image too small:', imgWidth, 'x', imgHeight)
    return null
  }

  canvas.width = imgWidth
  canvas.height = imgHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(image, 0, 0, imgWidth, imgHeight)

  // Age factor: younger faces expected to have fewer wrinkles,
  // so we modulate the raw density score
  const age = estimatedAge ?? 35
  const ageFactor = clamp((age - 20) / 35, 0.3, 1.5) // 0.3 at 20, 1.0 at 55, 1.5 at 70+

  const results: WrinkleRegionResult[] = []

  for (const [regionKey, regionConfig] of Object.entries(REGIONS)) {
    const region = regionKey as WrinkleRegion

    // Boost mode for forehead — zoom crop + contrast + edge enhancement
    const useBoost = region === 'forehead' || region === 'glabella'
    const grayRegion = extractRegionGrayscale(
      canvas,
      landmarks,
      regionConfig.landmarks,
      imgWidth,
      imgHeight,
      useBoost,
    )

    if (!grayRegion) {
      console.warn(`[Wrinkle] Could not extract region: ${region}`)
      // Add a zero-score result rather than skipping
      results.push({
        region,
        label: regionConfig.label,
        density: 0,
        score: 0,
        level: 'low',
        insight: getInsight(region, 'low'),
      })
      continue
    }

    const edges = sobelEdgeDetection(grayRegion.data, grayRegion.width, grayRegion.height)
    const rawDensity = calculateWrinkleDensity(edges, grayRegion.width, grayRegion.height)

    // Scale density to a 0–100 score
    // Typical wrinkle density range: 0.02 (smooth) to 0.25 (heavy wrinkles)
    // Apply age factor to reflect that same density means more at younger age
    const adjustedDensity = rawDensity * ageFactor
    const score = clamp(Math.round(adjustedDensity * 350), 0, 100)
    const level = classifyWrinkleLevel(score)

    console.log(`[Wrinkle] ${region}: density=${rawDensity.toFixed(4)}, ageFactor=${ageFactor.toFixed(2)}, score=${score}, level=${level}`)

    results.push({
      region,
      label: regionConfig.label,
      density: rawDensity,
      score,
      level,
      insight: getInsight(region, level),
    })
  }

  // Overall score: weighted average
  let weightedSum = 0
  let totalWeight = 0
  for (const r of results) {
    const w = REGIONS[r.region].weight
    weightedSum += r.score * w
    totalWeight += w
  }
  const overallScore = totalWeight > 0 ? clamp(Math.round(weightedSum / totalWeight), 0, 100) : 0
  const overallLevel = classifyWrinkleLevel(overallScore)

  console.log(`[Wrinkle] Overall: score=${overallScore}, level=${overallLevel}`)

  return {
    regions: results,
    overallScore,
    overallLevel,
  }
}
