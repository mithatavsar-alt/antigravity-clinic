'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Landmark } from '@/lib/ai/types'
import {
  init as initHumanEngine,
  detectFaceFromVideo,
  destroy as destroyHumanEngine,
} from '@/lib/ai/human-engine'
import {
  evaluateFaceGuide,
  type TargetAngle,
  calculateBrightness,
  estimateSharpness,
  detectShadow,
  smoothLandmarks,
  resetSmoothing,
  resetStability,
  pushDetection,
  pushMiss,
  resetFaceLock,
  NO_FACE_STATUS,
  LEFT_EYE,
  RIGHT_EYE,
  LEFT_EYEBROW,
  RIGHT_EYEBROW,
  NOSE_BRIDGE,
  UPPER_LIP,
  LOWER_LIP,
  JAWLINE,
  FOREHEAD_ZONE,
  LEFT_UNDER_EYE,
  RIGHT_UNDER_EYE,
  LEFT_NASOLABIAL,
  RIGHT_NASOLABIAL,
  type FaceGuideStatus,
} from '@/lib/ai/face-guide'
import { FACEMESH_TESSELATION } from '@/lib/ai/facemesh-tesselation'
import {
  computeFaceContour,
  drawFaceContour,
  drawDynamicVignette,
  drawContourAccents,
  drawFixedGuideFrame,
  projectLandmarkToCanvas,
  resetContourSmoothing,
  type GuideFrameState,
} from '@/lib/ai/face-contour'
import type {
  CaptureFrameMetrics,
  CaptureLivenessSignals,
  CaptureLivenessStep,
  CaptureManifest,
  CaptureMetricSummary,
  CapturePoseSummary,
  CapturePoseVariance,
  CaptureRegionVisibility,
  CaptureViewKey,
  CaptureViewManifest,
  LivenessStatus,
} from '@/types/capture'

// ─── Ear-excluded tesselation mesh ─────────────────────────
// Landmarks in the ear/preauricular region that should NOT appear in the
// face-only overlay. Edges touching any of these are excluded at module load.
// These are the outermost lateral landmarks that sit on/near the ear tragus
// and sideburn area, well outside the clinically relevant facial surface.
const EAR_AREA_LANDMARKS = new Set([
  // Left ear / preauricular (widest lateral points)
  234, 127, 93, 132, 58, 172,
  // Right ear / preauricular (widest lateral points)
  454, 356, 323, 361, 288, 389,
])

const FACE_ONLY_TESSELATION = FACEMESH_TESSELATION.filter(
  ([a, b]) => !EAR_AREA_LANDMARKS.has(a) && !EAR_AREA_LANDMARKS.has(b)
)

// ─── Types ──────────────────────────────────────────────────
export type CaptureMode = 'single' | 'multi'
export type MultiStep = 'front' | 'left' | 'right'
export type { CaptureManifest, CaptureViewManifest, CaptureViewKey }

export interface ViewQualityMeta {
  view: CaptureViewKey
  qualityScore: number
  acceptanceScore: number
  captured: boolean
  qualityBand: CaptureViewManifest['quality_band']
  recaptureRequired: boolean
}

export interface CaptureMetadata {
  confidence: 'high' | 'medium' | 'low'
  qualityScore: number
  captureQualityScore: number
  /** Top N temporally-distinct frames from the capture buffer (best quality) */
  capturedFrames?: string[]
  /** Accepted temporal frame sets preserved per view */
  viewFrames?: Partial<Record<CaptureViewKey, string[]>>
  /** Per-view quality scores (multi-capture only) */
  viewQualities?: ViewQualityMeta[]
  captureManifest?: CaptureManifest
  recaptureRecommended?: boolean
  recaptureViews?: CaptureViewKey[]
  livenessStatus?: LivenessStatus
  livenessConfidence?: number
  livenessRequired?: boolean
  livenessPassed?: boolean
  livenessSignals?: CaptureLivenessSignals
}

export interface MultiCaptureResult {
  front: string
  left: string
  right: string
}

interface FaceGuideCaptureProps {
  onCapture: (dataUrl: string, meta?: CaptureMetadata) => void
  onClose: () => void
  mode?: CaptureMode
  autoConfirm?: boolean
  onMultiCapture?: (photos: MultiCaptureResult, meta?: CaptureMetadata) => void
}

// Mimic expressions removed — 3-pose capture only (front, left, right)

type InitState = 'loading' | 'ready' | 'error'

/**
 * Validation state machine — purely Face Mesh driven.
 *  idle → detecting → tracking → stabilizing → validated → advancing
 */
type ValidationPhase = 'idle' | 'detecting' | 'tracking' | 'stabilizing' | 'validated' | 'advancing'

// ─── Constants ──────────────────────────────────────────────
const ADVANCE_DELAY_MS = 600
const FAILSAFE_MS = 10000
const BEST_FRAME_BUFFER_SIZE = 20
const BEST_FRAME_WINDOW_MS = 3000
/** How many distinct frames to export for multi-frame analysis */
const MULTI_FRAME_EXPORT_COUNT = 8
/** Minimum temporal gap (ms) between exported frames to ensure distinctness */
const MULTI_FRAME_MIN_GAP_MS = 150
const REJECTED_FRAME_SAMPLE_MS = 250

// ─── Auto-fit (software preview fitting) ───────────────────
// Smoothly zooms/pans the camera preview so the detected face
// is brought into the target oval, giving the camera an
// "assisted" feeling. Purely visual — does NOT affect capture.
const AUTOFIT_SMOOTHING = 0.07          // Per-frame blend toward target (gentle)
const AUTOFIT_RELEASE_SPEED = 0.035     // Slower return to neutral when face lost
const AUTOFIT_MAX_SCALE = 1.3           // Max zoom to preserve image quality
const AUTOFIT_IDEAL_FACE_HEIGHT = 0.43  // Target face-height ratio in frame for the face-only guide
const AUTOFIT_MAX_SHIFT = 10            // Max translate in % of container
const AUTOFIT_DEAD_ZONE = 0.03          // Ignore offsets smaller than this (reduces jitter)

interface AutoFitState {
  scale: number
  tx: number   // translateX in %
  ty: number   // translateY in %
}

// ─── Countdown constants ──────────────────────────────────
// Front: full 3→2→1 countdown for careful frontal alignment.
// Left/Right: quick 1-second countdown — stability is ensured by
// STABILITY_FRAMES_REQUIRED consecutive ready frames BEFORE countdown starts.
const COUNTDOWN_SECONDS_FRONT = 3
const COUNTDOWN_MS_FRONT = COUNTDOWN_SECONDS_FRONT * 1000
const COUNTDOWN_SECONDS_SIDE = 1
const COUNTDOWN_MS_SIDE = COUNTDOWN_SECONDS_SIDE * 1000

// ─── ANGLE-SPECIFIC READINESS ──────────────────────────────
// 6 checks aligned with the visible quality pills:
//   1. Distance  (Mesafe)  — face size / proximity
//   2. Lighting  (Işık)    — brightness & shadow
//   3. Angle     (Açı)     — head pose for current step
//   4. Centering (Konum)   — face position in frame
//   5. Sharpness (Netlik)  — image clarity
//   6. Stability (İfade)   — landmark consistency / expression
//
// Hard blockers reject immediately (no face, too far, outside frame,
// unreadable blur, completely wrong pose for the current step).
//
// FRONT VIEW:  strict — all 6/6 soft checks must pass.
// LEFT/RIGHT:  tolerant — 5/6 soft checks, so one marginal metric
//              (e.g. stability after head turn) doesn't stall capture.
//              Wrong pose direction is still a hard blocker.

/** Hard-blocker floors — below these, capture is unsafe */
const HARD_MIN_DISTANCE   = 0.25
const HARD_MIN_CENTERING  = 0.15
const HARD_MIN_SHARPNESS  = 0.15
const HARD_MIN_COMPLETENESS_FRONT = 0.72
const HARD_MIN_COMPLETENESS_SIDE = 0.52
const HARD_MIN_OCCLUSION_FRONT = 0.74
const HARD_MIN_OCCLUSION_SIDE = 0.58
const HARD_MIN_SIDE_CROW = 0.38
const HARD_MIN_SIDE_NASOLABIAL = 0.38
const HARD_MIN_SIDE_JAWLINE = 0.42

/** Minimum ready frames before countdown starts (prevents premature capture) */
const STABILITY_FRAMES_REQUIRED = 6

/** Soft checks required: front must pass all 6, sides need 5 of 6 */
const MIN_PASSING_FRONT = 6
const MIN_PASSING_SIDE  = 5


function isReadyForCapture(
  status: FaceGuideStatus,
  isSide: boolean,
  relaxed = false,
): boolean {
  // ── Hard blockers — always reject (all steps) ──
  if (!status.faceDetected) return false
  if (!status.faceLocked) return false

  const qb = status.qualityBreakdown

  // Face too small / too far
  if (qb.distance < HARD_MIN_DISTANCE) return false
  // Face completely outside frame
  if (qb.centering < HARD_MIN_CENTERING) return false
  // Image unreadable
  if (qb.sharpness < HARD_MIN_SHARPNESS) return false
  if (status.landmarkCompleteness < (isSide ? HARD_MIN_COMPLETENESS_SIDE : HARD_MIN_COMPLETENESS_FRONT)) return false
  if (status.occlusionScore < (isSide ? HARD_MIN_OCCLUSION_SIDE : HARD_MIN_OCCLUSION_FRONT)) return false
  // Wrong pose direction: side requires 'ok' (correct yaw for left/right);
  // front rejects hard turns (angle score near zero).
  // This is a hard blocker — wrong-angle capture is never allowed.
  if (isSide && status.angle !== 'ok') return false
  if (!isSide && qb.angle < 0.25) return false
  if (isSide && status.crowFeetScore < HARD_MIN_SIDE_CROW) return false
  if (isSide && status.regionVisibility.nasolabial < HARD_MIN_SIDE_NASOLABIAL) return false
  if (isSide && status.regionVisibility.jawline < HARD_MIN_SIDE_JAWLINE) return false

  // ── Front-only hard blockers — full face visibility ──
  if (!isSide) {
    if (!status.eyesVisible) return false       // both eyes must be visible
    if (!status.foreheadVisible) return false    // forehead not cropped
    if (!status.chinVisible) return false        // chin not cropped
    if (status.symmetryScore < 0.55) return false  // face roughly symmetric (frontal)
  }

  // ── 6 soft checks — counted individually ──
  // 1. Distance   2. Lighting   3. Angle
  // 4. Centering  5. Sharpness  6. Stability
  const t = relaxed
    ? (isSide ? 0.28 : 0.40)
    : (isSide ? 0.38 : 0.50)

  let passing = 0
  if (qb.distance  >= t) passing++                         // 1. Distance
  if (qb.lighting  >= t) passing++                         // 2. Lighting
  if (qb.angle     >= t) passing++                         // 3. Angle
  // Side poses naturally de-center — use a relaxed centering threshold
  if (qb.centering >= (isSide ? t * 0.6 : t)) passing++   // 4. Centering
  if (qb.sharpness >= t) passing++                         // 5. Sharpness
  // Side poses have volatile stability after head turn — relax
  if (qb.stability >= (isSide ? t * 0.5 : t)) passing++   // 6. Stability

  // Front: strict 6/6 — all checks must pass
  // Left/Right: tolerant 5/6 — one marginal check won't stall capture
  const required = isSide ? MIN_PASSING_SIDE : MIN_PASSING_FRONT
  const acceptanceThreshold = relaxed
    ? (isSide ? 0.68 : 0.80)
    : (isSide ? 0.74 : 0.86)
  return passing >= required && status.captureAcceptance >= acceptanceThreshold
}

// ─── MANUAL CAPTURE ELIGIBILITY (hardened fallback) ──────────
// Nearly identical trust to auto-capture — only difference is:
//   • Soft-check gate: 5/6 front (vs 6/6 auto), 4/6 side (vs 5/6 auto)
//   • No stability-frame countdown (manual is instantaneous)
//
// Everything else matches auto:
//   • Same hard blockers (angle, distance, completeness, occlusion)
//   • Same front visibility (eyes, forehead, chin, symmetry ≥ 0.55)
//   • Same side region checks (crow's feet, nasolabial, jawline)
//   • Same acceptance thresholds (0.86 front, 0.82 side)
//
// Manual is NOT a shortcut — it's a fallback for when one soft metric
// (typically stability) can't settle, but all other evidence is strong.

const MANUAL_THRESHOLD_FRONT = 0.86
const MANUAL_THRESHOLD_SIDE  = 0.72
const MANUAL_MIN_PASSING_FRONT = 5
const MANUAL_MIN_PASSING_SIDE  = 4

function isManualCaptureEligible(
  status: FaceGuideStatus,
  isSide: boolean,
): boolean {
  // ── Hard blockers — same as auto-capture ──
  if (!status.faceDetected) return false
  if (!status.faceLocked) return false

  const qb = status.qualityBreakdown

  // Face too small / too far
  if (qb.distance < HARD_MIN_DISTANCE) return false
  // Face completely outside frame
  if (qb.centering < HARD_MIN_CENTERING) return false
  // Image unreadable
  if (qb.sharpness < HARD_MIN_SHARPNESS) return false
  if (status.landmarkCompleteness < (isSide ? HARD_MIN_COMPLETENESS_SIDE : HARD_MIN_COMPLETENESS_FRONT)) return false
  if (status.occlusionScore < (isSide ? HARD_MIN_OCCLUSION_SIDE : HARD_MIN_OCCLUSION_FRONT)) return false

  // Front: reject wrong angles — aligned with auto-capture's hard blocker
  if (!isSide && qb.angle < 0.25) return false

  if (isSide && status.angle !== 'ok') return false
  if (isSide && status.crowFeetScore < HARD_MIN_SIDE_CROW) return false
  if (isSide && status.regionVisibility.nasolabial < HARD_MIN_SIDE_NASOLABIAL) return false
  if (isSide && status.regionVisibility.jawline < HARD_MIN_SIDE_JAWLINE) return false

  // Front-only visibility — must see both eyes, forehead, chin, symmetry (same as auto)
  if (!isSide) {
    if (!status.eyesVisible) return false
    if (!status.foreheadVisible) return false
    if (!status.chinVisible) return false
    if (status.symmetryScore < 0.55) return false
  }

  // ── Soft-check gate (reduced vs auto but not absent) ──
  const t = isSide ? 0.38 : 0.50
  let passing = 0
  if (qb.distance  >= t) passing++
  if (qb.lighting  >= t) passing++
  if (qb.angle     >= t) passing++
  if (qb.centering >= (isSide ? t * 0.6 : t)) passing++
  if (qb.sharpness >= t) passing++
  if (qb.stability >= (isSide ? t * 0.5 : t)) passing++

  const minPassing = isSide ? MANUAL_MIN_PASSING_SIDE : MANUAL_MIN_PASSING_FRONT
  if (passing < minPassing) return false

  // Score threshold — matches auto-capture acceptance thresholds
  const threshold = isSide ? MANUAL_THRESHOLD_SIDE : MANUAL_THRESHOLD_FRONT
  return status.captureAcceptance >= threshold
}

