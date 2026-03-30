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
import { savePhoto } from '@/lib/photo-bridge'
import { run as runGeometryAnalysis } from '@/lib/ai/analysis'
import { computeFocusAreas, computeQualityScore, getSuggestedZones } from '@/lib/ai/aesthetic-scoring'
import { generateSuggestions, generatePatientSummaryText, generateFocusAreaLabels, mapFocusAreasToRegionScores } from '@/lib/ai/result-generator'
import { deriveRadarAnalysis } from '@/lib/ai/radar-scores'
import { deriveDoctorAnalysis, deriveConsultationReadiness } from '@/lib/ai/derive-doctor-analysis'
import { analyzeWrinkles, deriveSkinTexture } from '@/lib/ai/wrinkle-analysis'
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

// ─── Types ──────────────────────────────────────────────────

type VisualStage = 0 | 1 | 2 | 3 | 4

type PipelineState =
  | { phase: 'running' }
  | { phase: 'error'; message: string }
  | { phase: 'done' }

// ─── Stage definitions ──────────────────────────────────────

const STAGES = [
  {
    label: 'Yüz Tespiti',
    icon: '◎',
    messages: [
      'Yüz noktaları tespit ediliyor…',
      'Landmark modeli yükleniyor…',
      'Yüz çerçevesi belirleniyor…',
    ],
  },
  {
    label: 'Landmark Haritalama',
    icon: '⬡',
    messages: [
      '468 nokta haritalanıyor…',
      'Doğruluk artırılıyor…',
      'En iyi frame seçildi',
    ],
  },
  {
    label: 'Geometri Analizi',
    icon: '△',
    messages: [
      'Simetri hesaplanıyor…',
      'Oranlar analiz ediliyor…',
      'Altın oran karşılaştırması…',
    ],
  },
  {
    label: 'Cilt & Doku Tarama',
    icon: '◈',
    messages: [
      'Cilt çizgileri taranıyor…',
      'Doku analizi yapılıyor…',
      'Kırışıklık haritası oluşturuluyor…',
    ],
  },
  {
    label: 'AI Tahmin',
    icon: '✦',
    messages: [
      'Model confidence optimize ediliyor…',
      'Sonuçlar derleniyor…',
      'Rapor oluşturuluyor…',
    ],
  },
] as const

const MIN_STAGE_MS = 1500
const PIPELINE_TIMEOUT_MS = 25_000

// Navigation is now handled via Next.js router (client-side) to preserve
// in-memory Zustand state — avoids data loss from localStorage hydration race.

// ─── Timeout utility ────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı (${ms / 1000}s)`)), ms)
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

// ─── Canvas drawing utilities ───────────────────────────────

const GOLD = '#D6B98C'
const EMERALD = '#3D9B7A'
const NEON_GREEN = '#4AE3A7'
const BRIGHT_GOLD = '#E8C97A'

/** Compute face bounding box from landmarks (normalized 0–1) */
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

// ─── Analysis pipeline ──────────────────────────────────────

