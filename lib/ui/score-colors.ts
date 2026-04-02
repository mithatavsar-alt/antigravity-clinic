/**
 * Shared score → color mapping used across analysis UI components.
 * Green (balanced), Gold (improvable), Muted coral (needs attention).
 */

export function scoreColor(s: number): string {
  if (s >= 70) return '#4AE3A7'
  if (s >= 40) return '#D6B98C'
  return '#C47A7A'
}
