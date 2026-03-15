export interface Landmark {
  x: number
  y: number
  z: number
}

export interface FaceMetrics {
  faceRatio: number
  eyeDistanceRatio: number
  noseToFaceWidth: number
  mouthToNoseWidth: number
  symmetryRatio: number
}

export interface AnalysisResult {
  metrics: FaceMetrics
  suggestions: string[]
  scores: {
    symmetry: number
    proportion: number
  }
}

export type FaceMeshErrorCode = 'INIT_TIMEOUT' | 'NO_FACE_DETECTED' | 'MISSING_LANDMARK' | 'MODEL_LOAD_FAILED'

export class FaceMeshError extends Error {
  code: FaceMeshErrorCode
  constructor(code: FaceMeshErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'FaceMeshError'
  }
}
