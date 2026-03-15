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
  // MVP: console.log — production'da API'ye gönderilecek
  console.log(`[AUDIT] ${event}`, { timestamp: new Date().toISOString(), ...payload })
}
