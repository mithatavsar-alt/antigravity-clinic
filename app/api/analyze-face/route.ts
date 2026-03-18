import { NextRequest, NextResponse } from 'next/server'
import { perfectCorpProvider } from '@/lib/external-analysis'
import type { ExternalAnalysisError, ExternalAnalysisResponse } from '@/lib/external-analysis'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

// Simple in-memory rate limiter (resets on cold start — fine for Vercel serverless)
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const ipHits = new Map<string, { count: number; resetAt: number }>()

function errorResponse(
  message: string,
  code: ExternalAnalysisError['code'],
  status: number
): NextResponse<ExternalAnalysisResponse> {
  return NextResponse.json({ success: false as const, error: message, code }, { status })
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  const entry = ipHits.get(ip)
  if (entry && now < entry.resetAt) {
    entry.count++
    if (entry.count > RATE_LIMIT_MAX) {
      return errorResponse('Çok fazla istek. Lütfen biraz bekleyin.', 'UNKNOWN', 429)
    }
  } else {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
  }

  try {
    const contentType = request.headers.get('content-type') ?? ''

    let imageBuffer: Buffer
    let mimeType: string

    if (contentType.includes('multipart/form-data')) {
      // Multipart upload
      const formData = await request.formData()
      const file = formData.get('image')

      if (!file || !(file instanceof File)) {
        return errorResponse('Görsel dosyası bulunamadı. "image" alanına dosya yükleyin.', 'INVALID_IMAGE', 400)
      }

      mimeType = file.type
      if (!ALLOWED_TYPES.has(mimeType)) {
        return errorResponse(
          `Geçersiz dosya türü: ${mimeType}. Kabul edilen türler: JPG, PNG, WebP.`,
          'INVALID_IMAGE',
          400
        )
      }

      if (file.size > MAX_SIZE_BYTES) {
        return errorResponse(
          `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum: 10 MB.`,
          'INVALID_IMAGE',
          400
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
    } else if (contentType.includes('application/json')) {
      // Base64 JSON upload (for camera captures)
      const body = await request.json()
      const { image, mimeType: bodyMimeType } = body

      if (!image || typeof image !== 'string') {
        return errorResponse('Base64 "image" alanı gerekli.', 'INVALID_IMAGE', 400)
      }

      // Strip data URL prefix if present
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
      mimeType = typeof bodyMimeType === 'string' ? bodyMimeType : 'image/jpeg'

      if (!ALLOWED_TYPES.has(mimeType)) {
        return errorResponse(
          `Geçersiz dosya türü: ${mimeType}. Kabul edilen türler: JPG, PNG, WebP.`,
          'INVALID_IMAGE',
          400
        )
      }

      imageBuffer = Buffer.from(base64Data, 'base64')

      if (imageBuffer.length > MAX_SIZE_BYTES) {
        return errorResponse(
          `Dosya çok büyük. Maksimum: 10 MB.`,
          'INVALID_IMAGE',
          400
        )
      }
    } else {
      return errorResponse(
        'Desteklenmeyen içerik türü. multipart/form-data veya application/json gönderin.',
        'INVALID_IMAGE',
        400
      )
    }

    // Check API key is configured
    if (!process.env.PERFECTCORP_API_KEY) {
      console.error('[analyze-face] PERFECTCORP_API_KEY is not set')
      return errorResponse(
        'Analiz servisi henüz yapılandırılmamış. Lütfen yöneticiyle iletişime geçin.',
        'AUTH_ERROR',
        503
      )
    }

    // Call external provider
    const result = await perfectCorpProvider.analyze(imageBuffer, mimeType)

    const response: Record<string, unknown> = { ...result }
    if (process.env.NODE_ENV === 'development') {
      response._debug = {
        provider: 'perfectcorp',
        source: 'real-api',
        analyzed_at: new Date().toISOString(),
      }
    }

    return NextResponse.json(response)
  } catch (err) {
    const error = err as Error & { code?: string }
    console.error('[analyze-face] Provider error:', error.message)

    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return errorResponse(
        'Analiz servisi yanıt vermedi. Lütfen tekrar deneyin.',
        'TIMEOUT',
        504
      )
    }

    if (error.code === 'AUTH_ERROR') {
      return errorResponse(
        'Analiz servisi kimlik doğrulama hatası.',
        'AUTH_ERROR',
        502
      )
    }

    return errorResponse(
      'Analiz sırasında beklenmeyen bir hata oluştu.',
      'UNKNOWN',
      500
    )
  }
}
