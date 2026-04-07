/**
 * WhatsApp appointment request message generator.
 *
 * Produces a personalized, patient-perspective WhatsApp message
 * based on face analysis results.  The output is ready to be
 * URL-encoded into a wa.me link.
 */

// Region mapping uses string keys to accept both typed FocusRegion and
// the plain-string shape stored on the Lead model.

// ─── Public types ──────────────────────────────────────────

export type WhatsAppRegion =
  | 'goz_cevresi'
  | 'goz_alti'
  | 'alin'
  | 'kas_arasi'
  | 'nazolabial'
  | 'dudak_cevresi'
  | 'cene_hatti'
  | 'alt_yuz'
  | 'cilt_dokusu'
  | 'genel'

/** Lightweight focus area input — accepts the Lead shape (region as string). */
export interface FocusAreaInput {
  region: string
  score: number
}

export interface WhatsAppMessageInput {
  overallScore?: number           // 0–100
  analysisConfidence?: number     // 0–1
  primaryRegion?: WhatsAppRegion
  secondaryRegion?: WhatsAppRegion | null
  focusAreas?: FocusAreaInput[]
  strongAreas?: string[]
  improvementAreas?: string[]
  overallSummary?: string
  persona?: 'female' | 'neutral'
}

export interface WhatsAppMessageOutput {
  message: string
  primaryRegionUsed: WhatsAppRegion
  secondaryRegionUsed: WhatsAppRegion | null
}

// ─── Internal helpers ──────────────────────────────────────

type ToneBucket = 'refined' | 'balanced' | 'supportive' | 'gentle'

function getToneBucket(score: number | undefined): ToneBucket {
  if (score == null) return 'balanced'
  if (score >= 85) return 'refined'
  if (score >= 70) return 'balanced'
  if (score >= 55) return 'supportive'
  return 'gentle'
}

type ConfidenceBand = 'high' | 'medium' | 'low'

function getConfidenceBand(c: number | undefined): ConfidenceBand {
  if (c == null) return 'medium'
  if (c >= 0.7) return 'high'
  if (c >= 0.4) return 'medium'
  return 'low'
}

/** Map the existing FocusRegion keys (or plain strings) to WhatsAppRegion. */
const FOCUS_REGION_MAP: Record<string, WhatsAppRegion> = {
  forehead_glabella: 'alin',
  crow_feet:        'goz_cevresi',
  under_eye:        'goz_alti',
  mid_face:         'cilt_dokusu',
  lip_chin_jawline: 'cene_hatti',
  nasolabial:       'nazolabial',
  nose:             'genel',
}

function mapFocusRegion(r: string): WhatsAppRegion {
  return FOCUS_REGION_MAP[r] ?? 'genel'
}

/** Derive primary region from focusAreas when not explicitly provided. */
function resolvePrimaryRegion(input: WhatsAppMessageInput): WhatsAppRegion {
  if (input.primaryRegion) return input.primaryRegion
  if (input.focusAreas && input.focusAreas.length > 0) {
    const sorted = [...input.focusAreas].sort((a, b) => b.score - a.score)
    return mapFocusRegion(sorted[0].region)
  }
  return 'genel'
}

function resolveSecondaryRegion(input: WhatsAppMessageInput, primary: WhatsAppRegion): WhatsAppRegion | null {
  if (input.secondaryRegion !== undefined) return input.secondaryRegion
  if (input.focusAreas && input.focusAreas.length >= 2) {
    const sorted = [...input.focusAreas].sort((a, b) => b.score - a.score)
    const mapped = mapFocusRegion(sorted[1].region)
    return mapped !== primary ? mapped : null
  }
  return null
}

// ─── Phrase pools (per region) ─────────────────────────────

