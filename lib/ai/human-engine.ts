/**
 * Human Engine — local, browser-based face analysis using @vladmandic/human.
 *
 * Provides face detection, 468 landmarks (MediaPipe-compatible),
 * age estimation, and detection confidence — all running client-side.
 */

import { FaceMeshError } from './types'
import type { Landmark } from './types'

const isDev = process.env.NODE_ENV === 'development'
const devWarn = (...args: unknown[]) => { if (isDev) console.warn(...args) }

// ─── Types ──────────────────────────────────────────────────

export interface HumanDetection {
  landmarks: Landmark[]
  age: number | null
  gender: string | null
  genderConfidence: number
  confidence: number
  box: { x: number; y: number; width: number; height: number }
}

type HumanInstance = {
  load: () => Promise<void>
  warmup: (type: string) => Promise<void>
  detect: (
    input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    config?: Record<string, unknown>
  ) => Promise<HumanResult>
}

type HumanFace = {
  mesh: Array<[number, number, number]>
  score: number
  /** Provided by the description (faceres) module */
  age?: number
  /** Provided by the description (faceres) module */
  gender?: string
  /** Provided by the description (faceres) module */
  genderScore?: number
  box: [number, number, number, number]
  boxRaw: [number, number, number, number]
  // Allow additional fields from the library
  [key: string]: unknown
}

type HumanResult = {
  face: HumanFace[]
}

// ─── Singleton state ────────────────────────────────────────

let humanInstance: HumanInstance | null = null
let initPromise: Promise<void> | null = null

// ─── Configuration ──────────────────────────────────────────

const MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/'

function getConfig() {
  return {
    modelBasePath: MODEL_BASE,
    // Use WASM backend for broader compatibility; WebGL is faster but less stable
    backend: 'wasm' as const,
    wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/wasm-out/',
    face: {
      enabled: true,
      detector: {
        enabled: true,
        maxDetected: 1,
        rotation: false,
        modelPath: 'blazeface-back.json',
      },
      mesh: {
        enabled: true,
        modelPath: 'facemesh.json',
      },
      iris: {
        enabled: false,
      },
      // Age + gender are provided by the description module (faceres model).
      // Separate age/gender configs are not used in Human v3.x.
      description: {
        enabled: true,
        modelPath: 'faceres.json',
        minConfidence: 0.1,
      },
      emotion: {
        enabled: false,
      },
      antispoof: {
        enabled: false,
      },
      liveness: {
        enabled: false,
      },
    },
    body: { enabled: false },
    hand: { enabled: false },
    gesture: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
  }
}

// ─── Public API ─────────────────────────────────────────────

export async function init(): Promise<void> {
  if (humanInstance) return
  if (initPromise) return initPromise

  const INIT_TIMEOUT_MS = 12_000

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(
      () => reject(new FaceMeshError('INIT_TIMEOUT', `Human engine did not initialize within ${INIT_TIMEOUT_MS / 1000}s`)),
      INIT_TIMEOUT_MS
    )
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  })

  const loadPromise = (async () => {
    // Dynamic import — only executes client-side inside init().
    // The package is marked in serverExternalPackages (next.config.ts) so SSR
    // won't try to bundle it and pull in @tensorflow/tfjs-node.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const humanModule = await import('@vladmandic/human' as any)
    const Human = humanModule.default || humanModule.Human

    const config = getConfig()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new Human(config as any) as unknown as HumanInstance

    await instance.load()

    try {
      await instance.warmup('full')
    } catch (err) {
      devWarn('[Human] Warmup failed (non-fatal):', err)
    }

    humanInstance = instance
  })()

  initPromise = Promise.race([loadPromise, timeoutPromise])
  try {
    await initPromise
  } catch (err) {
    initPromise = null
    humanInstance = null
    if (isDev) console.error('[Human] Init failed:', err)
    throw err
  }
}

/**
 * Detect face from an image element.
 * Returns normalized landmarks (0-1) compatible with existing MediaPipe indices.
 */
