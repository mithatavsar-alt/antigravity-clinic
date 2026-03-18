/**
 * Central contact configuration.
 * All contact URLs/numbers are derived from environment variables
 * with sensible defaults for development.
 */

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '905321234567'

export const contact = {
  whatsappNumber: WHATSAPP_NUMBER,
  whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}`,
  whatsappBookingUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Merhaba, AI ön değerlendirmemi tamamladım. Randevu planlamak istiyorum.'
  )}`,
} as const
