import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  insertConsent,
  insertIntake,
  insertSession,
  type ConsentInsert,
  type IntakeInsert,
  type PatientInsert,
  type SessionInsert,
  updateSession,
  upsertPatient,
} from '@/lib/supabase/queries'
import { BUCKET, uploadCapturePhotos } from '@/lib/supabase/storage'

export const runtime = 'nodejs'

// ── Limits ──
const MAX_PHOTO_DATA_URL_LENGTH = 8_000_000    // 8 MB per photo
const MAX_REQUEST_BODY_LENGTH   = 25_000_000   // 25 MB total request body
const ALLOWED_VIEWS = ['front', 'left', 'right'] as const

// ── IP rate limiter (in-memory, per-instance) ──
const RATE_WINDOW_MS  = 60_000   // 1 minute
const RATE_MAX_HITS   = 6        // max requests per window per IP
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

// Prevent unbounded memory growth — prune stale entries periodically
let lastPrune = Date.now()
function pruneStaleEntries() {
  const now = Date.now()
  if (now - lastPrune < RATE_WINDOW_MS * 2) return
  lastPrune = now
  for (const [ip, entry] of ipHits) {
    if (now - entry.windowStart > RATE_WINDOW_MS) ipHits.delete(ip)
  }
}

type AllowedView = (typeof ALLOWED_VIEWS)[number]

