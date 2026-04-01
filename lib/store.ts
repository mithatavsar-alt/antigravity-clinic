'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lead, LeadStatus, DoctorAnalysis, PatientSummary, ConsultationReadiness } from '@/types/lead'
import { mockLeads } from '@/data/mock-leads'
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

  isAuthenticated: boolean
  login: (credentials: { email: string; password: string }) => boolean
  logout: () => void
}

function setAuthCookie(token: string) {
  if (typeof window === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `ag_auth_token=${token}; path=/; max-age=86400; SameSite=Strict${secure}`
}

function clearAuthCookie() {
  if (typeof window === 'undefined') return
  document.cookie = 'ag_auth_token=; path=/; max-age=0; SameSite=Strict'
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

      leads: mockLeads,
      addLead: (lead) => {
        const { score, band } = calculateReadiness(lead)
        const enriched: Lead = { ...lead, readiness_score: score, readiness_band: band }
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

      isAuthenticated: false,
      login: ({ email, password }) => {
        if (email === 'doctor@clinic.com' && password === 'clinic2026') {
          set({ isAuthenticated: true })
          setAuthCookie('mock-token-2026')
          return true
        }
        return false
      },
      logout: () => {
        set({ isAuthenticated: false })
        clearAuthCookie()
      },
    }),
    {
      name: 'ag-clinic-store',
      // isAuthenticated intentionally excluded — cookie is the sole auth source
      partialize: (s) => ({
        leads: s.leads.map((l) => ({
          ...l,
          // Strip large base64 data-URIs to avoid exceeding localStorage quota.
          // Object URLs (blob:) are session-scoped and can't be restored anyway.
          patient_photo_url: stripDataUri(l.patient_photo_url),
          doctor_frontal_photos: l.doctor_frontal_photos.map(stripDataUri).filter(Boolean) as string[],
          doctor_mimic_photos: l.doctor_mimic_photos.map(stripDataUri).filter(Boolean) as string[],
          optional_video_url: stripDataUri(l.optional_video_url),
          before_media: l.before_media.map(stripDataUri).filter(Boolean) as string[],
          after_media: l.after_media.map(stripDataUri).filter(Boolean) as string[],
        })),
      }),
    }
  )
)
