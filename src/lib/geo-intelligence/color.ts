// ============================================================================
// 🗺️ Geo Intelligence — colour logic (pure). 32.4.
// Separated from the layer UI: given a value + a layer (+ the value domain across
// the visible areas) it returns a colour. normalizeValue → 0..1; getHeatColor
// interpolates the layer's colour ramp. Empty values → neutral (never coloured).
// ============================================================================
import type { GeoArea, GeoMetricKey, HeatLayer } from "./types";

export const NEUTRAL = "#E5E7EB";

/** Clamp a value into 0..1 across [min,max] (safe when min===max). */
export function normalizeValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0.5;
  const t = (value - min) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** Interpolate a colour ramp at t∈[0,1]. */
export function rampColor(ramp: string[], t: number): string {
  if (ramp.length === 0) return NEUTRAL;
  if (ramp.length === 1) return ramp[0];
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  if (i >= ramp.length - 1) return ramp[ramp.length - 1];
  const [r1, g1, b1] = hexToRgb(ramp[i]);
  const [r2, g2, b2] = hexToRgb(ramp[i + 1]);
  return `#${toHex(r1 + (r2 - r1) * f)}${toHex(g1 + (g2 - g1) * f)}${toHex(b1 + (b2 - b1) * f)}`;
}

export interface Domain { min: number; max: number }

/** min/max of a metric across areas (ignoring nulls). */
export function metricDomain(areas: GeoArea[], key: GeoMetricKey): Domain {
  let min = Infinity, max = -Infinity;
  for (const a of areas) {
    const v = a.metrics[key];
    if (v == null || !Number.isFinite(v)) continue;
    if (v < min) min = v; if (v > max) max = v;
  }
  if (min === Infinity) return { min: 0, max: 1 };
  return { min, max };
}

/** The colour for one area's value under a given layer + domain. */
export function getHeatColor(value: number | null, layer: HeatLayer, domain: Domain): string {
  if (value == null || !Number.isFinite(value)) return NEUTRAL;
  return rampColor(layer.colorScale, normalizeValue(value, domain.min, domain.max));
}

/** Which legend bucket (0..legend.length-1) a value falls into. */
export function legendBucket(value: number | null, layer: HeatLayer, domain: Domain): number {
  if (value == null) return -1;
  const t = normalizeValue(value, domain.min, domain.max);
  return Math.min(layer.legend.length - 1, Math.floor(t * layer.legend.length));
}

/** Human formatting per layer format. */
export function formatValue(value: number | null, format: HeatLayer["format"]): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const nf = (n: number) => n.toLocaleString("he-IL");
  switch (format) {
    case "shekel": return `₪${nf(Math.round(value))}`;
    case "shekel_sqm": return `₪${nf(Math.round(value))}/מ״ר`;
    case "count": return nf(Math.round(value));
    case "score": return `${Math.round(value)}/100`;
    case "percent": return `${Math.round(value)}%`;
    case "signed_percent": return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
    case "days": return `${Math.round(value)} ימים`;
    default: return nf(value);
  }
}
