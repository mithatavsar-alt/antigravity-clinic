/**
 * Fusion Engine — Combines specialist module outputs
 *
 * Aggregates all 5 specialist RegionAssessments into a unified
 * FusionResult with weighted scoring and priority ranking.
 *
 * Also builds CalibrationContext from available pipeline data
 * and provides the main entry point: runSpecialistAnalysis().
 */

import type { Landmark, WrinkleRegionResult, EnhancedAnalysisResult } from '../types'
import type { YoungFaceProfile, QualityGateResult } from '../pipeline/types'
import type {
  SpecialistModule,
  RegionAssessment,
  CalibrationContext,
  FusionResult,
  SpecialistModuleKey,
} from './types'

import { CrowFeetModule } from './crow-feet-module'
import { UnderEyeModule } from './under-eye-module'
import { LipsPerioralModule } from './lips-perioral-module'
import { CheekVolumeModule } from './cheek-volume-module'
import { ChinContourModule } from './chin-contour-module'

// ─── Module Registry ───────────────────────────────────────

const SPECIALIST_MODULES: SpecialistModule[] = [
  CrowFeetModule,
  UnderEyeModule,
  LipsPerioralModule,
  CheekVolumeModule,
  ChinContourModule,
]

/** Per-module weight in overall score */
const MODULE_WEIGHTS: Record<SpecialistModuleKey, number> = {
  crow_feet: 0.20,
  under_eye: 0.20,
  lips_perioral: 0.20,
  cheek_volume: 0.20,
  chin_contour: 0.20,
}

// ─── Calibration Context Builder ───────────────────────────

export function buildCalibrationContext(
  rawAnalysis: EnhancedAnalysisResult,
  qualityGate: QualityGateResult,
  youngFaceProfile: YoungFaceProfile,
  captureConfidence: 'high' | 'medium' | 'low' = 'high',
): CalibrationContext {
  const smoothingDetected = rawAnalysis.imageQuality?.flags.includes('smoothing_detected') ?? false

  return {
    estimatedAge: rawAnalysis.estimatedAge,
    youngFaceProfile,
    qualityGate,
    qualityScore: rawAnalysis.qualityScore,
    captureConfidence,
    smoothingDetected,
    gender: rawAnalysis.gender,
  }
}

// ─── Fusion Logic ──────────────────────────────────────────

function fuseAssessments(assessments: RegionAssessment[]): FusionResult {
  const evaluable = assessments.filter(a => a.evaluable)

  if (evaluable.length === 0) {
    return {
      assessments,
      overallScore: 0,
      overallConfidence: 0,
      priorityRegions: [],
      analyzedAt: Date.now(),
    }
  }

  // Weighted average score
  let totalWeight = 0
  let weightedScore = 0
  let weightedConfidence = 0

  for (const assessment of evaluable) {
    const w = MODULE_WEIGHTS[assessment.moduleKey] ?? 0.2
    weightedScore += assessment.score * w
    weightedConfidence += assessment.confidence * w
    totalWeight += w
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
  const overallConfidence = totalWeight > 0 ? Math.round(weightedConfidence / totalWeight) : 0

  // Priority ranking: sort by score * confidence (highest concern first)
  const priorityRegions = evaluable
    .filter(a => !a.isPositive)
    .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence))
    .map(a => a.moduleKey)

  return {
    assessments,
    overallScore,
    overallConfidence,
    priorityRegions,
    analyzedAt: Date.now(),
  }
}

// ─── Main Entry Point ──────────────────────────────────────

/**
 * Run all 5 specialist modules and fuse the results.
 *
 * Called after the main analysis pipeline (stage 3) completes,
 * before the trust pipeline (stage 4).
 *
 * @param landmarks - 468 MediaPipe landmarks
 * @param imageSource - The captured image
 * @param calibration - Pre-built calibration context
 * @param wrinkleRegions - Wrinkle data from existing pipeline (reused)
 */
export function runSpecialistAnalysis(
  landmarks: Landmark[],
  imageSource: HTMLCanvasElement | HTMLImageElement,
  calibration: CalibrationContext,
  wrinkleRegions?: WrinkleRegionResult[],
): FusionResult {
  const assessments: RegionAssessment[] = []

  for (const mod of SPECIALIST_MODULES) {
    try {
      const assessment = mod.analyze(landmarks, imageSource, calibration, wrinkleRegions)
      assessments.push(assessment)
    } catch (err) {
      console.warn(`[Specialist] ${mod.key} analysis failed (non-fatal):`, err)
      // Push a non-evaluable placeholder
      assessments.push({
        moduleKey: mod.key,
        displayName: mod.displayName,
        icon: mod.icon,
        score: 0,
        confidence: 0,
        severity: 'minimal',
        subScores: [],
        observation: 'Bu bölge değerlendirilemedi.',
        isPositive: false,
        features: { values: {}, sources: [], extractedAt: Date.now() },
        dataSources: [],
        evaluable: false,
        limitation: 'Analiz sırasında bir hata oluştu.',
      })
    }
  }

  return fuseAssessments(assessments)
}

// ─── Re-exports ────────────────────────────────────────────

export { SPECIALIST_MODULES }
export type { CalibrationContext, FusionResult, RegionAssessment, SpecialistModuleKey }
