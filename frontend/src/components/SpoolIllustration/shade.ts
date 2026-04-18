/**
 * Darken (amt < 0) or lighten (amt > 0) a hex color by |amt| ∈ [0, 1].
 *
 * Auto-flips direction when the base is already at an extreme: darkening a
 * near-black produces another near-black (invisible), so we lighten instead.
 * Same for lightening a near-white. This keeps winding lines and rim strokes
 * visible regardless of filament color.
 */
export function shade(hex: string, amt: number): string {
  const clean = hex.replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;

  const avg = (r + g + b) / 3;
  let effective = amt;
  if (amt < 0 && avg < 40) effective = -amt;
  else if (amt > 0 && avg > 215) effective = -amt;

  if (effective < 0) {
    r = Math.round(r * (1 + effective));
    g = Math.round(g * (1 + effective));
    b = Math.round(b * (1 + effective));
  } else {
    r = Math.round(r + (255 - r) * effective);
    g = Math.round(g + (255 - g) * effective);
    b = Math.round(b + (255 - b) * effective);
  }
  return `rgb(${r},${g},${b})`;
}

// Bambu reports "00000000" (all zeros incl. alpha) when no color is known —
// any other value, including "000000FF" (opaque black), is a real colour.
export function normalizeHex(hex: string | null | undefined, fallback = "#888888"): string {
  if (!hex || hex === "00000000") return fallback;
  const clean = hex.replace(/^#/, "").slice(0, 6);
  if (clean.length < 3) return fallback;
  return `#${clean}`;
}
