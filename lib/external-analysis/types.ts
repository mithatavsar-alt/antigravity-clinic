/**
 * Normalized response schema for external face analysis providers.
 * Provider-agnostic — adapters map vendor responses into this format.
 */

export interface SkinAnalysis {
  skinAge: number | null
  wrinkle: number | null
  texture: number | null
  pore: number | null
  pigmentation: number | null
  redness: number | null
}

export interface FaceAnalysis {
  symmetry: number | null
  harmony: number | null
}

export interface QualityCheck {
  passed: boolean
  message: string
}

export interface ExternalAnalysisResult {
  success: boolean
  quality: QualityCheck
  skin: SkinAnalysis
  face: FaceAnalysis
  notes: string[]
  rawAvailable: boolean
}

export interface ExternalAnalysisError {
  success: false
  error: string
  code: 'INVALID_IMAGE' | 'API_ERROR' | 'TIMEOUT' | 'AUTH_ERROR' | 'UNKNOWN'
}

export type ExternalAnalysisResponse = ExternalAnalysisResult | ExternalAnalysisError

/** Provider adapter interface — implement per vendor */
export interface AnalysisProvider {
  readonly name: string
  analyze(imageBuffer: Buffer, mimeType: string): Promise<ExternalAnalysisResult>
}