interface PersistCaptureRequest {
  leadId?: string
  patient: PatientInsert
  intake: Omit<IntakeInsert, 'patient_id'>
  consent: Omit<ConsentInsert, 'patient_id'>
  session: Omit<SessionInsert, 'patient_id' | 'intake_id' | 'consent_id' | 'photo_urls'>
  photos?: Partial<Record<AllowedView, string>>
  rawLivenessConfidence?: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function sanitizePhotos(value: unknown): Partial<Record<AllowedView, string>> {
  if (!isRecord(value)) return {}

  const result: Partial<Record<AllowedView, string>> = {}
  for (const view of ALLOWED_VIEWS) {
    const maybeDataUrl = value[view]
    if (typeof maybeDataUrl !== 'string') continue
    if (!maybeDataUrl.startsWith('data:image/')) continue
    if (maybeDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
      throw new Error(`Photo payload too large for ${view}`)
    }
    result[view] = maybeDataUrl
  }
  return result
}

export async function POST(request: NextRequest) {
  // ── Guard 1: IP rate limiting ──
  pruneStaleEntries()
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
  if (isRateLimited(clientIp)) {
    console.warn('[AnalysisPersist] Rate limited:', clientIp)
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // ── Guard 2: Content-Length sanity check ──
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_REQUEST_BODY_LENGTH) {
    console.warn('[AnalysisPersist] Payload too large:', contentLength, 'bytes from', clientIp)
    return NextResponse.json(
      { error: 'Request payload too large' },
      { status: 413 },
    )
  }

  // ── Guard 3: Origin check (same-site only) ──
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) {
        console.warn('[AnalysisPersist] Origin mismatch:', origin, 'vs', host, 'from', clientIp)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 400 })
    }
  }

  try {
    const body = await request.json() as PersistCaptureRequest

    if (
      !isRecord(body)
      || !isRecord(body.patient)
      || !isRecord(body.intake)
      || !isRecord(body.consent)
      || !isRecord(body.session)
      || !isNonEmptyString(body.patient.full_name)
      || !isNonEmptyString(body.patient.phone)
      || !isNonEmptyString(body.intake.concern_area)
      || !isNonEmptyString(body.intake.desired_result_style)
      || !isNonEmptyString(body.intake.consultation_timing)
    ) {
      return NextResponse.json({ error: 'Invalid capture persistence payload' }, { status: 400 })
    }

    const photos = sanitizePhotos(body.photos)
    const sb = createAdminClient()
    const warnings: Array<{ step: string; message: string }> = []

    console.log('[AnalysisPersist] Request received:', {
      leadId: body.leadId ?? null,
      consentGiven: body.consent?.consent_given ?? null,
      hasConsentTimestamp: Boolean(body.consent?.consent_timestamp),
      rawLivenessConfidence: body.rawLivenessConfidence ?? null,
      normalizedLivenessConfidence: body.session?.liveness_confidence ?? null,
      patientKeys: Object.keys(body.patient ?? {}),
      intakeKeys: Object.keys(body.intake ?? {}),
      sessionKeys: Object.keys(body.session ?? {}),
      photoViews: Object.keys(photos),
    })

    const { id: patientId, error: patientError } = await upsertPatient(sb, body.patient)
    if (patientError || !patientId) {
      console.error('[AnalysisPersist] Patient upsert failed:', patientError?.message ?? 'missing patient id')
      return NextResponse.json({ error: 'Failed to persist patient' }, { status: 500 })
    }

    const intakePayload: IntakeInsert = {
      patient_id: patientId,
      concern_area: body.intake.concern_area,
      concern_sub_areas: body.intake.concern_sub_areas,
      desired_result_style: body.intake.desired_result_style,
      prior_treatment: body.intake.prior_treatment ?? false,
      consultation_timing: body.intake.consultation_timing,
      expectation_note: body.intake.expectation_note,
    }
    const { id: intakeId, error: intakeError } = await insertIntake(sb, intakePayload)
    if (intakeError) {
      warnings.push({ step: 'intake', message: intakeError.message })
      console.error('[AnalysisPersist] Intake insert failed:', intakeError.message)
    }

    const consentPayload: ConsentInsert = {
      patient_id: patientId,
      consent_given: Boolean(body.consent.consent_given),
      consent_text_version: body.consent.consent_text_version,
      consent_timestamp: body.consent.consent_timestamp,
      ip_address: body.consent.ip_address,
      user_agent: body.consent.user_agent,
    }
    console.log('[AnalysisPersist] Consent insert diagnostics:', {
      patientId,
      consentGiven: consentPayload.consent_given,
      hasConsentTimestamp: Boolean(consentPayload.consent_timestamp),
      payloadKeys: Object.keys(consentPayload).filter((key) => consentPayload[key as keyof ConsentInsert] != null),
    })
    const { id: consentId, error: consentError } = await insertConsent(sb, consentPayload)
    if (consentError) {
      warnings.push({ step: 'consent', message: consentError.message })
      console.error('[AnalysisPersist] Consent insert failed:', consentError.message)
    }

    const sessionPayload: SessionInsert = {
      patient_id: patientId,
      intake_id: intakeId,
      consent_id: consentId,
      status: body.session.status ?? 'consented',
      capture_confidence: body.session.capture_confidence,
      capture_quality_score: body.session.capture_quality_score,
      capture_manifest: body.session.capture_manifest,
      liveness_status: body.session.liveness_status,
      liveness_passed: body.session.liveness_passed,
      liveness_confidence: body.session.liveness_confidence,
    }

    console.log('[AnalysisPersist] Session insert diagnostics:', {
      patientId,
      intakeId: intakeId ?? null,
      consentId: consentId ?? null,
      rawLivenessConfidence: body.rawLivenessConfidence ?? null,
      normalizedLivenessConfidence: sessionPayload.liveness_confidence ?? null,
      payloadKeys: Object.keys(sessionPayload).filter((key) => sessionPayload[key as keyof SessionInsert] != null),
    })

    const { id: sessionId, error: sessionError } = await insertSession(sb, sessionPayload)
    if (sessionError || !sessionId) {
      console.error('[AnalysisPersist] Session insert failed:', sessionError?.message ?? 'missing session id')
      return NextResponse.json({ error: 'Failed to create analysis session' }, { status: 500 })
    }

    let photoPaths: Record<string, string> = {}
    if (Object.keys(photos).length > 0) {
      console.log('[AnalysisPersist] Upload diagnostics:', {
        patientId,
        sessionId,
        bucket: BUCKET,
        photoViews: Object.keys(photos),
        sizes: Object.fromEntries(
          Object.entries(photos).map(([view, dataUrl]) => [view, `${Math.round(dataUrl.length / 1024)}KB`]),
        ),
      })

      photoPaths = await uploadCapturePhotos(sb, patientId, sessionId, photos)

      if (Object.keys(photoPaths).length > 0) {
        const { error: updateError } = await updateSession(sb, sessionId, { photo_urls: photoPaths })
        if (updateError) {
          warnings.push({ step: 'session.photo_urls', message: updateError.message })
          console.error('[AnalysisPersist] Session photo_urls update failed:', updateError.message)
        }
      } else {
        warnings.push({ step: 'upload', message: 'No photo paths were returned from storage upload' })
        console.warn('[AnalysisPersist] Upload completed without persisted photo paths')
      }
    } else {
      console.warn('[AnalysisPersist] No eligible photo payloads provided for upload')
    }

    return NextResponse.json({
      ok: true,
      patientId,
      intakeId: intakeId ?? null,
      consentId: consentId ?? null,
      sessionId,
      photoPaths,
      warnings,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[AnalysisPersist] Unexpected failure:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
