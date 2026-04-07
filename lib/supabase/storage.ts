/**
 * Supabase Storage helpers for patient media uploads.
 *
 * Bucket: patient-media (PRIVATE)
 * Structure: {patientId}/{sessionId}/{view}.jpg
 *
 * Upload returns the storage path (not a URL).
 * Reads use signed URLs generated server-side.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET = 'patient-media'

/** Default signed URL expiry: 1 hour */
export const SIGNED_URL_EXPIRY_SECONDS = 3600

/** Minimum decoded file size for a valid camera photo (1 KB) */
const MIN_PHOTO_BYTES = 1024

/**
 * Upload a base64 data URI to Supabase Storage.
 * Returns the storage path on success, null on error.
 */
export async function uploadPhoto(
  sb: SupabaseClient,
  patientId: string,
  sessionId: string,
  view: string,
  dataUrl: string,
): Promise<string | null> {
  try {
    // Validate dataUrl is a proper data URI
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      console.error('[Storage] Invalid dataUrl for', view, '— not a data URI. Length:', dataUrl?.length ?? 0, 'starts with:', dataUrl?.slice(0, 30))
      return null
    }

    const commaIdx = dataUrl.indexOf(',')
    if (commaIdx === -1 || commaIdx >= dataUrl.length - 1) {
      console.error('[Storage] No base64 payload after comma for', view, '| commaIdx:', commaIdx, '| total length:', dataUrl.length)
      return null
    }

    const header = dataUrl.slice(0, commaIdx)
    const base64 = dataUrl.slice(commaIdx + 1)

    const mimeMatch = header.match(/data:([^;]+)/)
    const mime = mimeMatch?.[1] ?? 'image/jpeg'
    const ext = mime === 'image/png' ? 'png' : 'jpg'

    // Decode base64 → Buffer (Node.js native, avoids Blob serialization issues)
    const buffer = Buffer.from(base64, 'base64')

    console.log(`[Storage] Decoded: view=${view} mime=${mime} base64Len=${base64.length} decodedBytes=${buffer.length}`)

    if (buffer.length < MIN_PHOTO_BYTES) {
      console.error(`[Storage] REJECTED ${view}: decoded size ${buffer.length} bytes is below ${MIN_PHOTO_BYTES} minimum — not a real photo`)
      return null
    }

    const path = `${patientId}/${sessionId}/${view}.${ext}`

    console.log(`[Storage] Uploading: bucket=${BUCKET} path=${path} mime=${mime} size=${buffer.length} bytes`)

    const { data, error } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mime,
        upsert: true,
      })

    if (error) {
      console.error('[Storage] Upload FAILED:', view, '| error:', error.message, '| statusCode:', (error as unknown as Record<string, unknown>).statusCode)
      return null
    }

    console.log('[Storage] Upload OK:', view, '| path:', data?.path ?? path, '| bytes:', buffer.length)
    return path
  } catch (e) {
    console.error('[Storage] Upload exception:', view, e)
    return null
  }
}

/**
 * Upload all captured view photos (front, left, right) to storage.
 * Returns a map of view → storage path.
 */
export async function uploadCapturePhotos(
  sb: SupabaseClient,
  patientId: string,
  sessionId: string,
  photos: { front?: string; left?: string; right?: string },
): Promise<Record<string, string>> {
  const paths: Record<string, string> = {}

  const entries = Object.entries(photos)
  const eligible = entries.filter(([, dataUrl]) => dataUrl && dataUrl.startsWith('data:'))
  const skipped = entries.filter(([, dataUrl]) => !dataUrl || !dataUrl.startsWith('data:'))

  if (skipped.length > 0) {
    console.warn('[Storage] Skipped non-data-URI entries:', skipped.map(([v, d]) => `${v}=${d?.slice(0, 30) ?? 'null'}`))
  }
  console.log(`[Storage] Eligible uploads: ${eligible.length}/${entries.length} views`)

  const uploads = eligible.map(async ([view, dataUrl]) => {
    const path = await uploadPhoto(sb, patientId, sessionId, view, dataUrl!)
    if (path) paths[view] = path
  })

  await Promise.all(uploads)
  return paths
}

/**
 * Generate signed URLs for storage paths.
 * Must be called with a client that has sufficient permissions (service role or authenticated).
 */
export async function createSignedUrls(
  sb: SupabaseClient,
  paths: string[],
  expiresIn: number = SIGNED_URL_EXPIRY_SECONDS,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}

  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn)

  if (error || !data) {
    console.error('[Storage] Signed URL generation failed:', error?.message)
    return {}
  }

  const result: Record<string, string> = {}
  for (const item of data) {
    if (item.signedUrl && !item.error) {
      result[item.path!] = item.signedUrl
    }
  }
  return result
}

/**
 * Check if a string looks like a storage path (not a full URL).
 * Storage paths don't start with http.
 */
export function isStoragePath(value: string): boolean {
  return !value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('data:')
}
