import type { CaptureManifest, CaptureViewKey } from '@/types/capture'

/**
 * Photo Bridge — preserves patient photos across hard navigations.
 *
 * Problem: Photos are captured as data: URIs (1-5MB). Zustand's localStorage
 * persist strips them to avoid exceeding the 5MB quota. Hard navigation
 * (window.location.replace) kills in-memory state, so the result page
 * loses the photo.
 *
 * Solution: Use sessionStorage as a temporary bridge. It's per-tab,
 * survives hard navigation, and is automatically cleaned up when the tab closes.
 * We only store one photo at a time (keyed by lead ID), so quota is not an issue.
 */

const SESSION_KEY_PREFIX = 'ag-photo-bridge:'
const VIEW_KEY_PREFIX = 'ag-photo-view:'
const FRAMES_KEY_PREFIX = 'ag-photo-frames:'
const VIEW_FRAMES_KEY_PREFIX = 'ag-photo-view-frames:'

/** Save a photo for a lead ID. Call before hard navigation. */
export function savePhoto(leadId: string, dataUrl: string): void {
  try {
    clearPrimaryPhotos()
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${leadId}`, dataUrl)
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save photo to sessionStorage:', e)
  }
}

/** Save all 3 view photos (front, left, right) for a lead ID. */
export function saveViewPhotos(leadId: string, photos: string[]): void {
  try {
    const views = ['front', 'left', 'right'] as const
    for (let i = 0; i < Math.min(photos.length, 3); i++) {
      if (photos[i]) {
        sessionStorage.setItem(`${VIEW_KEY_PREFIX}${leadId}:${views[i]}`, photos[i])
      }
    }
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save view photos to sessionStorage:', e)
  }
}

/** Retrieve a photo for a lead ID. Returns null if not found. */
export function getPhoto(leadId: string): string | null {
  try {
    return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${leadId}`)
  } catch {
    return null
  }
}

/** Retrieve all 3 view photos for a lead ID. Returns [front, left, right] or nulls. */
export function getViewPhotos(leadId: string): [string | null, string | null, string | null] {
  try {
    return [
      sessionStorage.getItem(`${VIEW_KEY_PREFIX}${leadId}:front`),
      sessionStorage.getItem(`${VIEW_KEY_PREFIX}${leadId}:left`),
      sessionStorage.getItem(`${VIEW_KEY_PREFIX}${leadId}:right`),
    ]
  } catch {
    return [null, null, null]
  }
}

/** Save multi-frame capture data URLs for a lead ID. */
export function saveCapturedFrames(leadId: string, frames: string[]): void {
  try {
    for (let i = 0; i < frames.length; i++) {
      sessionStorage.setItem(`${FRAMES_KEY_PREFIX}${leadId}:${i}`, frames[i])
    }
    sessionStorage.setItem(`${FRAMES_KEY_PREFIX}${leadId}:count`, String(frames.length))
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save captured frames to sessionStorage:', e)
  }
}

/** Retrieve multi-frame capture data URLs for a lead ID. */
export function getCapturedFrames(leadId: string): string[] {
  try {
    const countStr = sessionStorage.getItem(`${FRAMES_KEY_PREFIX}${leadId}:count`)
    if (!countStr) return []
    const count = parseInt(countStr, 10)
    const frames: string[] = []
    for (let i = 0; i < count; i++) {
      const frame = sessionStorage.getItem(`${FRAMES_KEY_PREFIX}${leadId}:${i}`)
      if (frame) frames.push(frame)
    }
    return frames
  } catch {
    return []
  }
}

/** Save accepted frame sets per view for temporal aggregation. */
export function saveCapturedFramesByView(
  leadId: string,
  framesByView: Partial<Record<CaptureViewKey, string[]>>,
): void {
  try {
    const views: CaptureViewKey[] = ['front', 'left', 'right']
    for (const view of views) {
      const frames = framesByView[view] ?? []
      sessionStorage.setItem(`${VIEW_FRAMES_KEY_PREFIX}${leadId}:${view}:count`, String(frames.length))
      for (let i = 0; i < frames.length; i++) {
        sessionStorage.setItem(`${VIEW_FRAMES_KEY_PREFIX}${leadId}:${view}:${i}`, frames[i])
      }
    }
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save per-view captured frames:', e)
  }
}

/** Retrieve accepted frame sets per view. */
export function getCapturedFramesByView(
  leadId: string,
): Partial<Record<CaptureViewKey, string[]>> {
  const result: Partial<Record<CaptureViewKey, string[]>> = {}
  try {
    const views: CaptureViewKey[] = ['front', 'left', 'right']
    for (const view of views) {
      const countStr = sessionStorage.getItem(`${VIEW_FRAMES_KEY_PREFIX}${leadId}:${view}:count`)
      if (!countStr) continue
      const count = parseInt(countStr, 10)
      if (!Number.isFinite(count) || count <= 0) continue
      const frames: string[] = []
      for (let i = 0; i < count; i++) {
        const frame = sessionStorage.getItem(`${VIEW_FRAMES_KEY_PREFIX}${leadId}:${view}:${i}`)
        if (frame) frames.push(frame)
      }
      if (frames.length > 0) result[view] = frames
    }
  } catch {
    return {}
  }
  return result
}

/** Remove the photo for a lead ID. */
export function removePhoto(leadId: string): void {
  try {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${leadId}`)
  } catch { /* ignore */ }
}

// ─── Capture Manifest ─────────────────────────────────────
// Structured metadata about the capture session, preserved
// alongside photo data to inform downstream quality assessment.

const MANIFEST_KEY_PREFIX = 'ag-capture-manifest:'

/** Save a structured capture manifest for a lead. */
export function saveCaptureManifest(leadId: string, manifest: CaptureManifest): void {
  try {
    sessionStorage.setItem(`${MANIFEST_KEY_PREFIX}${leadId}`, JSON.stringify(manifest))
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save capture manifest:', e)
  }
}

/** Retrieve the capture manifest for a lead. */
export function getCaptureManifest(leadId: string): CaptureManifest | null {
  try {
    const raw = sessionStorage.getItem(`${MANIFEST_KEY_PREFIX}${leadId}`)
    return raw ? JSON.parse(raw) as CaptureManifest : null
  } catch {
    return null
  }
}

/** Clear all bridge photos (cleanup). */
function clearPrimaryPhotos(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(SESSION_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
