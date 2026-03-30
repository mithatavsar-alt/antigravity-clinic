import type { AnalysisProvider, ExternalAnalysisResult, SkinAnalysis, FaceAnalysis } from './types'

/**
 * PerfectCorp / YouCam API adapter.
 *
 * Replace EXTERNAL_API_URL and adjust buildRequestPayload / mapResponse
 * once you have the real API documentation and credentials.
 */

// Change this to the actual PerfectCorp endpoint when available
const EXTERNAL_API_URL = process.env.PERFECTCORP_API_URL || 'https://api.perfectcorp.com/v1/skin-analysis'

function getApiKey(): string {
  const key = process.env.PERFECTCORP_API_KEY
  if (!key) throw new Error('PERFECTCORP_API_KEY environment variable is not set')
  return key
}

/**
 * Build the request payload for PerfectCorp API.
 * Adjust fields, headers, and body format per their docs.
 */
function buildRequest(imageBuffer: Buffer, mimeType: string): { url: string; init: RequestInit } {
  const apiKey = getApiKey()
  const base64Image = imageBuffer.toString('base64')

  return {
    url: EXTERNAL_API_URL,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
        image_type: mimeType,
        analysis_types: ['skin', 'face'],
      }),
      signal: AbortSignal.timeout(15000),
    },
  }
}

/**
 * Map the raw PerfectCorp response to our normalized schema.
 * Adjust field paths once you see the real response shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSkin(raw: any): SkinAnalysis {
  const skin = raw?.skin ?? raw?.skinAnalysis ?? {}
  return {
    skinAge: skin.skinAge ?? skin.skin_age ?? null,
    wrinkle: skin.wrinkle ?? skin.wrinkleScore ?? null,
    texture: skin.texture ?? skin.textureScore ?? null,
    pore: skin.pore ?? skin.poreScore ?? null,
    pigmentation: skin.pigmentation ?? skin.spots ?? null,
    redness: skin.redness ?? skin.rednessScore ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFace(raw: any): FaceAnalysis {
  const face = raw?.face ?? raw?.faceAnalysis ?? {}
  return {
    symmetry: face.symmetry ?? face.symmetryScore ?? null,
    harmony: face.harmony ?? face.goldenRatio ?? null,
  }
}

export const perfectCorpProvider: AnalysisProvider = {
  name: 'PerfectCorp',

  async analyze(imageBuffer: Buffer, mimeType: string): Promise<ExternalAnalysisResult> {
    const { url, init } = buildRequest(imageBuffer, mimeType)

    const res = await fetch(url, init)

    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error('API kimlik doğrulama hatası'), { code: 'AUTH_ERROR' as const })
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`PerfectCorp API ${res.status}: ${text.slice(0, 200)}`),
        { code: 'API_ERROR' as const }
      )
    }

    const raw = await res.json()

    return {
      success: true,
      quality: {
        passed: raw?.quality?.passed ?? true,
        message: raw?.quality?.message ?? 'Fotoğraf analize uygun',
      },
      skin: mapSkin(raw),
      face: mapFace(raw),
      notes: [
        'Bu sonuç ön değerlendirme amaçlıdır.',
        'Kesin işlem kararı doktor muayenesi ile verilmelidir.',
      ],
      rawAvailable: true,
    }
  },
}