export async function detectFace(
  input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<HumanDetection | null> {
  if (!humanInstance) {
    throw new FaceMeshError('MODEL_LOAD_FAILED', 'Human engine not initialized. Call init() first.')
  }

  const result = await humanInstance.detect(input)

  if (!result.face || result.face.length === 0) {
    devWarn('[Human] No face detected')
    return null
  }

  const face = result.face[0]

  if (!face.mesh || face.mesh.length < 400) {
    devWarn('[Human] Insufficient mesh points:', face.mesh?.length ?? 0)
    return null
  }

  // Determine input dimensions for normalization
  let inputWidth: number
  let inputHeight: number
  if (input instanceof HTMLVideoElement) {
    inputWidth = input.videoWidth || input.width
    inputHeight = input.videoHeight || input.height
  } else if (input instanceof HTMLImageElement) {
    inputWidth = input.naturalWidth || input.width
    inputHeight = input.naturalHeight || input.height
  } else {
    inputWidth = input.width
    inputHeight = input.height
  }

  // Convert mesh to normalized Landmark[] (0-1 range)
  // Human returns pixel coordinates; normalize to 0-1 for compatibility
  const landmarks: Landmark[] = face.mesh.map(([x, y, z]) => ({
    x: inputWidth > 0 ? x / inputWidth : x,
    y: inputHeight > 0 ? y / inputHeight : y,
    z: z / (inputWidth || 1), // z is relative to face width
  }))

  const [bx, by, bw, bh] = face.boxRaw ?? face.box
  const normalizedBox = face.boxRaw
    ? { x: bx, y: by, width: bw, height: bh }
    : {
        x: inputWidth > 0 ? bx / inputWidth : bx,
        y: inputHeight > 0 ? by / inputHeight : by,
        width: inputWidth > 0 ? bw / inputWidth : bw,
        height: inputHeight > 0 ? bh / inputHeight : bh,
      }

  return {
    landmarks,
    age: face.age ?? null,
    gender: face.gender ?? null,
    genderConfidence: face.genderScore ?? 0,
    confidence: face.score ?? 0,
    box: normalizedBox,
  }
}

/**
 * Detect face from video element (for real-time guidance).
 * Same as detectFace but named separately for clarity.
 */
export async function detectFaceFromVideo(
  video: HTMLVideoElement
): Promise<HumanDetection | null> {
  return detectFace(video)
}

/**
 * Run age estimation on multiple distinct frames and aggregate robustly.
 *
 * Uses trimmed mean (drop highest/lowest when ≥4 frames) for age to reject
 * outlier frames. Gender uses majority vote. Confidence uses median.
 *
 * Accepts genuinely distinct frames captured at different time points —
 * NOT copies of the same image.
 */
export async function detectFaceMultiFrame(
  images: HTMLImageElement[],
  minConfidence = 0.70,
): Promise<{ age: number | null; gender: string | null; genderConfidence: number; confidence: number; frameCount: number } | null> {
  if (!humanInstance || images.length === 0) return null

  const detections: Array<{ age: number; gender: string | null; genderConf: number; conf: number }> = []

  for (const img of images) {
    try {
      const result = await humanInstance.detect(img)
      if (!result.face || result.face.length === 0) continue
      const face = result.face[0]
      if (face.age != null && face.score != null && face.score >= minConfidence) {
        detections.push({
          age: face.age,
          gender: face.gender ?? null,
          genderConf: face.genderScore ?? 0,
          conf: face.score,
        })
      }
    } catch {
      // Skip failed frames
    }
  }

  if (detections.length === 0) return null

  // Trimmed mean for age: drop min/max when ≥4 detections
  const ages = detections.map(d => d.age).sort((a, b) => a - b)
  let trimmedAges = ages
  if (ages.length >= 4) {
    trimmedAges = ages.slice(1, -1) // drop lowest and highest
  }
  const avgAge = trimmedAges.reduce((s, a) => s + a, 0) / trimmedAges.length

  // Median confidence (more robust than mean)
  const confs = detections.map(d => d.conf).sort((a, b) => a - b)
  const medianConf = confs.length % 2 === 0
    ? (confs[confs.length / 2 - 1] + confs[confs.length / 2]) / 2
    : confs[Math.floor(confs.length / 2)]

  // Most common gender (majority vote)
  const genderCounts: Record<string, number> = {}
  for (const d of detections) {
    if (d.gender) genderCounts[d.gender] = (genderCounts[d.gender] || 0) + 1
  }
  const bestGender = Object.entries(genderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const avgGenderConf = detections
    .filter((d) => d.gender === bestGender)
    .reduce((s, d) => s + d.genderConf, 0) / Math.max(1, detections.filter((d) => d.gender === bestGender).length)

  return {
    age: Math.round(avgAge),
    gender: bestGender,
    genderConfidence: avgGenderConf,
    confidence: medianConf,
    frameCount: detections.length,
  }
}

export function destroy(): void {
  humanInstance = null
  initPromise = null
}

export function isInitialized(): boolean {
  return humanInstance !== null
}
