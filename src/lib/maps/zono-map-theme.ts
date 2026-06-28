// ============================================================================
// ZONO — MapLibre vector style theme (client-safe).
// ----------------------------------------------------------------------------
// Turns ANY MapLibre vector style (MapTiler, Stadia, Protomaps, Carto, …) into a
// native ZONO intelligence map: dark, quiet, deep-purple, with purple accents
// only where useful. The base map is beautiful but SECONDARY — our properties,
// heatmaps, polygons and competitor layers (added on top by ZonoMap) visually
// dominate. No bright greens/yellows, no colourful POI icons, no tourist feel.
//
// `buildZonoVectorStyle(baseStyle)` is provider-agnostic: it matches layers
// defensively by `layer.type` + keywords in `layer.id` / `source-layer`, so it
// works even when providers name their layers differently. It NEVER touches our
// own `zono-*` layers (those are added after load) and keeps every source,
// sprite and glyphs intact — only paint/layout/visibility are rebranded.
// ============================================================================
import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

/** ZONO map palette — single source of truth for the branded base map. */
export const ZONO_MAP_THEME = {
  background: "#0E0A1F",
  surface: "#151027",
  water: "#17122E",
  land: "#0E0A1F",
  park: "#1A1730",
  roadMinor: "#2B2444",
  roadMajor: "#5B3DF5",
  roadMajorMuted: "#3B2A78",
  border: "#2A2240",
  labelPrimary: "#EDEBFF",
  labelSecondary: "#9B8FCC",
  heatLow: "rgba(125,92,255,0)",
  heatMid: "rgba(139,92,246,.55)",
  heatHigh: "rgba(34,211,238,.85)",
  marker: "#8B5CF6",
  cluster: "#A855F7",
} as const;

export type ZonoMapThemeName = "dark-purple";

// ── Defensive keyword matching ──────────────────────────────────────────────
const lc = (s: unknown): string => (typeof s === "string" ? s.toLowerCase() : "");
/** True if the layer id OR its source-layer contains any of the keywords. */
function idHas(layer: LayerSpecification, ...keywords: string[]): boolean {
  const hay = `${lc(layer.id)} ${lc((layer as { "source-layer"?: string })["source-layer"])}`;
  return keywords.some((k) => hay.includes(k));
}

// Symbol/icon layers that add noise → hidden entirely.
const HIDE_KEYWORDS = ["poi", "restaurant", "shop", "tourism", "airport", "aeroway", "ferry", "transit", "rail", "station", "amenity", "leisure-icon", "place-of-worship"];
// Place labels we KEEP (country/city/town/village/neighbourhood/street).
const KEEP_LABEL_KEYWORDS = ["country", "state", "city", "town", "village", "suburb", "neighbourhood", "neighborhood", "hamlet", "locality", "place", "street", "road", "highway", "motorway", "boundary", "admin"];

const isSymbol = (l: LayerSpecification): boolean => l.type === "symbol";
const hasIcon = (l: LayerSpecification): boolean => {
  const layout = (l as { layout?: Record<string, unknown> }).layout ?? {};
  return "icon-image" in layout;
};
const hasText = (l: LayerSpecification): boolean => {
  const layout = (l as { layout?: Record<string, unknown> }).layout ?? {};
  return "text-field" in layout;
};

function ensure<T extends "paint" | "layout">(layer: LayerSpecification, key: T): Record<string, unknown> {
  const obj = (layer as unknown as Record<string, Record<string, unknown> | undefined>)[key];
  if (obj) return obj;
  const created: Record<string, unknown> = {};
  (layer as unknown as Record<string, unknown>)[key] = created;
  return created;
}
const setPaint = (l: LayerSpecification, prop: string, value: unknown) => { ensure(l, "paint")[prop] = value; };
const setLayout = (l: LayerSpecification, prop: string, value: unknown) => { ensure(l, "layout")[prop] = value; };
const hide = (l: LayerSpecification) => setLayout(l, "visibility", "none");

