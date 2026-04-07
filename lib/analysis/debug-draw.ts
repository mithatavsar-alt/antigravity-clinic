/**
 * Debug Draw Module
 *
 * Canvas debug overlay for development — visualizes face mask, regions,
 * scores, and skin confidence heatmap. All drawing is gated by DebugConfig
 * so production UI stays clean when debug is off.
 */

import { DEBUG_COLORS } from './constants'
import type {
  ComputedRegion,
  DebugConfig,
  FaceMaskResult,
  GlobalQualityGateSummary,
  Polygon,
  ScoreSummary,
  SkinConfidenceMap,
} from './types'

// Fallback for skinConfidenceMid since constants.ts may not define it
const SKIN_CONF_MID = 'rgba(200, 180, 0, 0.3)'

// ─── Internal Helpers ───────────────────────────────────

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Polygon,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  lineWidth = 1.5,
): void {
  const { vertices } = polygon
  if (vertices.length < 3) return

  ctx.beginPath()
  ctx.moveTo(vertices[0].x * w, vertices[0].y * h)
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x * w, vertices[i].y * h)
  }
  ctx.closePath()

  ctx.fillStyle = fill
  ctx.fill()

  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.font = '11px monospace'
  const metrics = ctx.measureText(text)
  const padding = 4
  const textHeight = 12

  ctx.fillStyle = DEBUG_COLORS.regionLabelBg
  ctx.fillRect(
    x - padding,
    y - textHeight - padding,
    metrics.width + padding * 2,
    textHeight + padding * 2,
  )

  ctx.fillStyle = DEBUG_COLORS.regionLabel
  ctx.fillText(text, x, y)
}

