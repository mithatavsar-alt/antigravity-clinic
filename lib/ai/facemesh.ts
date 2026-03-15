import { FaceMeshError } from './types'
import type { Landmark } from './types'

type ResultCallback = (landmarks: Landmark[] | null) => void

interface FaceMeshInstance {
  setOptions(options: {
    maxNumFaces: number
    refineLandmarks: boolean
    minDetectionConfidence: number
    minTrackingConfidence: number
  }): void
  onResults(callback: (results: { multiFaceLandmarks?: Landmark[][] }) => void): void
  send(input: { image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement }): Promise<void>
  close(): void
}

let faceMeshInstance: FaceMeshInstance | null = null
let initPromise: Promise<void> | null = null
let pendingResolve: (() => void) | null = null
let pendingReject: ((err: unknown) => void) | null = null
let pendingCallback: ResultCallback | null = null

function handleResults(results: { multiFaceLandmarks?: Landmark[][] }) {
  const cb = pendingCallback
  const resolve = pendingResolve
  const reject = pendingReject
  pendingCallback = null
  pendingResolve = null
  pendingReject = null

  try {
    const landmarks = results.multiFaceLandmarks?.[0] ?? null
    if (!landmarks || landmarks.length === 0) {
      cb?.(null)
    } else {
      cb?.(landmarks)
    }
    resolve?.()
  } catch (err) {
    reject?.(err)
  }
}

export async function init(): Promise<void> {
  if (faceMeshInstance) return
  if (initPromise) return initPromise

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new FaceMeshError('INIT_TIMEOUT', 'MediaPipe FaceMesh did not initialize within 8 seconds')),
      8000
    )
  )

  const loadPromise = (async () => {
    const mod = await import('@mediapipe/face_mesh')
    // @mediapipe/face_mesh exports FaceMesh as a named export
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FaceMeshClass = (mod as any).FaceMesh
    const instance: FaceMeshInstance = new FaceMeshClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    })
    instance.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    // Register onResults once — routes to current pending callback
    instance.onResults(handleResults)
    faceMeshInstance = instance
  })()

  initPromise = Promise.race([loadPromise, timeoutPromise])
  try {
    await initPromise
  } catch (err) {
    initPromise = null
    faceMeshInstance = null
    throw err
  }
}

export async function analyzeImage(
  imageElement: HTMLImageElement,
  onResult: ResultCallback
): Promise<void> {
  if (!faceMeshInstance) {
    throw new FaceMeshError('MODEL_LOAD_FAILED', 'FaceMesh not initialized. Call init() first.')
  }

  return new Promise((resolve, reject) => {
    pendingCallback = onResult
    pendingResolve = resolve
    pendingReject = reject

    faceMeshInstance!.send({ image: imageElement }).catch((err: unknown) => {
      pendingCallback = null
      pendingResolve = null
      pendingReject = null
      reject(err instanceof FaceMeshError ? err : new FaceMeshError('MODEL_LOAD_FAILED', String(err)))
    })
  })
}

export function destroy(): void {
  faceMeshInstance?.close()
  faceMeshInstance = null
  initPromise = null
  pendingCallback = null
  pendingResolve = null
  pendingReject = null
}
