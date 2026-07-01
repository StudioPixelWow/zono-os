// ============================================================================
// 🏅 Comparable Quality Score + match reasons (pure). Phase 27.4 · Part 8/10.
// ----------------------------------------------------------------------------
// A 0..100 quality score for the SELECTED comparable set (distance, similarity,
// source quality, attribute completeness, traceability). Honest: a low score is
// surfaced as "ההשוואות חלשות יחסית" rather than pretending. Also builds the
// per-comparable "why" reasons. Deterministic. No DB, no AI, no formula change.
// ============================================================================
import type { Candidate, ComparableQuality, DiscoverySourceId, DiscoverySubject, QualityBand } from "./types";

const SOURCE_QUALITY: Record<DiscoverySourceId, number> = {
  property_transactions: 100, broker_sold: 95, properties: 70, external_listings: 55, market_property_sources: 40,
};

const clampAvg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** How many of the appraiser-relevant attributes a candidate carries (0..1). */
function attributeCompleteness(c: Candidate): number {
  const present = [c.rooms != null, c.sqm != null, c.floor != null, c.propertyType != null, c.buildingYear != null, c.price != null, c.pricePerSqm != null];
  return present.filter(Boolean).length / present.length;
}

export function computeQuality(selected: Candidate[]): ComparableQuality {
  if (selected.length === 0) {
    return { score: 0, band: "weak", weak: true, label: "אין השוואות שמישות", factors: { distance: 0, similarity: 0, sourceQuality: 0, attributeCompleteness: 0, traceability: 0 } };
  }
  const similarity = Math.round(clampAvg(selected.map((c) => c.similarityScore)));
  const distances = selected.map((c) => c.distanceMeters).filter((d): d is number => d != null);
  const avgDist = distances.length ? clampAvg(distances) : null;
  const distance = avgDist == null ? 60 : Math.max(20, Math.min(100, Math.round(100 - avgDist / 45)));
  const sourceQuality = Math.round(clampAvg(selected.map((c) => SOURCE_QUALITY[c.source])));
  const attributeCompletenessPct = Math.round(clampAvg(selected.map(attributeCompleteness)) * 100);
  const traceability = Math.round((selected.filter((c) => c.isTraceable).length / selected.length) * 100);

  // Weighted blend + a small penalty when the set is very small.
  const sizePenalty = selected.length >= 5 ? 0 : (5 - selected.length) * 3;
  const raw = 0.28 * similarity + 0.26 * distance + 0.22 * sourceQuality + 0.14 * attributeCompletenessPct + 0.10 * traceability - sizePenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const band: QualityBand = score >= 70 ? "strong" : score >= 55 ? "moderate" : "weak";
  const label = band === "strong" ? "השוואות איכותיות" : band === "moderate" ? "השוואות סבירות" : "ההשוואות חלשות יחסית";
  return { score, band, weak: band === "weak", label, factors: { distance, similarity, sourceQuality, attributeCompleteness: attributeCompletenessPct, traceability } };
}

/** Per-comparable "why selected" reasons (Part 8). */
export function buildMatchReasons(subj: DiscoverySubject, c: Candidate, extra: { sameBuilding: boolean; sameNeighborhood: boolean; sameConstructionPeriod: boolean }): string[] {
  const r: string[] = [];
  if (c.distanceMeters != null) r.push(`✓ ${c.distanceMeters} מ׳ מהנכס`);
  if (extra.sameBuilding) r.push("✓ אותו בניין/מתחם");
  else if (c.street && subj.streetNormalized && c.matchLevel !== "out" && c.street) r.push(c.street === subj.street ? "✓ אותו רחוב" : "");
  if (extra.sameNeighborhood) r.push("✓ אותה שכונה");
  if (c.sameType && c.propertyType) r.push(`✓ אותו סוג נכס (${c.propertyType})`);
  if (subj.rooms != null && c.rooms != null && Math.abs(subj.rooms - c.rooms) < 0.5) r.push("✓ אותו מספר חדרים");
  if (subj.sqm != null && c.sqm != null && subj.sqm > 0 && Math.abs(subj.sqm - c.sqm) / subj.sqm <= 0.1) r.push("✓ שטח דומה");
  if (subj.floor != null && c.floor != null && Math.abs(subj.floor - c.floor) <= 1) r.push("✓ קומה דומה");
  if (extra.sameConstructionPeriod) r.push("✓ תקופת בנייה דומה");
  if (c.comparableType === "sold") r.push("✓ עסקה סגורה");
  return r.filter(Boolean);
}
