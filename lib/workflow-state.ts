/**
 * Scan Workflow State Machine
 *
 * Explicit, guarded state transitions for the scan flow:
 *   capture → processing → result (→ recapture → capture)
 *
 * This replaces implicit boolean combinations with a single
 * discriminated union + transition guards. Each page checks
 * the workflow state before acting, and transitions are logged
 * for auditability.
 */

// ─── State Definitions ────────────────────────────────────

export type CaptureState =
  | 'idle'             // form not yet started
  | 'ready'            // camera + engine loaded, waiting for user
  | 'capturing'        // actively capturing frames
  | 'captured'         // capture complete, photos saved
  | 'failed'           // capture failed (camera denied, engine error)

export type AnalysisState =
  | 'pending'          // waiting for input (lead created but not analyzed)
  | 'processing'       // pipeline actively running
  | 'completed'        // analysis finished, results saved
  | 'failed'           // pipeline error
  | 'blocked'          // quality gate blocked analysis

export type ResultState =
  | 'unavailable'      // no analysis data exists
  | 'ready'            // full analysis available
  | 'limited'          // analysis ran but with degraded quality
  | 'recapture_recommended' // results exist but recapture is advised

export type RecaptureState =
  | 'none'             // no recapture needed
  | 'recommended'      // system recommends recapture
  | 'required'         // quality too low, recapture strongly advised
  | 'in_progress'      // user has started recapture flow

export interface ScanWorkflowState {
  /** Current phase of the overall flow */
  phase: 'idle' | 'capture' | 'processing' | 'result' | 'recapture'
  capture: CaptureState
  analysis: AnalysisState
  result: ResultState
  recapture: RecaptureState
  /** Lead ID being processed (null before lead creation) */
  leadId: string | null
  /** Analysis run ID (null before processing starts) */
  analysisRunId: string | null
  /** Monotonic counter to detect stale state across navigations */
  sequence: number
  /** ISO timestamp of last transition */
  lastTransitionAt: string | null
}

export const INITIAL_WORKFLOW_STATE: ScanWorkflowState = {
  phase: 'idle',
  capture: 'idle',
  analysis: 'pending',
  result: 'unavailable',
  recapture: 'none',
  leadId: null,
  analysisRunId: null,
  sequence: 0,
  lastTransitionAt: null,
}

// ─── Transition Definitions ───────────────────────────────

type TransitionName =
  | 'start_capture'
  | 'capture_ready'
  | 'begin_capturing'
  | 'capture_complete'
  | 'capture_failed'
  | 'start_processing'
  | 'processing_complete'
  | 'processing_blocked'
  | 'processing_failed'
  | 'result_ready'
  | 'result_limited'
  | 'recommend_recapture'
  | 'require_recapture'
  | 'start_recapture'
  | 'reset'

interface TransitionRule {
  /** Which phases this transition is valid from */
  fromPhases: ScanWorkflowState['phase'][]
  /** Apply the state changes */
  apply: (state: ScanWorkflowState, payload?: Record<string, unknown>) => ScanWorkflowState
}

const TRANSITIONS: Record<TransitionName, TransitionRule> = {
  start_capture: {
    fromPhases: ['idle', 'recapture'],
    apply: (s) => ({
      ...s,
      phase: 'capture',
      capture: 'idle',
      analysis: 'pending',
      result: s.phase === 'recapture' ? s.result : 'unavailable',
    }),
  },

  capture_ready: {
    fromPhases: ['capture'],
    apply: (s) => ({ ...s, capture: 'ready' }),
  },

  begin_capturing: {
    fromPhases: ['capture'],
    apply: (s) => ({ ...s, capture: 'capturing' }),
  },

  capture_complete: {
    fromPhases: ['capture'],
    apply: (s, p) => ({
      ...s,
      capture: 'captured',
      leadId: (p?.leadId as string) ?? s.leadId,
    }),
  },

  capture_failed: {
    fromPhases: ['capture'],
    apply: (s) => ({ ...s, capture: 'failed' }),
  },

  start_processing: {
    fromPhases: ['capture', 'processing'], // allow re-entry if retrying
    apply: (s, p) => ({
      ...s,
      phase: 'processing',
      analysis: 'processing',
      analysisRunId: (p?.analysisRunId as string) ?? s.analysisRunId,
    }),
  },

  processing_complete: {
    fromPhases: ['processing'],
    apply: (s) => ({ ...s, analysis: 'completed' }),
  },

  processing_blocked: {
    fromPhases: ['processing'],
    apply: (s) => ({ ...s, analysis: 'blocked' }),
  },

  processing_failed: {
    fromPhases: ['processing'],
    apply: (s) => ({ ...s, analysis: 'failed' }),
  },

  result_ready: {
    fromPhases: ['processing', 'result'],
    apply: (s) => ({ ...s, phase: 'result', result: 'ready' }),
  },

  result_limited: {
    fromPhases: ['processing', 'result'],
    apply: (s) => ({ ...s, phase: 'result', result: 'limited' }),
  },

  recommend_recapture: {
    fromPhases: ['processing', 'result'],
    apply: (s) => ({
      ...s,
      phase: 'result',
      result: 'recapture_recommended',
      recapture: 'recommended',
    }),
  },

  require_recapture: {
    fromPhases: ['processing', 'result'],
    apply: (s) => ({
      ...s,
      phase: 'result',
      result: 'recapture_recommended',
      recapture: 'required',
    }),
  },

  start_recapture: {
    fromPhases: ['result'],
    apply: (s) => ({
      ...s,
      phase: 'recapture',
      capture: 'idle',
      recapture: 'in_progress',
      analysisRunId: null,
    }),
  },

  reset: {
    fromPhases: ['idle', 'capture', 'processing', 'result', 'recapture'],
    apply: () => ({ ...INITIAL_WORKFLOW_STATE }),
  },
}

