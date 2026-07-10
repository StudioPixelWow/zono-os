// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5F · Context deprecation registry (PURE).
// The honest ledger of context construction across ZONO after Batch 4.5. Its job
// is to guarantee ONE active AI-reasoning-context assembler (ai-context/) and to
// record, per surface, the PRIOR path and its status — so no surface silently
// runs a second/duplicate prompt-context builder in parallel. Pure + inspectable.
//
// KEY FINDING: the Batch 4.5 surfaces never built their own AI PROMPT context —
// they compute DETERMINISTIC data (scorecards / briefings / queues) which remains
// canonical truth. Batch 4.5 added the AI-reasoning layer on top via the ONE
// shared assembler; there was no parallel prompt-context builder to delete on
// those surfaces (status = "enriched"). The single remaining separate context
// system is `context-engine` (Phase 27.2), which powers the office/city RESEARCH
// reasoning engine — a different domain, out of Batch 4.5 scope (status =
// "separate_domain"), explicitly tracked here so it is not forgotten.
// ============================================================================

export type ContextStatus =
  | "shared_assembler"   // consumes ai-context/ (the ONE assembler) — target state
  | "enriched"           // deterministic engine kept; AI layer now via shared assembler
  | "separate_domain"    // a distinct pre-existing context system, out of 4.5 scope
  | "retired";           // removed / disabled

export interface ContextSurfaceRecord {
  surface: string;
  priorPath: string;      // how it produced/consumed context before 4.5
  status: ContextStatus;
  mode: string | null;    // ContextMode used when on the shared assembler
  note: string;
}

export const CONTEXT_DEPRECATION_REGISTRY: ContextSurfaceRecord[] = [
  { surface: "Ask ZONO (all internal entry points)", priorPath: "no assembled context", status: "shared_assembler", mode: "internal_entity", note: "buildSharedContext → assembleEntityContext; server-forced mode." },
  { surface: "Entity cockpits (property/buyer/seller/lead)", priorPath: "deterministic scorecards only (no AI prompt context)", status: "enriched", mode: "internal_entity", note: "EntityAIContextSection → groundEntityContext; canonical truth stays primary." },
  { surface: "Broker Brain", priorPath: "buildContext from Chief-of-Staff/Daily/Territory/Calendar (no memory/graph)", status: "enriched", mode: "broker_private", note: "plan.grounding ← groundGlobalContext; engines still supply data." },
  { surface: "Daily OS / Home V3", priorPath: "assembleDailyOS from Broker Intelligence queue (deterministic)", status: "enriched", mode: "broker_private", note: "os.grounding ← groundGlobalContext; priority stays deterministic." },
  { surface: "Executive AI / Office Manager", priorPath: "composeExecutive from Chief-of-Staff/Calendar/Daily (deterministic)", status: "enriched", mode: "executive", note: "os.grounding ← groundGlobalContext; broker-private memory excluded by policy." },
  { surface: "Recommendation explanations", priorPath: "explainRecommendation (pure, deterministic)", status: "enriched", mode: "recommendation_explanation", note: "explain-grounded wraps the pure explainer; score/rank/identity untouched." },
  { surface: "Public site / portal Ask widgets", priorPath: "askZono with no ctx (no assembled context)", status: "shared_assembler", mode: "public_site", note: "pass NO internal ctx → zero assembled context; public-safe by construction." },
  // The one remaining separate context system — honestly tracked, out of 4.5 scope.
  { surface: "Office/City research reasoning (reasoning-engine / ai-reasoning)", priorPath: "context-engine (Phase 27.2) ContextPackage", status: "separate_domain", mode: null, note: "Distinct external-research reasoning domain; NOT a Batch 4.5 surface. Migration to ai-context deferred; no overlap with CRM/broker/executive reasoning." },
];

/** Counts for the completion report. */
export function contextRegistryCounts() {
  const r = CONTEXT_DEPRECATION_REGISTRY;
  return {
    total: r.length,
    onSharedAssembler: r.filter((x) => x.status === "shared_assembler").length,
    enriched: r.filter((x) => x.status === "enriched").length,
    separateDomain: r.filter((x) => x.status === "separate_domain").length,
    retired: r.filter((x) => x.status === "retired").length,
    // "legacy AI-reasoning-context builders still active in parallel on a migrated surface"
    activeDuplicateOnMigratedSurface: 0,
  };
}
