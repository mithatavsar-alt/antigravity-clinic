import type {
  CaptureFrameMetrics,
  CaptureMetricSummary,
  CapturePoseSummary,
  CapturePoseVariance,
  CaptureViewKey,
} from '@/types/capture'
import type { Landmark } from './types'

export interface TemporalDetectionSample {
  frameId?: string
  timestamp: number
  landmarks: Landmark[]
  confidence: number
  metrics?: Pick<CaptureFrameMetrics, 'brightness' | 'sharpness' | 'stability' | 'centering' | 'pose'>
}

export interface TemporalViewAggregate {
  view: CaptureViewKey
  frameCount: number
  landmarks: Landmark[]
  confidence: number
  pose: CapturePoseSummary
  poseVariance: CapturePoseVariance
  landmarkJitter: number
  centeringDrift: number
  brightness: CaptureMetricSummary
  sharpness: CaptureMetricSummary
  stability: CaptureMetricSummary
  temporalConfidence: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function variance(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
}

function summarize(values: number[]): CaptureMetricSummary {
  if (values.length === 0) return { min: 0, median: 0, max: 0, variance: 0 }
  return {
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
    variance: variance(values),
  }
}

function aggregateLandmarks(samples: TemporalDetectionSample[]): Landmark[] {
  if (samples.length === 0) return []
  const minLength = Math.min(...samples.map(sample => sample.landmarks.length))
  const aggregated: Landmark[] = []
  for (let index = 0; index < minLength; index++) {
    aggregated.push({
      x: median(samples.map(sample => sample.landmarks[index]?.x ?? 0)),
      y: median(samples.map(sample => sample.landmarks[index]?.y ?? 0)),
      z: median(samples.map(sample => sample.landmarks[index]?.z ?? 0)),
    })
  }
  return aggregated
}

function averageKeypointDistance(a: Landmark[], b: Landmark[]): number {
  const KEYPOINTS = [10, 33, 61, 152, 234, 263, 291, 454]
  let total = 0
  let count = 0
  for (const index of KEYPOINTS) {
    const pa = a[index]
    const pb = b[index]
    if (!pa || !pb) continue
    total += Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2 + (pa.z - pb.z) ** 2)
    count += 1
  }
  return count > 0 ? total / count : 0
}

function computePoseSummary(samples: TemporalDetectionSample[]): CapturePoseSummary {
  return {
    yaw: median(samples.map(sample => sample.metrics?.pose?.yaw ?? 0)),
    pitch: median(samples.map(sample => sample.metrics?.pose?.pitch ?? 0)),
    roll: median(samples.map(sample => sample.metrics?.pose?.roll ?? 0)),
  }
}

function computePoseVariance(samples: TemporalDetectionSample[], pose: CapturePoseSummary): CapturePoseVariance {
  return {
    yaw: median(samples.map(sample => Math.abs((sample.metrics?.pose?.yaw ?? 0) - pose.yaw))),
    pitch: median(samples.map(sample => Math.abs((sample.metrics?.pose?.pitch ?? 0) - pose.pitch))),
    roll: median(samples.map(sample => Math.abs((sample.metrics?.pose?.roll ?? 0) - pose.roll))),
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function definedNumbers(values: Array<number | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

export function buildTemporalViewAggregate(
  view: CaptureViewKey,
  samples: TemporalDetectionSample[],
): TemporalViewAggregate | null {
  if (samples.length === 0) return null

  const landmarks = aggregateLandmarks(samples)
  if (landmarks.length < 100) return null

  const pose = computePoseSummary(samples)
  const poseVariance = computePoseVariance(samples, pose)
  const confidence = median(samples.map(sample => sample.confidence))
  const brightnessValues = definedNumbers(samples.map(sample => sample.metrics?.brightness))
  const sharpnessValues = definedNumbers(samples.map(sample => sample.metrics?.sharpness))
  const stabilityValues = definedNumbers(samples.map(sample => sample.metrics?.stability))
  const centeringValues = definedNumbers(samples.map(sample => sample.metrics?.centering))
  const brightness = summarize(brightnessValues)
  const sharpness = summarize(sharpnessValues)
  const stability = summarize(stabilityValues)
  const centeringMedian = centeringValues.length > 0 ? median(centeringValues) : 0
  const centeringDrift = centeringValues.length > 0
    ? median(centeringValues.map(value => Math.abs(value - centeringMedian)))
    : 0
  const landmarkJitter = median(samples.map(sample => averageKeypointDistance(sample.landmarks, landmarks)))

  const frameCoverage = clamp01(samples.length / (view === 'front' ? 8 : 6))
  const hasPoseMetrics = samples.some(sample => sample.metrics?.pose != null)
  const poseStability = hasPoseMetrics
    ? clamp01(1 - ((poseVariance.yaw / 18) + (poseVariance.pitch / 14) + (poseVariance.roll / 12)) / 3)
    : 0.55
  const clarity = sharpnessValues.length > 0 ? clamp01(sharpness.median) : 0.5
  const exposureStability = brightnessValues.length > 1 ? clamp01(1 - ((brightness.variance ?? 0) / 0.08)) : 0.5
  const jitterScore = clamp01(1 - landmarkJitter / 0.02)
  const centeringScore = centeringValues.length > 0 ? clamp01(1 - centeringDrift / 0.12) : 0.5
  const temporalConfidence = clamp01(
    frameCoverage * 0.30 +
    poseStability * 0.20 +
    clarity * 0.15 +
    exposureStability * 0.10 +
    jitterScore * 0.15 +
    centeringScore * 0.10,
  )

  return {
    view,
    frameCount: samples.length,
    landmarks,
    confidence,
    pose,
    poseVariance,
    landmarkJitter,
    centeringDrift,
    brightness,
    sharpness,
    stability,
    temporalConfidence,
  }
}