// ─── Transition Engine ────────────────────────────────────

export interface TransitionResult {
  ok: boolean
  state: ScanWorkflowState
  error?: string
}

/**
 * Attempt a guarded state transition.
 *
 * Returns the new state if valid, or the unchanged state + error if not.
 * Never throws — callers check `result.ok`.
 */
export function transition(
  current: ScanWorkflowState,
  name: TransitionName,
  payload?: Record<string, unknown>,
): TransitionResult {
  const rule = TRANSITIONS[name]
  if (!rule) {
    return { ok: false, state: current, error: `Unknown transition: ${name}` }
  }

  if (!rule.fromPhases.includes(current.phase)) {
    return {
      ok: false,
      state: current,
      error: `Transition '${name}' not allowed from phase '${current.phase}' (allowed: ${rule.fromPhases.join(', ')})`,
    }
  }

  const next = rule.apply(current, payload)
  next.sequence = current.sequence + 1
  next.lastTransitionAt = new Date().toISOString()

  return { ok: true, state: next }
}

// ─── Convenience Checks ───────────────────────────────────

/** Can processing safely start for this lead? */
export function canStartProcessing(state: ScanWorkflowState, leadId: string): boolean {
  if (state.analysis === 'processing') return false // already running
  if (state.leadId !== leadId) return false // wrong lead
  return state.capture === 'captured' || state.phase === 'processing'
}

/** Is the result page safe to render for this lead? */
export function isResultReady(state: ScanWorkflowState, leadId: string): boolean {
  if (state.leadId !== leadId) return false
  return state.analysis === 'completed' || state.analysis === 'blocked'
}

/** Should the result page show recapture CTA? */
export function shouldShowRecapture(state: ScanWorkflowState): boolean {
  return state.recapture === 'recommended' || state.recapture === 'required'
}

/** Derive the workflow state from a persisted lead (for page reloads) */
export function deriveWorkflowFromLead(lead: {
  id: string
  status: string
  analysis_source?: { provider: string } | null
  output_degraded?: boolean
  recapture_recommended?: boolean
  trust_pipeline?: { quality_gate_verdict: string } | null
}): ScanWorkflowState {
  const base: ScanWorkflowState = {
    ...INITIAL_WORKFLOW_STATE,
    leadId: lead.id,
  }

  const hasAnalysis = !!lead.analysis_source && lead.analysis_source.provider !== 'mock'
  const isBlocked = lead.trust_pipeline?.quality_gate_verdict === 'block'

  if (!hasAnalysis) {
    return {
      ...base,
      phase: 'processing',
      capture: 'captured',
      analysis: 'pending',
    }
  }

  // Analysis exists
  base.phase = 'result'
  base.capture = 'captured'
  base.analysis = isBlocked ? 'blocked' : 'completed'

  if (lead.recapture_recommended) {
    base.result = 'recapture_recommended'
    base.recapture = lead.output_degraded ? 'required' : 'recommended'
  } else if (lead.output_degraded) {
    base.result = 'limited'
  } else {
    base.result = 'ready'
  }

  return base
}
