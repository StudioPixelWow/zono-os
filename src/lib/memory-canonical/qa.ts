// ============================================================================
// 🧪 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · offline QA.
// No DB/network. Run: npx tsx src/lib/memory-canonical/qa.ts
// ============================================================================
import { classifyMemory } from "./salience";
import { memoryIdentityKey, normalizeFact } from "./identity";
import { resolveMemoryConflict, type ExistingMemory } from "./conflict";
import type { DomainEventLike } from "@/lib/kernel/subscriber";
import type { MemoryOpIntent } from "./types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const base: DomainEventLike = {
  id: "E1", event_type: "buyer.updated", entity_type: "buyer", entity_id: "B1",
  occurred_at: "2026-07-10T09:00:00Z", organization_id: "ORG1", actor_user_id: "U1", payload: {},
};

// ── Salience: only salient facts become memory ───────────────────────────────
const budget = classifyMemory({ ...base, payload: { budget: 2500000 } });
check("buyer budget → 1 explicit preference memory", budget.length === 1 && budget[0].memoryType === "preference" && budget[0].provenance === "explicit");
check("budget dimension key = budget", budget[0].normalizedFactKey === "budget");
check("budget is confidential sensitivity", budget[0].sensitivity === "confidential");
check("buyer.updated with no salient fields → 0 memories (honest skip)", classifyMemory(base).length === 0);
const multi = classifyMemory({ ...base, payload: { budget: 3000000, preferredArea: "חיפה" } });
check("multi-dimension buyer.updated → 2 memories", multi.length === 2);

const risk = classifyMemory({ ...base, event_type: "seller.risk_changed", entity_type: "seller", entity_id: "S1", payload: { risk: 72 } });
check("seller.risk_changed WITH evidence → derived risk memory", risk.length === 1 && risk[0].provenance === "derived" && risk[0].memoryType === "risk");
check("seller.risk_changed WITHOUT evidence → 0 (no inference)", classifyMemory({ ...base, event_type: "seller.risk_changed", entity_type: "seller", entity_id: "S1", payload: {} }).length === 0);

const meet = classifyMemory({ ...base, event_type: "meeting.completed", entity_type: "meeting", entity_id: "M1", payload: { outcome: "הסכים על מחיר", buyerId: "B1" } });
check("meeting.completed with outcome → meeting_outcome memory + refs", meet.length === 1 && meet[0].memoryType === "meeting_outcome" && meet[0].sourceEntityRefs.some(r => r.id === "B1"));
check("meeting.completed with no outcome → 0", classifyMemory({ ...base, event_type: "meeting.completed", entity_type: "meeting", entity_id: "M1", payload: {} }).length === 0);

check("document.signed → milestone-ish document_fact", classifyMemory({ ...base, event_type: "document.signed", entity_type: "document", entity_id: "D1" })[0]?.memoryType === "document_fact");
check("lead.converted_to_buyer → relationship memory", classifyMemory({ ...base, event_type: "lead.converted_to_buyer", entity_type: "lead", entity_id: "L1", payload: { buyerId: "B1" } })[0]?.memoryType === "relationship");
check("whatsapp.connected → org availability milestone (no secret)", (() => { const m = classifyMemory({ ...base, event_type: "whatsapp.connected", entity_type: "whatsapp", entity_id: "W1" }); return m.length === 1 && m[0].scope === "organization" && !m[0].fact.includes("token"); })());
check("noisy automation.run_completed → 0 memories", classifyMemory({ ...base, event_type: "automation.run_completed", entity_type: "automation", entity_id: "A1" }).length === 0);
check("price change → milestone with from→to", (() => { const m = classifyMemory({ ...base, event_type: "property.price_changed", entity_type: "property", entity_id: "P1", payload: { oldPrice: 100, newPrice: 90 } }); return m[0]?.normalizedFactKey === "price" && m[0].fact.includes("100") && m[0].fact.includes("90"); })());
check("salience deterministic", JSON.stringify(classifyMemory({ ...base, payload: { budget: 1 } })) === JSON.stringify(classifyMemory({ ...base, payload: { budget: 1 } })));

