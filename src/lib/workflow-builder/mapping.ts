// ============================================================================
// 🔁 Workflow Builder — template mapping (pure, client-safe). 30.4.2.
// Maps an entity + insight hints to the best-fit workflow template so any
// surface (workspace card, agent inbox item, Ask ZONO proposal, mission,
// scorecard) can suggest and start the right workflow. Pure — no server imports.
// ============================================================================
import type { EntityKind } from "./types";

// Hints are free-text signals a surface already knows (e.g. "at_risk", "hot",
// "stale", "critical", "recruit", "qualify", "price", "luxury").
export function suggestTemplate(entityKind: EntityKind, hints: string[] = []): string | null {
  const h = hints.map((x) => x.toLowerCase());
  const has = (...keys: string[]) => keys.some((k) => h.some((x) => x.includes(k)));

  switch (entityKind) {
    case "property":
      if (has("luxury", "יוקרה")) return "luxury_campaign";
      if (has("price", "overpriced", "מחיר", "תמחור")) return "price_review";
      if (has("stale", "critical", "מתיישן", "קריטי")) return "listing_refresh";
      return "listing_refresh";
    case "buyer": case "customer":
      return "buyer_closing";
    case "seller":
      if (has("price", "מחיר")) return "price_review";
      return "seller_recovery";
    case "lead":
      return "lead_qualification";
    case "office":
      return "recruit_broker";
    default:
      return null;
  }
}

// Offline self-check (pure).
export function runMappingSelfCheck(): { ok: boolean; total: number; passed: number; checks: { name: string; pass: boolean }[] } {
  const checks: { name: string; pass: boolean }[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  add("seller at risk → seller_recovery", suggestTemplate("seller", ["at_risk"]) === "seller_recovery");
  add("hot buyer → buyer_closing", suggestTemplate("buyer", ["hot"]) === "buyer_closing");
  add("stale listing → listing_refresh", suggestTemplate("property", ["stale"]) === "listing_refresh");
  add("critical listing → listing_refresh", suggestTemplate("property", ["critical"]) === "listing_refresh");
  add("luxury property → luxury_campaign", suggestTemplate("property", ["luxury"]) === "luxury_campaign");
  add("property price → price_review", suggestTemplate("property", ["price"]) === "price_review");
  add("seller price → price_review", suggestTemplate("seller", ["price"]) === "price_review");
  add("lead → lead_qualification", suggestTemplate("lead", []) === "lead_qualification");
  add("office → recruit_broker", suggestTemplate("office", ["recruit"]) === "recruit_broker");
  add("customer → buyer_closing", suggestTemplate("customer", []) === "buyer_closing");
  add("unknown kind → null", suggestTemplate("mission", []) === null);
  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
