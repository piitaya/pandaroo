// Traffic-light color for remaining filament percentage.
// Matches bambuddy thresholds: > 50 green, 15–50 amber, < 15 red.
export function spoolFillColor(pct: number): string {
  if (pct > 50) return "teal";
  if (pct >= 15) return "yellow";
  return "red";
}
