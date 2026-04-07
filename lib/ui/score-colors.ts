/**
 * Shared score → color mapping used across analysis UI components.
 * Green (balanced), Gold (improvable), Muted coral (needs attention).
 */

export function scoreColor(s: number): string {
  if (s >= 70) return '#3D7A5F'
  if (s >= 40) return '#C4A35A'
  return '#B26A63'
}
