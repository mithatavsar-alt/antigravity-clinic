/**
 * View Role Definitions — Which view is authoritative for each region.
 *
 * PRINCIPLE: Each region has a primary view and optional supporting views.
 * Front view should NOT dominate profile-related findings.
 * Side views should NOT dominate frontal/symmetry findings.
 *
 * Authority levels:
 * - primary: This view is the best source for this region (weight 1.0)
 * - supporting: This view can corroborate but not dominate (weight 0.4)
 * - minimal: This view has very limited visibility (weight 0.15)
 * - none: This view cannot see this region (weight 0)
 */

import type { CaptureView, ReliabilityRegion } from './types'

export type ViewAuthority = 'primary' | 'supporting' | 'minimal' | 'none'

export const VIEW_AUTHORITY_WEIGHT: Record<ViewAuthority, number> = {
  primary: 1.0,
  supporting: 0.4,
  minimal: 0.15,
  none: 0,
}

/** For each region, define the authority of each view */
export interface RegionViewRole {
  region: ReliabilityRegion
  front: ViewAuthority
  left: ViewAuthority
  right: ViewAuthority
}

/**
 * View role assignments.
 *
 * These encode the physical reality of what each camera angle can see.
 * Front: symmetry, forehead center, glabella, frontal lip/chin, overall balance.
 * Left: left profile contour, left jawline, left nasolabial depth, left crow's feet.
 * Right: right profile contour, right jawline, right nasolabial depth, right crow's feet.
 */
export const VIEW_ROLES: RegionViewRole[] = [
  // ── Frontal-dominant regions ──
  { region: 'forehead',         front: 'primary',    left: 'supporting', right: 'supporting' },
  { region: 'glabella',         front: 'primary',    left: 'minimal',    right: 'minimal' },
  { region: 'lips',             front: 'primary',    left: 'supporting', right: 'supporting' },
  { region: 'chin',             front: 'primary',    left: 'supporting', right: 'supporting' },

  // ── Left-side dominant regions ──
  { region: 'periocular_left',  front: 'supporting', left: 'primary',    right: 'none' },
  { region: 'under_eye_left',   front: 'supporting', left: 'primary',    right: 'none' },
  { region: 'cheek_left',       front: 'supporting', left: 'primary',    right: 'none' },
  { region: 'nasolabial_left',  front: 'supporting', left: 'primary',    right: 'none' },
  { region: 'jawline_left',     front: 'minimal',    left: 'primary',    right: 'none' },
  { region: 'profile_left',     front: 'none',       left: 'primary',    right: 'none' },

  // ── Right-side dominant regions ──
  { region: 'periocular_right', front: 'supporting', left: 'none',       right: 'primary' },
  { region: 'under_eye_right',  front: 'supporting', left: 'none',       right: 'primary' },
  { region: 'cheek_right',      front: 'supporting', left: 'none',       right: 'primary' },
  { region: 'nasolabial_right', front: 'supporting', left: 'none',       right: 'primary' },
  { region: 'jawline_right',    front: 'minimal',    left: 'none',       right: 'primary' },
  { region: 'profile_right',    front: 'none',       left: 'none',       right: 'primary' },
]

/** Get the authority of a specific view for a specific region */
export function getViewAuthority(region: ReliabilityRegion, view: CaptureView): ViewAuthority {
  const role = VIEW_ROLES.find(r => r.region === region)
  if (!role) return 'none'
  return role[view]
}

/** Get the weight of a specific view for a specific region */
export function getViewWeight(region: ReliabilityRegion, view: CaptureView): number {
  return VIEW_AUTHORITY_WEIGHT[getViewAuthority(region, view)]
}

/** Get which views are primary for a region */
export function getPrimaryViews(region: ReliabilityRegion): CaptureView[] {
  const role = VIEW_ROLES.find(r => r.region === region)
  if (!role) return []
  const views: CaptureView[] = []
  if (role.front === 'primary') views.push('front')
  if (role.left === 'primary') views.push('left')
  if (role.right === 'primary') views.push('right')
  return views
}

/** Check if a region is profile-dependent (needs side views for strong claims) */
export function isProfileDependent(region: ReliabilityRegion): boolean {
  const role = VIEW_ROLES.find(r => r.region === region)
  if (!role) return false
  return role.front === 'none' || role.front === 'minimal'
}

/** Check if a region is frontal-dominant (front view is authoritative) */
export function isFrontalDominant(region: ReliabilityRegion): boolean {
  const role = VIEW_ROLES.find(r => r.region === region)
  if (!role) return false
  return role.front === 'primary'
}

/**
 * Map wrinkle region keys to reliability region keys.
 * Wrinkle analysis uses combined bilateral names; reliability tracks sides separately.
 */
export const WRINKLE_TO_RELIABILITY: Record<string, ReliabilityRegion[]> = {
  forehead: ['forehead'],
  glabella: ['glabella'],
  crow_feet_left: ['periocular_left'],
  crow_feet_right: ['periocular_right'],
  under_eye_left: ['under_eye_left'],
  under_eye_right: ['under_eye_right'],
  nasolabial_left: ['nasolabial_left'],
  nasolabial_right: ['nasolabial_right'],
  marionette_left: ['nasolabial_left'],
  marionette_right: ['nasolabial_right'],
  cheek_left: ['cheek_left'],
  cheek_right: ['cheek_right'],
  jawline: ['jawline_left', 'jawline_right'],
}

/** Map focus area region keys to reliability regions */
export const FOCUS_TO_RELIABILITY: Record<string, ReliabilityRegion[]> = {
  forehead_glabella: ['forehead', 'glabella'],
  crow_feet: ['periocular_left', 'periocular_right'],
  under_eye: ['under_eye_left', 'under_eye_right'],
  mid_face: ['cheek_left', 'cheek_right'],
  nasolabial: ['nasolabial_left', 'nasolabial_right'],
  lip_chin_jawline: ['lips', 'chin', 'jawline_left', 'jawline_right'],
  nose: ['forehead'], // nose uses frontal primarily
}
