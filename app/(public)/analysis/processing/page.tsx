'use client'

import { Suspense } from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useClinicStore, waitForHydration } from '@/lib/store'
import { PremiumButton } from '@/components/design-system/PremiumButton'
import {
  init as initHumanEngine,
  detectFace,
  detectFaceMultiFrame,
  destroy as destroyHumanEngine,
} from '@/lib/ai/human-engine'
import { savePhoto, saveViewPhotos, saveCapturedFrames, getCapturedFrames, getCaptureManifest, getCapturedFramesByView } from '@/lib/photo-bridge'
import { run as runGeometryAnalysis } from '@/lib/ai/analysis'
import { computeFocusAreas, computeQualityScore, getSuggestedZones, computeLipAnalysis } from '@/lib/ai/aesthetic-scoring'
import { generateSuggestions, generateFocusAreaLabels, mapFocusAreasToRegionScores } from '@/lib/ai/result-generator'
import { deriveRadarAnalysis } from '@/lib/ai/radar-scores'
import { deriveDoctorAnalysis, deriveConsultationReadiness } from '@/lib/ai/derive-doctor-analysis'
import { analyzeWrinkles, analyzeWrinklesMultiFrame, analyzeWrinklesMultiView, deriveSkinTexture } from '@/lib/ai/wrinkle-analysis'
import { assessImageQuality } from '@/lib/ai/image-quality'
import { estimateAge } from '@/lib/ai/age-estimation'
import { computeSymmetryAnalysis } from '@/lib/ai/aesthetic-scoring'
import {
  FACE_OVAL, LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW,
  NOSE_BRIDGE, UPPER_LIP, LOWER_LIP,
  JAWLINE, FOREHEAD_ZONE, LEFT_TEMPLE, RIGHT_TEMPLE,
  LEFT_UNDER_EYE, RIGHT_UNDER_EYE,
} from '@/lib/ai/face-guide'
import type { EnhancedAnalysisResult } from '@/lib/ai/types'
import type { Landmark } from '@/lib/ai/types'
import {
  runTrustPipeline,
  getQualityCaveatText,
  assessViewQuality,
  buildMultiViewContext,
  buildSingleViewContext,
} from '@/lib/ai/pipeline'
import type { CaptureView, MultiViewContext } from '@/lib/ai/pipeline/types'
import { getViewWeight } from '@/lib/ai/pipeline/view-roles'
import { runSpecialistAnalysis, buildCalibrationContext } from '@/lib/ai/specialists'
import { runMultiViewPipeline, type MultiViewInput, type ViewKey } from '@/lib/ai/multi-view-pipeline'
import { buildTemporalViewAggregate, type TemporalDetectionSample, type TemporalViewAggregate } from '@/lib/ai/temporal-aggregation'
import { buildCanonicalAnalysisPayload, deriveOverallReliabilityBand } from '@/lib/ai/canonical-analysis'
import { logAuditEvent } from '@/lib/audit'
import type { CaptureViewManifest, CaptureViewKey } from '@/types/capture'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type VisualStage = 0 | 1 | 2 | 3 | 4

type PipelineState =
  | { phase: 'running' }
  | { phase: 'error'; message: string }
  | { phase: 'done' }

// â”€â”€â”€ Stage definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STAGES = [
  {
    label: 'YÃ¼z Tespiti',
    icon: 'â—Ž',
    messages: [
      'YÃ¼z noktalarÄ± tespit ediliyorâ€¦',
      'Landmark modeli yÃ¼kleniyorâ€¦',
      'YÃ¼z Ã§erÃ§evesi belirleniyorâ€¦',
    ],
  },
  {
    label: 'Landmark Haritalama',
    icon: 'â¬¡',
    messages: [
      '468 nokta haritalanÄ±yorâ€¦',
      'DoÄŸruluk artÄ±rÄ±lÄ±yorâ€¦',
      'En iyi frame seÃ§ildi',
    ],
  },
  {
    label: 'Geometri Analizi',
    icon: 'â–³',
    messages: [
      'Simetri hesaplanÄ±yorâ€¦',
      'Oranlar analiz ediliyorâ€¦',
      'AltÄ±n oran karÅŸÄ±laÅŸtÄ±rmasÄ±â€¦',
    ],
  },
  {
    label: 'Cilt & Doku Tarama',
    icon: 'â—ˆ',
    messages: [
      'Cilt Ã§izgileri taranÄ±yorâ€¦',
      'Doku analizi yapÄ±lÄ±yorâ€¦',
      'KÄ±rÄ±ÅŸÄ±klÄ±k haritasÄ± oluÅŸturuluyorâ€¦',
    ],
  },
  {
    label: 'AI Tahmin',
    icon: 'âœ¦',
    messages: [
      'Model confidence optimize ediliyorâ€¦',
      'SonuÃ§lar derleniyorâ€¦',
      'Rapor oluÅŸturuluyorâ€¦',
    ],
  },
] as const

const MIN_STAGE_MS = 1500
const PIPELINE_TIMEOUT_MS = 25_000

// Navigation is now handled via Next.js router (client-side) to preserve
// in-memory Zustand state â€” avoids data loss from localStorage hydration race.

// â”€â”€â”€ Timeout utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} zaman aÅŸÄ±mÄ±na uÄŸradÄ± (${ms / 1000}s)`)), ms)
    ),
  ])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run fn and guarantee at least minMs elapsed */
async function withMinDelay<T>(fn: () => Promise<T>, minMs: number): Promise<T> {
  const [result] = await Promise.all([fn(), delay(minMs)])
  return result
}

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function aggregateTemporalLandmarks(landmarkSets: Landmark[][]): Landmark[] {
  if (landmarkSets.length === 0) return []
  const minLength = Math.min(...landmarkSets.map(set => set.length))
  const aggregated: Landmark[] = []

  for (let index = 0; index < minLength; index++) {
    aggregated.push({
      x: medianNumber(landmarkSets.map(set => set[index]?.x ?? 0)),
      y: medianNumber(landmarkSets.map(set => set[index]?.y ?? 0)),
      z: medianNumber(landmarkSets.map(set => set[index]?.z ?? 0)),
    })
  }

  return aggregated
}

async function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  return new Promise((resolve) => {
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

interface TemporalViewSupport {
  aggregate: TemporalViewAggregate | null
  representativeImage: HTMLImageElement | null
  representativeDetection: Awaited<ReturnType<typeof detectFace>> | null
  loadedFrames: HTMLImageElement[]
}

function pruneTemporalSamples(samples: TemporalDetectionSample[]): TemporalDetectionSample[] {
  if (samples.length <= 1) return samples

  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp)
  const kept: TemporalDetectionSample[] = []

  for (const sample of sorted) {
    const previous = kept[kept.length - 1]
    if (!previous) {
      kept.push(sample)
      continue
    }

    const timestampGap = Math.abs(sample.timestamp - previous.timestamp)
    const yawDelta = Math.abs((sample.metrics?.pose?.yaw ?? 0) - (previous.metrics?.pose?.yaw ?? 0))
    const pitchDelta = Math.abs((sample.metrics?.pose?.pitch ?? 0) - (previous.metrics?.pose?.pitch ?? 0))
    const rollDelta = Math.abs((sample.metrics?.pose?.roll ?? 0) - (previous.metrics?.pose?.roll ?? 0))
    const centeringDelta = Math.abs((sample.metrics?.centering ?? 0) - (previous.metrics?.centering ?? 0))
    const sharpnessDelta = Math.abs((sample.metrics?.sharpness ?? 0) - (previous.metrics?.sharpness ?? 0))

    const nearDuplicate = timestampGap < 120 &&
      yawDelta < 1.6 &&
      pitchDelta < 1.4 &&
      rollDelta < 1.2 &&
      centeringDelta < 0.015 &&
      sharpnessDelta < 0.04

    if (!nearDuplicate) {
      kept.push(sample)
      continue
    }

    if (sample.confidence > previous.confidence) {
      kept[kept.length - 1] = sample
    }
  }

  return kept
}

async function buildTemporalSupportForView(
  view: CaptureViewKey,
  frameUrls: string[],
  manifestView?: CaptureViewManifest,
  manifestFrames: Array<{
    frameId: string
    view: CaptureViewKey
    timestamp: number
    accepted: boolean
    brightness: number
    sharpness: number
    stability: number
    centering: number
    pose: {
      yaw: number
      pitch: number
      roll: number
    }
  }> = [],
): Promise<TemporalViewSupport> {
  const uniqueFrames = Array.from(new Set(frameUrls)).filter(Boolean)
  if (uniqueFrames.length === 0) {
    return {
      aggregate: null,
      representativeImage: null,
      representativeDetection: null,
      loadedFrames: [],
    }
  }

  const loadedFrames = (await Promise.all(uniqueFrames.map(loadImageElement)))
    .filter((image): image is HTMLImageElement => !!image && image.naturalWidth >= 100 && image.naturalHeight >= 100)

  if (loadedFrames.length === 0) {
    return {
      aggregate: null,
      representativeImage: null,
      representativeDetection: null,
      loadedFrames: [],
    }
  }

  const detections = await Promise.all(
    loadedFrames.map(async (frame) => {
      try {
        return await detectFace(frame)
      } catch {
        return null
      }
    }),
  )

  const acceptedFrameIds = new Set(manifestView?.accepted_frame_ids ?? [])
  const acceptedMetrics = manifestFrames.filter(frame =>
    frame.view === view &&
    frame.accepted &&
    (acceptedFrameIds.size === 0 || acceptedFrameIds.has(frame.frameId)),
  )
  const rawSamples: TemporalDetectionSample[] = []
  let representativeImage: HTMLImageElement | null = null
  let representativeDetection: Awaited<ReturnType<typeof detectFace>> | null = null
  let representativeConfidence = 0

  detections.forEach((detection, index) => {
    if (!detection || detection.landmarks.length < 468 || detection.confidence < 0.45) return
    const metrics = acceptedMetrics[index]
    rawSamples.push({
      frameId: metrics?.frameId ?? `${view}-${index}`,
      timestamp: metrics?.timestamp ?? Date.now() + index,
      landmarks: detection.landmarks,
      confidence: detection.confidence,
      metrics: metrics ? {
        brightness: metrics.brightness,
        sharpness: metrics.sharpness,
        stability: metrics.stability,
        centering: metrics.centering,
        pose: metrics.pose,
      } : undefined,
    })

  })

  const samples = pruneTemporalSamples(rawSamples)
  const selectedIds = new Set(samples.map(sample => sample.frameId))

  detections.forEach((detection, index) => {
    if (!detection || detection.landmarks.length < 468 || detection.confidence < 0.45) return
    const metrics = acceptedMetrics[index]
    const frameId = metrics?.frameId ?? `${view}-${index}`
    if (!selectedIds.has(frameId)) return

    if (!representativeImage || detection.confidence > representativeConfidence) {
      representativeImage = loadedFrames[index]
      representativeDetection = detection
      representativeConfidence = detection.confidence
    }
  })

  return {
    aggregate: buildTemporalViewAggregate(view, samples),
    representativeImage,
    representativeDetection,
    loadedFrames,
  }
}

// â”€â”€â”€ Canvas drawing utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GOLD = '#D6B98C'
const EMERALD = '#3D9B7A'
const NEON_GREEN = '#4AE3A7'
const BRIGHT_GOLD = '#E8C97A'

/** Compute face bounding box from landmarks (normalized 0â€“1) */
function getFaceBounds(landmarks: Landmark[]) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const idx of FACE_OVAL) {
    const lm = landmarks[idx]
    if (!lm) continue
    if (lm.x < minX) minX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.x > maxX) maxX = lm.x
    if (lm.y > maxY) maxY = lm.y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const fw = maxX - minX
  const fh = maxY - minY
  return { cx, cy, fw, fh, minX, minY, maxX, maxY }
}