async function runLocalAnalysisPipeline(
  photoUrl: string,
  onStage: (stage: VisualStage) => void,
  onLandmarks: (landmarks: Landmark[]) => void,
): Promise<EnhancedAnalysisResult> {
  // ── Stage 0: Face Detection ──
  onStage(0)

  const stage0Result = await withMinDelay(async () => {
    await initHumanEngine()

    const image = new Image()
    image.crossOrigin = 'anonymous'
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Fotoğraf yüklenemedi'))
        image.src = photoUrl
      }),
      5000,
      'Fotoğraf yükleme'
    )
    if (image.naturalWidth < 100 || image.naturalHeight < 100) {
      throw new Error('Yüz algılanamadı. Lütfen tekrar deneyin.')
    }

    const det = await withTimeout(detectFace(image), 8000, 'Yüz algılama')
    if (!det || det.landmarks.length < 400) {
      throw new Error('Yüz algılanamadı. Lütfen tekrar deneyin.')
    }

    onLandmarks(det.landmarks)

    return { image, det }
  }, MIN_STAGE_MS)
  const detection = stage0Result.det
  const imgEl = stage0Result.image

  // ── Stage 1: Landmark Mapping + multi-frame age ──
  onStage(1)

  const stage1Result = await withMinDelay(async () => {
    const geo = runGeometryAnalysis(detection.landmarks)
    if (!geo) throw new Error('Yüz geometrisi hesaplanamadı. Lütfen tekrar deneyin.')

    let age = detection.age
    let gender = detection.gender
    let genderConf = detection.genderConfidence

    try {
      const imgCopies: HTMLImageElement[] = []
      for (let i = 0; i < 3; i++) {
        const copy = new Image()
        copy.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          copy.onload = () => resolve()
          copy.onerror = () => reject()
          copy.src = photoUrl
        })
        imgCopies.push(copy)
      }
      const multiResult = await detectFaceMultiFrame(imgCopies, 0.5)
      if (multiResult && multiResult.age != null) {
        age = multiResult.age
        gender = multiResult.gender
        genderConf = multiResult.genderConfidence
      }
    } catch (err) {
      console.warn('[Pipeline] Multi-frame age estimation failed (non-fatal):', err)
    }

    return { geo, age, gender, genderConf }
  }, MIN_STAGE_MS)
  const geometry = stage1Result.geo
  const finalAge = stage1Result.age
  const finalGender = stage1Result.gender
  const finalGenderConf = stage1Result.genderConf

  // ── Stage 2: Geometry / Aesthetic Scoring ──
  onStage(2)

  const stage2Result = await withMinDelay(async () => {
    const fa = computeFocusAreas({
      landmarks: detection.landmarks,
      metrics: geometry.metrics,
      estimatedAge: finalAge,
    })
    const qs = computeQualityScore(
      detection.confidence,
      detection.landmarks.length,
      imgEl.naturalWidth,
      imgEl.naturalHeight
    )
    const sz = getSuggestedZones(fa, 50)
    return { fa, qs, sz }
  }, MIN_STAGE_MS)
  const focusAreas = stage2Result.fa
  const qualityScore = stage2Result.qs
  const suggestedZones = stage2Result.sz

  // ── Stage 3: Skin / Wrinkle Analysis + Image Quality + Symmetry ──
  onStage(3)

  const stage3Result = await withMinDelay(async () => {
    // Image quality assessment
    let iq = null
    try {
      iq = assessImageQuality(detection.landmarks, detection.confidence, imgEl)
    } catch (err) {
      console.warn('[Pipeline] Image quality assessment failed (non-fatal):', err)
    }

    // Wrinkle analysis (13 regions)
    let wa = null
    try {
      wa = analyzeWrinkles(imgEl, detection.landmarks, finalAge)
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
      sym = computeSymmetryAnalysis(detection.landmarks)
    } catch (err) {
      console.warn('[Pipeline] Symmetry analysis failed (non-fatal):', err)
    }

    return { iq, wa, st, sym }
  }, MIN_STAGE_MS)

  const imageQuality = stage3Result.iq
  const wrinkleAnalysis = stage3Result.wa
  const skinTexture = stage3Result.st
  const symmetryAnalysis = stage3Result.sym

  // ── Stage 4: AI Prediction / Age Estimation / Build result ──
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
        detectionConfidence: detection.confidence,
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
      confidence: detection.confidence,
      qualityScore,
      wrinkleAnalysis,
      engine: 'human',
      imageQuality,
      ageEstimation: ageEst,
      skinTexture,
      symmetryAnalysis,
    }
    return result
  }, MIN_STAGE_MS)

  return enhanced
}

