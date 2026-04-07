import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateSession, upsertResult, type SessionUpdate, type ResultInsert } from '@/lib/supabase/queries'

export const runtime = 'nodejs'

// ── Rate limiter (same pattern as /api/analysis/persist) ──
const RATE_WINDOW_MS = 60_000
const RATE_MAX_HITS = 6
const ipHits = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipHits.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > RATE_MAX_HITS
}

let lastPrune = Date.now()
function pruneStaleEntries() {
  const now = Date.now()
  if (now - lastPrune < RATE_WINDOW_MS * 2) return
  lastPrune = now
  for (const [ip, entry] of ipHits) {
    if (now - entry.windowStart > RATE_WINDOW_MS) ipHits.delete(ip)
  }
}

/**
 * POST /api/analysis/save-results
 *
 * Persists analysis results (session update + result upsert) using
 * the service-role client so RLS does not block unauthenticated patients.
 *
 * Security:
 * - Origin check (same-site only)
 * - IP rate limiting (6 req/min)
 * - Session existence validation (prevents writes to nonexistent sessions)
 * - No authentication required (patients are not logged in)
 */
export async function POST(request: NextRequest) {
  // ── Rate limit ──
  pruneStaleEntries()
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
  if (isRateLimited(clientIp)) {
    console.warn('[SaveResults] Rate limited:', clientIp)
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // ── Origin check ──
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        console.warn('[SaveResults] Origin mismatch:', origin, 'vs', host)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 400 })
    }
  }

  try {
    const body = await request.json()

    const sessionId = body.sessionId as string | undefined
    const sessionUpdate = body.sessionUpdate as SessionUpdate | undefined
    const resultData = body.resultData as ResultInsert | undefined

    if (!sessionId || typeof sessionId !== 'string') {
      console.warn('[SaveResults] Missing or invalid sessionId')
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // UUID format check (Supabase uses UUIDs)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      console.warn('[SaveResults] Invalid sessionId format:', sessionId)
      return NextResponse.json({ error: 'Invalid sessionId format' }, { status: 400 })
    }

    const sb = createAdminClient()

    // ── Verify session exists ──
    const { data: session, error: lookupError } = await sb
      .from('analysis_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()

    if (lookupError) {
      console.error('[SaveResults] Session lookup failed:', lookupError.message, '| sessionId:', sessionId)
      return NextResponse.json({ error: 'Session lookup failed' }, { status: 500 })
    }

    if (!session) {
      console.warn('[SaveResults] Session not found:', sessionId, '| ip:', clientIp)
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const warnings: string[] = []

    // ── Update session metadata ──
    if (sessionUpdate && typeof sessionUpdate === 'object') {
      const { error } = await updateSession(sb, sessionId, sessionUpdate)
      if (error) {
        console.error('[SaveResults] updateSession failed:', error.message, '| sessionId:', sessionId)
        warnings.push(`session: ${error.message}`)
      } else {
        console.log('[SaveResults] Session updated:', sessionId, '| status:', sessionUpdate.status ?? 'unchanged')
      }
    }

    // ── Upsert analysis result ──
    if (resultData && typeof resultData === 'object') {
      const { error } = await upsertResult(sb, { ...resultData, session_id: sessionId })
      if (error) {
        console.error('[SaveResults] upsertResult failed:', error.message, '| sessionId:', sessionId)
        warnings.push(`result: ${error.message}`)
      } else {
        console.log('[SaveResults] Result persisted for session:', sessionId)
      }
    }

    if (warnings.length > 0) {
      console.warn('[SaveResults] Completed with warnings:', warnings, '| sessionId:', sessionId)
    }

    return NextResponse.json({ ok: true, warnings })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[SaveResults] Unexpected failure:', message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
