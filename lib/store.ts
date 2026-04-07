'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lead, LeadStatus, DoctorAnalysis, PatientSummary, ConsultationReadiness } from '@/types/lead'
import {
  type ScanWorkflowState,
  type TransitionResult,
  INITIAL_WORKFLOW_STATE,
  transition,
} from '@/lib/workflow-state'
const initialLeads: Lead[] = []
import { calculateReadiness } from '@/lib/readiness'

interface LeadAnalysisUpdate {
  doctor_analysis?: DoctorAnalysis
  patient_summary?: PatientSummary
  consultation_readiness?: ConsultationReadiness
  ai_scores?: Lead['ai_scores']
  skin_scores?: Lead['skin_scores']
  estimated_age?: Lead['estimated_age']
  estimated_gender?: Lead['estimated_gender']
  estimated_gender_confidence?: Lead['estimated_gender_confidence']
  wrinkle_scores?: Lead['wrinkle_scores']
  focus_areas?: Lead['focus_areas']
  suggested_zones?: Lead['suggested_zones']
  analysis_confidence?: Lead['analysis_confidence']
  capture_confidence?: Lead['capture_confidence']
  quality_score?: Lead['quality_score']
  age_estimation?: Lead['age_estimation']
  radar_analysis?: Lead['radar_analysis']
  analysis_source?: Lead['analysis_source']
  trust_pipeline?: Lead['trust_pipeline']
  lip_analysis?: Lead['lip_analysis']
  specialist_analysis?: Lead['specialist_analysis']
  multi_view_analysis?: Lead['multi_view_analysis']
  capture_manifest?: Lead['capture_manifest']
  capture_quality_score?: Lead['capture_quality_score']
  analysis_input_quality_score?: Lead['analysis_input_quality_score']
  report_confidence?: Lead['report_confidence']
  recapture_recommended?: Lead['recapture_recommended']
  recapture_views?: Lead['recapture_views']
  recapture_reason?: Lead['recapture_reason']
  liveness_status?: Lead['liveness_status']
  liveness_confidence?: Lead['liveness_confidence']
  liveness_required?: Lead['liveness_required']
  liveness_passed?: Lead['liveness_passed']
  liveness_signals?: Lead['liveness_signals']
  overall_reliability_band?: Lead['overall_reliability_band']
  evidence_coverage_score?: Lead['evidence_coverage_score']
  suppression_count?: Lead['suppression_count']
  limited_regions_count?: Lead['limited_regions_count']
  canonical_analysis?: Lead['canonical_analysis']
  output_degraded?: Lead['output_degraded']
  status?: LeadStatus
}

interface ClinicStore {
  currentLead: Partial<Lead> | null
  setCurrentLead: (lead: Partial<Lead>) => void
  clearCurrentLead: () => void

  formStep: 1 | 2 | 3
  setFormStep: (step: 1 | 2 | 3) => void

  leads: Lead[]
  addLead: (lead: Omit<Lead, 'readiness_score' | 'readiness_band'>) => void
  updateLeadAnalysis: (id: string, update: LeadAnalysisUpdate) => void
  updateLeadStatus: (id: string, status: LeadStatus) => void
  updateDoctorNotes: (id: string, notes: string) => void
  generateReport: (id: string, reportUrl: string) => void

  /** Scan workflow FSM state — NOT persisted to localStorage */
  scanWorkflow: ScanWorkflowState
  /** Attempt a guarded FSM transition. Returns false if transition was invalid. */
  transitionWorkflow: (
    name: Parameters<typeof transition>[1],
    payload?: Record<string, unknown>,
  ) => TransitionResult
  /** Reset workflow to initial state (e.g. on new scan start) */
  resetWorkflow: () => void

}

// Hydration tracking — persist loads async from localStorage
let storeHydrated = false
export function waitForHydration(): Promise<void> {
  if (storeHydrated) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useClinicStore.persist.onFinishHydration(() => {
      storeHydrated = true
      unsub()
      resolve()
    })
    // If already hydrated before listener attached
    if (useClinicStore.persist.hasHydrated()) {
      storeHydrated = true
      unsub()
      resolve()
    }
  })
}

/** Keep http/https URLs, strip data: and blob: URIs that can't/shouldn't be persisted */
function stripDataUri(url: string | undefined): string | undefined {
  if (!url) return url
  if (url.startsWith('data:') || url.startsWith('blob:')) return undefined
  return url
}

