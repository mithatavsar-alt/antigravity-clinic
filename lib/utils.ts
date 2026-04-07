import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function generateLeadId(): string {
  const ts = Date.now().toString(36)
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `LD-${ts}-${rand}`
}

// ─── Turkish Phone Utilities ────────────────────────────────

/**
 * Strip all non-digit characters, then normalize to 905XXXXXXXXX format.
 * Returns the 12-digit normalized string, or null if invalid.
 *
 * Accepted inputs (with/without spaces/dashes):
 *   05324100310   → 905324100310
 *   5324100310    → 905324100310
 *   905324100310  → 905324100310
 *   +905324100310 → 905324100310
 */
export function normalizeTurkishPhone(raw: string): string | null {
  // Only allow digits, spaces, dashes, parens, and a leading +
  if (/[a-zA-Z]/.test(raw)) return null
  const digits = raw.replace(/\D/g, '')

  let normalized: string
  if (digits.startsWith('90') && digits.length === 12) {
    normalized = digits
  } else if (digits.startsWith('0') && digits.length === 11) {
    normalized = '9' + digits          // 05XX… → 905XX…
  } else if (digits.startsWith('5') && digits.length === 10) {
    normalized = '90' + digits         // 5XX… → 905XX…
  } else {
    return null
  }

  // Must be 905XXXXXXXXX (Turkish GSM starts with 5)
  if (!/^905\d{9}$/.test(normalized)) return null
  return normalized
}

/** Validate without normalizing — returns true if the input can be normalized. */
export function isValidTurkishPhone(raw: string): boolean {
  return normalizeTurkishPhone(raw) !== null
}

/** Build a WhatsApp chat URL for a Turkish phone number. */
export function whatsappUrl(phone: string, message?: string): string {
  const normalized = normalizeTurkishPhone(phone) ?? phone.replace(/\D/g, '')
  const base = `https://wa.me/${normalized}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
