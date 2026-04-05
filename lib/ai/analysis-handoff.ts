/**
 * Analysis Handoff Layer
 *
 * Thin client for submitting canonical analysis payloads to a future
 * backend analysis service. Currently a no-op stub that validates the
 * payload shape and returns immediately — the actual backend endpoint
 * does not exist yet.
 *
 * When a backend service becomes available, only this file needs to
 * change. The rest of the pipeline (capture → canonical payload → result)
 * stays the same.
 *
 * IMPORTANT: This layer does NOT claim server authority. The canonical
 * payload's `analysis_authority` field is set to 'client-local' by the
 * builder. Only a real backend should set 'server-authoritative'.
 */

import type { CanonicalAnalysisPayload } from '@/types/analysis'

export interface HandoffResult {
  /** Whether the payload was accepted */
  accepted: boolean
  /** Where the analysis was processed */
  authority: 'client-local' | 'server-authoritative'
  /** The analysis_run_id echoed back for correlation */
  analysis_run_id: string
  /** If rejected, the reason */
  rejection_reason?: string
}

/**
 * Submit a canonical analysis payload for backend processing.
 *
 * Current implementation: validates payload shape and returns immediately
 * with `authority: 'client-local'`. This is a preparation point — when
 * a backend analysis endpoint exists, this function will POST the payload
 * and return the server's response.
 *
 * Callers should check `result.authority` to know whether the analysis
 * was processed locally or by an authoritative backend.
 */
export async function submitCanonicalPayload(
  payload: CanonicalAnalysisPayload,
): Promise<HandoffResult> {
  // ── Structural validation ──
  if (!payload.analysis_run_id || !payload.lead_id) {
    return {
      accepted: false,
      authority: 'client-local',
      analysis_run_id: payload.analysis_run_id ?? '',
      rejection_reason: 'Missing required identifiers (analysis_run_id or lead_id)',
    }
  }

  if (!payload.payload_schema_version) {
    return {
      accepted: false,
      authority: 'client-local',
      analysis_run_id: payload.analysis_run_id,
      rejection_reason: 'Missing payload_schema_version — payload may be from an older client',
    }
  }

  // ── Backend endpoint placeholder ──
  // When a backend becomes available, replace the block below with:
  //
  //   const endpoint = process.env.NEXT_PUBLIC_ANALYSIS_API_URL
  //   if (endpoint) {
  //     const res = await fetch(`${endpoint}/v1/analyze`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(payload),
  //     })
  //     const data = await res.json()
  //     return {
  //       accepted: data.accepted,
  //       authority: 'server-authoritative',
  //       analysis_run_id: payload.analysis_run_id,
  //       rejection_reason: data.rejection_reason,
  //     }
  //   }

  // No backend available — accept locally
  return {
    accepted: true,
    authority: 'client-local',
    analysis_run_id: payload.analysis_run_id,
  }
}
