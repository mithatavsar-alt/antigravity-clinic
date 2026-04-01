/**
 * Specialist Facial Analysis Modules — Public API
 *
 * 5 specialist modules + fusion engine for region-specific assessment.
 * Entry point: runSpecialistAnalysis() + buildCalibrationContext()
 */

export { runSpecialistAnalysis, buildCalibrationContext, SPECIALIST_MODULES } from './fusion-engine'
export type {
  SpecialistModule,
  SpecialistModuleKey,
  RegionAssessment,
  CalibrationContext,
  FusionResult,
  FeatureVector,
  FeatureSource,
  SubScore,
} from './types'
export { classifySeverity, normalizeScore } from './types'
export { CrowFeetModule } from './crow-feet-module'
export { UnderEyeModule } from './under-eye-module'
export { LipsPerioralModule } from './lips-perioral-module'
export { CheekVolumeModule } from './cheek-volume-module'
export { ChinContourModule } from './chin-contour-module'
