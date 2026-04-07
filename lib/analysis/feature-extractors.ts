/**
 * Feature Extractors Module
 *
 * Extracts visual features (wrinkle density, texture roughness, contrast,
 * tone uniformity, brightness) per analysis region using pixel utilities.
 * Computes asymmetry for paired regions and integrates skin confidence.
 */

import type { Landmark } from '../ai/types'
import type {
  AnalysisRegionId,
  ComputedRegion,
  RegionFeatures,
  GlobalQualityGateSummary,
  RegionSkinConfidence,
} from './types'
import { PAIRED_REGIONS } from './constants'
import {
  extractGrayscaleRegion,
  extractColorRegion,
  sobelEdges,
  sobelHorizontalBias,
  edgeDensity,
  textureRoughness,
  localContrast,
  colorUniformity,
  meanBrightness,
} from '../ai/specialists/pixel-utils'

// ─── Horizontal-bias Sobel region IDs ───────────────────

const HORIZONTAL_BIAS_REGIONS = new Set<AnalysisRegionId>([
  'forehead',
  'forehead_left',
  'forehead_right',
  'glabella',
])

// ─── Single Region Extraction (internal) ────────────────

function extractSingleRegion(
  source: HTMLCanvasElement | HTMLImageElement,
  landmarks: Landmark[],
  region: ComputedRegion,
): RegionFeatures | null {
  const def = region.definition

  // Skip virtual regions (empty landmarkIndices, e.g. symmetry_zone)
  if (def.landmarkIndices.length === 0) return null

  // Extract grayscale pixels
  const indices = [...def.landmarkIndices]
  const gray = extractGrayscaleRegion(source, landmarks, indices)
  if (!gray) return null

  // Too small to analyse
  if (gray.width < 8 || gray.height < 8) return null

  // Extract color region for tone uniformity
  const color = extractColorRegion(source, landmarks, indices)

  // Choose Sobel variant based on region type
  const edges = HORIZONTAL_BIAS_REGIONS.has(def.id)
    ? sobelHorizontalBias(gray.data, gray.width, gray.height)
    : sobelEdges(gray.data, gray.width, gray.height)

  // Compute features
  const wrinkleDensity = edgeDensity(edges, gray.width, gray.height)
  const roughness = textureRoughness(gray.data)
  const contrastIrregularity = localContrast(gray.data, gray.width, gray.height)
  const toneUniform = color ? colorUniformity(color) : 0.5
  const brightness = meanBrightness(gray.data)

  // Confidence based on pixel area
  const pixelCount = gray.width * gray.height
  const confidence = Math.min(1, pixelCount / 2000)

  return {
    regionId: def.id,
    wrinkleDensity,
    textureRoughness: roughness,
    contrastIrregularity,
    toneUniformity: toneUniform,
    meanBrightness: brightness,
    asymmetryEstimate: null,
    skinConfidenceFactor: 1.0,
    usableSkinRatio: 1.0,
    confidence,
  }
}

// ─── Asymmetry Computation (internal) ───────────────────

function computeAsymmetry(left: RegionFeatures, right: RegionFeatures): number {
  const densityDiff = Math.abs(left.wrinkleDensity - right.wrinkleDensity)
  const roughnessDiff = Math.abs(left.textureRoughness - right.textureRoughness)
  const uniformityDiff = Math.abs(left.toneUniformity - right.toneUniformity)
  return Math.min(1, densityDiff * 0.5 + roughnessDiff * 0.3 + uniformityDiff * 0.2)
}

// ─── Main Entry Point ───────────────────────────────────

/**
 * Extract visual features for all usable regions, compute paired asymmetry,
 * and optionally apply skin confidence adjustments.
 */
export function extractAllRegionFeatures(
  source: HTMLCanvasElement | HTMLImageElement,
  landmarks: Landmark[],
  regions: ComputedRegion[],
  qualityGates: GlobalQualityGateSummary,
  skinConfidences?: RegionSkinConfidence[],
): Map<AnalysisRegionId, RegionFeatures> {
  const featureMap = new Map<AnalysisRegionId, RegionFeatures>()

  // Build a set of region IDs that passed quality gates
  const passedGates = new Set<AnalysisRegionId>()
  for (const gate of qualityGates.regionGates) {
    if (gate.proceed) passedGates.add(gate.regionId)
  }

  // First pass: extract features for each region that passed quality gates
  for (const region of regions) {
    if (!passedGates.has(region.definition.id)) continue

    const features = extractSingleRegion(source, landmarks, region)
    if (features) {
      featureMap.set(region.definition.id, features)
    }
  }

  // Second pass: compute asymmetry for paired regions
  for (const [leftId, rightId] of PAIRED_REGIONS) {
    const leftFeatures = featureMap.get(leftId)
    const rightFeatures = featureMap.get(rightId)

    if (leftFeatures && rightFeatures) {
      const asymmetry = computeAsymmetry(leftFeatures, rightFeatures)
      leftFeatures.asymmetryEstimate = asymmetry
      rightFeatures.asymmetryEstimate = asymmetry
    }
  }

  // Third pass: apply skin confidences if provided
  if (skinConfidences) {
    applySkinConfidence(featureMap, skinConfidences)
  }

  return featureMap
}

// ─── Skin Confidence Application ────────────────────────

/**
 * Update features in-place with skin confidence data.
 * Adjusts skinConfidenceFactor, usableSkinRatio, and multiplies
 * the feature confidence by skinConfidenceFactor.
 */
export function applySkinConfidence(
  featureMap: Map<AnalysisRegionId, RegionFeatures>,
  skinConfidences: RegionSkinConfidence[],
): void {
  for (const skinConf of skinConfidences) {
    const features = featureMap.get(skinConf.regionId)
    if (!features) continue

    features.skinConfidenceFactor = skinConf.averageSkinConfidence
    features.usableSkinRatio = skinConf.usableSkinRatio
    features.confidence *= skinConf.averageSkinConfidence
  }
}
