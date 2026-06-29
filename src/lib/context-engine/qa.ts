// ============================================================================
// ✅ Context Engine QA — invariant validators + offline self-check (pure).
// No AI, no network: the self-check runs the engine against deterministic
// in-memory STUB_SOURCES, so it never touches repositories or models.
// ============================================================================
import { buildContextPackage } from "./engine";
import { PRIVATE_FIELD_KEYS } from "./permissions";
import type { ContextPackage, ContextRequest, ContextSources } from "./types";

export interface QaCheck { name: string; ok: boolean; detail: string }
export interface QaResult { passed: boolean; checks: QaCheck[] }

/** Static invariants every context package must satisfy. */
export function validateContextPackage(pkg: ContextPackage): QaResult {
  const checks: QaCheck[] = [];
  const add = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  add("has-cache-key", pkg.cacheKey.length > 0, pkg.cacheKey);
  add("every-block-attributed", pkg.blocks.every((b) => b.source.length > 0), "no unattributed/fabricated blocks");
  add("confidence-typed", pkg.blocks.every((b) => b.confidence === null || typeof b.confidence === "number"), "");
  add("explain-block-count", pkg.explain.blockCount === pkg.blocks.length, `${pkg.explain.blockCount} vs ${pkg.blocks.length}`);
  add("permissions-present", !!pkg.permissions, "");

  // Highest-priority block is never dropped by compression.
  const top = [...pkg.blocks].sort((a, b) => b.priority - a.priority)[0];
  add("top-priority-retained", !top || !top.truncated, top ? top.key : "no blocks");

  // No private field key survives serialization (privacy by default).
  const serialized = JSON.stringify(pkg.blocks);
  const leaked = [...PRIVATE_FIELD_KEYS].filter((k) => serialized.includes(`"${k}":`));
  add("no-private-fields", leaked.length === 0, leaked.join(", "));

  return { passed: checks.every((c) => c.ok), checks };
}

/** Deterministic in-memory sources — used only for offline QA (no DB, no AI). */
export const STUB_SOURCES: ContextSources = {
  async identity() {
    return { orgId: "org_demo", orgName: "ZONO Demo", userId: "user_demo", userName: "סוכן בדיקה", isManager: true };
  },
  async actionCenter() {
    return {
      recommendations: [{ id: "r1", title: "מעקב מוכר", reason: "לא נוצר קשר 7 ימים", urgency: 82 }],
      opportunities: [{ id: "l1", title: "דירה 4 חד׳", city: "חיפה", neighborhood: "כרמל", price: 2100000, opportunityScore: 78, hasAgent: false }],
      newListings: [{ id: "l2", title: "דירה 3 חד׳", city: "חיפה", neighborhood: "כרמל", price: 1800000, opportunityScore: 55, hasAgent: true }],
      brokers: [{ id: "b1", name: "דנה כהן", office: "רי/מקס", city: "חיפה", confidence: 71, listingsCount: 14 }],
      offices: [{ id: "o1", name: "רי/מקס כרמל", city: "חיפה", overall: 80, growth: 12, momentum: 60, threat: 40 }],
      priceDrops: 3, totalListings: 42,
    };
  },
  async location(city, neighborhood) {
    return {
      territory: { city, neighborhood, leaderOfficeId: "o1", leaderOfficeName: "רי/מקס כרמל", dominance: 64, competitionLevel: "moderate", confidence: 70, missing: [] },
      opportunities: [{ id: "l1", title: "דירה 4 חד׳", city, neighborhood, price: 2100000, opportunityScore: 78, hasAgent: false }],
      newListings: [{ id: "l2", title: "דירה 3 חד׳", city, neighborhood, price: 1800000, opportunityScore: 55, hasAgent: true }],
      counts: { opportunities: 1, offMarket: 1, recent: 2, total: 8 },
    };
  },
};

/** Run the engine offline and confirm determinism + invariants. */
export async function runSelfCheck(): Promise<QaResult> {
  const req: ContextRequest = { type: "property", entityId: "p1", city: "חיפה", neighborhood: "כרמל", screen: "/properties/p1", size: "medium" };
  const a = await buildContextPackage(req, STUB_SOURCES);
  const b = await buildContextPackage(req, STUB_SOURCES);

  const checks: QaCheck[] = [];
  checks.push({ name: "deterministic-cache-key", ok: a.cacheKey === b.cacheKey, detail: a.cacheKey });
  checks.push({ name: "deterministic-blocks", ok: JSON.stringify(a.blocks) === JSON.stringify(b.blocks), detail: `${a.blocks.length} blocks` });
  const inv = validateContextPackage(a);
  checks.push(...inv.checks);
  return { passed: checks.every((c) => c.ok), checks };
}
