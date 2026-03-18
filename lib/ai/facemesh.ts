/**
 * FaceMesh compatibility layer.
 *
 * Wraps the Human engine to provide the same public API that
 * FaceGuideCapture and the processing pipeline expect.
 * This is a drop-in replacement of the old MediaPipe CDN scripts.
 */

import { FaceMeshError } from './types'
import type { Landmark } from './types'
import {
  init as initHuman,
  detectFace,
  destroy as destroyHuman,
  isInitialized,
} from './human-engine'

type ResultCallback = (landmarks: Landmark[] | null) => void

export async function init(): Promise<void> {
  await initHuman()
}

/**
 * Analyze a static image and return face landmarks via callback.
 * Maintains the same signature as the old MediaPipe-based version.
 */
export async function analyzeImage(
  imageElement: HTMLImageElement,
  onResult: ResultCallback
): Promise<void> {
  if (!isInitialized()) {
    throw new FaceMeshError('MODEL_LOAD_FAILED', 'Human engine not initialized. Call init() first.')
  }

  console.log('[FaceMesh] Analyzing image...', imageElement.naturalWidth, 'x', imageElement.naturalHeight)

  const ANALYZE_TIMEOUT_MS = 4000

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error('[FaceMesh] analyzeImage timed out after', ANALYZE_TIMEOUT_MS, 'ms')
      onResult(null)
      resolve()
    }, ANALYZE_TIMEOUT_MS)

    detectFace(imageElement)
      .then((detection) => {
        clearTimeout(timer)
        if (!detection) {
          onResult(null)
        } else {
          console.log('[FaceMesh] Got', detection.landmarks.length, 'landmarks, confidence:', detection.confidence.toFixed(2))
          onResult(detection.landmarks)
        }
        resolve()
      })
      .catch((err) => {
        clearTimeout(timer)
        console.error('[FaceMesh] detect failed:', err)
        reject(err instanceof FaceMeshError ? err : new FaceMeshError('MODEL_LOAD_FAILED', String(err)))
      })
  })
}

/**
 * Analyze a video frame and return face landmarks via callback.
 * Used by FaceGuideCapture for real-time guidance.
 */
export async function analyzeVideoFrame(
  video: HTMLVideoElement,
  onResult: ResultCallback
): Promise<void> {
  if (!isInitialized()) return

  try {
    const detection = await detectFace(video)
    onResult(detection?.landmarks ?? null)
  } catch (err) {
    console.warn('[FaceMesh] Video frame analysis failed:', err)
    onResult(null)
  }
}

export function destroy(): void {
  destroyHuman()
}