const TIPS = [
  'Rahat ve doğal ifadenizi koruyun',
  'Saçlarınızın yüzünüzü örtmediğinden emin olun',
  'Gözlük takıyorsanız çıkarmanız önerilir',
  'Yüzünüze eşit ışık düşen bir ortam idealdir',
  'Sade arka plan daha iyi sonuç verir',
]
const MULTI_LABELS: Record<MultiStep, string> = {
  front: 'Ön Görünüm',
  left: 'Sol Yüz',
  right: 'Sağ Yüz',
}
const MULTI_INSTRUCTIONS: Record<MultiStep, string> = {
  front: 'Kameraya doğal bakın',
  left: 'Sol yüz için başınızı hafifçe sağa çevirin',
  right: 'Sağ yüz için başınızı hafifçe sola çevirin',
}

interface InitialGuideHint {
  width: string
  aspectRatio: string
  path: string
  mirror?: boolean
  offsetX?: string
}

const FRONT_GUIDE_PATH = 'M50 7 C31 7 18 20 14 38 C11 55 14 73 24 87 C31 97 40 104 50 106 C60 104 69 97 76 87 C86 73 89 55 86 38 C82 20 69 7 50 7 Z'
const SIDE_GUIDE_PATH = 'M58 8 C45 8 33 16 25 29 C18 41 17 57 22 72 C28 87 40 98 54 103 C66 104 75 99 81 90 C86 82 86 71 81 62 C77 54 70 48 65 42 C60 35 58 25 58 8 Z'

function getInitialGuideHint(step: MultiStep): InitialGuideHint {
  if (step === 'left') {
    return {
      width: '60%',
      aspectRatio: '60 / 96',
      path: SIDE_GUIDE_PATH,
      offsetX: '-3%',
    }
  }
  if (step === 'right') {
    return {
      width: '60%',
      aspectRatio: '60 / 96',
      path: SIDE_GUIDE_PATH,
      mirror: true,
      offsetX: '3%',
    }
  }
  return {
    width: '68%',
    aspectRatio: '68 / 98',
    path: FRONT_GUIDE_PATH,
  }
}

interface AngleAssistCopy {
  primary: string
  secondary: string
}

interface StepTurnHint {
  arrow: string
  instruction: string
  short: string
  tone?: 'neutral' | 'good' | 'warn'
}

function getStepTurnHint(step: MultiStep, status: FaceGuideStatus): StepTurnHint | null {
  if (step === 'left') {
    if (status.faceDetected && (status.angle === 'ok' || status.angle === 'tilt')) {
      return {
        arrow: '✓',
        instruction: 'Açı yeterli',
        short: status.angle === 'tilt' ? 'Şimdi sadece baş eğimini düzeltin' : 'Sol yanak görünür durumda',
        tone: 'good',
      }
    }
    if (status.faceDetected && status.angle === 'look_left') {
      return {
        arrow: '←',
        instruction: 'Biraz geri dönün',
        short: 'Fazla döndünüz',
        tone: 'warn',
      }
    }
    return {
      arrow: '→',
      instruction: 'Başınızı hafifçe sağa çevirin',
      short: 'Sol yanak görünmeli',
      tone: 'neutral',
    }
  }
  if (step === 'right') {
    if (status.faceDetected && (status.angle === 'ok' || status.angle === 'tilt')) {
      return {
        arrow: '✓',
        instruction: 'Açı yeterli',
        short: status.angle === 'tilt' ? 'Şimdi sadece baş eğimini düzeltin' : 'Sağ yanak görünür durumda',
        tone: 'good',
      }
    }
    if (status.faceDetected && status.angle === 'look_right') {
      return {
        arrow: '→',
        instruction: 'Biraz geri dönün',
        short: 'Fazla döndünüz',
        tone: 'warn',
      }
    }
    return {
      arrow: '←',
      instruction: 'Başınızı hafifçe sola çevirin',
      short: 'Sağ yanak görünmeli',
      tone: 'neutral',
    }
  }
  return null
}

function getAngleAssist(step: MultiStep, status: FaceGuideStatus): AngleAssistCopy | null {
  if (step === 'front') return null

  // When allOk is true, show only positive feedback — no micro-corrections
  if (status.allOk) {
    return {
      primary: 'Mükemmel pozisyon',
      secondary: 'Sabit kalın, çekim hazırlanıyor',
    }
  }

  if (step === 'left') {
    if (status.angle === 'look_right') {
      return {
        primary: 'Başınızı biraz daha sağa çevirin',
        secondary: 'Sol yanağınız biraz daha görünür olmalı',
      }
    }
    if (status.angle === 'look_left') {
      return {
        primary: 'Biraz sola geri dönün',
        secondary: 'Fazla döndünüz, sol yanak görünürlüğü yeterli',
      }
    }
    if (status.angle === 'ok') {
      return {
        primary: 'Açı doğru',
        secondary: 'Bu pozisyonda sabit kalın',
      }
    }
  }

  // Right step
  if (status.angle === 'look_left') {
    return {
      primary: 'Başınızı biraz daha sola çevirin',
      secondary: 'Sağ yanağınız biraz daha görünür olmalı',
    }
  }
  if (status.angle === 'look_right') {
    return {
      primary: 'Biraz sağa geri dönün',
      secondary: 'Fazla döndünüz, sağ yanak görünürlüğü yeterli',
    }
  }
  if (status.angle === 'ok') {
    return {
      primary: 'Açı doğru',
      secondary: 'Bu pozisyonda sabit kalın',
    }
  }

  return null
}

function getTiltAssist(status: FaceGuideStatus): AngleAssistCopy | null {
  if (status.angle !== 'tilt') return null

  if ((status.debug?.tiltDeg ?? 0) > 0) {
    return {
      primary: 'Başınızı hafifçe sola düzeltin',
      secondary: 'Sağ gözünüz biraz daha aşağıda görünüyor; göz çizginizi yataylayın',
    }
  }

  return {
    primary: 'Başınızı hafifçe sağa düzeltin',
    secondary: 'Sol gözünüz biraz daha aşağıda görünüyor; göz çizginizi yataylayın',
  }
}

// ─── Badge component with score-driven color ───────────────
// Color is driven by the continuous sub-score (0–1), NOT by the
// discrete ok/tilt/etc category. This ensures pills reflect real
// image suitability and match auto-capture readiness logic.
//
// Hysteresis: once a tier is reached, a wider band prevents flicker.
//  GREEN  ≥ 0.60  (drops back to YELLOW at < 0.50)
//  YELLOW ≥ 0.30  (drops back to RED at < 0.20)
//  RED    < 0.30  (initial state)

// ─── Quality pill definitions ─────────────────────────────
// 6 visible checks: Mesafe, Işık, Açı, Konum, Netlik, İfade
// Each shows a fixed Turkish label + a colored dot driven by the sub-score.

interface PillDef {
  key: string
  label: string
}

const PILL_DEFS: PillDef[] = [
  { key: 'distance', label: 'Mesafe' },
  { key: 'lighting', label: 'Işık' },
  { key: 'angle', label: 'Açı' },
  { key: 'centering', label: 'Konum' },
  { key: 'sharpness', label: 'Netlik' },
  { key: 'expression', label: 'İfade' },
]

type BadgeTier = 'red' | 'yellow' | 'green'
const badgeTierCache: Record<string, BadgeTier> = {}

function scoreToBadgeTier(category: string, score: number): BadgeTier {
  const prev = badgeTierCache[category] ?? 'red'
  let next: BadgeTier
  if (prev === 'green') {
    next = score >= 0.50 ? 'green' : score >= 0.20 ? 'yellow' : 'red'
  } else if (prev === 'yellow') {
    next = score >= 0.60 ? 'green' : score >= 0.20 ? 'yellow' : 'red'
  } else {
    next = score >= 0.60 ? 'green' : score >= 0.30 ? 'yellow' : 'red'
  }
  badgeTierCache[category] = next
  return next
}

const DOT_COLORS: Record<BadgeTier, string> = {
  green: '#00FFB4',
  yellow: '#C4A35A',
  red: '#A05252',
}

