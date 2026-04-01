/**
 * Pixel-Level Utilities for Specialist Modules
 *
 * Shared image processing primitives: grayscale extraction,
 * Sobel variants, CLAHE, texture metrics, color analysis.
 * Reuses proven patterns from wrinkle-analysis.ts but exposes
 * them as composable functions for specialist modules.
 */

import type { Landmark } from '../types'

// ─── Region Extraction ─────────────────────────────────────

export interface GrayscaleRegion {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface ColorRegion {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Extract a grayscale region from the source using landmark polygon bounds.
 */
export function extractGrayscaleRegion(
  source: HTMLCanvasElement | HTMLImageElement,
  landmarks: Landmark[],
  indices: number[],
  padding = 4,
): GrayscaleRegion | null {
  const canvas = toCanvas(source)
  if (!canvas) return null

  const w = canvas.width
  const h = canvas.height

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    const px = lm.x * w
    const py = lm.y * h
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }

  minX = Math.max(0, Math.floor(minX) - padding)
  minY = Math.max(0, Math.floor(minY) - padding)
  maxX = Math.min(w, Math.ceil(maxX) + padding)
  maxY = Math.min(h, Math.ceil(maxY) + padding)

  const rw = maxX - minX
  const rh = maxY - minY
  if (rw < 8 || rh < 8) return null

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const imageData = ctx.getImageData(minX, minY, rw, rh)
  const gray = new Uint8ClampedArray(rw * rh)
  for (let i = 0; i < rw * rh; i++) {
    const r = imageData.data[i * 4]
    const g = imageData.data[i * 4 + 1]
    const b = imageData.data[i * 4 + 2]
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  return { data: gray, width: rw, height: rh }
}

/**
 * Extract RGB color channels from a landmark region.
 */
export function extractColorRegion(
  source: HTMLCanvasElement | HTMLImageElement,
  landmarks: Landmark[],
  indices: number[],
  padding = 4,
): ColorRegion | null {
  const canvas = toCanvas(source)
  if (!canvas) return null

  const w = canvas.width
  const h = canvas.height

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (!lm) continue
    minX = Math.min(minX, lm.x * w)
    minY = Math.min(minY, lm.y * h)
    maxX = Math.max(maxX, lm.x * w)
    maxY = Math.max(maxY, lm.y * h)
  }

  minX = Math.max(0, Math.floor(minX) - padding)
  minY = Math.max(0, Math.floor(minY) - padding)
  maxX = Math.min(w, Math.ceil(maxX) + padding)
  maxY = Math.min(h, Math.ceil(maxY) + padding)

  const rw = maxX - minX
  const rh = maxY - minY
  if (rw < 8 || rh < 8) return null

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const imageData = ctx.getImageData(minX, minY, rw, rh)
  const n = rw * rh
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)

  for (let i = 0; i < n; i++) {
    r[i] = imageData.data[i * 4]
    g[i] = imageData.data[i * 4 + 1]
    b[i] = imageData.data[i * 4 + 2]
  }

  return { r, g, b, width: rw, height: rh }
}

// ─── Canvas Conversion ─────────────────────────────────────

function toCanvas(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement | null {
  if (source instanceof HTMLCanvasElement) return source

  const canvas = document.createElement('canvas')
  const w = source.naturalWidth || source.width
  const h = source.naturalHeight || source.height
  if (w === 0 || h === 0) return null
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0)
  return canvas
}

// ─── Sobel Edge Detection Variants ─────────────────────────

/** Standard Sobel */
export function sobelEdges(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y-1)*w + (x-1)], tc = gray[(y-1)*w + x], tr = gray[(y-1)*w + (x+1)]
      const ml = gray[y*w + (x-1)], mr = gray[y*w + (x+1)]
      const bl = gray[(y+1)*w + (x-1)], bc = gray[(y+1)*w + x], br = gray[(y+1)*w + (x+1)]
      const gx = -tl + tr - 2*ml + 2*mr - bl + br
      const gy = -tl - 2*tc - tr + bl + 2*bc + br
      edges[y*w + x] = Math.min(255, Math.round(Math.sqrt(gx*gx + gy*gy)))
    }
  }
  return edges
}

/** Horizontal-bias Sobel (for wrinkle lines) */
export function sobelHorizontalBias(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(w * h)
  const GY = 2.0, GX = 0.5
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y-1)*w + (x-1)], tc = gray[(y-1)*w + x], tr = gray[(y-1)*w + (x+1)]
      const ml = gray[y*w + (x-1)], mr = gray[y*w + (x+1)]
      const bl = gray[(y+1)*w + (x-1)], bc = gray[(y+1)*w + x], br = gray[(y+1)*w + (x+1)]
      const gx = (-tl + tr - 2*ml + 2*mr - bl + br) * GX
      const gy = (-tl - 2*tc - tr + bl + 2*bc + br) * GY
      edges[y*w + x] = Math.min(255, Math.round(Math.sqrt(gx*gx + gy*gy)))
    }
  }
  return edges
}

