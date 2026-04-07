import type { CaptureManifest, CaptureViewKey } from '@/types/capture'

/**
 * Photo Bridge: preserves patient photos across hard navigations.
 *
 * Problem: Photos are captured as data URIs. Zustand persist strips them to avoid
 * localStorage quota pressure, but hard navigation would otherwise lose them.
 *
 * Solution: Use sessionStorage as a temporary, per-tab bridge and keep large
 * frame arrays in memory only.
 */

const SESSION_KEY_PREFIX = 'ag-photo-bridge:'
const VIEW_KEY_PREFIX = 'ag-photo-view:'
const FRAMES_KEY_PREFIX = 'ag-photo-frames:'
const VIEW_FRAMES_KEY_PREFIX = 'ag-photo-view-frames:'
const MANIFEST_KEY_PREFIX = 'ag-capture-manifest:'

export function savePhoto(leadId: string, dataUrl: string): void {
  try {
    clearPrimaryPhotos()
    console.log('[PhotoBridge] savePhoto ->', `${SESSION_KEY_PREFIX}${leadId}`, `(${Math.round(dataUrl.length / 1024)}KB)`)
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${leadId}`, dataUrl)
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save photo to sessionStorage:', e)
  }
}

export function saveViewPhotos(leadId: string, photos: string[]): void {
  clearViewPhotos()
  const views = ['front', 'left', 'right'] as const
  console.log(
    '[PhotoBridge] saveViewPhotos keys:',
    views.slice(0, Math.min(photos.length, 3)).map((view) => `${VIEW_KEY_PREFIX}${leadId}:${view}`),
  )

  for (let i = 0; i < Math.min(photos.length, 3); i++) {
    if (!photos[i]) continue

    try {
      console.log('[PhotoBridge] saveViewPhotos ->', `${VIEW_KEY_PREFIX}${leadId}:${views[i]}`, `(${Math.round(photos[i].length / 1024)}KB)`)
      sessionStorage.setItem(`${VIEW_KEY_PREFIX}${leadId}:${views[i]}`, photos[i])
    } catch (e) {
      console.warn(`[PhotoBridge] Quota exceeded saving ${views[i]} view; flow continues without blocking`, e)
    }
  }
}

export function getPhoto(leadId: string): string | null {
  try {
    return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${leadId}`)
  } catch {
    return null
  }
}

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

export function saveCapturedFrames(_leadId: string, _frames: string[]): void {
  if (_frames.length > 0) {
    console.info('[PhotoBridge] saveCapturedFrames skipped: frame arrays stay in memory only to avoid quota pressure')
  }
}

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

export function saveCapturedFramesByView(
  _leadId: string,
  _framesByView: Partial<Record<CaptureViewKey, string[]>>,
): void {
  if (Object.values(_framesByView).some((frames) => (frames?.length ?? 0) > 0)) {
    console.info('[PhotoBridge] saveCapturedFramesByView skipped: per-view frame arrays stay in memory only to avoid quota pressure')
  }
}

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

export function removePhoto(leadId: string): void {
  try {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${leadId}`)
  } catch {
    // ignore
  }
}

export function saveCaptureManifest(leadId: string, manifest: CaptureManifest): void {
  try {
    console.log('[PhotoBridge] saveCaptureManifest ->', `${MANIFEST_KEY_PREFIX}${leadId}`)
    sessionStorage.setItem(`${MANIFEST_KEY_PREFIX}${leadId}`, JSON.stringify(manifest))
  } catch (e) {
    console.warn('[PhotoBridge] Failed to save capture manifest:', e)
  }
}

export function getCaptureManifest(leadId: string): CaptureManifest | null {
  try {
    const raw = sessionStorage.getItem(`${MANIFEST_KEY_PREFIX}${leadId}`)
    return raw ? JSON.parse(raw) as CaptureManifest : null
  } catch {
    return null
  }
}

export interface BridgeIntegrityResult {
  valid: boolean
  hasPhoto: boolean
  hasManifest: boolean
  hasViewPhotos: boolean
  manifestMatchesPhotos: boolean
  issues: string[]
}

export function validateBridgeIntegrity(leadId: string): BridgeIntegrityResult {
  const issues: string[] = []

  const photo = getPhoto(leadId)
  const hasPhoto = !!photo
  if (!hasPhoto) issues.push('missing_primary_photo')

  const manifest = getCaptureManifest(leadId)
  const hasManifest = !!manifest
  if (!hasManifest) issues.push('missing_capture_manifest')

  const [front, left, right] = getViewPhotos(leadId)
  const hasViewPhotos = !!front || !!left || !!right

  let manifestMatchesPhotos = true
  if (manifest?.mode === 'multi') {
    const capturedViews = manifest.views.filter((view) => view.captured).map((view) => view.view)
    if (capturedViews.includes('left') && !left) {
      issues.push('manifest_claims_left_but_missing')
      manifestMatchesPhotos = false
    }
    if (capturedViews.includes('right') && !right) {
      issues.push('manifest_claims_right_but_missing')
      manifestMatchesPhotos = false
    }
    if (capturedViews.includes('front') && !front && !photo) {
      issues.push('manifest_claims_front_but_missing')
      manifestMatchesPhotos = false
    }
  }

  return {
    valid: hasPhoto && issues.length === 0,
    hasPhoto,
    hasManifest,
    hasViewPhotos,
    manifestMatchesPhotos,
    issues,
  }
}

export function clearBridgeForLead(leadId: string): void {
  try {
    const prefixes = [SESSION_KEY_PREFIX, VIEW_KEY_PREFIX, FRAMES_KEY_PREFIX, VIEW_FRAMES_KEY_PREFIX, MANIFEST_KEY_PREFIX]
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && prefixes.some((prefix) => key.startsWith(prefix) && key.includes(leadId))) {
        keys.push(key)
      }
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // ignore
  }
}

function clearPrimaryPhotos(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(SESSION_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // ignore
  }
}

function clearViewPhotos(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(VIEW_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // ignore
  }
}
