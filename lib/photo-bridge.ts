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

/** Save a photo for a lead ID. Call before hard navigation. */
export function savePhoto(leadId: string, dataUrl: string): void {
  try {
    // Clear any previous photo first
    clearAllPhotos()
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

/** Remove the photo for a lead ID. */
export function removePhoto(leadId: string): void {
  try {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${leadId}`)
  } catch { /* ignore */ }
}

/** Clear all bridge photos (cleanup). */
function clearAllPhotos(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(SESSION_KEY_PREFIX) || key?.startsWith(VIEW_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
