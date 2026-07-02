// ============================================================================
// ✅ Truth Engine — self-tests (pure, offline). Phase 27.7. Part 9.
// Scenarios: conflicting office, old broker, fresh listing, duplicate property,
// strong / weak / mixed evidence — plus data-health aggregation and the Chief-
// of-Staff executive-trust adjustment.
// ============================================================================
import { computeTruthScore } from "./truth-score";
import { buildEvidenceGraph } from "./evidence-graph";
import { detectContradictions } from "./contradiction";
import { freshnessLevel } from "./freshness";
import { computeDataHealth, buildExecutiveTrust } from "./data-health";
import type { EvidenceItem, TruthInput } from "./types";

export interface TECheck { name: string; pass: boolean; detail: string }
export interface TESelfCheck { ok: boolean; total: number; passed: number; checks: TECheck[] }

const NOW = Date.UTC(2026, 6, 2);
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const ev = (source: string, sourceType: string, daysAgo: number, stance: EvidenceItem["stance"] = "support"): EvidenceItem =>
  ({ source, sourceType, at: iso(daysAgo), stance });

const mk = (over: Partial<TruthInput>): TruthInput => ({ entityType: "office", entityId: "e1", evidence: [], now: NOW, ...over });

export function runSelfCheck(): TESelfCheck {
  const checks: TECheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // ── Strong evidence: many diverse, fresh, supporting sources ────────────────
  const strong = computeTruthScore(mk({
    evidence: [ev("yad2", "listing_portal", 3), ev("madlan", "listing_portal", 5), ev("gov", "government", 6), ev("website", "official_site", 4)],
    requiredFields: ["phone", "city", "brand"], presentFields: ["phone", "city", "brand"], baseConfidence: 80,
  }));
  add("strong → high truth", strong.truthScore >= 70, `${strong.truthScore}`);
  add("strong → verified/corroborated", strong.verificationLevel === "verified" || strong.verificationLevel === "corroborated", strong.verificationLevel);
  add("strong → fresh", strong.freshnessLevel === "fresh", strong.freshnessLevel);
  add("confidence never exceeds truth", strong.confidence <= strong.truthScore, `${strong.confidence}/${strong.truthScore}`);

  // ── Weak evidence: single stale source, missing fields ─────────────────────
  const weak = computeTruthScore(mk({
    evidence: [ev("yad2", "listing_portal", 75)],
    requiredFields: ["phone", "city", "brand"], presentFields: ["city"],
  }));
  add("weak → low truth", weak.truthScore < 55, `${weak.truthScore}`);
  add("weak → single_source", weak.verificationLevel === "single_source", weak.verificationLevel);
  add("weak → missing info listed", weak.missingInfo.includes("phone") && weak.missingInfo.includes("brand"), weak.missingInfo.join(","));
  add("weak < strong", weak.truthScore < strong.truthScore, `${weak.truthScore} < ${strong.truthScore}`);

  // ── No evidence: confidence must be 0 (no fabrication) ──────────────────────
  const none = computeTruthScore(mk({ evidence: [] }));
  add("no evidence → confidence 0", none.confidence === 0, `${none.confidence}`);
  add("no evidence → unverified", none.verificationLevel === "unverified", none.verificationLevel);

  // ── Conflicting office: two phones + two office names ───────────────────────
  const conflicting = computeTruthScore(mk({
    entityType: "office",
    evidence: [ev("yad2", "listing_portal", 4), ev("madlan", "listing_portal", 5)],
    contradictionSignals: { phones: ["03-1111111", "03-2222222"], offices: ["רי/מקס פסגה", "רי/מקס מרכז"] },
    baseConfidence: 70,
  }));
  add("conflicting → contradictions found", conflicting.contradictions >= 2, `${conflicting.contradictions}`);
  add("conflicting → phone contradiction", conflicting.contradictionDetail.some((c) => c.field === "phone" && c.severity === "high"), "");
  add("conflicting lowers truth vs clean", conflicting.truthScore < strong.truthScore, `${conflicting.truthScore}`);

  // ── Old broker: fresh-less evidence → expired + outdated contradiction ──────
  const oldBroker = computeTruthScore(mk({
    entityType: "broker", evidence: [ev("yad2", "listing_portal", 200), ev("website", "official_site", 220)], baseConfidence: 60,
  }));
  add("old broker → expired", oldBroker.freshnessLevel === "expired", oldBroker.freshnessLevel);
  add("old broker → outdated contradiction", oldBroker.contradictionDetail.some((c) => c.field === "outdated"), "");
  add("old broker low freshness", oldBroker.freshness <= 40, `${oldBroker.freshness}`);

  // ── Fresh listing: single very recent source ───────────────────────────────
  const freshListing = computeTruthScore(mk({ entityType: "listing", evidence: [ev("yad2", "listing_portal", 1)] }));
  add("fresh listing → fresh level", freshListing.freshnessLevel === "fresh", freshListing.freshnessLevel);
  add("fresh listing freshness 100", freshListing.freshness === 100, `${freshListing.freshness}`);

  // ── Duplicate property: same source repeated → low diversity ────────────────
  const dup = computeTruthScore(mk({
    entityType: "property",
    evidence: [ev("yad2", "listing_portal", 3), ev("yad2", "listing_portal", 3), ev("yad2", "listing_portal", 4)],
  }));
  add("duplicate → diversity 1", dup.evidenceDiversity === 1, `${dup.evidenceDiversity}`);
  add("duplicate → not verified", dup.verificationLevel !== "verified", dup.verificationLevel);
  add("diverse beats duplicate", strong.truthScore > dup.truthScore, `${strong.truthScore} > ${dup.truthScore}`);

  // ── Mixed evidence: support + contradict stances ───────────────────────────
  const mixedGraph = buildEvidenceGraph([ev("a", "portal", 3, "support"), ev("b", "gov", 4, "support"), ev("c", "social", 5, "contradict")]);
  add("mixed graph counts stances", mixedGraph.supporting === 2 && mixedGraph.contradicting === 1, `${mixedGraph.supporting}/${mixedGraph.contradicting}`);
  const mixed = computeTruthScore(mk({ evidence: [ev("a", "portal", 3, "support"), ev("b", "gov", 4, "support"), ev("c", "social", 5, "contradict")] }));
  add("mixed → source contradiction", mixed.contradictionDetail.some((c) => c.field === "source"), "");

  // ── Direct engine checks ───────────────────────────────────────────────────
  add("freshnessLevel unknown on null", freshnessLevel(null, NOW) === "unknown", "");
  add("valuation contradiction on spread", detectContradictions({ valuations: [1000000, 1400000] }).some((c) => c.field === "valuation"), "");
  add("no contradiction on agreeing values", detectContradictions({ phones: ["03-1", "03-1"] }).length === 0, "");

  // ── Explainability ─────────────────────────────────────────────────────────
  add("explanation has why+freshness", strong.explanation.why.length > 0 && strong.explanation.freshness.length > 0, "");
  add("explanation lists missing (weak)", weak.explanation.missingData.some((m) => /phone|brand/.test(m)), "");

  // ── Data health aggregation ────────────────────────────────────────────────
  const health = computeDataHealth("office", [strong, weak, conflicting, freshListing]);
  add("data health computed", health.entities === 4 && health.score > 0 && health.score <= 100, `${health.score}`);
  add("data health tracks contradictions", health.contradictionRatePct > 0, `${health.contradictionRatePct}`);
  add("empty scope → 0 + note", computeDataHealth("market", []).score === 0 && computeDataHealth("market", []).notes.length > 0, "");

  // ── Executive trust adjustment (CoS consumes truth) ────────────────────────
  const exLow = buildExecutiveTrust(70, 80, 40);
  const exHigh = buildExecutiveTrust(70, 80, 95);
  add("low trust lowers confidence", exLow.truthAdjustedConfidence < 80, `${exLow.truthAdjustedConfidence}`);
  add("high trust preserves confidence", exHigh.truthAdjustedConfidence >= exLow.truthAdjustedConfidence, `${exHigh.truthAdjustedConfidence}`);
  add("adjusted never exceeds original", exLow.truthAdjustedConfidence <= 80 && exHigh.truthAdjustedConfidence <= 80, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