// ── Identity: stable per dimension, differs per subject/dimension ────────────
const budgetIntent = budget[0];
const k1 = memoryIdentityKey("ORG1", budgetIntent);
check("identity is uuid-shaped + deterministic", /^[0-9a-f-]{36}$/.test(k1) && k1 === memoryIdentityKey("ORG1", budgetIntent));
check("same dimension different value → SAME identity (enables supersede)", memoryIdentityKey("ORG1", { ...budgetIntent, fact: "תקציב: 9" }) === k1);
check("different dimension → different identity", memoryIdentityKey("ORG1", { ...budgetIntent, normalizedFactKey: "area" }) !== k1);
check("different org → different identity (cross-org isolation)", memoryIdentityKey("ORG9", budgetIntent) !== k1);
check("different entity → different identity", memoryIdentityKey("ORG1", { ...budgetIntent, entityId: "B2" }) !== k1);
check("normalizeFact strips niqqud + punctuation", normalizeFact("תַקְצִיב: 100!") === "תקציב 100");

// ── Conflict resolution ──────────────────────────────────────────────────────
const explicitExisting: ExistingMemory = { normalizedFact: normalizeFact("תקציב: 100"), provenance: "explicit", sourceEventId: "E0" };
check("no existing → create", resolveMemoryConflict(null, { fact: "x", provenance: "explicit", sourceEventId: "E1" }).action === "create");
check("same fact same event → skip (replay)", resolveMemoryConflict(explicitExisting, { fact: "תקציב: 100", provenance: "explicit", sourceEventId: "E0" }).action === "skip");
check("same fact new event → reinforce", resolveMemoryConflict(explicitExisting, { fact: "תקציב: 100", provenance: "explicit", sourceEventId: "E1" }).action === "reinforce");
check("new value explicit → supersede", resolveMemoryConflict(explicitExisting, { fact: "תקציב: 200", provenance: "explicit", sourceEventId: "E1" }).action === "supersede");
check("inferred CANNOT override explicit → skip", resolveMemoryConflict(explicitExisting, { fact: "תקציב: 200", provenance: "inferred", sourceEventId: "E1" }).action === "skip");
check("derived CANNOT override explicit → skip", resolveMemoryConflict(explicitExisting, { fact: "תקציב: 200", provenance: "derived", sourceEventId: "E1" }).action === "skip");
const inferredExisting: ExistingMemory = { normalizedFact: normalizeFact("סיכון: 50"), provenance: "inferred", sourceEventId: "E0" };
check("explicit supersedes inferred", resolveMemoryConflict(inferredExisting, { fact: "סיכון: 80", provenance: "explicit", sourceEventId: "E1" }).action === "supersede");
check("higher-rank derived supersedes inferred", resolveMemoryConflict(inferredExisting, { fact: "סיכון: 80", provenance: "derived", sourceEventId: "E1" }).action === "supersede");
check("conflict deterministic", JSON.stringify(resolveMemoryConflict(explicitExisting, { fact: "y", provenance: "explicit", sourceEventId: "E2" })) === JSON.stringify(resolveMemoryConflict(explicitExisting, { fact: "y", provenance: "explicit", sourceEventId: "E2" })));

// missing required event fields → no memory
check("missing org → 0", classifyMemory({ ...base, organization_id: "", payload: { budget: 1 } }).length === 0);
check("missing event id → 0", classifyMemory({ ...base, id: "", payload: { budget: 1 } }).length === 0);

