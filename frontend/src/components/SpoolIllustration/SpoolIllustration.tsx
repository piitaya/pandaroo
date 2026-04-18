import { useId, useMemo } from "react";
import { normalizeHex, shade } from "./shade";
import classes from "./SpoolIllustration.module.css";

export interface SpoolIllustrationProps {
  hex: string | null | undefined;
  /** Remaining percent, 0–100. `null` renders an empty spool. */
  remain: number | null;
  size?: number;
}

const CX = 100;
const CY = 100;
const R_OUT = 92;
const R_BORE = 22;
const R_HUB = 28;
const R_COIL_MIN = R_HUB + 3;
const R_COIL_MAX = 72;

interface Dot {
  x: number;
  y: number;
  r: number;
}

// Halftone perforation pattern — dots on a square grid, size peaks around 40%
// of the flange radius. Static (no remain dependency); the coil is drawn on
// top so dots it covers are naturally hidden and dots at the coil edge appear
// clipped by the coil outline.
const PERFORATIONS: ReadonlyArray<Dot> = (() => {
  const result: Dot[] = [];
  const gridStep = 4.6;
  const spanR = R_OUT - R_HUB;
  const peak = 0.4;
  const width = 0.34;
  const innerBound = R_HUB + 3;
  const outerBound = R_OUT - 6;
  const half = gridStep / 2;
  for (let gy = -outerBound; gy <= outerBound; gy += gridStep) {
    for (let gx = -outerBound; gx <= outerBound; gx += gridStep) {
      const dx = gx + half;
      const dy = gy + half;
      const dist = Math.hypot(dx, dy);
      if (dist < innerBound || dist > outerBound) continue;
      const tau = (dist - R_HUB) / spanR;
      const gauss = Math.exp(-(((tau - peak) / width) ** 2));
      const dotR = 0.4 + 1.2 * gauss;
      if (dotR < 0.3) continue;
      result.push({ x: CX + dx, y: CY + dy, r: dotR });
    }
  }
  return result;
})();

const NOTCHES: ReadonlyArray<{ x: number; y: number }> = (() => {
  const result: { x: number; y: number }[] = [];
  const count = 6;
  const ring = R_OUT - 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / 6;
    result.push({ x: CX + Math.cos(a) * ring, y: CY + Math.sin(a) * ring });
  }
  return result;
})();

/**
 * Back-half view of a Bambu-style refillable spool. Front flange omitted so
 * the wound filament is visible; back flange rendered as a halftone-perforated
 * disc. Filament is a colored donut — hub drawn on top hides its centre.
 */
export function SpoolIllustration({ hex, remain, size = 180 }: SpoolIllustrationProps) {
  const uid = useId().replace(/:/g, "");
  const base = normalizeHex(hex);
  const pct = remain == null ? 0 : Math.max(0, Math.min(100, remain)) / 100;
  const rCoil = R_COIL_MIN + (R_COIL_MAX - R_COIL_MIN) * pct;

  const windings = useMemo(() => {
    const ringStep = 2.5;
    const result: number[] = [];
    for (let r = R_COIL_MIN + ringStep; r < rCoil; r += ringStep) {
      result.push(r);
    }
    return result;
  }, [rCoil]);

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={classes.spool}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`coil-${uid}`} cx="42%" cy="40%" r="72%">
          <stop offset="0%" stopColor={shade(base, 0.18)} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={shade(base, -0.18)} />
        </radialGradient>
      </defs>

      <ellipse
        cx={CX}
        cy={CY + R_OUT + 6}
        rx={R_OUT * 0.82}
        ry="5"
        className={classes.shadow}
      />

      <circle cx={CX} cy={CY} r={R_OUT} className={classes.flange} />

      <circle cx={CX} cy={CY} r={R_OUT} className={classes.rim} />
      <circle cx={CX} cy={CY} r={R_OUT - 1.5} className={classes.rimHighlight} />

      {PERFORATIONS.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          className={classes.perforation}
        />
      ))}

      {NOTCHES.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={n.x}
          cy={n.y}
          r={1.4}
          className={classes.notch}
        />
      ))}

      {pct > 0 && (
        <>
          <circle cx={CX} cy={CY} r={rCoil} fill={`url(#coil-${uid})`} />
          {windings.map((r, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke={shade(base, i % 2 === 0 ? -0.26 : -0.1)}
              strokeOpacity={0.45}
              strokeWidth={0.8}
            />
          ))}
          <circle
            cx={CX}
            cy={CY}
            r={rCoil}
            fill="none"
            stroke={shade(base, -0.35)}
            strokeOpacity={0.55}
            strokeWidth={0.8}
          />
        </>
      )}

      <circle cx={CX} cy={CY} r={R_HUB} className={classes.hubFill} />
      <circle cx={CX} cy={CY} r={R_HUB} className={classes.hubStroke} />
      <circle cx={CX} cy={CY} r={R_BORE} className={classes.bore} />
      <circle cx={CX} cy={CY} r={R_BORE} className={classes.boreEdge} />
    </svg>
  );
}