export const useClinicStore = create<ClinicStore>()(
  persist(
    (set) => ({
      currentLead: null,
      setCurrentLead: (lead) =>
        set((s) => ({ currentLead: { ...s.currentLead, ...lead } })),
      clearCurrentLead: () => set({ currentLead: null, formStep: 1 }),

      formStep: 1,
      setFormStep: (step) => set({ formStep: step }),

      leads: initialLeads,
      addLead: (lead) => {
        const { score, band } = calculateReadiness(lead)
        const enriched: Lead = { ...lead, readiness_score: score, readiness_band: band }
        console.log('[Store] addLead:', lead.id, '| total after:', useClinicStore.getState().leads.length + 1)
        set((s) => ({ leads: [enriched, ...s.leads] }))
      },
      updateLeadAnalysis: (id, update) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id ? { ...l, ...update, updated_at: new Date().toISOString() } : l
          ),
        })),
      updateLeadStatus: (id, status) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id ? { ...l, status, updated_at: new Date().toISOString() } : l
          ),
        })),
      updateDoctorNotes: (id, notes) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id
              ? { ...l, doctor_notes: notes, doctor_notes_updated_at: new Date().toISOString() }
              : l
          ),
        })),
      generateReport: (id, reportUrl) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id
              ? { ...l, report_generated_at: new Date().toISOString(), report_url: reportUrl }
              : l
          ),
        })),

      scanWorkflow: { ...INITIAL_WORKFLOW_STATE },
      transitionWorkflow: (name, payload) => {
        const current = useClinicStore.getState().scanWorkflow
        const result = transition(current, name, payload)
        if (result.ok) {
          set({ scanWorkflow: result.state })
        } else if (process.env.NODE_ENV === 'development') {
          console.warn(`[Workflow] Transition '${name}' rejected:`, result.error)
        }
        return result
      },
      resetWorkflow: () => set({ scanWorkflow: { ...INITIAL_WORKFLOW_STATE } }),
    }),
    {
      name: 'ag-clinic-store',
      storage: {
        getItem: (name) => {
          try {
            const value = localStorage.getItem(name)
            return value ? JSON.parse(value) : null
          } catch (e) {
            console.warn('[Store] Failed to read localStorage:', e)
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch {
            console.warn('[Store] localStorage quota exceeded — clearing stale data and retrying')
            try {
              // Remove the stale key entirely, then retry with the new (smaller) value
              localStorage.removeItem(name)
              localStorage.setItem(name, JSON.stringify(value))
            } catch {
              // Still failing — localStorage is truly full. App continues in-memory only.
              console.error('[Store] localStorage write failed after cleanup — running in-memory only')
            }
          }
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name) } catch { /* noop */ }
        },
      },
      partialize: ((s: ClinicStore) => ({
        // currentLead is transient (accumulates data URIs during capture) — never persist
        // formStep resets with currentLead — no need to persist
        // scanWorkflow is session-scoped FSM state — no need to persist
        leads: s.leads.map((l) => ({
          ...l,

          // ── Strip base64 / blob URIs from photo fields ──
          patient_photo_url: stripDataUri(l.patient_photo_url),
          doctor_frontal_photos: l.doctor_frontal_photos.map(stripDataUri).filter(Boolean) as string[],
          doctor_mimic_photos: l.doctor_mimic_photos.map(stripDataUri).filter(Boolean) as string[],
          optional_video_url: stripDataUri(l.optional_video_url),
          before_media: l.before_media.map(stripDataUri).filter(Boolean) as string[],
          after_media: l.after_media.map(stripDataUri).filter(Boolean) as string[],

          // ── Drop large blobs that blow up localStorage (re-fetched from Supabase) ──
          captured_frames: undefined,
          canonical_analysis: undefined,
          specialist_analysis: undefined,
          multi_view_analysis: undefined,
          trust_pipeline: undefined,
          radar_analysis: undefined,
          capture_manifest: undefined,
          liveness_signals: undefined,
          focus_areas: undefined,
          wrinkle_scores: undefined,
          lip_analysis: undefined,
          suggested_zones: undefined,
          patient_summary: undefined,
          consultation_readiness: undefined,
          doctor_analysis: undefined,
          age_estimation: undefined,
        })),
      })) as unknown as (state: ClinicStore) => ClinicStore,
    }
  )
)
