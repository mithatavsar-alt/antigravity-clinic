export type AuditEvent =
  | 'form_started'
  | 'form_completed'
  | 'consent_granted'
  | 'consent_withdrawn'
  | 'photo_uploaded'
  | 'capture_completed'
  | 'capture_recapture_recommended'
  | 'analysis_started'
  | 'analysis_completed'
  | 'canonical_payload_created'
  | 'lead_viewed'
  | 'lead_status_changed'
  | 'media_opened'
  | 'doctor_note_added'
  | 'report_generated'
  | 'liveness_completed'
  | 'liveness_incomplete'

/** Audit log schema version — bump when entry shape changes */
export const AUDIT_SCHEMA_VERSION = '2.0.0' as const

export interface AuditEntry {
  schema_version: typeof AUDIT_SCHEMA_VERSION
  event: AuditEvent
  timestamp: string
  /** Correlation ID linking to an analysis run (when applicable) */
  analysis_run_id?: string
  [key: string]: unknown
}

export function logAuditEvent(
  event: AuditEvent,
  payload: Record<string, unknown> = {},
): void {
  const entry: AuditEntry = {
    schema_version: AUDIT_SCHEMA_VERSION,
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }

  if (typeof window !== 'undefined') {
    try {
      const key = 'ag-clinic:audit-events'
      const raw = window.sessionStorage.getItem(key)
      const events = raw ? JSON.parse(raw) as AuditEntry[] : []
      events.push(entry)
      // Append-only within the session; cap at 200 to avoid quota pressure
      window.sessionStorage.setItem(key, JSON.stringify(events.slice(-200)))
    } catch {
      // Best-effort audit sink — never break UX
    }

    // ── Supabase: persist audit event (fire-and-forget) ──
    try {
      import('@/lib/supabase/client').then(({ createClient }) => {
        const sb = createClient()
        sb.from('audit_events').insert({
          event,
          patient_id: payload.patient_id ?? null,
          session_id: payload.session_id ?? null,
          payload: { ...payload, schema_version: AUDIT_SCHEMA_VERSION },
        }).then(() => {}, () => {})
      }).catch(() => {})
    } catch {
      // Supabase not available — sessionStorage is the fallback
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${event}`, entry)
  }
}

/** Retrieve all audit entries for the current session (read-only snapshot). */
export function getAuditLog(): AuditEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem('ag-clinic:audit-events')
    return raw ? JSON.parse(raw) as AuditEntry[] : []
  } catch {
    return []
  }
}
