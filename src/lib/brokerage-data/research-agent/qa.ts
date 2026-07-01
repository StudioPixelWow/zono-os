// ============================================================================
// ✅ Research Agent self-tests (pure, offline). Phase 26.4.13.
// Exercises the deterministic core: staged query building (multi-step, not one
// prompt), Hebrew/English/brand dedupe, and cross-reference query shape. No DB,
// no network, no AI.
// ============================================================================
import { stageQueries, crossRefQueries } from "./search";
import { mergeNames, canonicalKey } from "./dedupe";
import { ALL_STAGES } from "./types";

export interface AgentCheck { name: string; pass: boolean; detail: string }
export interface AgentSelfCheck { ok: boolean; total: number; passed: number; checks: AgentCheck[] }

export function runSelfCheck(): AgentSelfCheck {
  const checks: AgentCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const city = "קריית ביאליק";

  // Multi-step: several stages, many queries (not one prompt).
  const plan = stageQueries(city, {});
  const totalQ = plan.reduce((n, p) => n + p.queries.length, 0);
  add("multi-stage plan", plan.length >= 6, `${plan.length} stages`);
  add("many queries (not one)", totalQ >= 18, `${totalQ} queries`);
  add("franchise stage present", plan.some((p) => p.stage === "franchises" && p.queries.some((q) => /RE\/MAX|רימקס|רי\/מקס/.test(q))), "ok");
  add("portals stage present", plan.some((p) => p.stage === "portals"), "ok");
  add("social stage present", plan.some((p) => p.stage === "social"), "ok");
  add("stages within known set", plan.every((p) => ALL_STAGES.includes(p.stage)), "ok");

  // Toggles remove stages.
  const noSocial = stageQueries(city, { includeSocial: false });
  add("toggle removes social", !noSocial.some((p) => p.stage === "social"), "ok");

  // Cross-reference produces the 6 per-office queries.
  add("cross-ref 6 queries", crossRefQueries("רי/מקס נדל\"ן", city).length === 6, "ok");

  // Dedupe: RE/MAX variants collapse to one candidate; aliases retained.
  const m1 = mergeNames([{ raw: "RE/MAX קריית ביאליק" }, { raw: "רימקס קרית ביאליק" }, { raw: "רי/מקס" }], city);
  add("brand variants → 1", m1.length === 1, `${m1.length}`);
  add("aliases retained", (m1[0]?.aliases.length ?? 0) >= 2, `${m1[0]?.aliases.length}`);

  // Independent office keeps its own identity (not merged into a brand).
  const m2 = mergeNames([{ raw: "תיווך הצפון בע\"מ" }, { raw: "RE/MAX קריית ביאליק" }], city);
  add("independent stays separate", m2.length === 2, `${m2.length}`);

  // Canonical key stable across spelling of city-independent name.
  const k1 = canonicalKey("אנגלו סכסון", city)?.normalizedBrand;
  const k2 = canonicalKey("Anglo Saxon", city)?.normalizedBrand;
  add("anglo he/en same brand", !!k1 && k1 === k2, `${k1}/${k2}`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