// ─── Exported Function ──────────────────────────────────

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  faceMask: FaceMaskResult,
  regions: ComputedRegion[],
  qualityGates: GlobalQualityGateSummary,
  scores: ScoreSummary | null,
  config: DebugConfig,
  skinConfidence?: SkinConfidenceMap | null,
): void {
  if (!config.enabled) return

  ctx.save()

  // 1. Face mask
  if (config.showFaceMask) {
    drawPolygon(
      ctx,
      faceMask.outerPolygon,
      w,
      h,
      DEBUG_COLORS.faceMask,
      DEBUG_COLORS.faceMaskBorder,
      2,
    )

    if (faceMask.foreheadExtension) {
      drawPolygon(
        ctx,
        faceMask.foreheadExtension,
        w,
        h,
        DEBUG_COLORS.foreheadExtension,
        DEBUG_COLORS.faceMaskBorder,
        1,
      )
    }
  }

  // 2. Exclusion zones
  if (config.showExclusionZones) {
    for (const exclusion of faceMask.exclusions) {
      drawPolygon(
        ctx,
        exclusion.polygon,
        w,
        h,
        DEBUG_COLORS.exclusionZone,
        DEBUG_COLORS.exclusionBorder,
        1.5,
      )
    }
  }

  // 3. Region polygons
  if (config.showRegionPolygons) {
    // Build a lookup from quality gates
    const gateMap = new Map(
      qualityGates.regionGates.map((g) => [g.regionId, g]),
    )

    for (const region of regions) {
      if (region.polygon.vertices.length < 3) continue

      const gate = gateMap.get(region.definition.id)
      const usable = gate?.proceed ?? region.usable

      if (!usable && !config.showSkippedRegions) continue

      const fill = usable
        ? DEBUG_COLORS.regionUsable
        : DEBUG_COLORS.regionSkipped
      const stroke = usable
        ? DEBUG_COLORS.regionUsableBorder
        : DEBUG_COLORS.regionSkippedBorder

      drawPolygon(ctx, region.polygon, w, h, fill, stroke, 1.5)

      // Region label at bbox center
      if (config.showRegionLabels) {
        const cx = (region.bbox.x + region.bbox.width / 2) * w
        const cy = (region.bbox.y + region.bbox.height / 2) * h

        // Find score for this region if available
        const regionScore = scores?.regionScores.find(
          (s) => s.regionId === region.definition.id,
        )
        const label = regionScore
          ? `${region.definition.label} (${regionScore.score})`
          : region.definition.label

        drawLabel(ctx, label, cx, cy)

        // Visibility reason below label
        if (config.showVisibilityReasons && !usable && gate?.skipReason) {
          drawLabel(ctx, gate.skipReason, cx, cy + 16)
        }
      }
    }
  }

  // 4. Skin confidence heatmap
  if (config.showSkinConfidenceHeatmap && skinConfidence) {
    const cellW = (skinConfidence.cellWidth / w) * w // cell dimensions in canvas pixels
    const cellH = (skinConfidence.cellHeight / h) * h
    // cellWidth/cellHeight are already in pixel space relative to the source image
    // Scale to canvas: assume normalized grid over image dimensions
    const scaleX = w / (skinConfidence.gridCols * skinConfidence.cellWidth || 1)
    const scaleY = h / (skinConfidence.gridRows * skinConfidence.cellHeight || 1)

    for (let r = 0; r < skinConfidence.gridRows; r++) {
      const row = skinConfidence.cells[r]
      if (!row) continue

      for (let c = 0; c < skinConfidence.gridCols; c++) {
        const cell = row[c]
        if (!cell) continue

        // Only draw cells that are notable (not good skin areas)
        if (cell.isLikelySkin && cell.confidence >= 0.7) continue

        let color: string
        if (cell.confidence > 0.7) {
          color = DEBUG_COLORS.skinConfidenceHigh
        } else if (cell.confidence >= 0.4) {
          color = SKIN_CONF_MID
        } else {
          color = DEBUG_COLORS.skinConfidenceLow
        }

        ctx.fillStyle = color
        ctx.fillRect(
          c * skinConfidence.cellWidth * scaleX,
          r * skinConfidence.cellHeight * scaleY,
          skinConfidence.cellWidth * scaleX,
          skinConfidence.cellHeight * scaleY,
        )
      }
    }
  }

  // 5. Raw metrics panel (top-right)
  if (config.showRawMetrics && scores) {
    const panelX = w - 200
    const panelY = 10
    const lineHeight = 16
    const padding = 8

    const lines: string[] = [
      `Overall: ${scores.overallScore} (${Math.round(scores.overallConfidence * 100)}%)`,
      `Regions: ${scores.usableRegionsCount}/${scores.usableRegionsCount + scores.skippedRegionsCount}`,
      '',
      ...scores.regionScores.map(
        (rs) => `${rs.label}: ${rs.score}`,
      ),
    ]

    const panelHeight = lines.length * lineHeight + padding * 2
    const panelWidth = 190

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight)

    ctx.font = '11px monospace'
    ctx.fillStyle = '#ffffff'

    lines.forEach((line, i) => {
      ctx.fillText(line, panelX + padding, panelY + padding + (i + 1) * lineHeight)
    })
  }

  // 6. Score contribution bars (bottom-left)
  if (config.showScoreContributions && scores) {
    const barX = 10
    const barMaxWidth = 160
    const barHeight = 14
    const barGap = 4
    const padding = 8

    const groups = scores.groupScores
    const panelHeight = groups.length * (barHeight + barGap) + padding * 2 + 16
    const panelY = h - panelHeight - 10

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(barX, panelY, barMaxWidth + padding * 2 + 60, panelHeight)

    ctx.font = '10px monospace'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Score Contributions', barX + padding, panelY + padding + 10)

    groups.forEach((group, i) => {
      const y = panelY + padding + 20 + i * (barHeight + barGap)
      const barW = (group.score / 100) * barMaxWidth

      // Bar background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.fillRect(barX + padding, y, barMaxWidth, barHeight)

      // Bar fill
      const hue = Math.round((group.score / 100) * 120) // 0=red, 120=green
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.8)`
      ctx.fillRect(barX + padding, y, barW, barHeight)

      // Label
      ctx.fillStyle = '#ffffff'
      ctx.fillText(
        `${group.label}: ${group.score}`,
        barX + padding + barMaxWidth + 4,
        y + barHeight - 2,
      )
    })
  }

  ctx.restore()
}
