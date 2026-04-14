// Bambu reports `"00000000"` (all zeros, including alpha) when a tray
// has no known color. Any other value is a real color — including
// `"000000FF"` (opaque black) and `"FFFFFFFF"` (opaque white), which
// are valid filament colors we must render as-is.
export function swatchFill(hex: string | null | undefined): string | null {
  if (!hex || hex === "00000000") return null;
  return `#${hex.slice(0, 6)}`;
}

export function ColorSwatch({
  hex,
  size = 20,
}: {
  hex: string | null | undefined;
  size?: number;
}) {
  const background = swatchFill(hex);
  const radius = size >= 32 ? 6 : 4;
  if (background) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background,
          border: "1px solid #ddd",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: "1px dashed #cbd5e1",
        background:
          "repeating-linear-gradient(45deg, #f8fafc, #f8fafc 4px, #e2e8f0 4px, #e2e8f0 8px)",
        flexShrink: 0,
      }}
    />
  );
}