const REGION_PHRASES: Record<WhatsAppRegion, string[]> = {
  goz_cevresi: [
    'özellikle göz çevresiyle ilgili değerlendirme dikkatimi çekti',
    'göz çevremde hafif iyileştirme potansiyeli olduğu görüldü',
    'göz çevresi için daha detaylı uzman görüşü almak istiyorum',
  ],
  goz_alti: [
    'özellikle göz altı görünümümle ilgili değerlendirme dikkatimi çekti',
    'göz altı bölgesi için detaylı bilgi almak istiyorum',
    'göz altı bölgesinde desteklenebilecek bir alan olduğu görüldü',
  ],
  alin: [
    'özellikle alın bölgesindeki değerlendirme dikkatimi çekti',
    'alın bölgesi için uzman görüşü almak istiyorum',
    'alın bölgesinde hafif belirginlik dikkatimi çekti',
  ],
  kas_arasi: [
    'kaş arası bölgesiyle ilgili değerlendirme dikkatimi çekti',
    'bu alan için detaylı değerlendirme almak istiyorum',
    'kaş arası bölgesinde hafif belirginlik fark ettim',
  ],
  nazolabial: [
    'özellikle burun-dudak çevresiyle ilgili analiz sonucu dikkatimi çekti',
    'bu bölge için detaylı uzman değerlendirmesi almak istiyorum',
    'burun-dudak çevresindeki değerlendirme dikkatimi çekti',
  ],
  dudak_cevresi: [
    'dudak çevresiyle ilgili değerlendirme dikkatimi çekti',
    'bu alanı daha detaylı değerlendirmek istiyorum',
    'dudak çevresi için uzman görüşü almak istiyorum',
  ],
  cene_hatti: [
    'çene hattı ve alt yüz bölgesiyle ilgili değerlendirme dikkatimi çekti',
    'bu bölge için uzman görüşü almak istiyorum',
    'alt yüz ve çene hattıyla ilgili analiz sonucu dikkatimi çekti',
  ],
  alt_yuz: [
    'alt yüz bölgesiyle ilgili değerlendirme dikkatimi çekti',
    'bu bölge için daha detaylı bilgi almak istiyorum',
    'çene hattı ve alt yüz bölgesinde iyileştirme potansiyeli görüldü',
  ],
  cilt_dokusu: [
    'genel cilt görünümümde bazı alanların desteklenebileceği görüldü',
    'cilt yapımla ilgili daha detaylı değerlendirme almak istiyorum',
    'cilt kalitesiyle ilgili analiz sonucu dikkatimi çekti',
  ],
  genel: [
    'yüz analizi sonucumu daha detaylı değerlendirmek istiyorum',
    'uzman görüşüyle bana uygun yaklaşımı öğrenmek istiyorum',
    'genel analiz sonuçlarımı bir uzmanla değerlendirmek istiyorum',
  ],
}

// ─── Confidence-based prefixes ─────────────────────────────

const CONFIDENCE_PREFIXES: Record<ConfidenceBand, string[]> = {
  low:    ['ön analizde', 'ilk değerlendirmede'],
  medium: ['ön analiz sonucumda', 'yüz analizi sonucumda'],
  high:   ['yüz analizi sonucumda', 'analiz sonucumda'],
}

// ─── Appointment closings ──────────────────────────────────

const CLOSINGS_BY_TONE: Record<ToneBucket, string[]> = {
  refined: [
    'Daha detaylı bilgi almak ve uygun bir randevu oluşturmak istiyorum.',
    'Müsait olduğunuz bir zamanda randevu planlamak isterim.',
  ],
  balanced: [
    'Uygun bir randevu planlayabilir miyiz?',
    'Daha detaylı bilgi almak ve uygun bir randevu oluşturmak istiyorum.',
    'Bana uygun bir randevu oluşturabilir misiniz?',
  ],
  supportive: [
    'Bu konuda daha detaylı görüş almak istiyorum. Bana uygun bir randevu oluşturabilir misiniz?',
    'Daha detaylı bilgi almak istiyorum. Müsait olduğunuz bir zamanda görüşebilir miyiz?',
  ],
  gentle: [
    'Daha detaylı bilgi almak ve bana uygun bir randevu oluşturmak istiyorum.',
    'Uzman görüşü almak istiyorum. Müsait olduğunuz bir zamanda randevu planlayabilir miyiz?',
  ],
}

// ─── Deterministic "pick" based on numeric seed ────────────

function pick<T>(arr: readonly T[], seed: number): T {
  const idx = Math.abs(Math.round(seed * 1000)) % arr.length
  return arr[idx]
}

// ─── Main generator ────────────────────────────────────────

export function generateWhatsAppMessage(
  input: WhatsAppMessageInput = {},
): WhatsAppMessageOutput {
  const score = input.overallScore
  const confidence = input.analysisConfidence
  const tone = getToneBucket(score)
  const confBand = getConfidenceBand(confidence)

  const primary = resolvePrimaryRegion(input)
  const secondary = resolveSecondaryRegion(input, primary)

  // Use score + confidence as deterministic seed for variation
  const seed = (score ?? 50) / 100 + (confidence ?? 0.5)

  const prefix = pick(CONFIDENCE_PREFIXES[confBand], seed)
  const regionPhrase = pick(REGION_PHRASES[primary], seed + 0.33)
  const closing = pick(CLOSINGS_BY_TONE[tone], seed + 0.67)

  let message: string

  if (primary === 'genel') {
    // For general region, use a simpler structure
    message = `Merhaba, ${prefix} ${regionPhrase}. ${closing}`
  } else {
    message = `Merhaba, ${prefix} ${regionPhrase}. ${closing}`
  }

  return {
    message,
    primaryRegionUsed: primary,
    secondaryRegionUsed: secondary,
  }
}

// ─── Convenience: build WhatsApp URL with generated message ─

export function buildWhatsAppBookingUrl(
  phoneNumber: string,
  input: WhatsAppMessageInput,
): string {
  const { message } = generateWhatsAppMessage(input)
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
}