function QualityPillStrip({ scores }: { scores: Record<string, number> }) {
  return (
    <div className="flex items-center justify-center gap-[6px] flex-wrap">
      {PILL_DEFS.map(({ key, label }) => {
        const tier = scoreToBadgeTier(key, scores[key] ?? 0)
        return (
          <span key={key} className="inline-flex items-center gap-[5px] text-[9px] font-medium tracking-[0.06em] text-white/40 transition-colors duration-500">
            <span
              className="w-[6px] h-[6px] rounded-full transition-colors duration-500"
              style={{ backgroundColor: DOT_COLORS[tier], boxShadow: `0 0 4px ${DOT_COLORS[tier]}50` }}
            />
            {label}
          </span>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PURE LANDMARK MESH DRAWING — no static overlays, no templates
// Only real Face Mesh data rendered as premium contour lines.
// ════════════════════════════════════════════════════════════

/** Detected region info for overlay highlighting — only regions with real detections */
export interface OverlayRegionHighlight {
  region: string
  score: number
  detected: boolean
}

/**
 * Resolve the shared accent RGB triplet from quality score.
 * This single source of truth drives mesh color AND bottom bar color.
 *
 * Premium palette with clear quality progression:
 *   low  (< 0.4)        → muted cool lavender  (140,115,175)
 *   mid  (0.4–0.7)      → warm violet           (155,125,215)
 *   high (0.7–0.9)      → luminous amethyst     (145,140,235)
 *   ready (≥ 0.9)       → bright cyan-teal      (90,210,200)
 */
export function accentFromQuality(q: number): string {
  if (q >= 0.9) return '90,210,200'       // scan-ready: distinct teal shift
  if (q >= 0.7) {
    const t = (q - 0.7) / 0.2
    return `${Math.round(145 - 55 * t)},${Math.round(140 + 70 * t)},${Math.round(235 - 35 * t)}`
  }
  if (q >= 0.4) {
    const t = (q - 0.4) / 0.3
    return `${Math.round(155 - 10 * t)},${Math.round(125 + 15 * t)},${Math.round(215 + 20 * t)}`
  }
  const t = q / 0.4
  return `${Math.round(140 + 15 * t)},${Math.round(115 + 10 * t)},${Math.round(175 + 40 * t)}`
}

export function drawMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  _allOk: boolean,
  mirror = true,
  _clipOval = true,   // eslint-disable-line @typescript-eslint/no-unused-vars -- kept for signature compat
  qualityScore = 0,
  /** Optional: wrinkle regions with real detections for subtle highlight overlay */
  detectedRegions?: OverlayRegionHighlight[],
  /** Dynamic accent RGB triplet — if omitted, derived from qualityScore */
  accentRgb?: string,
  /** When false, skip inner tesselation mesh (contour + features still draw) */
  showTesselation = true,
  /** When true, skip ctx.clearRect (caller already cleared for layered rendering) */
  skipClear = false,
  sourceWidth?: number,
  sourceHeight?: number,
) {
  if (!skipClear) ctx.clearRect(0, 0, w, h)
  ctx.save()

  const projected = landmarks.map((lm) =>
    projectLandmarkToCanvas(lm, w, h, { mirror, sourceWidth, sourceHeight }),
  )

  // Shared dynamic accent — drives ALL mesh colors
  const accent = accentRgb ?? accentFromQuality(qualityScore)

  // Tier-based opacity: mesh gets brighter as quality improves
  const baseOpacity = 0.30 + qualityScore * 0.40  // range 0.30–0.70

  // ── Wireframe contour drawing helper (clean, no glow) ──
  const drawContour = (
    indices: number[],
    color: string,
    opacity: number,
    lineW: number,
  ) => {
    ctx.beginPath()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = lineW
    ctx.strokeStyle = `${color}${Math.min(1, opacity * baseOpacity).toFixed(3)})`
    let started = false
    for (const idx of indices) {
      const point = projected[idx]
      if (!point) continue
      if (!started) { ctx.moveTo(point.x, point.y); started = true }
      else ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  // ════════════════════════════════════════════════════════════
  // FULL TRIANGULATED WIREFRAME MESH — face-only subset.
  // Excludes ear-area edges for a tighter, face-only overlay.
  // Clean anti-aliased lines, no glow, premium med-tech look.
  // PURELY VISUAL — does NOT affect analysis.
  // ════════════════════════════════════════════════════════════
  if (showTesselation) {
    const meshAlpha = Math.min(0.38, 0.12 + qualityScore * 0.26)
    ctx.beginPath()
    ctx.lineWidth = 0.40
    ctx.strokeStyle = `rgba(${accent},${meshAlpha.toFixed(3)})`
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const [a, b] of FACE_ONLY_TESSELATION) {
      const la = projected[a], lb = projected[b]
      if (!la || !lb) continue
      ctx.moveTo(la.x, la.y)
      ctx.lineTo(lb.x, lb.y)
    }
    ctx.stroke()
  }

  // ════════════════════════════════════════════════════════════
  // FEATURE CONTOURS — key anatomical landmarks with soft glow.
  // Two-pass rendering: subtle glow pass → crisp line pass.
  // The glow gives depth without looking like a debug overlay.
  // ════════════════════════════════════════════════════════════
  const drawGlowContour = (
    indices: number[],
    opacity: number,
    lineW: number,
  ) => {
    // Glow pass — wider, semi-transparent, with shadow blur
    ctx.save()
    ctx.shadowColor = `rgba(${accent},${(opacity * baseOpacity * 0.25).toFixed(3)})`
    ctx.shadowBlur = 6
    drawContour(indices, `rgba(${accent},`, opacity * 0.35, lineW + 1.5)
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.restore()
    // Crisp line pass
    drawContour(indices, `rgba(${accent},`, opacity, lineW)
  }

  // ── Layer 1 — strongest: primary anatomical contours ──
  drawGlowContour(JAWLINE, 0.60, 0.8)
  drawGlowContour(LEFT_EYE, 0.80, 0.9)
  drawGlowContour(RIGHT_EYE, 0.80, 0.9)
  drawGlowContour(LEFT_EYEBROW, 0.60, 0.7)
  drawGlowContour(RIGHT_EYEBROW, 0.60, 0.7)
  drawGlowContour(NOSE_BRIDGE, 0.65, 0.8)
  drawGlowContour(UPPER_LIP, 0.60, 0.7)
  drawGlowContour(LOWER_LIP, 0.60, 0.7)

  // ── Layer 2 — medium: secondary anatomical regions ──
  // Forehead hairline contour
  drawContour(FOREHEAD_ZONE, `rgba(${accent},`, 0.30, 0.5)
  // Under-eye contours (treatment-relevant: dark circles, hollowing)
  drawContour(LEFT_UNDER_EYE, `rgba(${accent},`, 0.28, 0.45)
  drawContour(RIGHT_UNDER_EYE, `rgba(${accent},`, 0.28, 0.45)
  // Nasolabial fold lines (treatment-relevant: fillers)
  drawContour(LEFT_NASOLABIAL, `rgba(${accent},`, 0.25, 0.4)
  drawContour(RIGHT_NASOLABIAL, `rgba(${accent},`, 0.25, 0.4)
  // Crow's feet area — outer eye connectors
  const LEFT_CROW_AREA = [33, 130, 226, 247, 30, 29, 27, 28, 56]
  const RIGHT_CROW_AREA = [263, 359, 446, 467, 260, 259, 257, 258, 286]
  drawContour(LEFT_CROW_AREA, `rgba(${accent},`, 0.22, 0.4)
  drawContour(RIGHT_CROW_AREA, `rgba(${accent},`, 0.22, 0.4)
  // Nose sides — alar contour
  const NOSE_LEFT = [48, 115, 220, 45, 4]
  const NOSE_RIGHT = [278, 344, 440, 275, 4]
  drawContour(NOSE_LEFT, `rgba(${accent},`, 0.22, 0.4)
  drawContour(NOSE_RIGHT, `rgba(${accent},`, 0.22, 0.4)
  // Chin contour
  const CHIN_CONTOUR = [175, 148, 176, 149, 150, 136, 172, 58, 132]
  drawContour(CHIN_CONTOUR, `rgba(${accent},`, 0.20, 0.4)
  // Cheek structure lines
  const LEFT_CHEEK = [116, 117, 118, 119, 120, 121, 128, 245]
  const RIGHT_CHEEK = [345, 346, 347, 348, 349, 350, 357, 465]
  drawContour(LEFT_CHEEK, `rgba(${accent},`, 0.18, 0.35)
  drawContour(RIGHT_CHEEK, `rgba(${accent},`, 0.18, 0.35)

  // ── Layer 3 — soft: subtle density support points ──
  // Brow-to-temple connectors
  const LEFT_BROW_TEMPLE = [70, 63, 105, 66, 107, 9, 336, 296, 334, 293, 300]
  drawContour(LEFT_BROW_TEMPLE, `rgba(${accent},`, 0.12, 0.3)
  // Marionette area
  const LEFT_MARIONETTE = [61, 146, 91, 181, 84]
  const RIGHT_MARIONETTE = [291, 375, 321, 405, 314]
  drawContour(LEFT_MARIONETTE, `rgba(${accent},`, 0.14, 0.3)
  drawContour(RIGHT_MARIONETTE, `rgba(${accent},`, 0.14, 0.3)
  // Glabella (between brows)
  const GLABELLA = [107, 9, 336, 151, 108, 69]
  drawContour(GLABELLA, `rgba(${accent},`, 0.14, 0.3)

  // ════════════════════════════════════════════════════════════
  // ANCHOR DOTS — key landmarks as refined vertex points with glow
  // Premium: outer glow ring + accent fill + bright core
  // Expanded set for denser, more confident tracking feel
  // ════════════════════════════════════════════════════════════
  const anchors = [
    1,    // nose tip
    33,   // left eye outer
    263,  // right eye outer
    133,  // left eye inner
    362,  // right eye inner
    61,   // left mouth corner
    291,  // right mouth corner
    152,  // chin
    10,   // forehead top
    70,   // left brow outer
    300,  // right brow outer
    4,    // nose base
    168,  // nose bridge top
    130,  // left crow's feet
    359,  // right crow's feet
    148,  // left jaw
    377,  // right jaw
  ]
  for (const idx of anchors) {
    const point = projected[idx]
    if (!point) continue
    const { x, y } = point
    // Soft glow ring
    ctx.save()
    ctx.shadowColor = `rgba(${accent},${(0.30 * baseOpacity).toFixed(3)})`
    ctx.shadowBlur = 4
    ctx.fillStyle = `rgba(${accent},${(0.45 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.restore()
    // Bright core
    ctx.fillStyle = `rgba(255,255,255,${(0.55 * baseOpacity).toFixed(3)})`
    ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill()
  }

  // ════════════════════════════════════════════════════════════
  // DETECTED REGION HIGHLIGHTS — very subtle, wireframe-compatible
  // No highlight = no detection. Never creates false heatmaps.
  // ════════════════════════════════════════════════════════════
  if (detectedRegions && detectedRegions.length > 0) {
    const regionCenters: Record<string, number[]> = {
      forehead: [10, 151, 9, 8],
      glabella: [9, 107, 336],
      crow_feet_left: [33, 130, 226],
      crow_feet_right: [263, 359, 446],
      under_eye_left: [33, 7, 163, 144],
      under_eye_right: [362, 382, 381, 380],
      nasolabial_left: [98, 240, 64],
      nasolabial_right: [327, 460, 294],
      marionette_left: [61, 146, 91],
      marionette_right: [291, 375, 321],
      jawline: [152, 148, 377],
    }
    for (const region of detectedRegions) {
      if (!region.detected || region.score < 15) continue
      const centerLandmarks = regionCenters[region.region]
      if (!centerLandmarks) continue

      let cx = 0, cy = 0, count = 0
      for (const idx of centerLandmarks) {
        const point = projected[idx]
        if (!point) continue
        cx += point.x; cy += point.y; count++
      }
      if (count === 0) continue
      cx /= count; cy /= count

      // Extremely subtle — just enough to hint at detection
      const intensity = Math.min(0.04, (region.score / 100) * 0.05)
      const radius = Math.max(w, h) * 0.05

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      grad.addColorStop(0, `rgba(${accent},${intensity.toFixed(3)})`)
      grad.addColorStop(1, `rgba(${accent},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}

// ─── Camera acquisition ─────────────────────────────────────
function diagnoseCameraError(err: unknown): string {
  if (!(err instanceof DOMException)) return 'Kamera başlatılamadı'
  switch (err.name) {
    case 'NotAllowedError': return 'Kamera izni reddedildi. Tarayıcı ayarlarından kamera iznini açın.'
    case 'NotFoundError': return 'Kamera bulunamadı. Lütfen bir kamera bağlayın.'
    case 'NotReadableError': return 'Kamera başka bir uygulama tarafından kullanılıyor.'
    case 'OverconstrainedError': return 'Kamera istenen çözünürlüğü desteklemiyor.'
    case 'SecurityError': return 'Kamera güvenli bağlantı (HTTPS) gerektirir.'
    default: return `Kamera hatası: ${(err as DOMException).message}`
  }
}

// ─── Target aspect ratio for the capture frame ─────────────
// 3:4 portrait — matches the UI container and prevents distortion.
// All capture/mesh canvases use this ratio for consistency.
const TARGET_ASPECT = 3 / 4

async function acquireCamera(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new DOMException('Kamera HTTPS veya localhost gerektirir.', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Bu tarayıcı kamera erişimini desteklemiyor.', 'NotFoundError')
  }
  // Prefer 3:4 portrait to match the UI frame exactly
  const portraitConstraints = [
    { facingMode: 'user' as const, width: { ideal: 720 }, height: { ideal: 960 } },
    { facingMode: 'user' as const, width: { ideal: 640 }, height: { ideal: 480 } },
    { facingMode: 'user' as const },
  ]
  for (const constraints of portraitConstraints) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: constraints })
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
    }
  }
  // Last resort: enumerate devices
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((d) => d.kind === 'videoinput')
    if (videoDevices.length === 0) throw new DOMException('Kamera bulunamadı.', 'NotFoundError')
    for (const device of videoDevices) {
      try { return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } }) } catch { /* next */ }
    }
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) throw err
  }
  return await navigator.mediaDevices.getUserMedia({ video: true })
}

/**
 * Captures a center-cropped 3:4 frame from the video, matching exactly
 * what the user sees in the UI. Prevents stretched or squeezed faces.
 */
function captureAlignedFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw === 0 || vh === 0) return null

  const videoAspect = vw / vh
  let sx = 0, sy = 0, sw = vw, sh = vh

  if (videoAspect > TARGET_ASPECT) {
    // Video is wider than 3:4 — crop sides
    sw = Math.round(vh * TARGET_ASPECT)
    sx = Math.round((vw - sw) / 2)
  } else if (videoAspect < TARGET_ASPECT) {
    // Video is taller than 3:4 — crop top/bottom
    sh = Math.round(vw / TARGET_ASPECT)
    sy = Math.round((vh - sh) / 2)
  }

  // Output at a clean resolution
  const outW = Math.min(sw, 720)
  const outH = Math.round(outW / TARGET_ASPECT)
  canvas.width = outW
  canvas.height = outH

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Mirror horizontally (front camera) and draw cropped region
  ctx.resetTransform()
  ctx.translate(outW, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH)

  return canvas.toDataURL('image/jpeg', 0.92)
}

// ─── Best-frame scoring ─────────────────────────────────────
interface ScoredFrame extends CaptureFrameMetrics {
  dataUrl: string
  score: number
  time: number
}

interface ViewCaptureRuntime {
  acceptedFrames: ScoredFrame[]
  sampledFrames: CaptureFrameMetrics[]
  rejectedReasons: Record<string, number>
  guidanceHistory: string[]
  selectedKeyframeId?: string
  lastRejectionAt?: number
  lastGuidance?: string
  holdStartedAt?: number
  holdDurationMs: number
  countdownResets: number
  blinkDetected: boolean
  /** How this view was captured — set when auto-advance or manual shutter fires */
  captureTrigger?: 'auto' | 'manual'
}

interface LivenessRuntime {
  frontSteadyFrames: number
  frontSteadyObservedAt?: number
  leftObservedAt?: number
  rightObservedAt?: number
  blinkDetectedAt?: number
  blinkInProgress: boolean
  blinkCandidateAt?: number
  blinkCount: number
  baselineEyeOpenness: number
  minEyeOpenness: number
  maxEyeOpenness: number
  yawLeftPeak: number
  yawRightPeak: number
  motionSamples: number[]
  /** Timestamp when blink challenge instruction was shown */
  blinkChallengeShownAt?: number
  /** Duration of the detected blink in ms */
  blinkDurationMs?: number
  /** Previous frame's yaw for left-turn smoothness tracking */
  prevYawLeft: number[]
  /** Previous frame's yaw for right-turn smoothness tracking */
  prevYawRight: number[]
  /** Frame-over-frame landmark position deltas for temporal continuity */
  frameDeltaSamples: number[]
  /** Previous frame's average landmark position (for delta calculation) */
  prevLandmarkCenter?: { x: number; y: number }
  /** Number of distinct motion direction changes (x-axis) */
  motionDirectionChanges: number
  /** Previous motion direction sign */
  prevMotionSign: number
}

const VIEW_KEYS: CaptureViewKey[] = ['front', 'left', 'right']

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function toQualityBand(score: number): CaptureViewManifest['quality_band'] {
  if (score >= 0.82) return 'high'
  if (score >= 0.65) return 'usable'
  if (score >= 0.45) return 'weak'
  return 'reject'
}

function toCaptureConfidence(score: number): CaptureMetadata['confidence'] {
  if (score >= 0.85) return 'high'
  if (score >= 0.68) return 'medium'
  return 'low'
}

function targetAcceptedFrameCount(view: CaptureViewKey): number {
  return view === 'front' ? 8 : 6
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function variance(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
}

function summarizeMetric(values: number[]): CaptureMetricSummary {
  if (values.length === 0) return { min: 0, median: 0, max: 0 }
  return {
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
    variance: variance(values),
  }
}

function summarizePose(frames: CaptureFrameMetrics[]): CapturePoseSummary {
  return {
    yaw: median(frames.map(frame => frame.pose.yaw)),
    pitch: median(frames.map(frame => frame.pose.pitch)),
    roll: median(frames.map(frame => frame.pose.roll)),
  }
}

function summarizePoseVariance(frames: CaptureFrameMetrics[], pose: CapturePoseSummary): CapturePoseVariance {
  const deviations = (values: number[], target: number) => median(values.map(value => Math.abs(value - target)))
  return {
    yaw: deviations(frames.map(frame => frame.pose.yaw), pose.yaw),
    pitch: deviations(frames.map(frame => frame.pose.pitch), pose.pitch),
    roll: deviations(frames.map(frame => frame.pose.roll), pose.roll),
  }
}

function summarizeRegionVisibility(frames: CaptureFrameMetrics[]): CaptureRegionVisibility {
  return {
    forehead: median(frames.map(frame => frame.regionVisibility.forehead)),
    periocular: median(frames.map(frame => frame.regionVisibility.periocular)),
    nasolabial: median(frames.map(frame => frame.regionVisibility.nasolabial)),
    jawline: median(frames.map(frame => frame.regionVisibility.jawline)),
    lips: median(frames.map(frame => frame.regionVisibility.lips)),
  }
}

function computeCenteringDrift(frames: CaptureFrameMetrics[]): number {
  if (frames.length === 0) return 0
  const medianCentering = median(frames.map(frame => frame.centering))
  return median(frames.map(frame => Math.abs(frame.centering - medianCentering)))
}

function buildEmptyRuntime(): ViewCaptureRuntime {
  return {
    acceptedFrames: [],
    sampledFrames: [],
    rejectedReasons: {},
    guidanceHistory: [],
    holdDurationMs: 0,
    countdownResets: 0,
    blinkDetected: false,
  }
}

function buildEmptyLivenessRuntime(): LivenessRuntime {
  return {
    frontSteadyFrames: 0,
    blinkInProgress: false,
    blinkCount: 0,
    baselineEyeOpenness: 0,
    minEyeOpenness: 1,
    prevYawLeft: [],
    prevYawRight: [],
    frameDeltaSamples: [],
    motionDirectionChanges: 0,
    prevMotionSign: 0,
    maxEyeOpenness: 0,
    yawLeftPeak: 0,
    yawRightPeak: 0,
    motionSamples: [],
  }
}

function clearLivenessForView(runtime: LivenessRuntime, view: CaptureViewKey): LivenessRuntime {
  if (view === 'front') {
    return {
      ...runtime,
      frontSteadyFrames: 0,
      frontSteadyObservedAt: undefined,
      blinkDetectedAt: undefined,
      blinkInProgress: false,
      blinkCandidateAt: undefined,
      blinkCount: 0,
      baselineEyeOpenness: 0,
      minEyeOpenness: 1,
      maxEyeOpenness: 0,
      motionSamples: [],
      blinkChallengeShownAt: undefined,
      blinkDurationMs: undefined,
      frameDeltaSamples: [],
      prevLandmarkCenter: undefined,
      motionDirectionChanges: 0,
      prevMotionSign: 0,
    }
  }
  if (view === 'left') {
    return { ...runtime, leftObservedAt: undefined, yawLeftPeak: 0, prevYawLeft: [] }
  }
  return { ...runtime, rightObservedAt: undefined, yawRightPeak: 0, prevYawRight: [] }
}

function computeEyeOpenness(landmarks: Landmark[]): number {
  const leftTop = landmarks[159]
  const leftBottom = landmarks[145]
  const leftOuter = landmarks[33]
  const leftInner = landmarks[133]
  const rightTop = landmarks[386]
  const rightBottom = landmarks[374]
  const rightOuter = landmarks[362]
  const rightInner = landmarks[263]

  if (!leftTop || !leftBottom || !leftOuter || !leftInner || !rightTop || !rightBottom || !rightOuter || !rightInner) {
    return 0
  }

  const leftWidth = Math.abs(leftOuter.x - leftInner.x) || 0.001
  const rightWidth = Math.abs(rightOuter.x - rightInner.x) || 0.001
  const leftOpen = Math.abs(leftTop.y - leftBottom.y) / leftWidth
  const rightOpen = Math.abs(rightTop.y - rightBottom.y) / rightWidth
  return clamp01(((leftOpen + rightOpen) / 2) / 0.18)
}

/**
 * Compute yaw sample smoothness: how consistent the yaw transition was.
 * Smooth natural turns produce values near 1.0; jerky/fake motion is lower.
 */
function computeYawSmoothness(samples: number[]): number {
  if (samples.length < 3) return 0
  let totalDelta = 0
  let reversals = 0
  let prevDelta = 0
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i] - samples[i - 1]
    totalDelta += Math.abs(delta)
    if (i > 1 && Math.sign(delta) !== 0 && Math.sign(prevDelta) !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) {
      reversals += 1
    }
    prevDelta = delta
  }
  const avgDelta = totalDelta / (samples.length - 1)
  // Penalize excessive reversals and too-large jumps
  const reversalPenalty = clamp01(1 - reversals / (samples.length * 0.5))
  const smoothness = clamp01(avgDelta / 4) * reversalPenalty
  return smoothness
}