/** Expand a point outward from face center */
function expandPoint(
  lm: Landmark, cx: number, cy: number, scaleX: number, scaleY: number,
  w: number, h: number,
): [number, number] {
  const ex = cx + (lm.x - cx) * scaleX
  const ey = cy + (lm.y - cy) * scaleY
  return [ex * w, ey * h]
}

/**
 * Draw a path of landmarks expanded outward from face center.
 * scaleX/scaleY > 1 to expand beyond the default mesh boundary.
 */
function drawExpandedPath(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  indices: number[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  progress: number,
  close = false,
) {
  if (indices.length < 2) return
  const count = Math.floor((close ? indices.length : indices.length - 1) * Math.min(progress, 1))
  if (count < 1) return

  const first = landmarks[indices[0]]
  if (!first) return
  const [sx, sy] = expandPoint(first, cx, cy, scaleX, scaleY, w, h)
  ctx.beginPath()
  ctx.moveTo(sx, sy)

  for (let i = 1; i <= count; i++) {
    const idx = indices[i % indices.length]
    const lm = landmarks[idx]
    if (!lm) continue
    const [px, py] = expandPoint(lm, cx, cy, scaleX, scaleY, w, h)
    ctx.lineTo(px, py)
  }

  if (close) ctx.closePath()
}

// Priority zone indices for brighter rendering
const PRIORITY_ZONES = new Set([
  // Forehead
  ...FOREHEAD_ZONE,
  // Under-eye
  ...LEFT_UNDER_EYE, ...RIGHT_UNDER_EYE,
  // Temples
  ...LEFT_TEMPLE, ...RIGHT_TEMPLE,
])

function drawLandmarkPoints(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  progress: number,
  time: number,
) {
  const count = Math.floor(landmarks.length * Math.min(progress, 1))
  // Breathing pulse: subtle scale oscillation
  const breathe = 1 + 0.008 * Math.sin(time * 0.002)

  for (let i = 0; i < count; i++) {
    const lm = landmarks[i]
    const isPriority = PRIORITY_ZONES.has(i)
    const [px, py] = expandPoint(lm, cx, cy, scaleX * breathe, scaleY * breathe, w, h)

    if (isPriority) {
      // Glow dot for priority zones
      ctx.save()
      ctx.shadowColor = NEON_GREEN
      ctx.shadowBlur = 6
      ctx.fillStyle = NEON_GREEN
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin((i / count) * Math.PI + time * 0.003)
      ctx.beginPath()
      ctx.arc(px, py, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Bright core
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(px, py, 0.9, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Standard dot with subtle glow
      ctx.fillStyle = GOLD
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin((i / count) * Math.PI)
      ctx.beginPath()
      ctx.arc(px, py, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  indices: number[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  progress: number,
  color: string,
  lineWidth = 1,
  glow = false,
) {
  if (indices.length < 2) return

  ctx.save()
  if (glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = 10
  }
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  drawExpandedPath(ctx, landmarks, indices, w, h, cx, cy, scaleX, scaleY, progress)
  ctx.stroke()
  ctx.restore()
}

function drawZoneHighlight(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  indices: number[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  alpha: number,
  color: string,
) {
  if (indices.length < 3) return

  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = alpha * 0.15

  drawExpandedPath(ctx, landmarks, indices, w, h, cx, cy, scaleX, scaleY, 1, true)
  ctx.fill()
  ctx.restore()
}

function drawScanSweep(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  faceMinY: number, faceMaxY: number,
  progress: number,
  color: string,
) {
  // Scan only within expanded face bounds (with 25% top padding for forehead)
  const topY = Math.max(0, faceMinY * h - h * 0.12)
  const bottomY = Math.min(h, faceMaxY * h + h * 0.04)
  const range = bottomY - topY
  const y = topY + progress * range

  const gradient = ctx.createLinearGradient(0, y - 25, 0, y + 25)
  gradient.addColorStop(0, 'transparent')
  gradient.addColorStop(0.5, color)
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.globalAlpha = 0.35
  ctx.fillRect(0, y - 25, w, 50)
  ctx.globalAlpha = 1
}

function drawGlowOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  alpha: number,
  time: number,
) {
  if (FACE_OVAL.length < 3) return

  // Breathing pulse on glow
  const breathe = 1 + 0.012 * Math.sin(time * 0.0015)
  const sx = scaleX * breathe
  const sy = scaleY * breathe

  // Outer glow (wide, soft)
  ctx.save()
  ctx.shadowColor = NEON_GREEN
  ctx.shadowBlur = 25
  ctx.strokeStyle = NEON_GREEN
  ctx.lineWidth = 2.5
  ctx.globalAlpha = alpha * 0.4

  drawExpandedPath(ctx, landmarks, FACE_OVAL, w, h, cx, cy, sx, sy, 1, true)
  ctx.stroke()
  ctx.restore()

  // Inner neon contour (sharper)
  ctx.save()
  ctx.shadowColor = NEON_GREEN
  ctx.shadowBlur = 8
  ctx.strokeStyle = BRIGHT_GOLD
  ctx.lineWidth = 1.2
  ctx.globalAlpha = alpha * 0.6

  drawExpandedPath(ctx, landmarks, FACE_OVAL, w, h, cx, cy, sx, sy, 1, true)
  ctx.stroke()
  ctx.restore()
}

/** Draw expanded forehead zone as a priority highlight */
function drawForeheadHighlight(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  alpha: number,
) {
  ctx.save()
  // Extra upward expansion for forehead
  const foreheadScaleY = scaleY * 1.15

  ctx.fillStyle = NEON_GREEN
  ctx.globalAlpha = alpha * 0.08

  drawExpandedPath(ctx, landmarks, FOREHEAD_ZONE, w, h, cx, cy, scaleX, foreheadScaleY, 1, true)
  ctx.fill()

  // Thin neon border on forehead zone
  ctx.strokeStyle = NEON_GREEN
  ctx.lineWidth = 1
  ctx.globalAlpha = alpha * 0.3

  drawExpandedPath(ctx, landmarks, FOREHEAD_ZONE, w, h, cx, cy, scaleX, foreheadScaleY, 1, true)
  ctx.stroke()
  ctx.restore()
}

/** Draw under-eye priority zones */
function drawUnderEyeHighlight(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number, h: number,
  cx: number, cy: number,
  scaleX: number, scaleY: number,
  alpha: number,
) {
  ctx.save()
  ctx.fillStyle = BRIGHT_GOLD
  ctx.globalAlpha = alpha * 0.1

  drawExpandedPath(ctx, landmarks, LEFT_UNDER_EYE, w, h, cx, cy, scaleX, scaleY, 1, true)
  ctx.fill()
  drawExpandedPath(ctx, landmarks, RIGHT_UNDER_EYE, w, h, cx, cy, scaleX, scaleY, 1, true)
  ctx.fill()
  ctx.restore()
}

// â”€â”€â”€ Analysis pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function runLocalAnalysisPipeline(
  photoUrl: string,
  onStage: (stage: VisualStage) => void,
  onLandmarks: (landmarks: Landmark[]) => void,
  capturedFrameUrls?: string[],
): Promise<EnhancedAnalysisResult> {
  // â”€â”€ Stage 0: Face Detection â”€â”€
  onStage(0)

  const stage0Result = await withMinDelay(async () => {
    await initHumanEngine()

    const image = new Image()
    image.crossOrigin = 'anonymous'
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('FotoÄŸraf yÃ¼klenemedi'))
        image.src = photoUrl
      }),
      5000,
      'FotoÄŸraf yÃ¼kleme'
    )
    if (image.naturalWidth < 100 || image.naturalHeight < 100) {
      throw new Error('YÃ¼z algÄ±lanamadÄ±. LÃ¼tfen tekrar deneyin.')
    }

    const det = await withTimeout(detectFace(image), 8000, 'YÃ¼z algÄ±lama')
    if (!det || det.landmarks.length < 200) {
      throw new Error('YÃ¼z algÄ±lanamadÄ±. LÃ¼tfen tekrar deneyin.')
    }

    onLandmarks(det.landmarks)

    return { image, det }
  }, MIN_STAGE_MS)
  const detection = stage0Result.det
  const imgEl = stage0Result.image

  // â”€â”€ Stage 1: Landmark Mapping + multi-frame age â”€â”€
  onStage(1)

  const stage1Result = await withMinDelay(async () => {
    let age = detection.age
    let gender = detection.gender
    let genderConf = detection.genderConfidence
    let coreLandmarks = detection.landmarks
    let coreConfidence = detection.confidence

    // True multi-frame: use distinct captured frames if available
    let loadedFrames: HTMLImageElement[] = []
    try {
      if (capturedFrameUrls && capturedFrameUrls.length >= 2) {
        // Real multi-frame: load each distinct captured frame
        for (const frameUrl of capturedFrameUrls) {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject()
            img.src = frameUrl
          })
          loadedFrames.push(img)
        }
        console.log(`[Pipeline] Multi-frame: loaded ${loadedFrames.length} distinct captured frames`)
      } else {
        // Fallback: single image (no duplication â€” just one frame)
        const copy = new Image()
        copy.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          copy.onload = () => resolve()
          copy.onerror = () => reject()
          copy.src = photoUrl
        })
        loadedFrames.push(copy)
        console.log('[Pipeline] Multi-frame: single frame only (no captured frames available)')
      }

      const multiResult = await detectFaceMultiFrame(loadedFrames, 0.5)
      if (multiResult && multiResult.age != null) {
        age = multiResult.age
        gender = multiResult.gender
        genderConf = multiResult.genderConfidence
      }

      if (loadedFrames.length >= 3) {
        const temporalDetections = await Promise.all(
          loadedFrames.map(async (frame) => {
            try {
              return await detectFace(frame)
            } catch {
              return null
            }
          }),
        )

        const validTemporalDetections = temporalDetections
          .filter((item): item is NonNullable<typeof item> => !!item && item.landmarks.length >= 468 && item.confidence >= 0.45)

        if (validTemporalDetections.length >= 3) {
          coreLandmarks = aggregateTemporalLandmarks(validTemporalDetections.map(item => item.landmarks))
          coreConfidence = medianNumber(validTemporalDetections.map(item => item.confidence))
          onLandmarks(coreLandmarks)
          console.log(`[Pipeline] Temporal landmark aggregation active with ${validTemporalDetections.length} frames`)
        }
      }
    } catch (err) {
      console.warn('[Pipeline] Multi-frame age estimation failed (non-fatal):', err)
      loadedFrames = []
    }

    const geo = runGeometryAnalysis(coreLandmarks)
    if (!geo) throw new Error('YÃ¼z geometrisi hesaplanamadÄ±. LÃ¼tfen tekrar deneyin.')

    return { geo, age, gender, genderConf, loadedFrames, coreLandmarks, coreConfidence }
  }, MIN_STAGE_MS)
  const geometry = stage1Result.geo
  const finalAge = stage1Result.age
  const finalGender = stage1Result.gender
  const finalGenderConf = stage1Result.genderConf
  const realFrameImages = stage1Result.loadedFrames
  const coreLandmarks = stage1Result.coreLandmarks
  const coreConfidence = stage1Result.coreConfidence

  // â”€â”€ Stage 2: Geometry / Aesthetic Scoring â”€â”€
  onStage(2)

  const stage2Result = await withMinDelay(async () => {
    const fa = computeFocusAreas({
      landmarks: coreLandmarks,
      metrics: geometry.metrics,
      estimatedAge: finalAge,
    })
    const qs = computeQualityScore(
      coreConfidence,
      coreLandmarks.length,
      imgEl.naturalWidth,
      imgEl.naturalHeight
    )
    const sz = getSuggestedZones(fa, 50)
    return { fa, qs, sz }
  }, MIN_STAGE_MS)
  const focusAreas = stage2Result.fa
  const qualityScore = stage2Result.qs
  const suggestedZones = stage2Result.sz

  // â”€â”€ Stage 3: Skin / Wrinkle Analysis + Image Quality + Symmetry â”€â”€
  onStage(3)

  const stage3Result = await withMinDelay(async () => {
    // Image quality assessment
    let iq = null
    try {
      iq = assessImageQuality(coreLandmarks, coreConfidence, imgEl)
    } catch (err) {
      console.warn('[Pipeline] Image quality assessment failed (non-fatal):', err)
    }

    // Wrinkle analysis (13 regions) â€” multi-frame for stability
    // Pass real captured frames when available for true multi-frame analysis
    let wa = null
    try {
      const hasRealFrames = realFrameImages.length >= 2
      wa = analyzeWrinklesMultiFrame(
        imgEl, coreLandmarks, finalAge,
        hasRealFrames ? realFrameImages.length : 3,
        hasRealFrames ? realFrameImages : undefined,
      )
      if (!wa) wa = analyzeWrinkles(imgEl, coreLandmarks, finalAge)
    } catch (err) {
      console.warn('[Pipeline] Wrinkle analysis failed (non-fatal):', err)
    }

    // Skin texture profile
    let st = null
    if (wa) {
      try {
        st = deriveSkinTexture(wa)
      } catch (err) {
        console.warn('[Pipeline] Skin texture derivation failed (non-fatal):', err)
      }
    }

    // Symmetry analysis
    let sym = null
    try {
      sym = computeSymmetryAnalysis(coreLandmarks)
    } catch (err) {
      console.warn('[Pipeline] Symmetry analysis failed (non-fatal):', err)
    }

    // Lip analysis
    let lip = null
    try {
      lip = computeLipAnalysis(coreLandmarks, coreConfidence)
    } catch (err) {
      console.warn('[Pipeline] Lip analysis failed (non-fatal):', err)
    }

    return { iq, wa, st, sym, lip }
  }, MIN_STAGE_MS)

  const imageQuality = stage3Result.iq
  const wrinkleAnalysis = stage3Result.wa
  const skinTexture = stage3Result.st
  const symmetryAnalysis = stage3Result.sym
  const lipAnalysis = stage3Result.lip

  // â”€â”€ Stage 4: AI Prediction / Age Estimation / Build result â”€â”€
  onStage(4)

  const enhanced = await withMinDelay(async () => {
    // Multi-signal age estimation
    let ageEst = null
    try {
      ageEst = estimateAge({
        modelAge: finalAge,
        wrinkles: wrinkleAnalysis,
        imageQuality,
        skinTexture,
        metrics: geometry.metrics,
        detectionConfidence: coreConfidence,
      })
    } catch (err) {
      console.warn('[Pipeline] Age estimation failed (non-fatal):', err)
    }

    const result: EnhancedAnalysisResult = {
      geometry,
      estimatedAge: finalAge,
      gender: finalGender,
      genderConfidence: finalGenderConf,
      focusAreas,
      suggestedZones,
      confidence: coreConfidence,
      qualityScore,
      wrinkleAnalysis,
      engine: 'human',
      imageQuality,
      ageEstimation: ageEst,
      skinTexture,
      symmetryAnalysis,
      lipAnalysis,
    }
    return result
  }, MIN_STAGE_MS)

  return enhanced
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProcessingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const id = searchParams.get('id')
  const ran = useRef(false)
  const abortRef = useRef(false)

  const [pipelineState, setPipelineState] = useState<PipelineState>({ phase: 'running' })
  const [currentStage, setCurrentStage] = useState<VisualStage>(0)
  const [stageProgress, setStageProgress] = useState(0) // 0â€“1 within current stage
  const [microMessage, setMicroMessage] = useState<string>(STAGES[0].messages[0])
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null)
  const landmarksRef = useRef<Landmark[] | null>(null)
  const [freeze, setFreeze] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const stageStartRef = useRef(performance.now())
  const microIndexRef = useRef(0)
  const microTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // â”€â”€ Micro-message cycling â”€â”€
  useEffect(() => {
    if (pipelineState.phase !== 'running') {
      if (microTimerRef.current) clearInterval(microTimerRef.current)
      return
    }

    microIndexRef.current = 0
    setMicroMessage(STAGES[currentStage].messages[0])

    microTimerRef.current = setInterval(() => {
      microIndexRef.current = (microIndexRef.current + 1) % STAGES[currentStage].messages.length
      setMicroMessage(STAGES[currentStage].messages[microIndexRef.current])
    }, 1800)

    return () => {
      if (microTimerRef.current) clearInterval(microTimerRef.current)
    }
  }, [currentStage, pipelineState.phase])

  // â”€â”€ Canvas overlay animation â”€â”€
  useEffect(() => {
    if (!landmarks || !canvasRef.current || !photoUrl) return
    if (pipelineState.phase !== 'running' && !freeze) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    // Compute face bounds for dynamic scaling
    const bounds = getFaceBounds(landmarks)
    const { cx, cy, fw, minY: fMinY, maxY: fMaxY } = bounds

    // Dynamic scaling: expand overlay 15â€“20% beyond mesh boundary
    // Extra vertical expansion for forehead (+25% top)
    const baseScaleX = 1.15
    const baseScaleY = 1.25
    // If face is small in frame, expand more; if large, clip to canvas
    const faceRatio = fw // width as fraction of frame
    const dynamicScale = faceRatio < 0.3 ? 1.15 : faceRatio > 0.6 ? 0.95 : 1.0
    const scaleX = baseScaleX * dynamicScale
    const scaleY = baseScaleY * dynamicScale

    let running = true
    stageStartRef.current = performance.now()

    function animate() {
      if (!running || !ctx) return

      const now = performance.now()
      const elapsed = now - stageStartRef.current
      const progress = Math.min(elapsed / MIN_STAGE_MS, 1)
      setStageProgress(progress)

      ctx.clearRect(0, 0, w, h)

      // Stage 0: Reveal landmark points (with glow on priority zones)
      if (currentStage >= 0 && landmarks) {
        const pointProgress = currentStage === 0 ? progress : 1
        drawLandmarkPoints(ctx, landmarks, w, h, cx, cy, scaleX, scaleY, pointProgress, now)
      }

      // Stage 1: Draw connection lines (expanded, with neon glow on contour)
      if (currentStage >= 1 && landmarks) {
        const lineProgress = currentStage === 1 ? progress : 1
        const lineAlpha = currentStage === 1 ? 0.5 + 0.5 * progress : 0.7
        ctx.globalAlpha = lineAlpha

        // Outer contour â€” neon glow
        drawConnections(ctx, landmarks, FACE_OVAL, w, h, cx, cy, scaleX, scaleY, lineProgress, EMERALD, 1.5, true)
        // Jawline â€” full chin-to-ear
        drawConnections(ctx, landmarks, JAWLINE, w, h, cx, cy, scaleX, scaleY, lineProgress, EMERALD, 1.2, true)
        // Forehead contour
        drawConnections(ctx, landmarks, FOREHEAD_ZONE, w, h, cx, cy, scaleX, scaleY * 1.1, lineProgress, NEON_GREEN, 1, true)
        // Temple regions
        drawConnections(ctx, landmarks, LEFT_TEMPLE, w, h, cx, cy, scaleX, scaleY, lineProgress, GOLD, 0.8)
        drawConnections(ctx, landmarks, RIGHT_TEMPLE, w, h, cx, cy, scaleX, scaleY, lineProgress, GOLD, 0.8)
        // Eyes
        drawConnections(ctx, landmarks, LEFT_EYE, w, h, cx, cy, scaleX, scaleY, lineProgress, NEON_GREEN, 1)
        drawConnections(ctx, landmarks, RIGHT_EYE, w, h, cx, cy, scaleX, scaleY, lineProgress, NEON_GREEN, 1)
        // Eyebrows
        drawConnections(ctx, landmarks, LEFT_EYEBROW, w, h, cx, cy, scaleX, scaleY, lineProgress, GOLD, 0.8)
        drawConnections(ctx, landmarks, RIGHT_EYEBROW, w, h, cx, cy, scaleX, scaleY, lineProgress, GOLD, 0.8)
        // Nose
        drawConnections(ctx, landmarks, NOSE_BRIDGE, w, h, cx, cy, scaleX, scaleY, lineProgress, GOLD, 0.8)
        // Lips
        drawConnections(ctx, landmarks, UPPER_LIP, w, h, cx, cy, scaleX, scaleY, lineProgress, EMERALD, 0.8)
        drawConnections(ctx, landmarks, LOWER_LIP, w, h, cx, cy, scaleX, scaleY, lineProgress, EMERALD, 0.8)
        ctx.globalAlpha = 1
      }

      // Stage 2: Zone highlights (expanded with forehead + under-eye priority)
      if (currentStage >= 2 && landmarks) {
        const zoneAlpha = currentStage === 2 ? progress : 1
        drawZoneHighlight(ctx, landmarks, FACE_OVAL, w, h, cx, cy, scaleX, scaleY, zoneAlpha, EMERALD)
        drawZoneHighlight(ctx, landmarks, [...LEFT_EYE], w, h, cx, cy, scaleX, scaleY, zoneAlpha, NEON_GREEN)
        drawZoneHighlight(ctx, landmarks, [...RIGHT_EYE], w, h, cx, cy, scaleX, scaleY, zoneAlpha, NEON_GREEN)
        // Priority zone highlights
        drawForeheadHighlight(ctx, landmarks, w, h, cx, cy, scaleX, scaleY, zoneAlpha)
        drawUnderEyeHighlight(ctx, landmarks, w, h, cx, cy, scaleX, scaleY, zoneAlpha)
      }

      // Stage 3: Scan sweep (within expanded face bounds)
      if (currentStage === 3 && landmarks) {
        drawScanSweep(ctx, w, h, fMinY, fMaxY, progress, NEON_GREEN)
      }

      // Stage 4: Glow overlay (expanded + breathing)
      if (currentStage >= 4 && landmarks) {
        const glowAlpha = currentStage === 4 ? progress : 1
        drawGlowOverlay(ctx, landmarks, w, h, cx, cy, scaleX, scaleY, glowAlpha, now)
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      running = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [landmarks, currentStage, pipelineState.phase, freeze, photoUrl])

  // â”€â”€ Main pipeline â”€â”€
  useEffect(() => {
    if (!id) {
      routerRef.current.replace('/analysis')
      return
    }

    if (ran.current) return
    ran.current = true

    const leadId = id

    const safetyTimer = setTimeout(() => {
      console.warn(`[Pipeline] Safety timeout reached (${PIPELINE_TIMEOUT_MS / 1000}s)`)
      abortRef.current = true
      setPipelineState({
        phase: 'error',
        message: 'Analiz zaman aÅŸÄ±mÄ±na uÄŸradÄ±. LÃ¼tfen tekrar deneyin.',
      })
      destroyHumanEngine()
    }, PIPELINE_TIMEOUT_MS)

    async function runPipeline() {
      try {
        await withTimeout(waitForHydration(), 3000, 'Store yÃ¼kleme')

        if (abortRef.current) return

        const { leads, updateLeadAnalysis, clearCurrentLead } = useClinicStore.getState()
        const lead = leads.find((l) => l.id === leadId)

        if (!lead) {
          console.error('[Pipeline] Lead not found:', leadId)
          setPipelineState({
            phase: 'error',
            message: 'Analiz verisi bulunamadÄ±. LÃ¼tfen formu tekrar doldurun.',
          })
          return
        }

        clearCurrentLead()

        const photo = lead.patient_photo_url
        if (photo) {
          savePhoto(leadId, photo)
          setPhotoUrl(photo)
        }

        // Save captured frames to session bridge (for true multi-frame analysis)
        const capturedFrames = lead.captured_frames ?? []
        if (capturedFrames.length > 0) {
          saveCapturedFrames(leadId, capturedFrames)
        }

        // Save all 3 view photos to session bridge (survives localStorage quota stripping)
        const viewPhotos = lead.doctor_frontal_photos ?? []
        if (viewPhotos.length >= 3) {
          saveViewPhotos(leadId, viewPhotos)
        }

        if (!photo) {
          clearTimeout(safetyTimer)
          setPipelineState({ phase: 'done' })
          await delay(400)
          routerRef.current.replace(`/analysis/result?id=${leadId}`)
          return
        }

        // Retrieve capture manifest (per-view quality from capture time)
        const captureManifest = getCaptureManifest(leadId)
        const capturedFramesByView = getCapturedFramesByView(leadId)

        // â”€â”€ Run local analysis pipeline â”€â”€
        // Retrieve real captured frames from session bridge (or from lead)
        const pipelineFrames = capturedFrames.length > 0
          ? capturedFrames
          : getCapturedFrames(leadId)
        const frontPipelineFrames = capturedFramesByView.front && capturedFramesByView.front.length > 0
          ? capturedFramesByView.front
          : pipelineFrames

        const enhanced = await runLocalAnalysisPipeline(
          photo,
          (stage) => {
            if (!abortRef.current) {
              setCurrentStage(stage)
              stageStartRef.current = performance.now()
            }
          },
          (lm) => {
            landmarksRef.current = lm
            if (!abortRef.current) setLandmarks(lm)
          },
          frontPipelineFrames.length > 0 ? frontPipelineFrames : undefined,
        )

        if (abortRef.current) return

        // â”€â”€ Trust Pipeline: validate, filter, gate â”€â”€
        // The image element is needed for quality gate â€” recreate it
        const trustImage = new Image()
        trustImage.crossOrigin = 'anonymous'
        let trustImageLoaded = false
        await new Promise<void>((resolve) => {
          trustImage.onload = () => { trustImageLoaded = true; resolve() }
          trustImage.onerror = () => resolve()
          trustImage.src = photo
        })

        const manifestViewsByKey = new Map<CaptureViewKey, CaptureViewManifest>(
          (captureManifest?.views ?? []).map(view => [view.view, view]),
        )
        const temporalSupportEntries = await Promise.all(
          (['front', 'left', 'right'] as CaptureViewKey[]).map(async (view) => [
            view,
            await buildTemporalSupportForView(
              view,
              capturedFramesByView[view] ?? [],
              manifestViewsByKey.get(view),
              captureManifest?.frames ?? [],
            ),
          ] as const),
        )
        const temporalSupportByView = temporalSupportEntries.reduce<Partial<Record<CaptureViewKey, TemporalViewSupport>>>((acc, [view, support]) => {
          if (support.aggregate || support.representativeImage || support.loadedFrames.length > 0) {
            acc[view] = support
          }
          return acc
        }, {})

        let pipelineLandmarks = landmarksRef.current ?? []
        if (temporalSupportByView.front?.aggregate && temporalSupportByView.front.aggregate.landmarks.length >= 468) {
          pipelineLandmarks = temporalSupportByView.front.aggregate.landmarks
          landmarksRef.current = pipelineLandmarks
          if (!abortRef.current) setLandmarks(pipelineLandmarks)
        }

        // â”€â”€ Build multi-view context for reliability architecture â”€â”€
        // Assess front view quality first (always available)
        const frontCaptureQuality = captureManifest?.views.find(v => v.view === 'front')?.acceptance_score
        const frontViewQuality = assessViewQuality(
          'front',
          pipelineLandmarks,
          enhanced.confidence,
          trustImage,
          frontCaptureQuality,
        )

        // Multi-view context will be enriched after side-view detection below
        let multiViewCtx: MultiViewContext | null = null

        // For now, build single-view context (will be upgraded if side views exist)
        multiViewCtx = buildSingleViewContext(frontViewQuality)

        const trustResult = runTrustPipeline(
          enhanced,
          pipelineLandmarks,
          trustImage,
          undefined, // use default config
          multiViewCtx,
          false, // not an uploaded photo
        )

        // Post-capture: quality gate blocks are downgraded to degrade in pipeline.
        // Only soft warnings are shown on the result page.
        const qualityCaveat = getQualityCaveatText(trustResult)

        // â”€â”€ Specialist Module Analysis (5 regions) â”€â”€
        let specialistResult = null
        if (trustImageLoaded && pipelineLandmarks.length >= 468) {
          try {
            const calibrationCtx = buildCalibrationContext(
              enhanced,
              trustResult.qualityGate,
              trustResult.youngFaceProfile,
              (lead.capture_confidence as 'high' | 'medium' | 'low') ?? 'high',
            )
            specialistResult = runSpecialistAnalysis(
              pipelineLandmarks,
              trustImage,
              calibrationCtx,
              enhanced.wrinkleAnalysis?.regions,
            )
          } catch (err) {
            console.warn('[Pipeline] Specialist analysis failed (non-fatal):', err)
          }
        }

        // â”€â”€ Multi-View Analysis Pipeline (front + left + right) â”€â”€
        let multiViewResult = null
        const allPhotos = lead.doctor_frontal_photos ?? []
        if (trustImageLoaded && pipelineLandmarks.length >= 468 && allPhotos.length >= 3) {
          try {
            const calibrationCtx = specialistResult
              ? buildCalibrationContext(enhanced, trustResult.qualityGate, trustResult.youngFaceProfile, (lead.capture_confidence as 'high' | 'medium' | 'low') ?? 'high')
              : buildCalibrationContext(enhanced, trustResult.qualityGate, trustResult.youngFaceProfile, (lead.capture_confidence as 'high' | 'medium' | 'low') ?? 'high')

            const viewKeys: ViewKey[] = ['front', 'left', 'right']
            const multiViewInputs: MultiViewInput[] = []

            for (let i = 0; i < 3; i++) {
              const photoSrc = allPhotos[i]
              if (!photoSrc) continue
              const viewKey = viewKeys[i]
              const temporalSupport = temporalSupportByView[viewKey]

              if (i === 0) {
                multiViewInputs.push({
                  view: viewKey,
                  image: trustImage,
                  landmarks: pipelineLandmarks,
                  detectionConfidence: enhanced.confidence,
                  temporal: temporalSupport?.aggregate ?? undefined,
                })
                continue
              }

              const img = temporalSupport?.representativeImage ?? await loadImageElement(photoSrc)
              if (!img || img.naturalWidth < 100) continue

              const det = temporalSupport?.representativeDetection ?? await detectFace(img).catch(() => null)
              if (!det || det.landmarks.length < 468) {
                multiViewInputs.push({
                  view: viewKey,
                  image: img,
                  landmarks: det?.landmarks ?? [],
                  detectionConfidence: det?.confidence ?? 0,
                  temporal: temporalSupport?.aggregate ?? undefined,
                })
              } else {
                multiViewInputs.push({
                  view: viewKey,
                  image: img,
                  landmarks: temporalSupport?.aggregate?.landmarks ?? det.landmarks,
                  detectionConfidence: det.confidence,
                  temporal: temporalSupport?.aggregate ?? undefined,
                })
              }
            }

            if (multiViewInputs.length >= 2) {
              multiViewResult = runMultiViewPipeline(multiViewInputs, calibrationCtx)

              // â”€â”€ View-specific wrinkle re-analysis â”€â”€
              // Run full wrinkle engine (with CLAHE) on each side view and fuse results
              try {
                const viewWrinkleInputs = multiViewInputs
                  .filter(input => input.landmarks.length >= 400)
                  .map(input => ({
                    view: input.view as 'front' | 'left' | 'right',
                    image: input.image,
                    landmarks: input.landmarks,
                  }))

                if (viewWrinkleInputs.length >= 2) {
                  const fusedWrinkles = analyzeWrinklesMultiView(
                    viewWrinkleInputs,
                    enhanced.estimatedAge,
                    enhanced.wrinkleAnalysis,
                  )
                  if (fusedWrinkles) {
                    enhanced.wrinkleAnalysis = fusedWrinkles
                    console.log(`[Pipeline] View-specific wrinkle fusion: ${viewWrinkleInputs.length} views â†’ ${fusedWrinkles.regions.length} regions`)
                  }
                }
              } catch (err) {
                console.warn('[Pipeline] View-specific wrinkle re-analysis failed (non-fatal):', err)
              }

              // â”€â”€ Build multi-view quality profiles for reliability architecture â”€â”€
              const viewQualityProfiles = multiViewInputs.map(input => {
                const viewCaptureQuality = captureManifest?.views.find(v => v.view === input.view)?.acceptance_score
                return assessViewQuality(
                  input.view as CaptureView,
                  input.landmarks,
                  input.detectionConfidence,
                  input.image,
                  viewCaptureQuality,
                )
              })

              // Build multi-view fusion context with per-region scores from the multi-view pipeline
              const viewScoreMap = new Map<string, { view: CaptureView; score: number; quality: number; weight: number }[]>()
              if (multiViewResult) {
                for (const region of multiViewResult.allRegions) {
                  const key = region.key
                  if (!viewScoreMap.has(key)) viewScoreMap.set(key, [])
                  const vqp = viewQualityProfiles.find(v => v.view === region.sourceView)
                  viewScoreMap.get(key)!.push({
                    view: region.sourceView as CaptureView,
                    score: region.score,
                    quality: vqp?.quality ?? 0.5,
                    weight: getViewWeight(region.key as never, region.sourceView as CaptureView) || 0.5,
                  })
                }
              }

              multiViewCtx = buildMultiViewContext(viewQualityProfiles, viewScoreMap)
            }
          } catch (err) {
            console.warn('[Pipeline] Multi-view analysis failed (non-fatal):', err)
          }
        }

        // â”€â”€ Re-run trust pipeline with full multi-view context if available â”€â”€
        // This upgrades confidence scoring with view-aware reliability data
        let finalTrustResult = trustResult
        if (multiViewCtx && multiViewCtx.isMultiView) {
          finalTrustResult = runTrustPipeline(
            enhanced,
            pipelineLandmarks,
            trustImage,
            undefined,
            multiViewCtx,
            false,
          )
        }

        // â”€â”€ Save results â”€â”€
        const { geometry, estimatedAge, focusAreas, suggestedZones, confidence, qualityScore, wrinkleAnalysis, ageEstimation } = enhanced

        // Always show real analysis results â€” post-capture only shows warning banners, never blocks
        const suggestions = generateSuggestions(enhanced, finalTrustResult.observations)
        const summaryText = finalTrustResult.patientSummary
        const focusLabels = finalTrustResult.focusLabels.length > 0
          ? finalTrustResult.focusLabels
          : generateFocusAreaLabels(enhanced, finalTrustResult.observations)
        const radarAnalysis = deriveRadarAnalysis(enhanced, lead.capture_confidence as 'high' | 'medium' | 'low' | undefined)

        // Doctor analysis now uses enhanced pipeline + trust data
        const doctorAnalysis = deriveDoctorAnalysis(leadId, geometry, lead, enhanced, finalTrustResult)
        const enhancedRegionScores = mapFocusAreasToRegionScores(focusAreas, geometry.metrics)
        doctorAnalysis.region_scores = enhancedRegionScores
        doctorAnalysis.model_version = 'human-trust-v2'

        const readiness = deriveConsultationReadiness(lead)
        const frontCaptureManifest = captureManifest?.views.find(view => view.view === 'front')
        const captureQualityScore = frontCaptureManifest
          ? Math.round(frontCaptureManifest.acceptance_score * 100)
          : (lead.capture_quality_score ?? Math.round(qualityScore))
        const analysisInputQualityScore = Math.round(finalTrustResult.qualityGate.score)
        const livenessRequired = captureManifest?.liveness_required ?? lead.liveness_required ?? false
        const livenessPassed = captureManifest?.liveness_passed ?? lead.liveness_passed ?? !livenessRequired
        const livenessStatus = captureManifest?.liveness_status
          ?? lead.liveness_status
          ?? (livenessRequired ? 'not_started' : 'not_required')
        const livenessSignals = captureManifest?.liveness_signals ?? lead.liveness_signals
        const livenessConfidence = captureManifest?.liveness_confidence != null
          ? Math.round(captureManifest.liveness_confidence * 100)
          : (lead.liveness_confidence ?? (livenessPassed ? 100 : 0))
        const livenessMissingViews = livenessRequired && !livenessPassed
          ? captureManifest?.liveness_steps
            ?.filter(step => !step.observed)
            .flatMap<CaptureViewKey>((step) => {
              if (step.key === 'left_turn') return ['left']
              if (step.key === 'right_turn') return ['right']
              return ['front']
            }) ?? ['front']
          : []
        const captureRecaptureViews = captureManifest?.views
          .filter(view => view.recapture_required)
          .map(view => view.view) ?? []
        const recaptureViews = Array.from(new Set([...(multiViewResult?.recaptureNeeded ?? []), ...captureRecaptureViews, ...livenessMissingViews]))
        const recaptureRecommended = finalTrustResult.qualityGate.recaptureRecommended || recaptureViews.length > 0 || (livenessRequired && !livenessPassed)
        const blockedByQuality = finalTrustResult.qualityGate.verdict === 'block'
        const temporalViewSupport = (['front', 'left', 'right'] as CaptureViewKey[]).reduce<Partial<Record<CaptureViewKey, { frameCount: number; confidence: number }>>>((acc, view) => {
          const aggregate = temporalSupportByView[view]?.aggregate
          if (aggregate) {
            acc[view] = {
              frameCount: aggregate.frameCount,
              confidence: Math.round(aggregate.temporalConfidence * 100),
            }
          }
          return acc
        }, {})
        const temporalConfidenceValues = Object.values(temporalViewSupport).map(value => value.confidence)
        const temporalCoverageScore = temporalConfidenceValues.length > 0
          ? Math.round(temporalConfidenceValues.reduce((sum, value) => sum + value, 0) / temporalConfidenceValues.length)
          : 0
        const totalExpectedViews = captureManifest?.mode === 'multi' ? 3 : 1
        const acceptedViewCount = captureManifest?.views.filter(view => view.captured && !view.recapture_required).length ?? 0
        const viewCoverageScore = Math.round((acceptedViewCount / Math.max(totalExpectedViews, 1)) * 100)
        const totalEvidenceSlots = Math.max(finalTrustResult.observations.length + finalTrustResult.suppressedCount, 1)
        const observationCoverageScore = Math.round((1 - (finalTrustResult.suppressedCount / totalEvidenceSlots)) * 100)
        const evidenceCoverageScore = Math.max(0, Math.min(100, Math.round(
          viewCoverageScore * 0.35 +
          temporalCoverageScore * 0.30 +
          observationCoverageScore * 0.35,
        )))
        const livenessPenalty = livenessRequired && !livenessPassed ? 0.72 : 1
        const temporalPenalty = temporalConfidenceValues.length > 0
          ? 0.82 + ((temporalCoverageScore / 100) * 0.18)
          : 1
        const reportConfidence = Math.max(0, Math.min(100, Math.round(
          finalTrustResult.overallConfidence * livenessPenalty * temporalPenalty,
        )))
        const suppressionCount = finalTrustResult.suppressedCount
        const limitedRegionsCount = finalTrustResult.observations.filter(
          observation => observation.visibility === 'limited' || observation.visibility === 'not_evaluable',
        ).length
        const overallReliabilityBand = deriveOverallReliabilityBand(
          reportConfidence,
          evidenceCoverageScore,
          recaptureRecommended,
        )
        const limitedByLiveness = livenessRequired && !livenessPassed && reportConfidence < 55
        const blockRichOutputs = blockedByQuality || limitedByLiveness
        const recaptureReason = finalTrustResult.qualityGate.recaptureReason ??
          ((livenessRequired && !livenessPassed)
            ? 'Canlilik dogrulamasi tamamlanamadi. Daha guvenilir sonuc icin cekimin yeniden alinmasi onerilir.'
            : recaptureViews.length > 0
              ? `Yeniden cekim onerisi: ${recaptureViews.join(', ')} acilarinda dogruluk sinirli.`
              : undefined)
        const canonicalAnalysis = buildCanonicalAnalysisPayload({
          leadId,
          captureManifest,
          captureQualityScore,
          analysisInputQualityScore,
          reportConfidence,
          evidenceCoverageScore,
          overallReliabilityBand,
          suppressionCount,
          limitedRegionsCount,
          qualityGateVerdict: finalTrustResult.qualityGate.verdict,
          recaptureRecommended,
          recaptureViews,
          temporalViewSupport,
        })

        updateLeadAnalysis(leadId, {
          doctor_analysis: blockRichOutputs ? undefined : doctorAnalysis,
          patient_summary: {
            status: 'ready',
            photo_quality: analysisInputQualityScore >= 75 ? 'good' : analysisInputQualityScore >= 50 ? 'acceptable' : 'poor',
            focus_areas: focusLabels.length > 0 ? focusLabels : ['Genel Yuz Dengesi'],
            consultation_recommended: true,
            summary_text: summaryText,
            feature_schema_version: '2.0.0',
            model_version: 'human-v1',
          },
          consultation_readiness: readiness,
          ai_scores: blockRichOutputs ? undefined : {
            symmetry: geometry.scores.symmetry,
            proportion: geometry.scores.proportion,
            suggestions,
            metrics: geometry.metrics,
          },
          estimated_age: blockRichOutputs ? undefined : estimatedAge,
          estimated_gender: blockRichOutputs ? undefined : (enhanced.gender ?? null),
          estimated_gender_confidence: blockRichOutputs ? undefined : (enhanced.genderConfidence > 0 ? enhanced.genderConfidence : undefined),
          focus_areas: blockRichOutputs ? [] : focusAreas.map((a) => ({
            region: a.region,
            label: a.label,
            score: a.score,
            insight: a.insight,
            doctorReviewRecommended: a.doctorReviewRecommended,
          })),
          wrinkle_scores: !blockRichOutputs && wrinkleAnalysis ? {
            regions: wrinkleAnalysis.regions.map((r) => ({
              region: r.region,
              label: r.label,
              density: r.density,
              score: r.score,
              level: r.level,
              insight: r.insight,
              confidence: r.confidence,
              detected: r.detected,
              evidenceStrength: r.evidenceStrength,
            })),
            overallScore: wrinkleAnalysis.overallScore,
            overallLevel: wrinkleAnalysis.overallLevel,
          } : undefined,
          age_estimation: !blockRichOutputs && ageEstimation ? {
            estimatedRange: ageEstimation.estimatedRange,
            pointEstimate: ageEstimation.pointEstimate,
            confidence: ageEstimation.confidence,
            confidenceScore: ageEstimation.confidenceScore,
            drivers: ageEstimation.drivers.map((d) => ({
              signal: d.signal,
              label: d.label,
              weight: d.weight,
              description: d.description,
            })),
            caveat: ageEstimation.caveat,
          } : undefined,
          radar_analysis: blockRichOutputs ? undefined : radarAnalysis,
          suggested_zones: blockRichOutputs ? [] : suggestedZones,
          analysis_confidence: blockRichOutputs ? 0 : confidence,
          quality_score: qualityScore,
          // â”€â”€ Separated quality semantics â”€â”€
          capture_manifest: captureManifest ?? undefined,
          capture_quality_score: captureQualityScore,
          analysis_input_quality_score: analysisInputQualityScore,
          report_confidence: reportConfidence,
          liveness_status: livenessStatus,
          liveness_confidence: livenessConfidence,
          liveness_required: livenessRequired,
          liveness_passed: livenessPassed,
          liveness_signals: livenessSignals,
          overall_reliability_band: overallReliabilityBand,
          evidence_coverage_score: evidenceCoverageScore,
          suppression_count: suppressionCount,
          limited_regions_count: limitedRegionsCount,
          canonical_analysis: canonicalAnalysis,
          recapture_recommended: recaptureRecommended,
          recapture_views: recaptureViews,
          recapture_reason: recaptureReason,
          analysis_source: {
            provider: 'human-local',
            source: 'real-client-side',
            facemesh_ok: true,
            perfectcorp_ok: false,
            analyzed_at: new Date().toISOString(),
          },
          status: 'analysis_ready',
          // â”€â”€ Trust pipeline metadata â”€â”€
          trust_pipeline: {
            overall_confidence: reportConfidence,
            quality_gate_verdict: finalTrustResult.qualityGate.verdict,
            liveness_status: livenessStatus,
            liveness_confidence: livenessConfidence,
            evidence_coverage_score: evidenceCoverageScore,
            overall_reliability_band: overallReliabilityBand,
            quality_gate_score: finalTrustResult.qualityGate.score,
            quality_level: finalTrustResult.qualityLevel,
            young_face_active: finalTrustResult.youngFaceProfile.active,
            age_profile: finalTrustResult.youngFaceProfile.ageProfile,
            metrics_shown: finalTrustResult.findings.filter(f => !f.isSoft).length,
            metrics_soft: finalTrustResult.softCount,
            metrics_suppressed: suppressionCount,
            quality_caveat: qualityCaveat,
            strong_features: finalTrustResult.strongFeatures,
            limited_areas: finalTrustResult.limitedAreasText,
            findings: finalTrustResult.findings.map(f => ({
              text: f.text,
              region: f.region,
              band: f.band,
              isSoft: f.isSoft,
            })),
            observations: finalTrustResult.observations.map(o => ({
              area: o.area,
              label: o.label,
              observation: o.observation,
              visibility: o.visibility,
              confidence: o.confidence,
              impact: o.impact,
              isPositive: o.isPositive,
              score: o.score,
              ...(o.limitation ? { limitation: o.limitation } : {}),
              ...(o.contributingViews ? { contributingViews: o.contributingViews } : {}),
              ...(o.evidenceSummary ? { evidenceSummary: o.evidenceSummary } : {}),
            })),
            region_confidences: finalTrustResult.regionConfidences.map(rc => ({
              region: rc.region,
              label: rc.label,
              confidence: rc.confidence,
              evaluable: rc.evaluable,
              limitation: rc.limitation,
            })),
            // â”€â”€ Multi-view reliability metadata â”€â”€
            multi_view_reliability: multiViewCtx?.isMultiView ? {
              capturedViews: multiViewCtx.capturedViews,
              viewQualities: multiViewCtx.viewQualities.map(v => ({
                view: v.view,
                quality: v.quality,
                band: v.band,
                usable: v.usable,
              })),
              fusedFindingsCount: finalTrustResult.fusedFindings.length,
            } : undefined,
          },
          lip_analysis: !blockRichOutputs && finalTrustResult.lipMetric ? {
            volume: finalTrustResult.lipMetric.data.volume,
            symmetry: finalTrustResult.lipMetric.data.symmetry,
            contour: finalTrustResult.lipMetric.data.contour,
            surface: finalTrustResult.lipMetric.data.surface,
            evaluable: finalTrustResult.lipMetric.data.evaluable,
            limitationReason: finalTrustResult.lipMetric.data.limitationReason,
            confidence: finalTrustResult.lipMetric.data.confidence,
          } : undefined,
          specialist_analysis: !blockRichOutputs && specialistResult ? {
            assessments: specialistResult.assessments.map(a => ({
              moduleKey: a.moduleKey,
              displayName: a.displayName,
              icon: a.icon,
              score: a.score,
              confidence: a.confidence,
              severity: a.severity,
              observation: a.observation,
              isPositive: a.isPositive,
              consultationNote: a.consultationNote,
              evaluable: a.evaluable,
              limitation: a.limitation,
              subScores: a.subScores.map(s => ({
                key: s.key,
                label: s.label,
                score: s.score,
                weight: s.weight,
                confidence: s.confidence,
              })),
            })),
            overallScore: specialistResult.overallScore,
            overallConfidence: specialistResult.overallConfidence,
            priorityRegions: specialistResult.priorityRegions,
            analyzedAt: specialistResult.analyzedAt,
          } : undefined,
          multi_view_analysis: !blockRichOutputs && multiViewResult ? {
            globalScore: multiViewResult.globalScore,
            globalConfidence: multiViewResult.globalConfidence,
            recaptureNeeded: multiViewResult.recaptureNeeded,
            centralRegions: multiViewResult.centralRegions.map(r => ({
              key: r.key, label: r.label, icon: r.icon, sourceView: r.sourceView,
              score: r.score, confidence: r.confidence, severity: r.severity,
              observation: r.observation, isPositive: r.isPositive,
              consultationNote: r.consultationNote,
              subScores: r.subScores,
            })),
            leftRegions: multiViewResult.leftRegions.map(r => ({
              key: r.key, label: r.label, icon: r.icon, sourceView: r.sourceView,
              score: r.score, confidence: r.confidence, severity: r.severity,
              observation: r.observation, isPositive: r.isPositive,
              consultationNote: r.consultationNote,
              subScores: r.subScores,
            })),
            rightRegions: multiViewResult.rightRegions.map(r => ({
              key: r.key, label: r.label, icon: r.icon, sourceView: r.sourceView,
              score: r.score, confidence: r.confidence, severity: r.severity,
              observation: r.observation, isPositive: r.isPositive,
              consultationNote: r.consultationNote,
              subScores: r.subScores,
            })),
            priorityRegions: multiViewResult.priorityRegions,
            viewQualities: multiViewResult.views.map(v => ({
              view: v.view, score: Math.round(v.quality.score * 100),
              usable: v.quality.usable, issue: v.quality.issue,
              poseCorrect: v.poseValidation.poseCorrect,
              frameCount: v.quality.frameCount,
              temporalScore: v.quality.temporalScore != null ? Math.round(v.quality.temporalScore * 100) : undefined,
              landmarkJitter: v.quality.landmarkJitter,
            })),
            viewSummaries: multiViewResult.viewSummaries.map(vs => ({
              view: vs.view, label: vs.label, qualityScore: vs.qualityScore,
              usable: vs.usable, issue: vs.issue, poseCorrect: vs.poseCorrect,
              visibleRegionCount: vs.visibleRegionCount, limitations: vs.limitations,
              narrative: vs.narrative,
              frameCount: vs.frameCount,
              temporalConfidence: vs.temporalConfidence,
              sourceMode: vs.sourceMode,
            })),
            synthesis: multiViewResult.synthesis,
            analyzedAt: multiViewResult.analyzedAt,
          } : undefined,
        })

        // â”€â”€ Final freeze 0.5s then navigate â”€â”€
        logAuditEvent('analysis_completed', {
          lead_id: leadId,
          report_confidence: reportConfidence,
          capture_quality_score: captureQualityScore,
          analysis_input_quality_score: analysisInputQualityScore,
          recapture_recommended: recaptureRecommended,
          recapture_views: recaptureViews,
          quality_gate_verdict: finalTrustResult.qualityGate.verdict,
          liveness_status: livenessStatus,
          liveness_confidence: livenessConfidence,
          evidence_coverage_score: evidenceCoverageScore,
          overall_reliability_band: overallReliabilityBand,
        })

        setFreeze(true)
        setPipelineState({ phase: 'done' })
        clearTimeout(safetyTimer)
        await delay(500)
        routerRef.current.replace(`/analysis/result?id=${leadId}`)
      } catch (err) {
        console.error('[Pipeline] Error:', err)
        clearTimeout(safetyTimer)

        const message = err instanceof Error
          ? err.message
          : 'Analiz sÄ±rasÄ±nda bir hata oluÅŸtu'

        setPipelineState({ phase: 'error', message })

        // Save fallback data
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
      } finally {
        destroyHumanEngine()
      }
    }

    runPipeline()
  }, [id])

  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  const handleBack = useCallback(() => {
    router.replace('/analysis')
  }, [router])

  const handleSkip = useCallback(() => {
    if (id) router.replace(`/analysis/result?id=${id}`)
  }, [id, router])

  // â”€â”€ Render â”€â”€

  const isRunning = pipelineState.phase === 'running'
  const isError = pipelineState.phase === 'error'
  const isDone = pipelineState.phase === 'done'
  const overallProgress = isError ? 0 : isDone ? 100 : Math.round(((currentStage + stageProgress) / 5) * 100)

  return (
    <div
      className="theme-dark min-h-screen flex flex-col items-center justify-center px-5 sm:px-8 py-10 relative"
      style={{
        background: 'linear-gradient(160deg, #0A0908 0%, #141110 20%, #0F1214 50%, #0A0B0D 100%)',
      }}
    >
      {/* Ambient depth glows â€” cinematic */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 25%, rgba(214,185,140,0.025) 0%, transparent 55%), radial-gradient(ellipse 40% 30% at 50% 75%, rgba(61,155,122,0.015) 0%, transparent 45%)' }} />

      <div className="relative w-full max-w-md flex flex-col items-center" style={{ gap: 'clamp(1.5rem, 3vw, 2rem)' }}>

        {/* â”€â”€ Photo with canvas overlay â€” cinematic frame â”€â”€ */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: '3 / 4',
            borderRadius: '24px',
            border: isDone
              ? '1px solid rgba(61,155,122,0.20)'
              : '1px solid rgba(214,185,140,0.08)',
            boxShadow: isDone
              ? '0 0 40px rgba(61,155,122,0.25), 0 0 100px rgba(61,155,122,0.06), 0 24px 64px rgba(0,0,0,0.5)'
              : '0 20px 60px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(214,185,140,0.04) inset',
            animation: isDone ? 'glowPulse 2.5s ease-in-out infinite' : undefined,
            transition: 'box-shadow 0.8s ease, border-color 0.8s ease',
          }}
        >
          {/* Background photo */}
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Analiz edilen fotoÄŸraf"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: isRunning ? 'brightness(0.7)' : 'brightness(0.85)' }}
            />
          ) : (
            <div className="absolute inset-0 bg-[rgba(20,18,15,0.9)]" />
          )}

          {/* Canvas overlay for landmark animations */}
          <canvas
            ref={canvasRef}
            width={360}
            height={480}
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: 'none' }}
          />

          {/* Scan line overlay (stage 3) */}
          {currentStage === 3 && isRunning && (
            <div
              className="absolute left-0 right-0 h-[2px] pointer-events-none"
              style={{
                background: `linear-gradient(90deg, transparent, ${NEON_GREEN}, transparent)`,
                animation: 'scanLine 2s linear infinite',
                boxShadow: `0 0 12px ${NEON_GREEN}`,
              }}
            />
          )}

          {/* Stage indicator badge â€” premium pill */}
          {isRunning && (
            <div
              className="absolute top-5 left-5 flex items-center gap-2.5 rounded-full px-4 py-2"
              style={{
                background: 'rgba(10, 8, 6, 0.80)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(214, 185, 140, 0.10)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                animation: 'stageFadeIn 0.4s ease-out',
              }}
            >
              <span
                className="text-sm"
                style={{ animation: 'aiPulse 1.5s ease-in-out infinite' }}
              >
                {STAGES[currentStage].icon}
              </span>
              <span className="text-label text-[#D6B98C]" style={{ fontSize: '9px' }}>
                {STAGES[currentStage].label}
              </span>
            </div>
          )}

          {/* Done overlay â€” elegant reveal */}
          {isDone && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(10,8,6,0.2) 0%, rgba(10,8,6,0.45) 100%)',
                animation: 'stageFadeIn 0.4s ease-out',
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-[-8px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(61,155,122,0.2) 0%, transparent 70%)' }} />
                  <svg className="w-14 h-14 text-[#3D9B7A] relative" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-label text-[rgba(248,246,242,0.60)]" style={{ fontSize: '9px' }}>
                  Analiz TamamlandÄ±
                </span>
              </div>
            </div>
          )}
        </div>

        {/* â”€â”€ Progress bar â€” refined â”€â”€ */}
        <div className="w-full flex flex-col gap-2.5">
          <div className="w-full h-[2.5px] rounded-full bg-[rgba(248,246,242,0.04)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${overallProgress}%`,
                background: isError
                  ? '#C47A7A'
                  : isDone
                    ? EMERALD
                    : `linear-gradient(90deg, ${GOLD}, ${EMERALD})`,
                boxShadow: isError ? 'none' : isDone ? `0 0 8px ${EMERALD}40` : `0 0 6px ${GOLD}30`,
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] font-light text-[rgba(248,246,242,0.30)] tabular-nums tracking-tight">
              {overallProgress}%
            </span>
            {isRunning && (
              <span className="text-label-sm text-[rgba(248,246,242,0.25)]">
                AÅŸama {currentStage + 1}/5
              </span>
            )}
          </div>
        </div>

        {/* â”€â”€ Micro-message â€” editorial â”€â”€ */}
        {isRunning && (
          <p
            key={microMessage}
            className="font-body text-[13px] text-[rgba(214,185,140,0.70)] text-center tracking-[0.02em] leading-relaxed"
            style={{ animation: 'microMessageFade 1.8s ease-in-out', maxWidth: '28ch', margin: '0 auto' }}
          >
            {microMessage}
          </p>
        )}

        {/* â”€â”€ Stage timeline â€” premium â”€â”€ */}
        <div
          className="w-full relative flex flex-col rounded-xl px-5 py-4"
          style={{ background: 'rgba(14,12,10,0.40)', border: '1px solid rgba(214,185,140,0.05)' }}
        >
          {/* Vertical spine */}
          <div
            className="absolute top-6 bottom-6 w-px"
            style={{
              left: 25,
              background: 'linear-gradient(to bottom, rgba(214,185,140,0.08), rgba(61,155,122,0.15), rgba(214,185,140,0.03))',
            }}
          />

          {STAGES.map((stage, i) => {
            const isDoneStage = i < currentStage || isDone
            const isActive    = i === currentStage && isRunning
            const isWaiting   = i > currentStage && isRunning
            const isErrorStage = isError && i === currentStage

            const dotColor = isDoneStage ? '#3D9B7A' : isActive ? '#D6B98C' : isErrorStage ? '#C47A7A' : 'rgba(248,246,242,0.12)'
            const dotSize  = isActive ? 12 : isDoneStage ? 10 : 8
            const labelColor = isDoneStage ? 'rgba(61,155,122,0.85)' : isActive ? '#D6B98C' : isErrorStage ? '#C47A7A' : isWaiting ? 'rgba(248,246,242,0.2)' : 'rgba(248,246,242,0.35)'

            return (
              <div
                key={stage.label}
                className="flex items-center gap-4 py-2.5 transition-all duration-300"
                style={{
                  paddingLeft: 0,
                  animation: isDoneStage ? `stageFadeIn 0.25s ease-out ${i * 40}ms both` : 'none',
                }}
              >
                {/* Dot on spine */}
                <div className="relative z-10 flex-shrink-0 flex items-center justify-center" style={{ width: 32, height: 32 }}>
                  {/* Pulse ring for active */}
                  {isActive && (
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: 22, height: 22,
                        border: '1px solid rgba(214,185,140,0.3)',
                        animation: 'markerRing 1.8s ease-out infinite',
                      }}
                    />
                  )}
                  <div
                    className="rounded-full transition-all duration-500"
                    style={{
                      width: dotSize, height: dotSize,
                      background: dotColor,
                      boxShadow: isDoneStage
                        ? '0 0 8px rgba(61,155,122,0.4)'
                        : isActive
                          ? '0 0 12px rgba(214,185,140,0.5)'
                          : 'none',
                    }}
                  />
                </div>

                {/* Row content */}
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="text-sm leading-none"
                      style={{ opacity: isWaiting ? 0.3 : 0.8, transition: 'opacity 0.4s ease' }}
                    >
                      {stage.icon}
                    </span>
                    <span
                      className="font-body text-[12px] tracking-wide transition-colors duration-400"
                      style={{ color: labelColor }}
                    >
                      {stage.label}
                    </span>
                  </div>

                  {/* Right: check / spinner / progress bar */}
                  <div className="flex-shrink-0 ml-3">
                    {isDoneStage && (
                      <svg className="w-3.5 h-3.5 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isActive && (
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-[2px] rounded-full bg-[rgba(248,246,242,0.06)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#D6B98C] transition-all duration-300"
                            style={{ width: `${stageProgress * 100}%` }}
                          />
                        </div>
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-[#D6B98C] border-t-transparent animate-spin" />
                      </div>
                    )}
                    {isErrorStage && (
                      <svg className="w-3.5 h-3.5 text-[#C47A7A]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* â”€â”€ Error state â€” premium â”€â”€ */}
        {isError && (
          <div
            className="w-full flex flex-col gap-5"
            style={{ animation: 'sectionReveal 0.4s ease-out' }}
          >
            <div className="rounded-lg border border-[rgba(196,122,122,0.15)] bg-[rgba(196,122,122,0.04)] px-5 py-4">
              <p className="font-body text-[13px] text-[rgba(196,122,122,0.85)] leading-[1.7]">
                {pipelineState.message}
              </p>
            </div>

            <div className="flex gap-3">
              <PremiumButton
                type="button"
                variant="ghost"
                size="md"
                onClick={handleBack}
                className="flex-1 justify-center"
              >
                Geri DÃ¶n
              </PremiumButton>
              <PremiumButton
                type="button"
                variant="ghost"
                size="md"
                onClick={handleSkip}
                className="flex-1 justify-center"
              >
                SonuÃ§lara Git
              </PremiumButton>
              <PremiumButton
                type="button"
                variant="gold"
                size="md"
                onClick={handleRetry}
                className="flex-1 justify-center"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Tekrar Dene
              </PremiumButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
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





