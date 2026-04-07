/**
 * Face Region Segmentation — Region computation and lookup
 *
 * Computes 18 analysis regions from face mesh landmarks, clipped to
 * the face mask boundary. Each region carries visibility/usability
 * metadata for downstream quality gating.
 *
 * All coordinates are normalized 0-1.
 */

import type { Landmark } from '../ai/types'
import type {
  AnalysisRegionId,
  RegionGroup,
  ComputedRegion,
  FaceMaskResult,
  Polygon,
  RegionVisibility,
  RegionReasonCode,
} from './types'
import { REGION_DEFINITIONS, PAIRED_REGIONS } from './constants'
import {
  landmarksToPolygon,
  polygonBBox,
  polygonArea,
  pointInPolygon,
} from './face-mask'

// ─── Polygon Clipping ────────────────────────────────────

/**
 * Clip a polygon's vertices to those that fall inside the face mask.
 * This is a simple vertex-inclusion filter (not full Sutherland-Hodgman).
 * Sufficient for region boundary approximation.
 */
function clipPolygonToFaceMask(
  polygon: Polygon,
  faceMask: FaceMaskResult,
): Polygon {
  if (!faceMask.reliable) return polygon

  const clipped = polygon.vertices.filter((v) => {
    // Must be inside outer polygon or forehead extension
    let inside = pointInPolygon(v, faceMask.outerPolygon)
    if (!inside && faceMask.foreheadExtension) {
      inside = pointInPolygon(v, faceMask.foreheadExtension)
    }
    return inside
  })

  return { vertices: clipped }
}

// ─── Visibility Assessment ───────────────────────────────

function assessVisibility(
  polygon: Polygon,
  area: number,
  minArea: number,
  minConfidence: number,
  landmarkCount: number,
  totalIndices: number,
): RegionVisibility {
  const reasonCodes: RegionReasonCode[] = []

  // Check landmark coverage
  const landmarkRatio = totalIndices > 0 ? landmarkCount / totalIndices : 0

  if (landmarkRatio < 0.5) {
    reasonCodes.push('poor_landmarks')
  }

  if (area < minArea) {
    reasonCodes.push('insufficient_area')
  }

  // Determine confidence from landmark coverage
  const confidence = Math.min(1, landmarkRatio)

  if (confidence < minConfidence) {
    reasonCodes.push('low_confidence')
  }

  // Determine visibility status
  let status: RegionVisibility['status'] = 'visible'
  if (landmarkRatio < 0.5) {
    status = 'not_visible'
  } else if (landmarkRatio < 0.8 || reasonCodes.length > 0) {
    status = 'partially_visible'
  }

  // Determine usability
  const usable =
    reasonCodes.length === 0 &&
    polygon.vertices.length >= 3 &&
    area >= minArea &&
    confidence >= minConfidence

  return {
    status,
    usability: usable ? 'usable' : 'not_usable',
    confidence,
    reasonCodes,
  }
}

// ─── Main Region Computation ─────────────────────────────

/**
 * Compute all 18 analysis regions from landmarks, clipped to the face mask.
 *
 * - Enabled regions with valid landmarks get polygon/bbox/area computed
 * - Symmetry zone is virtual (no polygon extraction)
 * - Disabled regions get usable:false
 * - Regions with <3 clipped vertices or insufficient area get appropriate reason codes
 */
export function computeRegions(
  landmarks: Landmark[],
  faceMask: FaceMaskResult,
): ComputedRegion[] {
  const regions: ComputedRegion[] = []
  const faceBBox = faceMask.faceBBox
  const faceBBoxArea = faceBBox.width * faceBBox.height

  for (const definition of Object.values(REGION_DEFINITIONS)) {
    // Handle virtual regions (symmetry_zone)
    if (definition.id === 'symmetry_zone') {
      regions.push({
        definition,
        polygon: { vertices: [] },
        bbox: { x: 0, y: 0, width: 0, height: 0 },
        area: 0,
        usable: definition.enabled,
        visibility: {
          status: definition.enabled ? 'visible' : 'not_visible',
          usability: definition.enabled ? 'usable' : 'not_usable',
          confidence: definition.enabled ? 1 : 0,
          reasonCodes: [],
        },
      })
      continue
    }

    // Handle disabled regions
    if (!definition.enabled) {
      regions.push({
        definition,
        polygon: { vertices: [] },
        bbox: { x: 0, y: 0, width: 0, height: 0 },
        area: 0,
        usable: false,
        visibility: {
          status: 'not_visible',
          usability: 'not_usable',
          confidence: 0,
          reasonCodes: [],
        },
      })
      continue
    }

    // Extract polygon from landmarks
    const rawPolygon = landmarksToPolygon(landmarks, definition.landmarkIndices)

    if (!rawPolygon || rawPolygon.vertices.length < 3) {
      regions.push({
        definition,
        polygon: { vertices: [] },
        bbox: { x: 0, y: 0, width: 0, height: 0 },
        area: 0,
        usable: false,
        visibility: {
          status: 'not_visible',
          usability: 'not_usable',
          confidence: 0,
          reasonCodes: ['poor_landmarks'],
        },
      })
      continue
    }

    // Clip to face mask
    const clippedPolygon = clipPolygonToFaceMask(rawPolygon, faceMask)

    if (clippedPolygon.vertices.length < 3) {
      regions.push({
        definition,
        polygon: clippedPolygon,
        bbox: polygonBBox(rawPolygon),
        area: 0,
        usable: false,
        visibility: {
          status: 'not_visible',
          usability: 'not_usable',
          confidence: 0,
          reasonCodes: ['face_mask_excluded'],
        },
      })
      continue
    }

    // Compute area as fraction of face bbox
    const rawArea = polygonArea(clippedPolygon)
    const normalizedArea = faceBBoxArea > 0 ? rawArea / faceBBoxArea : 0

    const bbox = polygonBBox(clippedPolygon)

    // Assess visibility
    const visibility = assessVisibility(
      clippedPolygon,
      normalizedArea,
      definition.minAreaThreshold,
      definition.minConfidenceThreshold,
      clippedPolygon.vertices.length,
      definition.landmarkIndices.length,
    )

    regions.push({
      definition,
      polygon: clippedPolygon,
      bbox,
      area: normalizedArea,
      usable: visibility.usability === 'usable',
      visibility,
    })
  }

  return regions
}

// ─── Lookup Utilities ────────────────────────────────────

/**
 * Find a computed region by its ID.
 */
export function getRegion(
  regions: ComputedRegion[],
  id: AnalysisRegionId,
): ComputedRegion | undefined {
  return regions.find((r) => r.definition.id === id)
}

/**
 * Get the paired region ID for asymmetry comparison.
 * Returns undefined if the region has no pair.
 */
export function getPairedRegionId(
  id: AnalysisRegionId,
): AnalysisRegionId | undefined {
  for (const [left, right] of PAIRED_REGIONS) {
    if (id === left) return right
    if (id === right) return left
  }
  return undefined
}

/**
 * Filter regions by their group.
 */
export function getRegionsByGroup(
  regions: ComputedRegion[],
  group: RegionGroup,
): ComputedRegion[] {
  return regions.filter((r) => r.definition.group === group)
}