/** Rebrand one layer in place. Returns false to drop it from the style. */
function brandLayer(layer: LayerSpecification): boolean {
  const T = ZONO_MAP_THEME;

  // ── Background / base canvas ──────────────────────────────────────────────
  if (layer.type === "background") { setPaint(layer, "background-color", T.background); return true; }

  // ── Water (deep purple/navy) ──────────────────────────────────────────────
  if (idHas(layer, "water", "ocean", "sea", "lake", "river", "waterway")) {
    if (layer.type === "fill") setPaint(layer, "fill-color", T.water);
    else if (layer.type === "line") { setPaint(layer, "line-color", T.water); setPaint(layer, "line-opacity", 0.6); }
    else if (isSymbol(layer)) { setPaint(layer, "text-color", T.labelSecondary); setPaint(layer, "text-halo-color", T.background); }
    return true;
  }

  // ── Parks / green / landcover (muted purple-grey, NEVER green) ────────────
  if (idHas(layer, "park", "grass", "wood", "forest", "green", "vegetation", "golf", "pitch", "cemetery", "garden")) {
    if (layer.type === "fill") { setPaint(layer, "fill-color", T.park); setPaint(layer, "fill-opacity", 0.6); }
    else if (layer.type === "line") setPaint(layer, "line-color", T.border);
    else if (isSymbol(layer)) return false; // drop park icons/labels noise
    return true;
  }

  // ── Land / landuse / landcover base ───────────────────────────────────────
  if (idHas(layer, "land", "earth", "background-pattern", "landuse", "landcover", "sand", "desert", "wetland", "glacier", "ice")) {
    if (layer.type === "fill") { setPaint(layer, "fill-color", T.land); setPaint(layer, "fill-opacity", 1); }
    return true;
  }

  // ── Buildings (dark purple, low contrast) ─────────────────────────────────
  if (idHas(layer, "building")) {
    if (layer.type === "fill") { setPaint(layer, "fill-color", T.surface); setPaint(layer, "fill-opacity", 0.55); setPaint(layer, "fill-outline-color", T.border); }
    else if (layer.type === "fill-extrusion") { setPaint(layer, "fill-extrusion-color", T.surface); setPaint(layer, "fill-extrusion-opacity", 0.5); }
    else if (isSymbol(layer)) return false;
    return true;
  }

  // ── Boundaries / admin lines ──────────────────────────────────────────────
  if (idHas(layer, "boundary", "admin", "border") && layer.type === "line") {
    setPaint(layer, "line-color", T.border); setPaint(layer, "line-opacity", 0.7);
    return true;
  }

  // ── Roads / streets / highways ────────────────────────────────────────────
  if (idHas(layer, "road", "street", "highway", "motorway", "trunk", "bridge", "tunnel", "path", "track")) {
    if (layer.type === "line") {
      const major = idHas(layer, "motorway", "trunk", "primary", "major", "highway");
      setPaint(layer, "line-color", major ? T.roadMajorMuted : T.roadMinor);
      return true;
    }
    if (isSymbol(layer)) {
      // Keep road/street name labels but dim them (reduce label brightness).
      setPaint(layer, "text-color", T.labelSecondary);
      setPaint(layer, "text-halo-color", T.background);
      setPaint(layer, "text-halo-width", 1);
      if (hasIcon(layer)) setLayout(layer, "icon-image", undefined as unknown as string);
      return true;
    }
    return true;
  }

  // ── Transit / airport / shop / poi etc. — drop the noise ──────────────────
  if (idHas(layer, ...HIDE_KEYWORDS)) { hide(layer); return true; }

  // ── Remaining SYMBOL layers ───────────────────────────────────────────────
  if (isSymbol(layer)) {
    const keep = idHas(layer, ...KEEP_LABEL_KEYWORDS);
    // A generic icon-only symbol with no useful place text → hide (POI-ish).
    if (!keep && hasIcon(layer) && !hasText(layer)) { hide(layer); return true; }
    if (!keep) { hide(layer); return true; } // unknown labels add noise → quiet them
    // Kept place label → subtle, premium.
    const primary = idHas(layer, "country", "state", "city", "capital", "admin");
    setPaint(layer, "text-color", primary ? T.labelPrimary : T.labelSecondary);
    setPaint(layer, "text-halo-color", T.background);
    setPaint(layer, "text-halo-width", 1.2);
    setPaint(layer, "text-halo-blur", 0.4);
    if (hasIcon(layer)) setLayout(layer, "icon-image", undefined as unknown as string); // drop place icons
    return true;
  }

  // ── Anything else (fills/lines we didn't recognise) → mute toward surface ──
  if (layer.type === "fill") setPaint(layer, "fill-color", T.surface);
  else if (layer.type === "line") setPaint(layer, "line-color", T.roadMinor);
  return true;
}

/**
 * Return a ZONO-branded clone of a loaded MapLibre vector style. Pure: the input
 * is never mutated; sources / sprite / glyphs are preserved so labels and icons
 * the provider ships still resolve. Only paint / layout / visibility change.
 */
export function buildZonoVectorStyle(baseStyle: StyleSpecification): StyleSpecification {
  const style: StyleSpecification = JSON.parse(JSON.stringify(baseStyle));
  const layers = Array.isArray(style.layers) ? style.layers : [];
  style.layers = layers.filter((layer) => brandLayer(layer));
  // Guarantee a dark base even if the provider shipped no background layer.
  if (!style.layers.some((l) => l.type === "background")) {
    style.layers.unshift({ id: "zono-base-bg", type: "background", paint: { "background-color": ZONO_MAP_THEME.background } });
  }
  return style;
}