/**
 * Compute temporal motion continuity from frame delta samples.
 * Low = possible static photo. High = real moving face.
 */
function computeTemporalMotionContinuity(samples: number[]): number {
  if (samples.length < 5) return 0
  // Count frames with meaningful motion (delta > 0.0005)
  const movingFrames = samples.filter(d => d > 0.0005).length
  const movingRatio = movingFrames / samples.length
  // Median delta should be small but non-zero for real faces
  const sorted = [...samples].sort((a, b) => a - b)
  const medianDelta = sorted[Math.floor(sorted.length / 2)]
  // Real faces: median delta 0.001-0.015, moving ratio > 0.4
  const deltaScore = medianDelta > 0.0008 && medianDelta < 0.05 ? 1 : clamp01(medianDelta / 0.001)
  return clamp01(movingRatio * 0.6 + deltaScore * 0.4)
}

function computeLivenessSignals(runtime: LivenessRuntime, required: boolean): {
  status: LivenessStatus
  passed: boolean
  confidence: number
  steps: CaptureLivenessStep[]
  signals: CaptureLivenessSignals
  incompleteReason: string | null
} {
  const stepConfidence: Record<CaptureLivenessStep['key'], number> = {
    front: runtime.frontSteadyObservedAt ? 0.9 : Math.min(0.55, runtime.frontSteadyFrames / 6),
    blink: runtime.blinkDetectedAt ? 0.92 : runtime.baselineEyeOpenness > 0 ? 0.25 : 0,
    left_turn: runtime.leftObservedAt ? clamp01(Math.abs(runtime.yawLeftPeak) / 22) : 0,
    right_turn: runtime.rightObservedAt ? clamp01(Math.abs(runtime.yawRightPeak) / 22) : 0,
  }

  const motionConsistency = runtime.motionSamples.length > 0
    ? clamp01(median(runtime.motionSamples))
    : 0
  const frontObserved = !!runtime.frontSteadyObservedAt
  const blinkDetected = !!runtime.blinkDetectedAt
  const leftObserved = !!runtime.leftObservedAt
  const rightObserved = !!runtime.rightObservedAt

  // Blink timing plausibility: real blinks are 100–500ms
  const blinkPlausible = runtime.blinkDurationMs != null
    ? runtime.blinkDurationMs >= 80 && runtime.blinkDurationMs <= 600
    : false
  // Penalize blink confidence if timing is implausible
  if (blinkDetected && !blinkPlausible && runtime.blinkDurationMs != null) {
    stepConfidence.blink *= 0.5
  }

  // Eye openness delta — strength of blink evidence
  const eyeOpennessDelta = runtime.baselineEyeOpenness > 0 && runtime.minEyeOpenness < 1
    ? runtime.baselineEyeOpenness - runtime.minEyeOpenness
    : 0

  // Yaw smoothness for turns
  const yawLeftSmoothness = computeYawSmoothness(runtime.prevYawLeft)
  const yawRightSmoothness = computeYawSmoothness(runtime.prevYawRight)

  // Temporal motion continuity
  const temporalContinuity = computeTemporalMotionContinuity(runtime.frameDeltaSamples)

  const passed = required
    ? (frontObserved && blinkDetected && leftObserved && rightObserved)
    : (frontObserved && blinkDetected)

  // Temporal continuity bonus: real moving face boosts confidence slightly
  const continuityBonus = temporalContinuity > 0.4 ? 0.05 : 0

  const confidence = clamp01(
    stepConfidence.front * 0.25 +
    stepConfidence.blink * 0.30 +
    stepConfidence.left_turn * 0.18 +
    stepConfidence.right_turn * 0.18 +
    motionConsistency * 0.09 +
    continuityBonus,
  )

  const status: LivenessStatus = !required
    ? (passed ? 'passed' : confidence > 0 ? 'in_progress' : 'not_required')
    : passed
      ? 'passed'
      : frontObserved || blinkDetected || leftObserved || rightObserved
        ? 'incomplete'
        : 'not_started'

  // Build incomplete reason
  let incompleteReason: string | null = null
  if (required && !passed) {
    const missing: string[] = []
    if (!frontObserved) missing.push('ön görünüm sabitlenmedi')
    if (!blinkDetected) missing.push('göz kırpma algılanmadı')
    if (!leftObserved) missing.push('sol dönüş tamamlanmadı')
    if (!rightObserved) missing.push('sağ dönüş tamamlanmadı')
    incompleteReason = missing.length > 0 ? missing.join(', ') : null
  } else if (!required && !blinkDetected) {
    incompleteReason = 'göz kırpma algılanmadı'
  }

  const steps: CaptureLivenessStep[] = [
    { key: 'front', observed: frontObserved, confidence: stepConfidence.front, observed_at: runtime.frontSteadyObservedAt, detail: frontObserved ? 'Ön görünüm doğrulandı' : 'Ön görünüm sabitlenmedi' },
    { key: 'blink', observed: blinkDetected, confidence: stepConfidence.blink, observed_at: runtime.blinkDetectedAt, detail: blinkDetected ? 'Göz kırpma sinyali alındı' : 'Göz kırpma algılanmadı' },
    { key: 'left_turn', observed: leftObserved, confidence: stepConfidence.left_turn, observed_at: runtime.leftObservedAt, detail: leftObserved ? 'Sol dönüş doğrulandı' : 'Sol dönüş eksik' },
    { key: 'right_turn', observed: rightObserved, confidence: stepConfidence.right_turn, observed_at: runtime.rightObservedAt, detail: rightObserved ? 'Sağ dönüş doğrulandı' : 'Sağ dönüş eksik' },
  ]

  return {
    status,
    passed,
    confidence,
    steps,
    incompleteReason,
    signals: {
      front_steady_observed: frontObserved,
      blink_detected: blinkDetected,
      left_turn_observed: leftObserved,
      right_turn_observed: rightObserved,
      blink_count: runtime.blinkCount,
      baseline_eye_openness: runtime.baselineEyeOpenness || undefined,
      min_eye_openness: runtime.minEyeOpenness < 1 ? runtime.minEyeOpenness : undefined,
      max_eye_openness: runtime.maxEyeOpenness || undefined,
      yaw_left_peak: runtime.yawLeftPeak || undefined,
      yaw_right_peak: runtime.yawRightPeak || undefined,
      motion_consistency: motionConsistency || undefined,
      step_confidence: stepConfidence,
      eye_openness_delta: eyeOpennessDelta > 0 ? eyeOpennessDelta : undefined,
      blink_duration_ms: runtime.blinkDurationMs,
      blink_challenge_shown_at: runtime.blinkChallengeShownAt,
      yaw_left_smoothness: yawLeftSmoothness > 0 ? yawLeftSmoothness : undefined,
      yaw_right_smoothness: yawRightSmoothness > 0 ? yawRightSmoothness : undefined,
      temporal_motion_continuity: temporalContinuity > 0 ? temporalContinuity : undefined,
      motion_direction_changes: runtime.motionDirectionChanges > 0 ? runtime.motionDirectionChanges : undefined,
      schema_version: '2.0.0',
    },
  }
}

