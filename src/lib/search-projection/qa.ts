// ============================================================================
// 🧪 ZONO OS 2.0 — Stage 4 · Search projection · offline QA. No DB/network.
// Run: npx tsx src/lib/search-projection/qa.ts
// ============================================================================
import { normalizeText, normalizePhone, phoneTail, buildKeywords, buildNormalizedText } from "./normalize";
import { buildSearchDocument } from "./document";
import { classifyEventForSearch } from "./subscriber";
import type { DomainEventLike } from "@/lib/kernel/subscriber";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

// ── Normalization ────────────────────────────────────────────────────────────
check("normalizeText lowercases + strips punctuation", normalizeText("Dan's Villa, Haifa!") === "dan s villa haifa");
check("normalizeText strips niqqud", normalizeText("שָׁלוֹם") === "שלום");
check("normalizeText handles null", normalizeText(null) === "");
check("normalizePhone canonicalizes +972", normalizePhone("+972-54-123-4567") === "0541234567");
check("normalizePhone canonicalizes 0-prefixed", normalizePhone("054-123 4567") === "0541234567");
check("normalizePhone rejects junk", normalizePhone("abc") === null);
check("phoneTail is last 7", phoneTail("0541234567") === "1234567");
check("buildKeywords dedupes + includes phone forms", (() => {
  const k = buildKeywords(["חיפה כרמל", "חיפה"], ["0541234567"]);
  return k.includes("חיפה") && k.includes("כרמל") && k.includes("0541234567") && k.includes("1234567") && k.filter((x) => x === "חיפה").length === 1;
})());
check("buildNormalizedText joins safe parts + phone", buildNormalizedText(["דירה בחיפה", "כרמל"], ["0541234567"]).includes("0541234567"));

// ── Document builder (defensive fields, safe-only) ───────────────────────────
const buyerDoc = buildSearchDocument("buyer", "B1", "ORG1", { id: "B1", full_name: "דנה כהן", city: "חיפה", status: "hot", phone: "054-1234567", owner_id: "U1", updated_at: "2026-07-10T09:00:00Z", private_notes: "SECRET note" }, "EVT1");
check("buyer doc title from full_name", buyerDoc?.title === "דנה כהן");
check("buyer doc subtitle joins safe fields", buyerDoc?.subtitle === "חיפה · hot");
check("buyer doc route is per-id", buyerDoc?.route === "/buyers/B1");
check("buyer doc owner resolved", buyerDoc?.owner_user_id === "U1");
check("buyer doc carries event_id + source_updated_at", buyerDoc?.event_id === "EVT1" && buyerDoc?.source_updated_at === "2026-07-10T09:00:00Z");
check("buyer doc keywords include phone forms", !!buyerDoc?.keywords.includes("0541234567"));
check("buyer doc NEVER indexes private notes", !buyerDoc?.normalized_text.includes("secret") && !JSON.stringify(buyerDoc?.keywords).toLowerCase().includes("secret"));

const propDoc = buildSearchDocument("property", "P1", "ORG1", { id: "P1", title: "פנטהאוז ברמת אביב", city: "תל אביב", status: "active", agent_id: "U2" }, null);
check("property doc route", propDoc?.route === "/properties/P1");
check("property owner falls back to agent_id", propDoc?.owner_user_id === "U2");

// no safe title → null (never fabricate)
check("no-title entity → null (skipped, not fabricated)", buildSearchDocument("buyer", "B2", "ORG1", { id: "B2", city: "חיפה" }, null) === null);
// unknown entity type → null
check("unknown entity type → null", buildSearchDocument("widget", "W1", "ORG1", { id: "W1", title: "x" }, null) === null);
// deterministic
check("document builder deterministic", JSON.stringify(buildSearchDocument("buyer", "B1", "ORG1", { id: "B1", full_name: "א" }, null)) === JSON.stringify(buildSearchDocument("buyer", "B1", "ORG1", { id: "B1", full_name: "א" }, null)));

// ── Event classifier ─────────────────────────────────────────────────────────
const base: DomainEventLike = {
  id: "E1", event_type: "buyer.created", entity_type: "buyer", entity_id: "B1",
  occurred_at: "2026-07-10T09:00:00Z", organization_id: "ORG1", actor_user_id: "U1", payload: {},
};
check("buyer.created → upsert", classifyEventForSearch(base)?.action === "upsert");
check("buyer.updated → upsert", classifyEventForSearch({ ...base, event_type: "buyer.updated" })?.action === "upsert");
check("property.archived → soft_delete", classifyEventForSearch({ ...base, event_type: "property.archived", entity_type: "property", entity_id: "P1" })?.action === "soft_delete");
check("external_listing.disappeared → soft_delete", classifyEventForSearch({ ...base, event_type: "external_listing.disappeared", entity_type: "external_listing", entity_id: "X1" })?.action === "soft_delete");
check("lead.converted_to_buyer → upsert lead", classifyEventForSearch({ ...base, event_type: "lead.converted_to_buyer", entity_type: "lead", entity_id: "L1" })?.entityType === "lead");
check("deal.stage_changed → upsert", classifyEventForSearch({ ...base, event_type: "deal.stage_changed", entity_type: "deal", entity_id: "D1" })?.action === "upsert");
check("unrelated event → null", classifyEventForSearch({ ...base, event_type: "buyer.risk_changed" }) === null);
check("unsupported entity type → null", classifyEventForSearch({ ...base, event_type: "organization.updated", entity_type: "organization", entity_id: "O1" }) === null);
check("missing event id → null", classifyEventForSearch({ ...base, id: "" }) === null);
check("classifier carries org (cross-org isolation)", classifyEventForSearch({ ...base, organization_id: "ORG9" })?.entityId === "B1");
check("classifier deterministic", JSON.stringify(classifyEventForSearch(base)) === JSON.stringify(classifyEventForSearch(base)));

console.log(`\nSearch Projection (normalize + document + subscriber) QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
