'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lead, LeadStatus } from '@/types/lead'
import { mockLeads } from '@/data/mock-leads'
import { calculateReadiness } from '@/lib/readiness'

interface ClinicStore {
  currentLead: Partial<Lead> | null
  setCurrentLead: (lead: Partial<Lead>) => void
  clearCurrentLead: () => void

  formStep: 1 | 2 | 3
  setFormStep: (step: 1 | 2 | 3) => void

  leads: Lead[]
  addLead: (lead: Omit<Lead, 'readiness_score' | 'readiness_band'>) => void
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
      partialize: (s) => ({ leads: s.leads }),
    }
  )
)
