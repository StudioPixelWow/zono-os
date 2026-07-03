// ============================================================================
// ✅ Geo Intelligence — self-tests (pure, offline). 32.4.
// 14 layers well-formed / distinct ramps / colour logic / normalization /
// derivation from real cells / mock / insights / formatting / performance.
// ============================================================================
import { HEATMAP_LAYERS, LAYER_BY_ID, DEFAULT_LAYER_ID } from "./layers";
import { normalizeValue, getHeatColor, metricDomain, formatValue, rampColor, NEUTRAL, legendBucket } from "./color";
import { cellToArea, globalInsights, type MarketCellInput } from "./derive";
import { generateMockAreas } from "./mock";
import type { GeoArea } from "./types";

export interface GICheck { name: string; pass: boolean; detail: string }
export interface GISelfCheck { ok: boolean; total: number; passed: number; checks: GICheck[] }

const HEX = /^#[0-9a-fA-F]{6}$/;

const cell = (o: Partial<MarketCellInput> = {}): MarketCellInput => ({
  localityId: "L1", localityName: "נאות אפקה", demand: 88, supply: 38, opportunity: 95,
  avgPrice: 4820000, avgPricePerSqm: 42500, externalListings: 100, internalProperties: 26,
  priceDrops: 3, belowAverage: 4, activeBuyers: 40, matchedBuyers: 22, transactionScore: 70,
  competitionScore: 72, momentumScore: 84, reasons: ["ביקוש גבוה"], ...o,
});

export function runSelfCheck(): GISelfCheck {
  const checks: GICheck[] = [];
  const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

  // Exactly 14 well-formed layers.
  add("exactly 14 heat layers", HEATMAP_LAYERS.length === 14, `${HEATMAP_LAYERS.length}`);
  add("each layer has id/label/icon/description/metricKey/legend/colorScale", HEATMAP_LAYERS.every((l) => l.id && l.label && l.icon && l.description && l.metricKey && l.legend.length >= 3 && l.colorScale.length >= 2));
  add("layer ids unique", new Set(HEATMAP_LAYERS.map((l) => l.id)).size === 14);
  add("all colorScale entries are valid hex", HEATMAP_LAYERS.every((l) => l.colorScale.every((c) => HEX.test(c))));
  // Not "one colour": layers use several distinct ramps.
  add("layers use multiple distinct colour ramps", new Set(HEATMAP_LAYERS.map((l) => l.colorScale.join(","))).size >= 8);
  add("default + lookup", LAYER_BY_ID[DEFAULT_LAYER_ID]?.id === DEFAULT_LAYER_ID);

  // Normalization.
  add("normalizeValue clamps 0..1", normalizeValue(50, 0, 100) === 0.5 && normalizeValue(-5, 0, 100) === 0 && normalizeValue(200, 0, 100) === 1);
  add("normalizeValue safe when min===max", normalizeValue(5, 5, 5) === 0.5);
  add("ramp endpoints", rampColor(["#000000", "#ffffff"], 0) === "#000000" && rampColor(["#000000", "#ffffff"], 1) === "#ffffff");
  add("ramp midpoint interpolates", rampColor(["#000000", "#ffffff"], 0.5) !== "#000000" && HEX.test(rampColor(["#000000", "#ffffff"], 0.5)));

  // Derivation from a real cell → all metrics present + derived flag.
  const a = cellToArea(cell());
  add("cellToArea populates all 14 metrics", Object.values(a.metrics).every((v) => v !== undefined) && a.metrics.activeListings === 126);
  add("derived DOM / growth / adRoi in range", a.metrics.daysOnMarket >= 18 && a.metrics.daysOnMarket <= 140 && Math.abs(a.metrics.priceGrowthPct) <= 12 && a.metrics.adRoiScore >= 0 && a.metrics.adRoiScore <= 100);
  add("recruitment uses real opportunity", a.metrics.recruitmentScore === 95);
  add("area carries AI recommendation", a.aiRecommendation.length > 0 && a.derived === true);

  // Colour logic across a set.
  const areas: GeoArea[] = [cell(), cell({ localityName: "לב העיר", avgPrice: 3650000, demand: 60, supply: 68, opportunity: 55, competitionScore: 40, momentumScore: 48, priceDrops: 9 }), cell({ localityName: "פלורנטין", avgPrice: 2650000, demand: 92, supply: 55, opportunity: 88, momentumScore: 70 })].map(cellToArea);
  const layer = LAYER_BY_ID.avg_price;
  const dom = metricDomain(areas, "avgPrice");
  add("metricDomain min/max", dom.min === 2650000 && dom.max === 4820000);
  add("getHeatColor returns hex for value", HEX.test(getHeatColor(areas[0].metrics.avgPrice, layer, dom)));
  add("getHeatColor neutral for null", getHeatColor(null, layer, dom) === NEUTRAL);
  add("different values → different colours", getHeatColor(dom.min, layer, dom) !== getHeatColor(dom.max, layer, dom));
  add("legendBucket within range", (() => { const b = legendBucket(dom.max, layer, dom); return b >= 0 && b < layer.legend.length; })());

  // Formatting.
  add("format shekel/sqm/score/percent/signed/days/count", formatValue(4820000, "shekel").includes("₪") && formatValue(42500, "shekel_sqm").includes("מ״ר") && formatValue(95, "score") === "95/100" && formatValue(72, "percent") === "72%" && formatValue(8.3, "signed_percent") === "+8.3%" && formatValue(54, "days") === "54 ימים" && formatValue(126, "count") === "126");

  // Insights.
  const ins = globalInsights(areas);
  add("globalInsights produced + reference layers", ins.length >= 3 && ins.every((x) => x.title.length > 0));

  // Mock.
  const mock = generateMockAreas();
  add("mock areas generated + flagged", mock.length >= 10 && mock.every((m) => m.mock === true) && mock.some((m) => m.level === "street"));
  add("mock covers multiple cities + property types", new Set(mock.map((m) => m.city)).size >= 3 && new Set(mock.flatMap((m) => m.propertyTypes)).size >= 3);
  add("mock every layer metric resolvable", HEATMAP_LAYERS.every((l) => mock.every((m) => m.metrics[l.metricKey] != null)));

  // Every layer colours every area with a valid colour (no crash, no 'one colour').
  const allAreas = [...areas, ...mock];
  let allColored = true; const perLayerColours = new Set<string>();
  for (const l of HEATMAP_LAYERS) {
    const d = metricDomain(allAreas, l.metricKey);
    for (const ar of allAreas) { const col = getHeatColor(ar.metrics[l.metricKey], l, d); if (!(HEX.test(col) || col === NEUTRAL)) allColored = false; perLayerColours.add(l.id + col); }
  }
  add("every layer colours every area validly", allColored);
  add("colours vary across areas (not one colour)", perLayerColours.size > HEATMAP_LAYERS.length);

  // Performance on a large set.
  const t0 = Date.now();
  const big: GeoArea[] = Array.from({ length: 600 }, (_, i) => cellToArea(cell({ localityId: `L${i}`, localityName: `אזור ${i}`, avgPrice: 2_000_000 + i * 5000, demand: i % 100 })));
  for (const l of HEATMAP_LAYERS) { const d = metricDomain(big, l.metricKey); for (const ar of big) getHeatColor(ar.metrics[l.metricKey], l, d); }
  globalInsights(big);
  add("large set (600 areas × 14 layers) < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