// ── Batch 5.6D · Canonical Journey → AI memory ───────────────────────────────
const jMem = (over: Partial<DomainEventLike> = {}): DomainEventLike => ({
  ...base, event_type: "journey.completed", entity_type: "journey", entity_id: "J1",
  payload: { journeyType: "property", subjectType: "property", subjectId: "P1", fromStage: "under_contract", toStage: "sold", reason: "journey_closed_won" },
  ...over,
});
const jDone = classifyMemory(jMem());
check("journey.completed → exactly 1 memory", jDone.length === 1);
check("journey.completed → outcome memoryType", jDone[0]?.memoryType === "outcome");
check("journey outcome dimension = journey_outcome", jDone[0]?.normalizedFactKey === "journey_outcome");
check("journey memory is SUBJECT-scoped (not journey id)", jDone[0]?.scope === "entity" && jDone[0]?.entityType === "property" && jDone[0]?.entityId === "P1");
check("journey memory fact is concise + canonical stage label", jDone[0]?.fact === "המסע הושלם בשלב נמכר");
check("journey memory provenance = derived", jDone[0]?.provenance === "derived");
check("journey memory sensitivity = internal", jDone[0]?.sensitivity === "internal");
check("journey memory refs include journey + subject", (() => {
  const r = jDone[0]?.sourceEntityRefs ?? [];
  return r.some(x => x.type === "journey" && x.id === "J1") && r.some(x => x.type === "property" && x.id === "P1");
})());
// Deliberate omissions — these MUST stay unremembered (no second lifecycle truth).
check("journey.stage_changed → 0 memories (deliberate)", classifyMemory(jMem({ event_type: "journey.stage_changed", payload: { journeyType: "property", subjectType: "property", subjectId: "P1", toStage: "marketing" } })).length === 0);
check("journey.created → 0 memories (deliberate)", classifyMemory(jMem({ event_type: "journey.created", payload: { journeyType: "property", subjectType: "property", subjectId: "P1", toStage: "draft" } })).length === 0);
// Blocked → risk (pure QA only; no live emitter exists today).
const jBlocked = classifyMemory(jMem({ event_type: "journey.blocked", payload: { journeyType: "property", subjectType: "property", subjectId: "P1", toStage: "marketing" } }));
check("journey.blocked → 1 risk memory", jBlocked.length === 1 && jBlocked[0].memoryType === "risk");
check("journey blocked dimension = journey_blocked", jBlocked[0]?.normalizedFactKey === "journey_blocked");
check("journey blocked fact concise", jBlocked[0]?.fact === "המסע נחסם בשלב שיווק");
// Evidence guards.
check("journey with missing subject → 0 (honest skip)", classifyMemory(jMem({ payload: { journeyType: "property", toStage: "sold" } })).length === 0);
check("journey with unsupported type → 0", classifyMemory(jMem({ payload: { journeyType: "widget", subjectType: "widget", subjectId: "W1", toStage: "sold" } })).length === 0);
check("journey memory never carries raw reason/evidence text", !JSON.stringify(jDone[0]).includes("journey_closed_won"));
// Identity: journey outcome must NOT collide with deal.won / property.sold outcome.
const dealWon = classifyMemory({ ...base, event_type: "deal.won", entity_type: "deal", entity_id: "D1", payload: {} });
check("deal.won outcome uses a different dimension than journey_outcome", dealWon[0]?.normalizedFactKey === "outcome" && jDone[0]?.normalizedFactKey === "journey_outcome");
check("journey outcome identity ≠ deal outcome identity", memoryIdentityKey("ORG1", jDone[0]) !== memoryIdentityKey("ORG1", dealWon[0]));
check("journey outcome identity ≠ property.sold-style outcome identity on same subject", (() => {
  const propOutcome: MemoryOpIntent = { ...jDone[0], memoryType: "outcome", normalizedFactKey: "outcome" };
  return memoryIdentityKey("ORG1", jDone[0]) !== memoryIdentityKey("ORG1", propOutcome);
})());
check("journey outcome identity is stable across replay (idempotent)", memoryIdentityKey("ORG1", classifyMemory(jMem())[0]) === memoryIdentityKey("ORG1", classifyMemory(jMem())[0]));
check("journey outcome identity is org-scoped (cross-org differs)", memoryIdentityKey("ORG1", jDone[0]) !== memoryIdentityKey("ORG9", jDone[0]));
check("journey memory deterministic", JSON.stringify(classifyMemory(jMem())) === JSON.stringify(classifyMemory(jMem())));

const _typecheck: MemoryOpIntent = budgetIntent; void _typecheck;

console.log(`\nCanonical AI Memory (salience + identity + conflict) QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
