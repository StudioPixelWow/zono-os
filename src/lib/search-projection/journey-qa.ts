// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 5.6B · Canonical Journey search-document QA. No DB.
// Run: npx tsx src/lib/search-projection/journey-qa.ts
// ============================================================================
import { buildJourneySearchDocument } from "./journey-document";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

type Row = Record<string, unknown>;
const journey = (over: Row = {}): Row => ({
  id: "J1", org_id: "ORG1", journey_type: "property", entity_type: "property", entity_id: "P1",
  current_stage: "marketing", status: "active", source: "manual",
  stage_entered_at: "2026-07-14T10:00:00Z", updated_at: "2026-07-15T06:43:00Z",
  owner_user_id: "U1", metadata: {}, ...over,
});
const propertySubject: Row = { id: "P1", title: "הרצל 12, חיפה", city: "חיפה", status: "active" };

// ── Property journey ─────────────────────────────────────────────────────────
{
  const { doc } = buildJourneySearchDocument(journey(), propertySubject, "ORG1", "EVT1");
  check("property journey builds a doc", !!doc);
  check("entity_type = journey", doc?.entity_type === "journey");
  check("entity_id = journey id", doc?.entity_id === "J1");
  check("title = 'מסע הנכס — <address>'", doc?.title === "מסע הנכס — הרצל 12, חיפה");
  check("subtitle = 'מסע נכס · שיווק'", doc?.subtitle === "מסע נכס · שיווק");
  check("route = subject cockpit /properties/P1", doc?.route === "/properties/P1");
  check("owner resolved from journey", doc?.owner_user_id === "U1");
  check("visibility internal", doc?.visibility === "internal");
  check("event_id carried", doc?.event_id === "EVT1");
  check("metadata.journeyType", doc?.metadata.journeyType === "property");
  check("metadata.subjectEntityType", doc?.metadata.subjectEntityType === "property");
  check("metadata.subjectEntityId", doc?.metadata.subjectEntityId === "P1");
  check("metadata.currentStage", doc?.metadata.currentStage === "marketing");
  check("metadata.canonicalStageLabel", doc?.metadata.canonicalStageLabel === "שיווק");
  check("metadata.status", doc?.metadata.status === "active");
  check("metadata.stageEnteredAt", doc?.metadata.stageEnteredAt === "2026-07-14T10:00:00Z");
  check("stage label searchable (שיווק)", !!doc?.keywords.includes("שיווק"));
  check("stage key searchable (marketing)", !!doc?.keywords.includes("marketing"));
  check("subject address token searchable (הרצל)", !!doc?.normalized_text.includes("הרצל"));
  check("source_updated_at from journey.updated_at", doc?.source_updated_at === "2026-07-15T06:43:00Z");
}

// ── Title resolution per subject type ────────────────────────────────────────
check("buyer journey title from full_name", buildJourneySearchDocument(
  journey({ journey_type: "buyer", entity_type: "buyer", entity_id: "B1", current_stage: "new" }),
  { id: "B1", full_name: "ישראל ישראלי" }, "ORG1").doc?.title === "מסע הקונה — ישראל ישראלי");
check("buyer subtitle uses canonical stage label", buildJourneySearchDocument(
  journey({ journey_type: "buyer", entity_type: "buyer", entity_id: "B1", current_stage: "new" }),
  { id: "B1", full_name: "ישראל ישראלי" }, "ORG1").doc?.subtitle === "מסע קונה · קונה חדש");
check("seller journey title", buildJourneySearchDocument(
  journey({ journey_type: "seller", entity_type: "seller", entity_id: "S1", current_stage: "marketing" }),
  { id: "S1", full_name: "דנה כהן" }, "ORG1").doc?.title === "מסע המוכר — דנה כהן");
check("lead journey title", buildJourneySearchDocument(
  journey({ journey_type: "lead", entity_type: "lead", entity_id: "L1", current_stage: "new" }),
  { id: "L1", full_name: "ליד מפייסבוק" }, "ORG1").doc?.title === "מסע הליד — ליד מפייסבוק");
check("deal journey title + route /deals", (() => {
  const { doc } = buildJourneySearchDocument(
    journey({ journey_type: "deal", entity_type: "deal", entity_id: "D1", current_stage: "offer" }),
    { id: "D1", title: "עסקת הרצל" }, "ORG1");
  return doc?.title === "מסע העסקה — עסקת הרצל" && doc?.route === "/deals";
})());

// ── Skips (never a silent absence, never a dead result) ──────────────────────
check("missing subject id → missing_subject", buildJourneySearchDocument(journey({ entity_id: null }), null, "ORG1").skipReason === "missing_subject");
check("subject not resolved → subject_not_found", buildJourneySearchDocument(journey(), null, "ORG1").skipReason === "subject_not_found");
check("unsupported journey_type → unsupported_type", buildJourneySearchDocument(journey({ journey_type: "widget", entity_type: "widget" }), { id: "P1", title: "x" }, "ORG1").skipReason === "unsupported_type");
check("subject with no title → no_subject_title", buildJourneySearchDocument(journey(), { id: "P1", city: "חיפה" }, "ORG1").skipReason === "no_subject_title");
check("no doc on skip", buildJourneySearchDocument(journey(), null, "ORG1").doc === null);

// ── Terminal / blocked / fallback state ──────────────────────────────────────
check("terminal journey stays searchable, status won", (() => {
  const { doc } = buildJourneySearchDocument(journey({ current_stage: "sold", status: "won" }), propertySubject, "ORG1");
  return !!doc && doc.metadata.status === "won" && doc.metadata.canonicalStageLabel === "נמכר";
})());
check("blocked flag from metadata", buildJourneySearchDocument(journey({ metadata: { blocked: true } }), propertySubject, "ORG1").doc?.metadata.blocked === true);
check("blocked flag from status", buildJourneySearchDocument(journey({ status: "blocked" }), propertySubject, "ORG1").doc?.metadata.blocked === true);
check("fallback flag from metadata", buildJourneySearchDocument(journey({ metadata: { fallback: true } }), propertySubject, "ORG1").doc?.metadata.fallback === true);
check("no blocked/fallback by default", (() => {
  const m = buildJourneySearchDocument(journey(), propertySubject, "ORG1").doc?.metadata;
  return m?.blocked === false && m?.fallback === false;
})());

// ── Privacy: never index phone / private notes / raw payload ──────────────────
{
  const { doc } = buildJourneySearchDocument(
    journey({ journey_type: "buyer", entity_type: "buyer", entity_id: "B1", current_stage: "new" }),
    { id: "B1", full_name: "דנה כהן", phone: "054-1234567", private_notes: "SECRET", city: "חיפה" }, "ORG1");
  check("buyer journey does NOT index phone", !doc?.normalized_text.includes("0541234567") && !JSON.stringify(doc?.keywords).includes("0541234567"));
  check("buyer journey does NOT index private notes", !doc?.normalized_text.toLowerCase().includes("secret") && !JSON.stringify(doc?.keywords).toLowerCase().includes("secret"));
}

// ── Determinism ──────────────────────────────────────────────────────────────
check("journey doc deterministic", JSON.stringify(buildJourneySearchDocument(journey(), propertySubject, "ORG1")) === JSON.stringify(buildJourneySearchDocument(journey(), propertySubject, "ORG1")));

console.log(`\nCanonical Journey search-document QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
