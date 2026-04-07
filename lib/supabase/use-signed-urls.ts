'use client'

import { useEffect, useState } from 'react'
import { isStoragePath } from '@/lib/supabase/storage'

/**
 * Resolve storage paths to signed URLs via the server-side API.
 * Handles both legacy full URLs and new storage paths transparently.
 *
 * - If a value is a storage path → fetches signed URL
 * - If a value is already a full URL (legacy) or data URI → passes through
 * - If the API call fails → returns empty map (caller uses fallback UI)
 */
export function useSignedUrls(paths: string[]): Record<string, string> {
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})

  // Filter to only paths that need signing
  const storagePaths = paths.filter((p) => p && isStoragePath(p))
  const cacheKey = storagePaths.sort().join('|')

  useEffect(() => {
    if (storagePaths.length === 0) return

    let cancelled = false

    fetch('/api/storage/signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: storagePaths }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: { urls: Record<string, string> }) => {
        if (!cancelled && data.urls) {
          setUrlMap(data.urls)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error('[SignedURL] Fetch failed:', e)
        }
      })

    return () => { cancelled = true }
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return urlMap
}

/**
 * Resolve a single URL/path to a displayable src.
 * - Storage paths → look up in signed URL map
 * - Full URLs / data URIs → pass through
 * - null/undefined → return undefined
 */
export function resolvePhotoSrc(
  value: string | undefined,
  signedUrlMap: Record<string, string>,
): string | undefined {
  if (!value) return undefined
  if (!isStoragePath(value)) return value // Already a full URL or data URI
  return signedUrlMap[value] // Signed URL or undefined if not yet resolved
}
