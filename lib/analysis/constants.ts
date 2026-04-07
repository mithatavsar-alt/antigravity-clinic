/**
 * Face Region Segmentation Engine — Constants
 *
 * Landmark indices, region definitions, scoring thresholds, and
 * configuration constants for the analysis pipeline.
 */

import type { AnalysisRegionId, RegionDefinition, RegionGroup } from './types'

// ─── Face Oval Boundary (ordered clockwise from forehead center) ──

export const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251,
  301, 368, 435, 397,
  365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136,
  215, 138, 135, 169, 71,
  162, 21, 54, 103, 67, 109,
] as const

// ─── Exclusion Zone Indices ──────────────────────────────

export const LEFT_EYE_INDICES = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
] as const

export const RIGHT_EYE_INDICES = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
] as const

export const LIPS_INTERIOR_INDICES = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191,
] as const

export const LEFT_NOSTRIL_INDICES = [240, 64, 48, 115, 220] as const

export const RIGHT_NOSTRIL_INDICES = [460, 294, 278, 344, 440] as const

// ─── Forehead Extension ──────────────────────────────────

/** How much to extend the face mask upward for forehead coverage (fraction of face bbox height) */
export const FOREHEAD_EXTENSION_RATIO = 0.08

// ─── Region Definitions (18 regions) ─────────────────────
// NOTE: Region weights are RELATIVE, not normalized to sum to 1.0.
// The scoring engine divides by the sum of effective weights, so the
// absolute values don't matter — only the ratios between them.

