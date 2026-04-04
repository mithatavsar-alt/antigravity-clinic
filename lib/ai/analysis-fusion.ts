/**
 * Analysis Fusion Layer
 *
 * Combines internal (Human engine + wrinkle pipeline) and external
 * (PerfectCorp or other vendor) analysis results into a unified output.
 *
 * Design principles:
 * - System works fully without any external provider (internal-only mode)
 * - External results are supplementary evidence, not replacements
 * - Each source has per-metric confidence; fusion uses confidence-weighted merge
 * - Conflicting sources → reduced confidence, not averaged scores
 * - Provider-agnostic: any AnalysisProvider implementing the interface can plug in
 */

import type { WrinkleAnalysisResult, SkinTextureProfile } from './types'
import type { ExternalAnalysisResult } from '../external-analysis/types'
import { clamp } from './utils'

// ─── Types ──────────────────────────────────────────────────

export type AnalysisSource = 'internal' | 'external'

export interface SourceEvidence {
  source: AnalysisSource
  /** Provider name (e.g., 'human-engine', 'PerfectCorp') */
  provider: string
  /** Score 0–100 */
  score: number
  /** Confidence 0–1 */
  confidence: number
}

export interface FusedMetric {
  /** Metric key (e.g., 'wrinkle_overall', 'skin_texture', 'pore') */
  key: string
  /** Display label */
  label: string
  /** Fused score 0–100 */
  score: number
  /** Fused confidence 0–1 */
  confidence: number
  /** Whether sources agreed (delta ≤ 15 points) */
  sourcesAgree: boolean
  /** Individual source evidence */
  sources: SourceEvidence[]
  /** Strategy used for fusion */
  strategy: FusionStrategy
}

export type FusionStrategy =
  | 'internal_only'        // No external data available
  | 'external_only'        // No internal data for this metric
  | 'confidence_weighted'  // Both sources available, merged by confidence
  | 'conflict_reduced'     // Sources disagree significantly, confidence reduced

export interface FusionResult {
  metrics: FusedMetric[]
  /** Overall data quality: did we have multiple sources? */
  hasExternalData: boolean
  /** Which external provider was used (if any) */
  externalProvider: string | null
  /** Summary of fusion outcome */
  summary: string
}

// ─── Fusion Engine ──────────────────────────────────────────

/**
 * Fuse internal analysis results with optional external provider results.
 *
 * If `external` is null, all metrics use internal-only strategy.
 * The system is fully functional without external data.
 */
export function fuseAnalysisResults(
  internal: {
    wrinkles: WrinkleAnalysisResult | null
    skinTexture: SkinTextureProfile | null
    overallConfidence: number
  },
  external: ExternalAnalysisResult | null,
  externalProvider?: string,
): FusionResult {
  const metrics: FusedMetric[] = []
  const hasExternal = external !== null && external.success

  // ── Wrinkle overall score ──
  if (internal.wrinkles) {
    const internalEvidence: SourceEvidence = {
      source: 'internal',
      provider: 'human-engine',
      score: internal.wrinkles.overallScore,
      confidence: internal.overallConfidence,
    }

    if (hasExternal && external.skin.wrinkle != null) {
      const externalEvidence: SourceEvidence = {
        source: 'external',
        provider: externalProvider ?? 'external',
        score: external.skin.wrinkle,
        confidence: 0.8, // External API confidence (assumed high when available)
      }
      metrics.push(fuseMetric('wrinkle_overall', 'Kırışıklık Genel', internalEvidence, externalEvidence))
    } else {
      metrics.push({
        key: 'wrinkle_overall', label: 'Kırışıklık Genel',
        score: internalEvidence.score, confidence: internalEvidence.confidence,
        sourcesAgree: true, sources: [internalEvidence], strategy: 'internal_only',
      })
    }
  }

  // ── Skin texture ──
  if (internal.skinTexture) {
    const texScore = Math.round((1 - internal.skinTexture.roughness) * 100) // invert: low roughness = high texture score
    const internalEvidence: SourceEvidence = {
      source: 'internal', provider: 'human-engine',
      score: texScore, confidence: internal.skinTexture.confidence,
    }

    if (hasExternal && external.skin.texture != null) {
      const externalEvidence: SourceEvidence = {
        source: 'external', provider: externalProvider ?? 'external',
        score: external.skin.texture, confidence: 0.8,
      }
      metrics.push(fuseMetric('skin_texture', 'Cilt Dokusu', internalEvidence, externalEvidence))
    } else {
      metrics.push({
        key: 'skin_texture', label: 'Cilt Dokusu',
        score: texScore, confidence: internal.skinTexture.confidence,
        sourcesAgree: true, sources: [internalEvidence], strategy: 'internal_only',
      })
    }
  }

  // ── External-only metrics (pore, pigmentation, redness) ──
  // These are only available from external providers
  if (hasExternal) {
    const externalOnlyMetrics: Array<{ key: string; label: string; value: number | null }> = [
      { key: 'pore', label: 'Gözenek', value: external.skin.pore },
      { key: 'pigmentation', label: 'Pigmentasyon', value: external.skin.pigmentation },
      { key: 'redness', label: 'Kızarıklık', value: external.skin.redness },
    ]

    for (const m of externalOnlyMetrics) {
      if (m.value != null) {
        metrics.push({
          key: m.key, label: m.label,
          score: m.value, confidence: 0.75,
          sourcesAgree: true,
          sources: [{
            source: 'external', provider: externalProvider ?? 'external',
            score: m.value, confidence: 0.75,
          }],
          strategy: 'external_only',
        })
      }
    }
  }

  const summary = hasExternal
    ? `İç analiz ve ${externalProvider ?? 'harici kaynak'} verileri birleştirilmiştir.`
    : 'Yalnızca iç analiz verileri kullanılmıştır.'

  return {
    metrics,
    hasExternalData: hasExternal,
    externalProvider: hasExternal ? (externalProvider ?? null) : null,
    summary,
  }
}

// ─── Internal Helpers ──────────────────────────────────────

function fuseMetric(
  key: string,
  label: string,
  internal: SourceEvidence,
  external: SourceEvidence,
): FusedMetric {
  const delta = Math.abs(internal.score - external.score)
  const sourcesAgree = delta <= 15

  if (sourcesAgree) {
    // Confidence-weighted merge
    const totalConf = internal.confidence + external.confidence
    const fusedScore = totalConf > 0
      ? Math.round((internal.score * internal.confidence + external.score * external.confidence) / totalConf)
      : Math.round((internal.score + external.score) / 2)
    const fusedConf = clamp(Math.max(internal.confidence, external.confidence) * 1.1, 0, 1) // agreement bonus

    return {
      key, label, score: fusedScore, confidence: fusedConf,
      sourcesAgree: true, sources: [internal, external],
      strategy: 'confidence_weighted',
    }
  } else {
    // Sources conflict — reduce confidence, use weighted average
    const totalConf = internal.confidence + external.confidence
    const fusedScore = totalConf > 0
      ? Math.round((internal.score * internal.confidence + external.score * external.confidence) / totalConf)
      : Math.round((internal.score + external.score) / 2)
    const conflictPenalty = clamp(1 - (delta - 15) / 50, 0.5, 1)
    const fusedConf = clamp(Math.min(internal.confidence, external.confidence) * conflictPenalty, 0.1, 0.8)

    return {
      key, label, score: fusedScore, confidence: fusedConf,
      sourcesAgree: false, sources: [internal, external],
      strategy: 'conflict_reduced',
    }
  }
}