// ─── Main component ─────────────────────────────────────────

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
  const [stageProgress, setStageProgress] = useState(0) // 0–1 within current stage
  const [microMessage, setMicroMessage] = useState<string>(STAGES[0].messages[0])
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null)
  const [freeze, setFreeze] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const stageStartRef = useRef(performance.now())
  const microIndexRef = useRef(0)
  const microTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Micro-message cycling ──
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

  // ── Canvas overlay animation ──
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

    // Dynamic scaling: expand overlay 15–20% beyond mesh boundary
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

        // Outer contour — neon glow
        drawConnections(ctx, landmarks, FACE_OVAL, w, h, cx, cy, scaleX, scaleY, lineProgress, EMERALD, 1.5, true)
        // Jawline — full chin-to-ear
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks, currentStage, pipelineState.phase, freeze, photoUrl])

  // ── Main pipeline ──
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
        message: 'Analiz zaman aşımına uğradı. Lütfen tekrar deneyin.',
      })
      destroyHumanEngine()
    }, PIPELINE_TIMEOUT_MS)

    async function runPipeline() {
      try {
        await withTimeout(waitForHydration(), 3000, 'Store yükleme')

        if (abortRef.current) return

        const { leads, updateLeadAnalysis, clearCurrentLead } = useClinicStore.getState()
        const lead = leads.find((l) => l.id === leadId)

        if (!lead) {
          console.error('[Pipeline] Lead not found:', leadId)
          setPipelineState({
            phase: 'error',
            message: 'Analiz verisi bulunamadı. Lütfen formu tekrar doldurun.',
          })
          return
        }

        clearCurrentLead()

        const photo = lead.patient_photo_url
        if (photo) {
          savePhoto(leadId, photo)
          setPhotoUrl(photo)
        }

        if (!photo) {
          clearTimeout(safetyTimer)
          setPipelineState({ phase: 'done' })
          await delay(400)
          routerRef.current.replace(`/analysis/result?id=${leadId}`)
          return
        }

        // ── Run local analysis pipeline ──
        const enhanced = await runLocalAnalysisPipeline(
          photo,
          (stage) => {
            if (!abortRef.current) {
              setCurrentStage(stage)
              stageStartRef.current = performance.now()
            }
          },
          (lm) => {
            if (!abortRef.current) setLandmarks(lm)
          },
        )

        if (abortRef.current) return

        // ── Save results ──
        const { geometry, estimatedAge, focusAreas, suggestedZones, confidence, qualityScore, wrinkleAnalysis, ageEstimation } = enhanced

        const suggestions = generateSuggestions(enhanced)
        const summaryText = generatePatientSummaryText(enhanced, lead.concern_area)
        const focusLabels = generateFocusAreaLabels(focusAreas)
        const radarAnalysis = deriveRadarAnalysis(enhanced, lead.capture_confidence as 'high' | 'medium' | 'low' | undefined)

        const doctorAnalysis = deriveDoctorAnalysis(leadId, geometry, lead)
        const enhancedRegionScores = mapFocusAreasToRegionScores(focusAreas, geometry.metrics)
        doctorAnalysis.region_scores = enhancedRegionScores
        doctorAnalysis.model_version = 'human-v1'

        const readiness = deriveConsultationReadiness(lead)

        updateLeadAnalysis(leadId, {
          doctor_analysis: doctorAnalysis,
          patient_summary: {
            status: 'ready',
            photo_quality: qualityScore >= 60 ? 'good' : qualityScore >= 30 ? 'acceptable' : 'poor',
            focus_areas: focusLabels.length > 0 ? focusLabels : ['Genel Yüz Dengesi'],
            consultation_recommended: true,
            summary_text: summaryText,
            feature_schema_version: '2.0.0',
            model_version: 'human-v1',
          },
          consultation_readiness: readiness,
          ai_scores: {
            symmetry: geometry.scores.symmetry,
            proportion: geometry.scores.proportion,
            suggestions,
            metrics: geometry.metrics,
          },
          estimated_age: estimatedAge,
          estimated_gender: enhanced.gender ?? null,
          estimated_gender_confidence: enhanced.genderConfidence > 0 ? enhanced.genderConfidence : undefined,
          focus_areas: focusAreas.map((a) => ({
            region: a.region,
            label: a.label,
            score: a.score,
            insight: a.insight,
            doctorReviewRecommended: a.doctorReviewRecommended,
          })),
          wrinkle_scores: wrinkleAnalysis ? {
            regions: wrinkleAnalysis.regions.map((r) => ({
              region: r.region,
              label: r.label,
              density: r.density,
              score: r.score,
              level: r.level,
              insight: r.insight,
              confidence: r.confidence,
            })),
            overallScore: wrinkleAnalysis.overallScore,
            overallLevel: wrinkleAnalysis.overallLevel,
          } : undefined,
          age_estimation: ageEstimation ? {
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
          radar_analysis: radarAnalysis,
          suggested_zones: suggestedZones,
          analysis_confidence: confidence,
          quality_score: qualityScore,
          analysis_source: {
            provider: 'human-local',
            source: 'real-client-side',
            facemesh_ok: true,
            perfectcorp_ok: false,
            analyzed_at: new Date().toISOString(),
          },
          status: 'analysis_ready',
        })

        // ── Final freeze 0.5s then navigate ──
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
          : 'Analiz sırasında bir hata oluştu'

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Render ──

  const isRunning = pipelineState.phase === 'running'
  const isError = pipelineState.phase === 'error'
  const isDone = pipelineState.phase === 'done'
  const overallProgress = isError ? 0 : isDone ? 100 : Math.round(((currentStage + stageProgress) / 5) * 100)

  return (
    <div
      className="theme-dark min-h-screen flex flex-col items-center justify-center px-4 py-8 relative"
      style={{
        background: 'linear-gradient(135deg, #0E0B09 0%, #1A1410 25%, #14181A 55%, #0B0E10 100%)',
      }}
    >
      {/* Ambient depth glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(214,185,140,0.025) 0%, transparent 50%)' }} />

      <div className="relative w-full max-w-md flex flex-col items-center gap-6">

        {/* ── Photo with canvas overlay ── */}
        <div
          className="relative w-full overflow-hidden rounded-2xl border border-[rgba(214,185,140,0.12)]"
          style={{
            aspectRatio: '3 / 4',
            boxShadow: isDone
              ? '0 0 30px rgba(61,155,122,0.3), 0 0 80px rgba(61,155,122,0.08)'
              : '0 8px 40px rgba(0,0,0,0.5)',
            animation: isDone ? 'glowPulse 2s ease-in-out infinite' : undefined,
            transition: 'box-shadow 0.6s ease',
          }}
        >
          {/* Background photo */}
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Analiz edilen fotoğraf"
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

          {/* Stage indicator badge */}
          {isRunning && (
            <div
              className="absolute top-4 left-4 flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                background: 'rgba(14, 11, 9, 0.75)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(214, 185, 140, 0.15)',
                animation: 'stageFadeIn 0.4s ease-out',
              }}
            >
              <span
                className="text-sm"
                style={{ animation: 'aiPulse 1.5s ease-in-out infinite' }}
              >
                {STAGES[currentStage].icon}
              </span>
              <span className="font-body text-[11px] font-medium text-[#D6B98C] tracking-wide uppercase">
                {STAGES[currentStage].label}
              </span>
            </div>
          )}

          {/* Done overlay */}
          {isDone && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: 'rgba(14, 11, 9, 0.3)',
                animation: 'stageFadeIn 0.3s ease-out',
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="w-12 h-12 text-[#3D9B7A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-body text-xs text-[rgba(248,246,242,0.7)] tracking-wider uppercase">
                  Analiz Tamamlandı
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Progress bar ── */}
        <div className="w-full flex flex-col gap-2">
          <div className="w-full h-[3px] rounded-full bg-[rgba(248,246,242,0.06)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${overallProgress}%`,
                background: isError
                  ? '#C47A7A'
                  : isDone
                    ? EMERALD
                    : `linear-gradient(90deg, ${GOLD}, ${EMERALD})`,
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-[11px] text-[rgba(248,246,242,0.35)] tabular-nums">
              {overallProgress}%
            </span>
            {isRunning && (
              <span className="font-body text-[11px] text-[rgba(248,246,242,0.35)]">
                Aşama {currentStage + 1}/5
              </span>
            )}
          </div>
        </div>

        {/* ── Micro-message ── */}
        {isRunning && (
          <p
            key={microMessage}
            className="font-body text-[13px] text-[#D6B98C] text-center tracking-wide"
            style={{ animation: 'microMessageFade 1.8s ease-in-out' }}
          >
            {microMessage}
          </p>
        )}

        {/* ── Stage timeline ── */}
        <div className="w-full relative flex flex-col">
          {/* Vertical spine */}
          <div
            className="absolute top-4 bottom-4 w-px"
            style={{
              left: 15,
              background: 'linear-gradient(to bottom, rgba(214,185,140,0.1), rgba(61,155,122,0.2), rgba(214,185,140,0.05))',
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

        {/* ── Error state ── */}
        {isError && (
          <div
            className="w-full flex flex-col gap-4"
            style={{ animation: 'stageFadeIn 0.3s ease-out' }}
          >
            <div className="rounded-xl border border-[rgba(196,122,122,0.2)] bg-[rgba(196,122,122,0.06)] px-4 py-3">
              <p className="font-body text-[13px] text-[#C47A7A] leading-relaxed">
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
                Geri Dön
              </PremiumButton>
              <PremiumButton
                type="button"
                variant="ghost"
                size="md"
                onClick={handleSkip}
                className="flex-1 justify-center"
              >
                Sonuçlara Git
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
