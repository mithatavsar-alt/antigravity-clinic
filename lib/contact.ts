/**
 * Central contact configuration.
 * All contact URLs/numbers are derived from environment variables
 * with sensible defaults for development.
 */

import { normalizeTurkishPhone } from '@/lib/utils'

const RAW_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '905321234567'
const WHATSAPP_NUMBER = normalizeTurkishPhone(RAW_NUMBER) ?? RAW_NUMBER

const BOOKING_MESSAGE = 'Merhaba, AI ön değerlendirmemi tamamladım. Randevu planlamak istiyorum.'

export const contact = {
  whatsappNumber: WHATSAPP_NUMBER,
  whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}`,
  whatsappBookingUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(BOOKING_MESSAGE)}`,
} as const
