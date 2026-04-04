export type AuditEvent =
  | 'form_started'
  | 'form_completed'
  | 'consent_granted'
  | 'consent_withdrawn'
  | 'photo_uploaded'
  | 'capture_completed'
  | 'capture_recapture_recommended'
  | 'analysis_completed'
  | 'lead_viewed'
  | 'lead_status_changed'
  | 'media_opened'
  | 'doctor_note_added'
  | 'report_generated'

export function logAuditEvent(event: AuditEvent, payload: Record<string, unknown> = {}): void {
  const entry = { event, timestamp: new Date().toISOString(), ...payload }

  if (typeof window !== 'undefined') {
    try {
      const key = 'ag-clinic:audit-events'
      const raw = window.sessionStorage.getItem(key)
      const events = raw ? JSON.parse(raw) as Array<Record<string, unknown>> : []
      events.push(entry)
      window.sessionStorage.setItem(key, JSON.stringify(events.slice(-200)))
    } catch {
      // Best-effort audit sink — never break UX
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${event}`, entry)
  }
}