export const REGION_DEFINITIONS: Record<AnalysisRegionId, RegionDefinition> = {
  forehead: {
    id: 'forehead',
    label: 'Alın',
    landmarkIndices: [10, 151, 67, 109, 108, 107, 66, 54, 63, 55, 8, 285, 293, 284, 296, 336, 337, 338, 297],
    side: 'center',
    group: 'forehead',
    weight: 0.06,
    minAreaThreshold: 0.005,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  forehead_left: {
    id: 'forehead_left',
    label: 'Sol Alın',
    landmarkIndices: [54, 63, 55, 8, 151, 67, 109, 108, 107, 66],
    side: 'left',
    group: 'forehead',
    weight: 0.04,
    minAreaThreshold: 0.003,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  forehead_right: {
    id: 'forehead_right',
    label: 'Sağ Alın',
    landmarkIndices: [284, 293, 285, 8, 151, 297, 338, 337, 336, 296],
    side: 'right',
    group: 'forehead',
    weight: 0.04,
    minAreaThreshold: 0.003,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  glabella: {
    id: 'glabella',
    label: 'Kaş Arası',
    landmarkIndices: [107, 9, 336, 296, 334, 293, 283, 282, 295, 55, 65, 52, 53, 66],
    side: 'center',
    group: 'forehead',
    weight: 0.08,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  under_eye_left: {
    id: 'under_eye_left',
    label: 'Sol Göz Altı',
    landmarkIndices: [33, 7, 163, 144, 145, 153, 154, 155, 133, 243, 112, 26, 22, 23, 24, 110, 25],
    side: 'left',
    group: 'eye_area',
    weight: 0.09,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.35,
    enabled: true,
  },
  under_eye_right: {
    id: 'under_eye_right',
    label: 'Sağ Göz Altı',
    landmarkIndices: [362, 382, 381, 380, 374, 373, 390, 249, 263, 463, 341, 256, 252, 253, 254, 339, 255],
    side: 'right',
    group: 'eye_area',
    weight: 0.09,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.35,
    enabled: true,
  },
  crow_feet_left: {
    id: 'crow_feet_left',
    label: 'Sol Kaz Ayağı',
    landmarkIndices: [33, 130, 226, 247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25],
    side: 'left',
    group: 'eye_area',
    weight: 0.09,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  crow_feet_right: {
    id: 'crow_feet_right',
    label: 'Sağ Kaz Ayağı',
    landmarkIndices: [263, 359, 446, 467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255],
    side: 'right',
    group: 'eye_area',
    weight: 0.09,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  nose_surface: {
    id: 'nose_surface',
    label: 'Burun Yüzeyi',
    landmarkIndices: [6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 248, 281, 275, 45],
    side: 'center',
    group: 'mid_face',
    weight: 0.04,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  nasolabial_left: {
    id: 'nasolabial_left',
    label: 'Sol Nazolabial',
    landmarkIndices: [98, 240, 64, 48, 115, 220, 45, 4, 1, 196, 197, 195, 5],
    side: 'left',
    group: 'mid_face',
    weight: 0.08,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  nasolabial_right: {
    id: 'nasolabial_right',
    label: 'Sağ Nazolabial',
    landmarkIndices: [327, 460, 294, 278, 344, 440, 275, 4, 1, 419, 197, 195, 5],
    side: 'right',
    group: 'mid_face',
    weight: 0.08,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  perioral: {
    id: 'perioral',
    label: 'Dudak Çevresi',
    landmarkIndices: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 0, 267, 269, 270, 409, 37, 39, 40, 185],
    side: 'center',
    group: 'lower_face',
    weight: 0.06,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  cheek_left: {
    id: 'cheek_left',
    label: 'Sol Yanak',
    landmarkIndices: [116, 117, 118, 119, 120, 121, 128, 245, 193, 55, 65, 52, 53],
    side: 'left',
    group: 'mid_face',
    weight: 0.06,
    minAreaThreshold: 0.003,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  cheek_right: {
    id: 'cheek_right',
    label: 'Sağ Yanak',
    landmarkIndices: [345, 346, 347, 348, 349, 350, 357, 465, 417, 285, 295, 282, 283],
    side: 'right',
    group: 'mid_face',
    weight: 0.06,
    minAreaThreshold: 0.003,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  chin: {
    id: 'chin',
    label: 'Çene',
    landmarkIndices: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
    side: 'center',
    group: 'lower_face',
    weight: 0.05,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  jawline_left: {
    id: 'jawline_left',
    label: 'Sol Çene Hattı',
    landmarkIndices: [172, 136, 150, 149, 176, 148, 152],
    side: 'left',
    group: 'lower_face',
    weight: 0.03,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  jawline_right: {
    id: 'jawline_right',
    label: 'Sağ Çene Hattı',
    landmarkIndices: [397, 365, 379, 378, 400, 377, 152],
    side: 'right',
    group: 'lower_face',
    weight: 0.03,
    minAreaThreshold: 0.002,
    minConfidenceThreshold: 0.3,
    enabled: true,
  },
  symmetry_zone: {
    id: 'symmetry_zone',
    label: 'Simetri',
    landmarkIndices: [],
    side: 'center',
    group: 'symmetry',
    weight: 0.10,
    minAreaThreshold: 0,
    minConfidenceThreshold: 0,
    enabled: true,
  },
}

// ─── Group Labels (Turkish) ──────────────────────────────

export const GROUP_LABELS: Record<RegionGroup, string> = {
  forehead: 'Alın Bölgesi',
  eye_area: 'Göz Çevresi',
  mid_face: 'Orta Yüz',
  lower_face: 'Alt Yüz',
  symmetry: 'Simetri',
}

// ─── Group Weights ───────────────────────────────────────

export const GROUP_WEIGHTS: Record<RegionGroup, number> = {
  eye_area: 0.28,
  symmetry: 0.18,
  mid_face: 0.22,
  forehead: 0.18,
  lower_face: 0.14,
}

// ─── Severity Thresholds ─────────────────────────────────
// Scores >= threshold map to that severity level (higher = better)

export const SEVERITY_THRESHOLDS = {
  minimal: 75,
  mild: 55,
  moderate: 35,
} as const

// ─── Quality Thresholds ──────────────────────────────────

export const QUALITY_THRESHOLDS = {
  minLandmarkCount: 400,
  minDetectionConfidence: 0.5,
  minBrightness: 0.15,
  maxBrightness: 0.88,
  minSharpness: 0.08,
  maxAngleDeviation: 0.35,
  minImageDimension: 320,
} as const

// ─── Paired Regions (for asymmetry comparison) ───────────

export const PAIRED_REGIONS: readonly [AnalysisRegionId, AnalysisRegionId][] = [
  ['under_eye_left', 'under_eye_right'],
  ['crow_feet_left', 'crow_feet_right'],
  ['nasolabial_left', 'nasolabial_right'],
  ['cheek_left', 'cheek_right'],
  ['jawline_left', 'jawline_right'],
  ['forehead_left', 'forehead_right'],
] as const

// ─── Score Rounding ──────────────────────────────────────

/** Round scores to nearest multiple of this value */
export const SCORE_ROUNDING = 5

// ─── Confidence Levels ───────────────────────────────────

export const CONFIDENCE_LEVELS = {
  high: 0.70,
  medium: 0.40,
} as const

// ─── Skin Confidence Grid ────────────────────────────────

/** Cell size in pixels for the skin confidence heatmap grid */
export const SKIN_CONFIDENCE_GRID_SIZE = 16

// ─── Skin Tone Range (HSV) ──────────────────────────────

export const SKIN_TONE_RANGE = {
  minH: 0,
  maxH: 50,
  minS: 20,
  maxS: 180,
  minV: 60,
  maxV: 240,
} as const

// ─── Debug Overlay Colors ────────────────────────────────

export const DEBUG_COLORS = {
  faceMask: 'rgba(0, 255, 0, 0.15)',
  faceMaskBorder: 'rgba(0, 255, 0, 0.6)',
  exclusionZone: 'rgba(255, 0, 0, 0.2)',
  exclusionBorder: 'rgba(255, 0, 0, 0.6)',
  regionUsable: 'rgba(0, 120, 255, 0.15)',
  regionUsableBorder: 'rgba(0, 120, 255, 0.6)',
  regionSkipped: 'rgba(255, 165, 0, 0.15)',
  regionSkippedBorder: 'rgba(255, 165, 0, 0.6)',
  regionLabel: '#ffffff',
  regionLabelBg: 'rgba(0, 0, 0, 0.6)',
  skinConfidenceHigh: 'rgba(0, 200, 100, 0.3)',
  skinConfidenceLow: 'rgba(200, 0, 50, 0.3)',
  foreheadExtension: 'rgba(100, 200, 255, 0.2)',
} as const