/** Lateral-bias Sobel (for crow's feet — radial lines) */
export function sobelLateralBias(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(w * h)
  const GY = 1.8, GX = 0.6
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y-1)*w + (x-1)], tc = gray[(y-1)*w + x], tr = gray[(y-1)*w + (x+1)]
      const ml = gray[y*w + (x-1)], mr = gray[y*w + (x+1)]
      const bl = gray[(y+1)*w + (x-1)], bc = gray[(y+1)*w + x], br = gray[(y+1)*w + (x+1)]
      const gx = (-tl + tr - 2*ml + 2*mr - bl + br) * GX
      const gy = (-tl - 2*tc - tr + bl + 2*bc + br) * GY
      edges[y*w + x] = Math.min(255, Math.round(Math.sqrt(gx*gx + gy*gy)))
    }
  }
  return edges
}

// ─── Edge Density Calculation ──────────────────────────────

/** Calculate edge density (fraction of pixels above adaptive threshold) */
export function edgeDensity(edges: Uint8ClampedArray, w: number, h: number): number {
  const n = w * h
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) sum += edges[i]
  const mean = sum / n
  const threshold = Math.max(20, mean * 0.6 + 10)
  let count = 0
  for (let i = 0; i < n; i++) {
    if (edges[i] > threshold) count++
  }
  return count / n
}

// ─── Texture Metrics ───────────────────────────────────────

/** Compute texture roughness (variance of grayscale values) */
export function textureRoughness(gray: Uint8ClampedArray): number {
  const n = gray.length
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) sum += gray[i]
  const mean = sum / n
  let variance = 0
  for (let i = 0; i < n; i++) {
    const diff = gray[i] - mean
    variance += diff * diff
  }
  variance /= n
  // Normalize: typical variance range 0–3000 → 0–1
  return Math.min(1, Math.sqrt(variance) / 55)
}

/** Compute local contrast (mean absolute deviation of 5x5 patches) */
export function localContrast(gray: Uint8ClampedArray, w: number, h: number): number {
  if (w < 10 || h < 10) return 0
  let totalDeviation = 0
  let patches = 0

  for (let y = 2; y < h - 2; y += 3) {
    for (let x = 2; x < w - 2; x += 3) {
      let sum = 0, count = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          sum += gray[(y+dy)*w + (x+dx)]
          count++
        }
      }
      const mean = sum / count
      let dev = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          dev += Math.abs(gray[(y+dy)*w + (x+dx)] - mean)
        }
      }
      totalDeviation += dev / count
      patches++
    }
  }

  return patches > 0 ? Math.min(1, (totalDeviation / patches) / 40) : 0
}

/** Measure color uniformity (inverse of channel variance) in a region */
export function colorUniformity(region: ColorRegion): number {
  const n = region.width * region.height
  if (n < 4) return 0.5

  // Compute variance of each channel
  function channelVariance(ch: Uint8ClampedArray): number {
    let sum = 0
    for (let i = 0; i < n; i++) sum += ch[i]
    const mean = sum / n
    let v = 0
    for (let i = 0; i < n; i++) v += (ch[i] - mean) ** 2
    return v / n
  }

  const rv = channelVariance(region.r)
  const gv = channelVariance(region.g)
  const bv = channelVariance(region.b)
  const avgVariance = (rv + gv + bv) / 3

  // High variance = low uniformity. Map: 0–2000 → 1–0
  return Math.max(0, Math.min(1, 1 - avgVariance / 2000))
}

/** Compute mean brightness of a grayscale region (0–255) */
export function meanBrightness(gray: Uint8ClampedArray): number {
  if (gray.length === 0) return 128
  let sum = 0
  for (let i = 0; i < gray.length; i++) sum += gray[i]
  return sum / gray.length
}

// ─── Landmark Geometry Helpers ─────────────────────────────

/** 2D distance between two landmarks (normalized coordinates) */
export function dist2D(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/** 3D distance between two landmarks */
export function dist3D(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

/** Average z-depth of a set of landmarks */
export function avgDepth(landmarks: Landmark[], indices: number[]): number {
  let sum = 0, count = 0
  for (const idx of indices) {
    const lm = landmarks[idx]
    if (lm) { sum += lm.z; count++ }
  }
  return count > 0 ? sum / count : 0
}

/** Midpoint between two landmarks */
export function midpoint(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

/** Angle between three landmarks (vertex at b) in degrees. Returns NaN if degenerate. */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const dot = ba.x * bc.x + ba.y * bc.y
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2)
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2)
  if (magBA < 1e-6 || magBC < 1e-6) return NaN
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  return Math.acos(cos) * (180 / Math.PI)
}
