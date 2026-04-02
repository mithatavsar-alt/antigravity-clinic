export type AuditEvent =
  | 'form_started'
  | 'form_completed'
  | 'consent_granted'
  | 'consent_withdrawn'
  | 'photo_uploaded'
  | 'lead_viewed'
  | 'lead_status_changed'
  | 'media_opened'
  | 'doctor_note_added'
  | 'report_generated'

export function logAuditEvent(event: AuditEvent, payload: Record<string, unknown> = {}): void {
  // Client-side audit trail — logged to console, extensible to external service
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${event}`, { timestamp: new Date().toISOString(), ...payload })
  }
}