function computeFrameScore(status: FaceGuideStatus): number {
  const { qualityBreakdown: qb } = status
  return qb.distance * 0.25 + qb.angle * 0.20 + qb.centering * 0.10 + qb.sharpness * 0.20 + qb.lighting * 0.15 + qb.stability * 0.10
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT — Pure Face Mesh driven, no static overlays
// ═══════════════════════════════════════════════════════════
export function FaceGuideCapture({ onCapture, onClose, mode = 'single', autoConfirm = false, onMultiCapture }: FaceGuideCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const meshCanvasRef = useRef<HTMLCanvasElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const brightnessCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const engineReadyRef = useRef(false)
  const processingRef = useRef(false)
  const animFrameRef = useRef(0)
  const lastFrameTime = useRef(0)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-fit: smooth software preview fitting
  const autoFitWrapperRef = useRef<HTMLDivElement>(null)
  const autoFitRef = useRef<AutoFitState>({ scale: 1, tx: 0, ty: 0 })

  const validationStartRef = useRef<number | null>(null)
  const faceFirstSeenRef = useRef<number | null>(null)
  const frameBufferRef = useRef<ScoredFrame[]>([])
  /** Exported multi-frame data URLs for the current capture step */
  const exportedFramesRef = useRef<string[]>([])
  const exportedFramesByViewRef = useRef<Partial<Record<CaptureViewKey, string[]>>>({})
  const captureSessionIdRef = useRef(`capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const captureFramesRef = useRef<CaptureFrameMetrics[]>([])
  const acceptanceHistoryRef = useRef<CaptureManifest['acceptance_history']>([])
  const livenessRuntimeRef = useRef<LivenessRuntime>(buildEmptyLivenessRuntime())
  const viewRuntimeRef = useRef<Record<CaptureViewKey, ViewCaptureRuntime>>({
    front: buildEmptyRuntime(),
    left: buildEmptyRuntime(),
    right: buildEmptyRuntime(),
  })
  const viewManifestsRef = useRef<Partial<Record<CaptureViewKey, CaptureViewManifest>>>({})
  const stableReadyFrames = useRef(0)

  const [initState, setInitState] = useState<InitState>('loading')
  const [initError, setInitError] = useState<string | null>(null)
  const [status, setStatus] = useState<FaceGuideStatus>(NO_FACE_STATUS)
  const [preview, setPreview] = useState<string | null>(null)
  const [phase, setPhase] = useState<ValidationPhase>('idle')
  const [validationProgress, setValidationProgress] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [failsafeActive, setFailsafeActive] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const [landmarksRef] = useState<{ current: Landmark[] | null }>({ current: null })

  const [multiStep, setMultiStep] = useState<MultiStep>('front')
  const [multiPhotos, setMultiPhotos] = useState<{ front?: string; left?: string; right?: string }>({})

  // Countdown (3s front, 1s side)
  const countdownStartRef = useRef<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  // ── Grace frames: tolerate brief dips during countdown ──
  // Allows up to 3 consecutive non-ready frames before resetting.
  // Prevents micro-tremor dips from killing a valid countdown.
  const dipFramesRef = useRef(0)
  const MAX_DIP_FRAMES = 4

  // ── Refs that mirror state for use inside processFrame ──
  // processFrame runs in a rAF loop. If it depends on React state (phase,
  // countdown, preview), each setState recreates the callback and
  // re-registers the animation frame, causing timing gaps that prevent
  // the countdown from completing. These refs let processFrame read
  // current values without being in the dependency array.
  const phaseRef = useRef<ValidationPhase>('idle')
  const previewRef = useRef<string | null>(null)

  // Keep refs in sync with state
  const updatePhase = useCallback((p: ValidationPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])
  const updatePreview = useCallback((p: string | null) => {
    previewRef.current = p
    setPreview(p)
  }, [])

  const appendAcceptanceHistory = useCallback((view: CaptureViewKey, verdict: 'accept' | 'reject' | 'reset', reason: string, timestamp: number) => {
    acceptanceHistoryRef.current.push({ view, verdict, reason, timestamp })
  }, [])

  const appendGuidance = useCallback((view: CaptureViewKey, guidance: string) => {
    if (!guidance) return
    const runtime = viewRuntimeRef.current[view]
    if (runtime.lastGuidance === guidance) return
    runtime.lastGuidance = guidance
    runtime.guidanceHistory.push(guidance)
    if (runtime.guidanceHistory.length > 20) runtime.guidanceHistory.shift()
  }, [])

  const startHoldTracking = useCallback((view: CaptureViewKey, timestamp: number) => {
    const runtime = viewRuntimeRef.current[view]
    if (!runtime.holdStartedAt) runtime.holdStartedAt = timestamp
  }, [])

  const finalizeHoldTracking = useCallback((view: CaptureViewKey, timestamp: number) => {
    const runtime = viewRuntimeRef.current[view]
    if (runtime.holdStartedAt) {
      runtime.holdDurationMs += Math.max(0, timestamp - runtime.holdStartedAt)
      runtime.holdStartedAt = undefined
    }
  }, [])

  const registerCountdownReset = useCallback((view: CaptureViewKey, timestamp: number) => {
    finalizeHoldTracking(view, timestamp)
    viewRuntimeRef.current[view].countdownResets += 1
  }, [finalizeHoldTracking])

  const observeLiveness = useCallback((view: CaptureViewKey, guide: FaceGuideStatus, landmarks: Landmark[], timestamp: number) => {
    const runtime = livenessRuntimeRef.current
    const eyeOpenness = computeEyeOpenness(landmarks)
    runtime.maxEyeOpenness = Math.max(runtime.maxEyeOpenness, eyeOpenness)
    runtime.minEyeOpenness = Math.min(runtime.minEyeOpenness, eyeOpenness)

    // ── Temporal motion continuity: frame-over-frame landmark center delta ──
    // Detects if the face is actually moving (not a static photo)
    if (landmarks.length >= 468) {
      const nose = landmarks[4]
      const chin = landmarks[152]
      if (nose && chin) {
        const cx = (nose.x + chin.x) / 2
        const cy = (nose.y + chin.y) / 2
        if (runtime.prevLandmarkCenter) {
          const dx = cx - runtime.prevLandmarkCenter.x
          const dy = cy - runtime.prevLandmarkCenter.y
          const delta = Math.sqrt(dx * dx + dy * dy)
          runtime.frameDeltaSamples.push(delta)
          if (runtime.frameDeltaSamples.length > 30) runtime.frameDeltaSamples.shift()

          // Track motion direction changes (non-zero dx sign flips)
          const sign = dx > 0.001 ? 1 : dx < -0.001 ? -1 : 0
          if (sign !== 0 && runtime.prevMotionSign !== 0 && sign !== runtime.prevMotionSign) {
            runtime.motionDirectionChanges += 1
          }
          if (sign !== 0) runtime.prevMotionSign = sign
        }
        runtime.prevLandmarkCenter = { x: cx, y: cy }
      }
    }

    const frontalReady = view === 'front' && guide.angle === 'ok' && guide.captureAcceptance >= 0.78 && guide.qualityBreakdown.stability >= 0.35
    if (frontalReady) {
      runtime.frontSteadyFrames += 1
      runtime.baselineEyeOpenness = runtime.baselineEyeOpenness === 0
        ? eyeOpenness
        : runtime.baselineEyeOpenness * 0.92 + eyeOpenness * 0.08
      if (!runtime.frontSteadyObservedAt && runtime.frontSteadyFrames >= 4) {
        runtime.frontSteadyObservedAt = timestamp
        // Mark when blink challenge becomes active (front is steady → user can now blink)
        runtime.blinkChallengeShownAt = runtime.blinkChallengeShownAt ?? timestamp
      }
    } else if (view === 'front') {
      runtime.frontSteadyFrames = Math.max(0, runtime.frontSteadyFrames - 1)
    }

    if (runtime.frontSteadyObservedAt) {
      const baseline = Math.max(runtime.baselineEyeOpenness, 0.18)
      const closeThreshold = baseline * 0.62
      const reopenThreshold = baseline * 0.84
      if (!runtime.blinkInProgress && eyeOpenness > 0 && eyeOpenness <= closeThreshold) {
        runtime.blinkInProgress = true
        runtime.blinkCandidateAt = timestamp
      } else if (runtime.blinkInProgress) {
        const elapsed = timestamp - (runtime.blinkCandidateAt ?? timestamp)
        if (eyeOpenness >= reopenThreshold && elapsed <= 900) {
          runtime.blinkInProgress = false
          runtime.blinkDetectedAt = runtime.blinkDetectedAt ?? timestamp
          runtime.blinkDurationMs = elapsed
          runtime.blinkCount += 1
          viewRuntimeRef.current.front.blinkDetected = true
        } else if (elapsed > 900) {
          runtime.blinkInProgress = false
          runtime.blinkCandidateAt = undefined
        }
      }
    }

    if (guide.debug?.yawDeg != null) {
      const absYaw = Math.abs(guide.debug.yawDeg)
      const motionConsistency = clamp01(
        absYaw / 18 * 0.5 +
        guide.qualityBreakdown.stability * 0.3 +
        guide.captureAcceptance * 0.2,
      )
      runtime.motionSamples.push(motionConsistency)
      if (runtime.motionSamples.length > 20) runtime.motionSamples.shift()
    }

    if (view === 'left' && guide.angle === 'ok' && guide.captureAcceptance >= 0.80) {
      runtime.leftObservedAt = runtime.leftObservedAt ?? timestamp
      runtime.yawLeftPeak = Math.min(runtime.yawLeftPeak, guide.debug?.yawDeg ?? 0)
      // Track yaw samples for smoothness calculation
      if (guide.debug?.yawDeg != null) {
        runtime.prevYawLeft.push(guide.debug.yawDeg)
        if (runtime.prevYawLeft.length > 10) runtime.prevYawLeft.shift()
      }
    }

    if (view === 'right' && guide.angle === 'ok' && guide.captureAcceptance >= 0.80) {
      runtime.rightObservedAt = runtime.rightObservedAt ?? timestamp
      runtime.yawRightPeak = Math.max(runtime.yawRightPeak, guide.debug?.yawDeg ?? 0)
      if (guide.debug?.yawDeg != null) {
        runtime.prevYawRight.push(guide.debug.yawDeg)
        if (runtime.prevYawRight.length > 10) runtime.prevYawRight.shift()
      }
    }
  }, [])

  const recordRejectedSample = useCallback((view: CaptureViewKey, frame: CaptureFrameMetrics, reason: string) => {
    const runtime = viewRuntimeRef.current[view]
    runtime.rejectedReasons[reason] = (runtime.rejectedReasons[reason] ?? 0) + 1
    const now = frame.timestamp
    if (!runtime.lastRejectionAt || now - runtime.lastRejectionAt >= REJECTED_FRAME_SAMPLE_MS) {
      runtime.sampledFrames.push(frame)
      captureFramesRef.current.push(frame)
      runtime.lastRejectionAt = now
    }
  }, [])

  const pushAcceptedFrame = useCallback((view: CaptureViewKey, frame: ScoredFrame) => {
    const runtime = viewRuntimeRef.current[view]
    runtime.acceptedFrames.push(frame)
    runtime.sampledFrames.push(frame)
    captureFramesRef.current.push(frame)
  }, [])

  const buildFrameMetrics = useCallback((
    view: CaptureViewKey,
    guide: FaceGuideStatus,
    timestamp: number,
    accepted: boolean,
    rejectionReason?: string,
    dataUrl?: string,
  ): ScoredFrame => {
    const brightness = clamp01((guide.debug?.brightness ?? 0) / 255)
    const sharpness = clamp01(guide.qualityBreakdown.sharpness)
    const eyeOpenness = landmarksRef.current ? computeEyeOpenness(landmarksRef.current) : 0
    const frame: ScoredFrame = {
      frameId: `${view}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      view,
      timestamp,
      accepted,
      qualityScore: clamp01(guide.qualityScore),
      acceptanceScore: clamp01(guide.captureAcceptance),
      pose: {
        yaw: guide.debug?.yawDeg ?? 0,
        pitch: guide.debug?.pitchDeg ?? 0,
        roll: guide.debug?.tiltDeg ?? 0,
      },
      brightness,
      shadow: clamp01(guide.shadowUniformity),
      sharpness,
      stability: clamp01(guide.qualityBreakdown.stability),
      centering: clamp01(guide.qualityBreakdown.centering),
      faceSize: clamp01(guide.faceHeightRatio / 0.6),
      completeness: clamp01(guide.landmarkCompleteness),
      occlusion: clamp01(guide.occlusionScore),
      landmarkJitter: clamp01(1 - guide.qualityBreakdown.stability),
      eyeOpenness,
      regionVisibility: {
        forehead: clamp01(guide.regionVisibility.forehead),
        periocular: clamp01(guide.regionVisibility.periocular),
        nasolabial: clamp01(guide.regionVisibility.nasolabial),
        jawline: clamp01(guide.regionVisibility.jawline),
        lips: clamp01(guide.regionVisibility.lips),
      },
      rejectionReason,
      guidance: guide.mainMessage,
      dataUrl: dataUrl ?? '',
      score: computeFrameScore(guide),
      time: timestamp,
    }
    return frame
  }, [landmarksRef])

  const finalizeViewManifest = useCallback((view: CaptureViewKey): CaptureViewManifest => {
    const runtime = viewRuntimeRef.current[view]
    finalizeHoldTracking(view, Date.now())
    const acceptedFrames = runtime.acceptedFrames
    const representative = acceptedFrames.length > 0
      ? acceptedFrames.reduce((best, candidate) => (candidate.acceptanceScore > best.acceptanceScore ? candidate : best))
      : null
    const pose = acceptedFrames.length > 0 ? summarizePose(acceptedFrames) : undefined
    const poseVariance = acceptedFrames.length > 0 && pose ? summarizePoseVariance(acceptedFrames, pose) : undefined
    const qualityScore = representative ? representative.qualityScore : 0
    const acceptanceScore = representative
      ? median(acceptedFrames.map(frame => frame.acceptanceScore))
      : 0
    const qualityBand = toQualityBand(acceptanceScore)
    const recaptureRequired = qualityBand === 'reject' || acceptedFrames.length < Math.max(1, Math.floor(targetAcceptedFrameCount(view) * 0.66))
    const regionVisibility = summarizeRegionVisibility(acceptedFrames)
    const occlusionIndicators = [
      regionVisibility.forehead < 0.65 ? 'forehead_hidden' : null,
      regionVisibility.periocular < 0.7 ? 'periocular_hidden' : null,
      regionVisibility.nasolabial < 0.6 ? 'nasolabial_hidden' : null,
      regionVisibility.jawline < 0.6 ? 'jawline_hidden' : null,
      regionVisibility.lips < 0.75 ? 'lips_hidden' : null,
    ].filter((value): value is string => !!value)
    const livenessSignals = computeLivenessSignals(livenessRuntimeRef.current, mode === 'multi').signals

    const manifest: CaptureViewManifest = {
      view,
      captured: acceptedFrames.length > 0,
      capture_trigger: runtime.captureTrigger,
      quality_score: qualityScore,
      acceptance_score: acceptanceScore,
      quality_band: qualityBand,
      capture_verdict: acceptedFrames.length > 0
        ? recaptureRequired ? 'recapture_required' : 'accepted'
        : 'rejected',
      recapture_required: recaptureRequired,
      accepted_frame_ids: acceptedFrames.map(frame => frame.frameId),
      accepted_frame_count: acceptedFrames.length,
      rejected_frame_count: Object.values(runtime.rejectedReasons).reduce((sum, value) => sum + value, 0),
      rejected_reasons: Object.entries(runtime.rejectedReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      guidance_history: [...runtime.guidanceHistory],
      representative_frame_id: representative?.frameId,
      median_pose: pose,
      pose_variance: poseVariance,
      hold_duration_ms: runtime.holdDurationMs,
      countdown_resets: runtime.countdownResets,
      landmark_jitter: median(acceptedFrames.map(frame => frame.landmarkJitter ?? 0)),
      blink_detected: runtime.blinkDetected,
      brightness: summarizeMetric(acceptedFrames.map(frame => frame.brightness)),
      shadow: summarizeMetric(acceptedFrames.map(frame => frame.shadow)),
      sharpness: summarizeMetric(acceptedFrames.map(frame => frame.sharpness)),
      centering_drift: computeCenteringDrift(acceptedFrames),
      stability: median(acceptedFrames.map(frame => frame.stability)),
      completeness: median(acceptedFrames.map(frame => frame.completeness)),
      occlusion: median(acceptedFrames.map(frame => frame.occlusion)),
      region_visibility: regionVisibility,
      occlusion_indicators: occlusionIndicators.length > 0 ? occlusionIndicators : undefined,
      liveness_signals: view === 'front'
        ? {
            front_steady_observed: livenessSignals.front_steady_observed,
            blink_detected: livenessSignals.blink_detected,
            blink_count: livenessSignals.blink_count,
            baseline_eye_openness: livenessSignals.baseline_eye_openness,
            min_eye_openness: livenessSignals.min_eye_openness,
            max_eye_openness: livenessSignals.max_eye_openness,
          }
        : view === 'left'
          ? {
              left_turn_observed: livenessSignals.left_turn_observed,
              yaw_left_peak: livenessSignals.yaw_left_peak,
            }
          : {
              right_turn_observed: livenessSignals.right_turn_observed,
              yaw_right_peak: livenessSignals.yaw_right_peak,
            },
    }

    runtime.selectedKeyframeId = representative?.frameId
    viewManifestsRef.current[view] = manifest
    return manifest
  }, [finalizeHoldTracking, mode])

  const resetViewRuntime = useCallback((view: CaptureViewKey) => {
    const existingFrameIds = new Set(viewRuntimeRef.current[view].sampledFrames.map(frame => frame.frameId))
    viewRuntimeRef.current[view] = buildEmptyRuntime()
    viewManifestsRef.current[view] = undefined
    exportedFramesByViewRef.current[view] = undefined
    captureFramesRef.current = captureFramesRef.current.filter(frame => !existingFrameIds.has(frame.frameId))
    livenessRuntimeRef.current = clearLivenessForView(livenessRuntimeRef.current, view)
  }, [])

  // AI mesh overlay visibility — ON by default
  const [showMesh, setShowMesh] = useState(true)

  // Rotating tips
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000)
    return () => clearInterval(interval)
  }, [])

  // Capture best frame from buffer
  const captureBestFrame = useCallback((): string | null => {
    const buffer = frameBufferRef.current
    if (buffer.length > 0) {
      return buffer.reduce((a, b) => (b.score > a.score ? b : a)).dataUrl
    }
    // Fallback: capture current frame with proper alignment
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (video && canvas) {
      return captureAlignedFrame(video, canvas)
    }
    return null
  }, [])

  /**
   * Export top N temporally-distinct frames from the buffer.
   * Greedy selection: pick the highest-scored frame, then skip nearby frames
   * (within MULTI_FRAME_MIN_GAP_MS), pick the next highest, and so on.
   * This guarantees frames are from different render ticks, not duplicates.
   */
  const captureBestFrames = useCallback((count: number = MULTI_FRAME_EXPORT_COUNT): string[] => {
    const buffer = [...frameBufferRef.current]
    if (buffer.length === 0) return []

    // Sort by score descending
    buffer.sort((a, b) => b.score - a.score)

    const selected: ScoredFrame[] = []
    for (const frame of buffer) {
      if (selected.length >= count) break
      // Check temporal distance from all already-selected frames
      const tooClose = selected.some(s => Math.abs(s.time - frame.time) < MULTI_FRAME_MIN_GAP_MS)
      if (!tooClose) selected.push(frame)
    }

    return selected.map(f => f.dataUrl)
  }, [])

  // Auto-advance
  const triggerAutoAdvance = useCallback(() => {
    if (advanceTimerRef.current) return
    updatePhase('validated')
    setShowFlash(true)
    setTimeout(() => setShowFlash(false), 350)

    advanceTimerRef.current = setTimeout(() => {
      updatePhase('advancing')
      const exportCount = mode === 'multi'
        ? targetAcceptedFrameCount(multiStep as CaptureViewKey)
        : MULTI_FRAME_EXPORT_COUNT
      // Export top N distinct frames BEFORE clearing the buffer
      exportedFramesRef.current = captureBestFrames(exportCount)
      exportedFramesByViewRef.current[multiStep as CaptureViewKey] = exportedFramesRef.current
      const bestDataUrl = captureBestFrame()
      if (bestDataUrl) {
        viewRuntimeRef.current[multiStep as CaptureViewKey].captureTrigger = 'auto'
        const manifest = finalizeViewManifest(multiStep as CaptureViewKey)
        appendAcceptanceHistory(
          multiStep as CaptureViewKey,
          manifest.recapture_required ? 'reset' : 'accept',
          manifest.recapture_required ? 'capture_quality_limited' : 'capture_accepted',
          Date.now(),
        )
        if (mode === 'multi') setMultiPhotos((prev) => ({ ...prev, [multiStep]: bestDataUrl }))
        updatePreview(bestDataUrl)
      }
      frameBufferRef.current = []
      advanceTimerRef.current = null
    }, ADVANCE_DELAY_MS)
  }, [appendAcceptanceHistory, captureBestFrame, captureBestFrames, finalizeViewManifest, mode, multiStep, updatePhase, updatePreview])

  // Reset
  const resetValidation = useCallback(() => {
    validationStartRef.current = null
    faceFirstSeenRef.current = null
    frameBufferRef.current = []
    exportedFramesRef.current = []
    stableReadyFrames.current = 0
    countdownStartRef.current = null
    dipFramesRef.current = 0
    setCountdown(null)
    updatePhase('idle')
    setValidationProgress(0)
    setFailsafeActive(false)
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    resetSmoothing(); resetStability(); resetFaceLock(); resetContourSmoothing()
    // Reset badge hysteresis so next step starts at red
    for (const key of Object.keys(badgeTierCache)) delete badgeTierCache[key]
    // Reset auto-fit to neutral (will animate out via release speed)
    autoFitRef.current = { scale: 1, tx: 0, ty: 0 }
    if (autoFitWrapperRef.current) autoFitWrapperRef.current.style.transform = ''
  }, [updatePhase])

  // Init camera + engine
  useEffect(() => {
    let cancelled = false
    async function setup() {
      try {
        const [stream] = await Promise.all([acquireCamera(), initHumanEngine()])
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try { await videoRef.current.play() } catch { /* autoPlay */ }
        }
        if (cancelled) return
        engineReadyRef.current = true
        resetSmoothing(); resetStability(); resetFaceLock()
        setInitState('ready'); updatePhase('detecting')
      } catch (err) {
        if (!cancelled) { setInitState('error'); setInitError(diagnoseCameraError(err)) }
      }
    }
    setup()
    return () => {
      cancelled = true
      cancelAnimationFrame(animFrameRef.current)
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      engineReadyRef.current = false
      destroyHumanEngine(); resetSmoothing(); resetStability(); resetFaceLock()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── MAIN LOOP: detect → evaluate → draw mesh → validate ──
  const processFrame = useCallback(() => {
    const video = videoRef.current
    const bc = brightnessCanvasRef.current
    const mc = meshCanvasRef.current

    if (!video || !engineReadyRef.current || !bc || !mc || processingRef.current || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }

    const now = performance.now()
    if (now - lastFrameTime.current < 83) { // ~12fps
      animFrameRef.current = requestAnimationFrame(processFrame)
      return
    }
    lastFrameTime.current = now
    processingRef.current = true

    const brightness = calculateBrightness(video, bc)
    estimateSharpness(video, bc)

    // Sync canvas to video display size — critical for mobile alignment
    const rect = video.getBoundingClientRect()
    const rw = Math.round(rect.width), rh = Math.round(rect.height)
    if (mc.width !== rw || mc.height !== rh) { mc.width = rw; mc.height = rh }

    // Compute target angle early — needed for guide frame in both branches
    const targetAngle: TargetAngle = mode === 'multi' ? multiStep as TargetAngle : 'front'

    detectFaceFromVideo(video)
      .then((detection) => {
        processingRef.current = false
        const raw = detection?.landmarks ?? null

        if (!raw || raw.length < 468) {
          // ── Miss ──
          pushMiss()
          recordRejectedSample(
            multiStep as CaptureViewKey,
            buildFrameMetrics(multiStep as CaptureViewKey, NO_FACE_STATUS, now, false, 'no_face'),
            'no_face',
          )
          appendGuidance(multiStep as CaptureViewKey, NO_FACE_STATUS.mainMessage)
          // Keep last mesh visible while face is locked (prevents flicker)
          if (!status.faceLocked) {
            setStatus(NO_FACE_STATUS)
            landmarksRef.current = null
            validationStartRef.current = null
            setValidationProgress(0)
            if (phaseRef.current === 'stabilizing' || phaseRef.current === 'tracking') updatePhase('detecting')
            const ctx = mc.getContext('2d')
            if (ctx) {
              ctx.clearRect(0, 0, mc.width, mc.height)
              // Keep guide frame visible even without face detection
              drawFixedGuideFrame(ctx, mc.width, mc.height, {
                targetAngle,
                state: 'neutral',
                qualityScore: 0,
                time: now,
              })
            }
          }
          // Auto-fit: smoothly release back to neutral when no face
          {
            const af = autoFitRef.current
            const wrapper = autoFitWrapperRef.current
            if (wrapper && (Math.abs(af.scale - 1) > 0.002 || Math.abs(af.tx) > 0.02 || Math.abs(af.ty) > 0.02)) {
              af.scale += (1 - af.scale) * AUTOFIT_RELEASE_SPEED
              af.tx += (0 - af.tx) * AUTOFIT_RELEASE_SPEED
              af.ty += (0 - af.ty) * AUTOFIT_RELEASE_SPEED
              wrapper.style.transform = `scale(${af.scale.toFixed(4)}) translate(${af.tx.toFixed(2)}%, ${af.ty.toFixed(2)}%)`
            } else if (wrapper && af.scale !== 1) {
              af.scale = 1; af.tx = 0; af.ty = 0
              wrapper.style.transform = ''
            }
          }
        } else {
          // ── Face detected — all logic from real landmarks ──
          const smoothed = smoothLandmarks(raw)
          landmarksRef.current = smoothed
          pushDetection(smoothed, detection?.confidence ?? 0.5)

          const shadowScore = detectShadow(video, bc, smoothed)
          const guide = evaluateFaceGuide(smoothed, brightness, shadowScore, targetAngle)
          setStatus(guide)
          appendGuidance(multiStep as CaptureViewKey, guide.mainMessage)
          observeLiveness(multiStep as CaptureViewKey, guide, smoothed, now)

          // ── AUTO-FIT: software preview fitting ──────────────
          // Compute signed face offset from landmarks (face guide uses abs values)
          // Landmarks are in raw camera coords (0-1); video is CSS-mirrored.
          // Because of CSS scaleX(-1) on the video, raw X offsets translate
          // directly to correct visual shifts (mirror cancels the sign flip).
          {
            const wrapper = autoFitWrapperRef.current
            if (wrapper && guide.faceLocked && !preview) {
              const af = autoFitRef.current
              const leftCheek = smoothed[234]
              const rightCheek = smoothed[454]
              const foreheadLm = smoothed[10]
              const chinLm = smoothed[152]

              if (leftCheek && rightCheek && foreheadLm && chinLm) {
                const faceCX = (leftCheek.x + rightCheek.x) / 2
                const faceCY = (foreheadLm.y + chinLm.y) / 2
                const fh = guide.faceHeightRatio

                // Target scale: bring face to ideal size in frame
                let tScale = 1
                if (fh > 0.08 && fh < AUTOFIT_IDEAL_FACE_HEIGHT * 1.5) {
                  tScale = Math.min(AUTOFIT_MAX_SCALE, Math.max(1, AUTOFIT_IDEAL_FACE_HEIGHT / Math.max(fh, 0.15)))
                }
                // Don't zoom in if face is already large enough
                if (fh >= AUTOFIT_IDEAL_FACE_HEIGHT * 0.9) tScale = Math.max(1, Math.min(tScale, 1.05))

                // Signed offset from center (raw landmark space)
                const rawOffX = faceCX - 0.5     // positive = face right of center in raw
                const rawOffY = faceCY - 0.47    // positive = face below the guide center

                // Apply dead zone to reduce jitter on small movements
                const offX = Math.abs(rawOffX) > AUTOFIT_DEAD_ZONE ? rawOffX : 0
                const offY = Math.abs(rawOffY) > AUTOFIT_DEAD_ZONE ? rawOffY : 0

                // Translate to center the face — scaled by current zoom
                // Raw X maps directly to visual X because CSS mirror cancels
                const tTx = Math.max(-AUTOFIT_MAX_SHIFT, Math.min(AUTOFIT_MAX_SHIFT,
                  offX * 100 * tScale * 0.7))
                const tTy = Math.max(-AUTOFIT_MAX_SHIFT * 0.7, Math.min(AUTOFIT_MAX_SHIFT * 0.7,
                  -offY * 100 * tScale * 0.5))

                // Smooth toward target
                af.scale += (tScale - af.scale) * AUTOFIT_SMOOTHING
                af.tx += (tTx - af.tx) * AUTOFIT_SMOOTHING
                af.ty += (tTy - af.ty) * AUTOFIT_SMOOTHING

                wrapper.style.transform = `scale(${af.scale.toFixed(4)}) translate(${af.tx.toFixed(2)}%, ${af.ty.toFixed(2)}%)`
              }
            }
          }

          if (!faceFirstSeenRef.current) faceFirstSeenRef.current = now
          if (now - faceFirstSeenRef.current > FAILSAFE_MS && phaseRef.current !== 'validated' && phaseRef.current !== 'advancing') {
            setFailsafeActive(true)
          }

          // Phase transitions
          if (phaseRef.current === 'detecting' || phaseRef.current === 'idle') updatePhase('tracking')

          // ── READINESS + COUNTDOWN (angle-specific rule) ──────
          // Front: hard blockers + 6/6 soft checks (strict)
          // Left/Right: hard blockers + 5/6 soft checks (tolerant)
          //   1. isReadyForCapture() checks hard blockers + step-aware soft gate
          //   2. Accumulate STABILITY_FRAMES_REQUIRED consecutive ready frames
          //   3. Start countdown (3s front, 1s side)
          //   4. Grace: up to 3 dip frames tolerated during countdown
          //   5. Auto-capture when countdown completes
          const isSideStep = mode === 'multi' && multiStep !== 'front'
          const viewKey = multiStep as CaptureViewKey
          const curPhase = phaseRef.current
          const canAct = !previewRef.current && curPhase !== 'validated' && curPhase !== 'advancing'
          const countdownDuration = isSideStep ? COUNTDOWN_MS_SIDE : COUNTDOWN_MS_FRONT

          const readyNow = isReadyForCapture(guide, isSideStep, failsafeActive)

          if (readyNow) {
            stableReadyFrames.current++
          } else {
            stableReadyFrames.current = Math.max(0, stableReadyFrames.current - 2)
          }

          const requiredStable = failsafeActive ? 2 : STABILITY_FRAMES_REQUIRED

          if (readyNow && stableReadyFrames.current >= requiredStable && canAct) {
            // Ready — start or continue countdown, reset dip counter
            dipFramesRef.current = 0
            if (!countdownStartRef.current) {
              countdownStartRef.current = now
              startHoldTracking(viewKey, now)
              updatePhase('stabilizing')
            }
            const elapsed = now - countdownStartRef.current
            const remaining = Math.ceil((countdownDuration - elapsed) / 1000)
            setCountdown(Math.max(0, remaining))
            setValidationProgress(Math.min(1, elapsed / countdownDuration))

            if (elapsed >= countdownDuration) {
              const minFrames = Math.max(isSideStep ? 5 : 6, targetAcceptedFrameCount(viewKey) - 2)
              if (frameBufferRef.current.length >= minFrames) {
                setCountdown(null)
                triggerAutoAdvance()
              }
              // else: keep waiting — countdown stays at 0, will fire next frame when buffer fills
            }
          } else if (!readyNow && canAct) {
            const rejectionReason = guide.debug.rejectionReason ?? (guide.angle === 'look_left' || guide.angle === 'look_right' ? 'wrong_view' : 'quality_not_ready')
            recordRejectedSample(
              viewKey,
              buildFrameMetrics(viewKey, guide, now, false, rejectionReason),
              rejectionReason,
            )
            // Not ready — grace window during active countdown
            if (countdownStartRef.current) {
              dipFramesRef.current++
              if (dipFramesRef.current > MAX_DIP_FRAMES) {
                // Too many dip frames — hard reset
                appendAcceptanceHistory(viewKey, 'reset', rejectionReason, now)
                registerCountdownReset(viewKey, now)
                countdownStartRef.current = null
                dipFramesRef.current = 0
                setCountdown(null)
                setValidationProgress(0)
                if (curPhase === 'stabilizing') updatePhase('tracking')
              }
              // else: within grace window, keep countdown running
            } else if (curPhase === 'stabilizing') {
              updatePhase('tracking')
            }
          }

          // Buffer best frames — uses aligned 3:4 capture to match UI
          // Only buffer frames that meet minimum quality for clean results
          const bufferThreshold = isSideStep ? 0.66 : 0.80
          // Front: only buffer frames where full face is visible (eyes + forehead + chin)
          const faceFullyVisible = isSideStep || (guide.eyesVisible && guide.foreheadVisible && guide.chinVisible)
          if (guide.captureAcceptance >= bufferThreshold && faceFullyVisible && !previewRef.current && curPhase !== 'validated' && curPhase !== 'advancing') {
            const cc = captureCanvasRef.current
            if (cc && video.videoWidth > 0) {
              const dataUrl = captureAlignedFrame(video, cc)
              if (dataUrl) {
                const runtime = viewRuntimeRef.current[viewKey]
                const lastAccepted = runtime.acceptedFrames[runtime.acceptedFrames.length - 1]
                if (!lastAccepted || now - lastAccepted.timestamp >= MULTI_FRAME_MIN_GAP_MS / 2) {
                  const frame = buildFrameMetrics(viewKey, guide, now, true, undefined, dataUrl)
                  pushAcceptedFrame(viewKey, frame)
                  frameBufferRef.current.push(frame)
                }
                const cutoff = now - BEST_FRAME_WINDOW_MS
                frameBufferRef.current = frameBufferRef.current.filter((f) => f.time > cutoff).slice(-BEST_FRAME_BUFFER_SIZE)
              }
            }
          }

          // Draw dynamic face contour + mesh — unified on one canvas.
          // Order: guide frame (background) → vignette → mesh → contour (foreground)
          const meshAccent = accentFromQuality(guide.qualityScore)
          const ctx = mc.getContext('2d')
          if (ctx) {
            // 1) Compute contour from live landmarks
            const contour = computeFaceContour(smoothed, mc.width, mc.height, {
              mirror: true,
              sourceWidth: video.videoWidth,
              sourceHeight: video.videoHeight,
              targetAngle,
            })

            // 2) Clear canvas
            ctx.clearRect(0, 0, mc.width, mc.height)

            // 3) Draw fixed guide frame — always visible, behind everything
            const guideFrameState: GuideFrameState = guide.allOk
              ? 'valid'
              : guide.faceDetected && guide.faceLocked
                ? 'tracking'
                : guide.faceDetected
                  ? 'invalid'
                  : 'neutral'
            drawFixedGuideFrame(ctx, mc.width, mc.height, {
              targetAngle,
              state: guideFrameState,
              qualityScore: guide.qualityScore,
              time: now,
            })

            // 4) Draw vignette (behind mesh)
            if (contour.valid) {
              drawDynamicVignette(ctx, contour, mc.width, mc.height, 0.65)
            }

            // 5) Draw mesh (tesselation + feature contours + anchors)
            //    Pass skipClear=true since we already cleared above
            drawMesh(
              ctx,
              smoothed,
              mc.width,
              mc.height,
              guide.allOk,
              true,
              false,
              guide.qualityScore,
              undefined,
              meshAccent,
              showMesh,
              true,
              video.videoWidth,
              video.videoHeight,
            )

            // 6) Draw outer face contour + accents on top
            if (contour.valid) {
              drawFaceContour(ctx, contour, meshAccent, guide.qualityScore)
              drawContourAccents(ctx, contour, meshAccent, guide.qualityScore)
            }
          }
        }
      })
      .catch(() => { processingRef.current = false })

    animFrameRef.current = requestAnimationFrame(processFrame)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- phase/preview/countdown read via refs to avoid stale-closure restarts
  }, [appendAcceptanceHistory, appendGuidance, buildFrameMetrics, failsafeActive, landmarksRef, mode, multiStep, observeLiveness, pushAcceptedFrame, recordRejectedSample, registerCountdownReset, startHoldTracking, status.faceLocked, triggerAutoAdvance, updatePhase])

  useEffect(() => {
    if (initState === 'ready' && !preview) {
      animFrameRef.current = requestAnimationFrame(processFrame)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [initState, preview, processFrame])

  const buildCaptureManifest = useCallback((): CaptureManifest => {
    const relevantViews = mode === 'multi' ? VIEW_KEYS : (['front'] as CaptureViewKey[])
    const manifests = relevantViews.map(view => viewManifestsRef.current[view] ?? finalizeViewManifest(view))
    const selectedKeyframes = manifests.reduce<Partial<Record<CaptureViewKey, string>>>((acc, manifest) => {
      if (manifest.representative_frame_id) acc[manifest.view] = manifest.representative_frame_id
      return acc
    }, {})
    const liveness = computeLivenessSignals(livenessRuntimeRef.current, mode === 'multi')

    return {
      schema_version: '2.0.0',
      session_id: captureSessionIdRef.current,
      mode,
      captured_at: new Date(Math.min(...captureFramesRef.current.map(frame => frame.timestamp), Date.now())).toISOString(),
      completed_at: new Date().toISOString(),
      device_info: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      liveness_required: mode === 'multi',
      liveness_passed: liveness.passed,
      liveness_status: liveness.status,
      liveness_confidence: liveness.confidence,
      liveness_incomplete_reason: liveness.incompleteReason,
      liveness_schema_version: '2.0.0',
      liveness_signals: liveness.signals,
      liveness_steps: liveness.steps,
      frames: captureFramesRef.current
        .filter(frame => relevantViews.includes(frame.view))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ dataUrl, ...frame }) => frame)
        .sort((a, b) => a.timestamp - b.timestamp),
      views: manifests,
      selected_keyframes: selectedKeyframes,
      acceptance_history: acceptanceHistoryRef.current.filter(event => relevantViews.includes(event.view)),
    }
  }, [finalizeViewManifest, mode])

  const buildMeta = useCallback((): CaptureMetadata => {
    const manifest = buildCaptureManifest()
    const relevantViews = manifest.views.filter(view => mode === 'multi' || view.view === 'front')
    const livenessMissingViews = manifest.liveness_required && !manifest.liveness_passed
      ? manifest.liveness_steps
        ?.filter(step => !step.observed)
        .flatMap<CaptureViewKey>((step) => {
          if (step.key === 'left_turn') return ['left']
          if (step.key === 'right_turn') return ['right']
          return ['front']
        }) ?? ['front']
      : []
    const captureQualityScore = relevantViews.length > 0
      ? Math.round(median(relevantViews.map(view => view.acceptance_score)) * 100)
      : Math.round(status.captureAcceptance * 100)
    const recaptureViews = Array.from(new Set([
      ...relevantViews
      .filter(view => view.recapture_required)
      .map(view => view.view),
      ...livenessMissingViews,
    ]))
    const primaryFrames = mode === 'multi'
      ? (exportedFramesByViewRef.current.front ?? [])
      : (exportedFramesByViewRef.current.front ?? exportedFramesRef.current)
    const viewQualities: ViewQualityMeta[] = relevantViews.map(view => ({
      view: view.view,
      qualityScore: view.quality_score,
      acceptanceScore: view.acceptance_score,
      captured: view.captured,
      qualityBand: view.quality_band,
      recaptureRequired: view.recapture_required,
    }))
    const viewFrames = relevantViews.reduce<Partial<Record<CaptureViewKey, string[]>>>((acc, view) => {
      const frames = exportedFramesByViewRef.current[view.view]
      if (frames && frames.length > 0) acc[view.view] = frames
      return acc
    }, {})

    return {
      confidence: toCaptureConfidence(captureQualityScore / 100),
      qualityScore: Math.round(status.qualityScore * 100),
      captureQualityScore,
      capturedFrames: primaryFrames.length > 0 ? primaryFrames : undefined,
      viewFrames,
      viewQualities,
      captureManifest: manifest,
      recaptureRecommended: recaptureViews.length > 0 || (manifest.liveness_required && !manifest.liveness_passed),
      recaptureViews,
      livenessStatus: manifest.liveness_status,
      livenessConfidence: Math.round(manifest.liveness_confidence * 100),
      livenessRequired: manifest.liveness_required,
      livenessPassed: manifest.liveness_passed,
      livenessSignals: manifest.liveness_signals,
    }
  }, [buildCaptureManifest, mode, status.captureAcceptance, status.qualityScore])

  // Auto-confirm: in single mode, call onCapture as soon as preview is set
  useEffect(() => {
    if (autoConfirm && mode === 'single' && preview && phase === 'advancing') {
      onCapture(preview, buildMeta())
    }
  }, [autoConfirm, buildMeta, mode, onCapture, phase, preview])

  // Manual capture — hardened fallback with near-auto trust (5/6 front, 4/6 side soft checks).
  const isSideStep = mode === 'multi' && multiStep !== 'front'
  const manualCaptureEnabled = isManualCaptureEligible(status, isSideStep)
  const takeSnapshot = () => {
    if (!manualCaptureEnabled) return
    const viewKey = multiStep as CaptureViewKey
    exportedFramesRef.current = captureBestFrames(targetAcceptedFrameCount(viewKey))
    exportedFramesByViewRef.current[viewKey] = exportedFramesRef.current
    const dataUrl = captureBestFrame()
    if (!dataUrl) return
    if (viewRuntimeRef.current[viewKey].acceptedFrames.length === 0) {
      const frame = buildFrameMetrics(viewKey, status, Date.now(), true, undefined, dataUrl)
      pushAcceptedFrame(viewKey, frame)
      frameBufferRef.current.push(frame)
    }
    setShowFlash(true); setTimeout(() => setShowFlash(false), 350)
    viewRuntimeRef.current[viewKey].captureTrigger = 'manual'
    const manifest = finalizeViewManifest(viewKey)
    appendAcceptanceHistory(
      viewKey,
      manifest.recapture_required ? 'reset' : 'accept',
      'manual_capture',
      Date.now(),
    )
    if (mode === 'multi') {
      setMultiPhotos((prev) => ({ ...prev, [multiStep]: dataUrl }))
    }
    updatePreview(dataUrl); updatePhase('advancing')
  }

  const confirmSingle = () => { if (preview) onCapture(preview, buildMeta()) }

  const confirmMulti = () => {
    if (multiStep === 'front') {
      updatePreview(null); setMultiStep('left'); resetValidation(); updatePhase('detecting')
    } else if (multiStep === 'left') {
      updatePreview(null); setMultiStep('right'); resetValidation(); updatePhase('detecting')
    } else if (multiStep === 'right') {
      // Final step — finalize multi-capture
      const photos = { ...multiPhotos, right: preview! }
      if (onMultiCapture && photos.front && photos.left && photos.right) {
        onMultiCapture({ front: photos.front, left: photos.left, right: photos.right }, buildMeta())
      } else if (photos.front) onCapture(photos.front, buildMeta())
    }
  }

  const retake = () => {
    appendAcceptanceHistory(multiStep as CaptureViewKey, 'reset', 'manual_retake', Date.now())
    resetViewRuntime(multiStep as CaptureViewKey)
    updatePreview(null)
    resetValidation()
    updatePhase('detecting')
  }

  // ─── Render ───────────────────────────────────────────────
  const isMulti = mode === 'multi'
  const currentStepLabel = isMulti ? MULTI_LABELS[multiStep] : null
  const STEP_ORDER: MultiStep[] = ['front', 'left', 'right']
  const stepNumber = STEP_ORDER.indexOf(multiStep) + 1
  const totalSteps = STEP_ORDER.length
  const livenessOverview = computeLivenessSignals(livenessRuntimeRef.current, mode === 'multi')
  const currentGuideHint = getInitialGuideHint(isMulti ? multiStep : 'front')
  const angleAssist = isMulti ? getAngleAssist(multiStep, status) : null
  const stepTurnHint = isMulti ? getStepTurnHint(multiStep, status) : null
  const tiltAssist = getTiltAssist(status)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0E0B09 0%, #060609 60%, #030305 100%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={brightnessCanvasRef} className="hidden" />

      {/* ═══ SECTION 1: Header ═══════════════════════════════ */}
      <div className="flex-none px-4 pt-3 pb-2 sm:pt-4 sm:pb-2">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[rgba(255,255,255,0.06)] backdrop-blur-md border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-white/50 hover:text-white hover:bg-[rgba(255,255,255,0.12)] transition-all active:scale-95"
            aria-label="Kapat" type="button"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <span className="font-body text-[12px] tracking-[0.2em] uppercase text-[rgba(214,185,140,0.5)]">
            AI Yüz Tarama
          </span>

          {isMulti && !preview ? (
            <div className="flex items-center gap-1">
              {STEP_ORDER.map((s, i) => {
                const isDone = !!multiPhotos[s]
                const isCurrent = s === multiStep
                return (
                  <div key={s} className="flex items-center gap-0.5">
                    <div className={`w-5 h-5 rounded-full text-[9px] font-medium flex items-center justify-center transition-all ${
                      isCurrent ? 'bg-[#C4A35A] text-white' : isDone ? 'bg-[#00905A] text-white' : 'bg-white/8 text-white/30'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    {i < STEP_ORDER.length - 1 && <div className={`w-2 h-px ${isDone ? 'bg-[#00905A]' : 'bg-white/10'}`} />}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10" />
          )}
        </div>
      </div>

      {/* ═══ SECTION 2: Camera preview (flex-1, fills available space) ═══ */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 sm:px-4 pt-2 pb-2 sm:pt-4 sm:pb-2">
        <div
          className="relative w-full rounded-[20px] sm:rounded-[28px] overflow-hidden border border-[rgba(214,185,140,0.12)] shadow-[0_0_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(214,185,140,0.05)]"
          style={{ aspectRatio: '3/4', maxWidth: 'min(92vw, 420px)', maxHeight: 'min(100%, 62dvh)' }}
        >
          {/* Loading */}
          {initState === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#060609]">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#C4A35A] border-r-[#2D5F5D] animate-spin" />
                <div className="absolute inset-3 rounded-full border border-[rgba(196,163,90,0.12)]" />
              </div>
              <div className="text-center px-4">
                <p className="font-body text-[12px] sm:text-[13px] text-white/60 tracking-wide">AI tarama motoru hazırlanıyor</p>
                <p className="font-body text-[10px] text-white/40 mt-1">İlk kullanımda birkaç saniye sürebilir</p>
              </div>
            </div>
          )}

          {/* Error */}
          {initState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 bg-[#060609]">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[rgba(160,82,82,0.12)] flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#E07070]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="font-body text-[11px] sm:text-[12px] text-white/60 text-center leading-relaxed">{initError}</p>
              <button type="button" onClick={onClose} className="mt-1 font-body text-[12px] tracking-[0.15em] uppercase text-[#C4A35A] hover:text-[#D4B96A] transition-colors">
                Kapat
              </button>
            </div>
          )}

          {/* Live camera + Face Mesh canvas — ALWAYS MOUNTED to keep srcObject attached.
              When preview is shown, these stay in the DOM but are hidden under the preview layer.
              Wrapped in auto-fit div that smoothly zooms/pans to bring face into the oval. */}
          {(initState === 'ready' || initState === 'loading') && (
            <>
              <div
                ref={autoFitWrapperRef}
                className="absolute inset-0"
                style={{ willChange: 'transform', transformOrigin: '50% 45%' }}
              >
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                />
                <canvas
                  ref={meshCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>

              {/* ── Initial face guide — shown only before face is detected ──
                  Once the face is detected, the dynamic canvas contour takes over.
                  This CSS oval is purely an initial positioning hint. */}
              {!preview && !status.faceDetected && phase !== 'validated' && phase !== 'advancing' && (
                <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none" style={{ paddingBottom: '1%' }}>
                  {/* Static vignette for initial state */}
                  <div className="absolute inset-0" style={{
                    background: isMulti && multiStep !== 'front'
                      ? 'radial-gradient(ellipse 62% 66% at 50% 46%, transparent 34%, rgba(3,3,5,0.28) 54%, rgba(3,3,5,0.70) 75%, rgba(3,3,5,0.90) 100%)'
                      : 'radial-gradient(ellipse 68% 65% at 50% 46%, transparent 35%, rgba(3,3,5,0.30) 55%, rgba(3,3,5,0.70) 75%, rgba(3,3,5,0.90) 100%)',
                  }} />
                  <div
                    className="relative"
                    style={{
                      width: currentGuideHint.width,
                      aspectRatio: currentGuideHint.aspectRatio,
                      transform: `translateX(${currentGuideHint.offsetX ?? '0%'}) ${currentGuideHint.mirror ? 'scaleX(-1)' : ''}`.trim(),
                    }}
                  >
                    <svg
                      viewBox="0 0 100 112"
                      className="absolute inset-0 w-full h-full overflow-visible"
                      aria-hidden="true"
                    >
                      <path
                        d={currentGuideHint.path}
                        fill="none"
                        stroke="rgba(214,185,140,0.10)"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: 'blur(8px)', animation: 'ovalBreathe 4s ease-in-out infinite' }}
                      />
                      <path
                        d={currentGuideHint.path}
                        fill="none"
                        stroke="rgba(214,185,140,0.17)"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ animation: 'ovalBreathe 4s ease-in-out infinite' }}
                      />
                      <path
                        d={currentGuideHint.path}
                        fill="none"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth="0.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ animation: 'ovalBreathe 4s ease-in-out infinite' }}
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* Stabilization ring + countdown number */}
              {!preview && phase === 'stabilizing' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    <svg width="90" height="90" viewBox="0 0 100 100" className="opacity-60">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={`rgba(${accentFromQuality(status.qualityScore)},0.7)`}
                        strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${validationProgress * 264} 264`}
                        transform="rotate(-90 50 50)"
                        style={{ transition: 'stroke-dasharray 0.15s ease-out' }}
                      />
                    </svg>
                    {/* Countdown number — visible for all captures */}
                    {countdown !== null && countdown > 0 && (
                      <span
                        key={countdown}
                        className="absolute font-display text-[38px] sm:text-[44px] font-light tabular-nums"
                        style={{
                          color: `rgba(${accentFromQuality(status.qualityScore)},0.9)`,
                          textShadow: `0 0 24px rgba(${accentFromQuality(status.qualityScore)},0.4)`,
                          animation: 'countdownPop 0.35s ease-out',
                        }}
                      >
                        {countdown}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Validated success */}
              {!preview && (phase === 'validated' || phase === 'advancing') && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-[fadeIn_0.3s_ease]">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[rgba(0,255,180,0.15)] backdrop-blur-md border border-[rgba(0,255,180,0.4)] flex items-center justify-center">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#00FFB4]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Flash */}
              {showFlash && (
                <div className="absolute inset-0 z-30 bg-white animate-[flashFade_0.35s_ease-out_forwards] pointer-events-none" />
              )}


            </>
          )}

          {/* Preview — rendered ON TOP of the always-mounted video, at z-10 */}
          {preview && (
            <div className="absolute inset-0 z-10 animate-[fadeIn_0.5s_ease]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Önizleme" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              {isMulti && (
                <div className="absolute top-3 left-0 right-0 flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md text-[11px] sm:text-[12px] font-medium tracking-[0.15em] uppercase text-white/80">
                    {currentStepLabel} — Adım {stepNumber}/{totalSteps}
                  </span>
                </div>
              )}
              <div className="absolute bottom-3 left-3 right-3 flex justify-center pointer-events-none">
                <span className="px-3.5 py-1.5 rounded-full bg-[rgba(0,255,180,0.15)] backdrop-blur-md border border-[rgba(0,255,180,0.3)] text-[11px] sm:text-[14px] font-medium tracking-[0.1em] uppercase text-[#7CE8B2] whitespace-nowrap">
                  ✓ Çekim tamamlandı
                </span>
              </div>
            </div>
          )}

          {/* ── Quality pill strip — top of frame, compact dots+labels ── */}
          {initState === 'ready' && !preview && phase !== 'validated' && phase !== 'advancing' && (
            <div className="absolute top-2.5 left-2 right-2 z-10">
              <QualityPillStrip scores={{
                distance: status.faceDetected ? status.qualityBreakdown.distance : 0,
                lighting: status.faceDetected ? status.qualityBreakdown.lighting : 0,
                angle: status.faceDetected ? status.qualityBreakdown.angle : 0,
                centering: status.faceDetected ? status.qualityBreakdown.centering : 0,
                sharpness: status.faceDetected ? status.qualityBreakdown.sharpness : 0,
                expression: status.faceDetected ? Math.min(status.qualityBreakdown.stability, status.faceLocked ? 1 : 0.3) : 0,
              }} />
            </div>
          )}

          {/* ── AI Haritası toggle — bottom-left of camera frame ── */}
          {initState === 'ready' && !preview && (
            <button
              type="button"
              onClick={() => setShowMesh((v) => !v)}
              className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all duration-200 active:scale-95"
              style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: `1px solid ${showMesh ? 'rgba(214,185,140,0.15)' : 'rgba(255,255,255,0.08)'}`,
              }}
              aria-label={showMesh ? 'AI Haritasını Gizle' : 'AI Haritasını Göster'}
            >
              <svg className={`w-3 h-3 transition-colors duration-200 ${showMesh ? 'text-[#D6B98C]' : 'text-white/30'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              <span className={`font-body text-[9px] tracking-[0.06em] transition-colors duration-200 ${showMesh ? 'text-white/50' : 'text-white/38'}`}>
                {showMesh ? 'AI Haritası' : 'Harita Kapalı'}
              </span>
            </button>
          )}

        </div>
      </div>

      {/* ── Guidance card — below camera preview ── */}
      {initState === 'ready' && !preview && phase !== 'validated' && phase !== 'advancing' && (
        <div className="flex-none flex justify-center px-4 mt-2 sm:mt-2.5">
          <div
            className="flex flex-col items-center gap-1 px-5 sm:px-7 py-2.5 sm:py-3 rounded-[14px] sm:rounded-[16px] max-w-[92%]"
            style={{
              background: 'rgba(10,8,6,0.85)',
              border: '1px solid rgba(214,185,140,0.06)',
            }}
          >
            {isMulti && (
              <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#D4B96A]/60">
                {currentStepLabel} — {stepNumber}/{totalSteps}
              </span>
            )}
            {stepTurnHint && (
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border"
                style={{
                  borderColor: stepTurnHint.tone === 'good'
                    ? 'rgba(74,227,167,0.16)'
                    : stepTurnHint.tone === 'warn'
                      ? 'rgba(214,185,140,0.14)'
                      : 'rgba(214,185,140,0.10)',
                  background: stepTurnHint.tone === 'good'
                    ? 'rgba(74,227,167,0.06)'
                    : stepTurnHint.tone === 'warn'
                      ? 'rgba(214,185,140,0.07)'
                      : 'rgba(214,185,140,0.05)',
                }}
              >
                <span
                  className="font-display text-[15px] leading-none"
                  style={{
                    color: stepTurnHint.tone === 'good'
                      ? 'rgba(74,227,167,0.82)'
                      : 'rgba(214,185,140,0.78)',
                  }}
                >
                  {stepTurnHint.arrow}
                </span>
                <span
                  className="font-body text-[12px] tracking-[0.08em] uppercase"
                  style={{
                    color: stepTurnHint.tone === 'good'
                      ? 'rgba(74,227,167,0.80)'
                      : 'rgba(212,185,106,0.75)',
                  }}
                >
                  {stepTurnHint.instruction}
                </span>
              </div>
            )}
            <p className={`font-display text-[15px] sm:text-[17px] font-normal text-center leading-[1.35] tracking-[0.01em] transition-colors duration-500 whitespace-pre-line ${
              phase === 'stabilizing' ? 'text-[#D4B96A]'
                : status.faceDetected && status.qualityScore >= 0.5 ? 'text-white/90'
                : 'text-white/60'
            }`}>
              {(() => {
                const isSide = isMulti && multiStep !== 'front'
                // Countdown active (front or side)
                if (countdown !== null && countdown > 0) {
                  return isSide ? 'Mükemmel, bu pozisyonda kalın' : 'Sabit kalın, çekim başlıyor…'
                }
                if (phase === 'stabilizing') return 'Harika, tam böyle kalın…'
                // Side: when allOk, show only positive — suppress ALL corrections
                if (isSide && phase === 'tracking' && status.faceDetected && status.allOk) {
                  return 'Mükemmel pozisyon, sabit kalın'
                }
                // Tilt correction (front always, side only when NOT allOk)
                if (phase === 'tracking' && status.faceDetected && tiltAssist && !isSide) {
                  return tiltAssist.primary
                }
                if (isSide && phase === 'tracking' && status.faceDetected && angleAssist) {
                  return angleAssist.primary
                }
                // Front-specific: chin not visible
                if (!isSide && phase === 'tracking' && status.faceDetected && !status.chinVisible) {
                  return 'Çeneniz çerçevede görünür olsun'
                }
                if (phase === 'tracking' && status.faceDetected) return status.mainMessage
                if (phase === 'idle' || phase === 'detecting' || !status.faceDetected) {
                  return isMulti ? MULTI_INSTRUCTIONS[multiStep] : 'Yüzünüzü çerçeveye yerleştirin'
                }
                return status.mainMessage
              })()}
            </p>
            {/* Secondary hint */}
            {(() => {
              const isSide = isMulti && multiStep !== 'front'
              if (countdown !== null && countdown > 0) {
                return <p className="font-body text-[10px] text-[#D4B96A]/40 text-center tracking-wide">AI tarama hazırlanıyor</p>
              }
              // Side: suppress all secondary corrections when allOk
              if (isSide && phase === 'tracking' && status.faceDetected && status.allOk) {
                return <p className="font-body text-[10px] text-[#D4B96A]/40 text-center tracking-wide">Çekim için hazır</p>
              }
              // Tilt correction secondary (front only)
              if (!isSide && phase === 'tracking' && status.faceDetected && tiltAssist) {
                return <p className="font-body text-[10px] text-white/45 text-center tracking-wide">{tiltAssist.secondary}</p>
              }
              if (stepTurnHint && (phase === 'idle' || phase === 'detecting') && !status.faceDetected) {
                return <p className="font-body text-[10px] text-white/45 text-center tracking-wide">{stepTurnHint.short}</p>
              }
              if (isSide && phase === 'tracking' && status.faceDetected && angleAssist) {
                return <p className="font-body text-[10px] text-white/45 text-center tracking-wide">{angleAssist.secondary}</p>
              }
              if ((phase === 'idle' || phase === 'detecting') && !status.faceDetected) {
                return <p className="font-body text-[10px] text-white/30 text-center tracking-wide">Doğal ifadenizle kameraya bakın</p>
              }
              if (phase === 'tracking' && status.faceDetected) {
                // Show blink challenge hint when front is steady but blink not yet detected
                const blinkStep = livenessOverview.steps.find(s => s.key === 'blink')
                const frontStep = livenessOverview.steps.find(s => s.key === 'front')
                const showBlinkHint = frontStep?.observed && !blinkStep?.observed && (!isMulti || multiStep === 'front')
                if (showBlinkHint) {
                  return <p className="font-body text-[10px] text-[#D4B96A]/55 text-center tracking-wide animate-pulse">Doğal bir şekilde göz kırpın</p>
                }
                return <p className="font-body text-[10px] text-white/40 text-center tracking-wide" key={tipIndex}>{TIPS[tipIndex]}</p>
              }
              return null
            })()}
            {livenessOverview.status !== 'not_required' && (
              <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                {livenessOverview.steps.map((step) => {
                  const active = (step.key === 'front' && multiStep === 'front')
                    || (step.key === 'blink' && multiStep === 'front')
                    || (step.key === 'left_turn' && multiStep === 'left')
                    || (step.key === 'right_turn' && multiStep === 'right')
                  const tone = step.observed
                    ? 'rgba(74,227,167,0.72)'
                    : active
                      ? 'rgba(214,185,140,0.62)'
                      : 'rgba(248,246,242,0.18)'
                  const label = step.key === 'front'
                    ? 'Ön'
                    : step.key === 'blink'
                      ? 'Kırp'
                      : step.key === 'left_turn'
                        ? 'Sol'
                        : 'Sağ'

                  return (
                    <span
                      key={step.key}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border"
                      style={{
                        borderColor: step.observed ? 'rgba(74,227,167,0.16)' : active ? 'rgba(214,185,140,0.16)' : 'rgba(255,255,255,0.05)',
                        background: step.observed ? 'rgba(74,227,167,0.06)' : active ? 'rgba(214,185,140,0.05)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
                      <span className="font-body text-[11px] tracking-[0.12em] uppercase" style={{ color: tone }}>
                        {label}
                      </span>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECTION 3: Controls (flex-none) ═══ */}
      <div className="flex-none px-5 pb-5 sm:pb-6 pt-2 sm:pt-3">
        <div className="flex flex-col items-center gap-2">
          {!preview ? (
            <>
              {/* Quality bar + capture button */}
              {phase === 'validated' || phase === 'advancing' ? (
                <p className="font-body text-[13px] text-[#00FFB4] tracking-[0.1em] uppercase py-2">Çekim tamamlandı</p>
              ) : (
                <div className="flex items-center gap-5">
                  {/* Quality bar — left of shutter */}
                  {status.faceDetected && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 sm:w-20 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.round(status.qualityScore * 100)}%`,
                            background: `rgb(${accentFromQuality(status.qualityScore)})`,
                          }}
                        />
                      </div>
                      <span
                        className="font-mono text-[10px] tabular-nums w-6 transition-colors duration-500"
                        style={{ color: `rgba(${accentFromQuality(status.qualityScore)},0.55)` }}
                      >
                        {Math.round(status.qualityScore * 100)}
                      </span>
                    </div>
                  )}

                  {/* Shutter button — enabled when manual eligibility passes (hardened fallback) */}
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    disabled={!manualCaptureEnabled}
                    className="group relative flex-shrink-0 transition-opacity duration-300"
                    style={{ opacity: manualCaptureEnabled ? 1 : 0.25 }}
                    aria-label="Fotoğraf çek"
                  >
                    <div className={`w-[62px] h-[62px] sm:w-[72px] sm:h-[72px] rounded-full border-[2.5px] transition-all duration-500 flex items-center justify-center ${
                      manualCaptureEnabled
                        ? 'border-[rgba(0,255,180,0.45)] shadow-[0_0_20px_rgba(0,255,180,0.15)]'
                        : 'border-[rgba(255,255,255,0.08)]'
                    }`}>
                      <div className={`w-[50px] h-[50px] sm:w-[58px] sm:h-[58px] rounded-full transition-all duration-300 ${
                        manualCaptureEnabled
                          ? 'bg-[rgba(0,255,180,0.12)] group-hover:bg-[rgba(0,255,180,0.22)] group-active:scale-90'
                          : 'bg-[rgba(255,255,255,0.04)]'
                      }`} />
                    </div>
                  </button>

                  {/* Status hint — right of shutter */}
                  <div className="w-[76px] sm:w-[86px]">
                    {manualCaptureEnabled ? (
                      <p className="font-body text-[11px] text-[rgba(0,255,180,0.5)] tracking-[0.08em] uppercase leading-tight text-center">
                        Çekim hazır
                      </p>
                    ) : status.faceDetected ? (
                      <p className="font-body text-[11px] text-white/40 tracking-[0.08em] uppercase leading-tight text-center">
                        {phase === 'stabilizing' ? 'Taranıyor…' : 'Konumlanıyor…'}
                      </p>
                    ) : (
                      <p className="font-body text-[11px] text-white/35 tracking-[0.08em] uppercase leading-tight text-center">
                        Otomatik tarama
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ─── Preview action buttons ─── */
            <div className="flex flex-col gap-2.5 w-full max-w-[300px] sm:max-w-xs">
              <button
                type="button"
                onClick={isMulti ? confirmMulti : confirmSingle}
                className="w-full font-body text-[14px] font-medium tracking-[0.1em] uppercase py-3 sm:py-3.5 rounded-[14px] bg-gradient-to-br from-[#00905A] to-[#00B864] text-white hover:shadow-[0_4px_24px_rgba(0,184,100,0.35)] transition-all active:scale-[0.98]"
              >
                {isMulti
                  ? multiStep === 'right' ? 'Analizi Başlat'
                    : 'Sonraki Açı'
                  : 'Bu Fotoğrafı Kullan'}
              </button>
              <button
                type="button"
                onClick={retake}
                className="w-full font-body text-[13px] font-medium tracking-[0.1em] uppercase py-2.5 sm:py-3 rounded-[12px] border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all active:scale-[0.98]"
              >
                Yeniden Çek
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
