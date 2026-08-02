// ============================================================================
// 🚀 Autopilot subscriber — offline determinism/correctness test.
// Runnable with: npx tsx src/lib/kernel/autopilot-subscriber.test.mts
// Pure module → no DB, no env, no mocks. Exit code 0 = all pass.
// ============================================================================
import { projectEventToAutopilotRescue, type AutopilotRescue } from "./autopilot-subscriber.ts";
import type { DomainEventLike } from "./subscriber.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

function evt(overrides: Partial<DomainEventLike>): DomainEventLike {
  return {
    id: "evt-1", event_type: "lead.created", entity_type: "lead", entity_id: "e-1",
    occurred_at: "2026-08-02T10:00:00Z", organization_id: "org-1",
    actor_user_id: null, payload: null, metadata: null, ...overrides,
  };
}

console.log("\n— Direct rescue signals —");
const directCases: Array<[string, AutopilotRescue["signal"], RescueSev]> = [
  ["lead.created", "lead_going_cold", "high"],
  ["meeting.no_show", "no_show", "high"],
  ["meeting.cancelled", "meeting_cancelled", "medium"],
  ["seller.risk_changed", "seller_at_risk", "critical"],
  ["task.overdue", "task_overdue", "high"],
  ["deal.lost", "deal_lost", "medium"],
  ["property.price_changed", "price_opportunity", "high"],
  ["external_listing.returned", "back_on_market", "medium"],
  ["document.failed", "document_failed", "high"],
  ["journey.blocked", "journey_blocked", "critical"],
];
type RescueSev = "critical" | "high" | "medium";
for (const [type, signal, sev] of directCases) {
  const r = projectEventToAutopilotRescue(evt({ event_type: type, entity_type: "x", entity_id: "y" }));
  check(`${type} → ${signal} (${sev})`, !!r && r.signal === signal && r.severity === sev && r.requiresApproval === true && r.slaHours > 0);
}

console.log("\n— Stall detection (payload-gated) —");
check("deal.stage_changed with regressed:true → deal_stalled",
  projectEventToAutopilotRescue(evt({ event_type: "deal.stage_changed", payload: { regressed: true } }))?.signal === "deal_stalled");
check("deal.stage_changed with to_ordinal<from_ordinal → deal_stalled",
  projectEventToAutopilotRescue(evt({ event_type: "deal.stage_changed", payload: { from_ordinal: 3, to_ordinal: 1 } }))?.signal === "deal_stalled");
check("buyer.stage_changed direction:backward → deal_stalled",
  projectEventToAutopilotRescue(evt({ event_type: "buyer.stage_changed", payload: { direction: "backward" } }))?.signal === "deal_stalled");
check("deal.stage_changed FORWARD (to>from) → null (no fabricated rescue)",
  projectEventToAutopilotRescue(evt({ event_type: "deal.stage_changed", payload: { from_ordinal: 1, to_ordinal: 3 } })) === null);
check("deal.stage_changed no payload → null",
  projectEventToAutopilotRescue(evt({ event_type: "deal.stage_changed", payload: null })) === null);

console.log("\n— Non-rescue events return null —");
check("deal.won → null (positive event)", projectEventToAutopilotRescue(evt({ event_type: "deal.won" })) === null);
check("journey.completed → null", projectEventToAutopilotRescue(evt({ event_type: "journey.completed" })) === null);
check("buyer.created → null (not a rescue signal)", projectEventToAutopilotRescue(evt({ event_type: "buyer.created" })) === null);
check("property.published → null", projectEventToAutopilotRescue(evt({ event_type: "property.published" })) === null);

console.log("\n— Guard clauses —");
check("missing id → null", projectEventToAutopilotRescue(evt({ id: "" })) === null);
check("missing organization_id → null", projectEventToAutopilotRescue(evt({ organization_id: "" })) === null);
check("missing entity_id → null", projectEventToAutopilotRescue(evt({ entity_id: "" })) === null);

console.log("\n— Determinism + purity —");
const a = projectEventToAutopilotRescue(evt({ event_type: "seller.risk_changed", id: "evt-9", entity_id: "z" }));
const b = projectEventToAutopilotRescue(evt({ event_type: "seller.risk_changed", id: "evt-9", entity_id: "z" }));
check("same input → deep-equal output", JSON.stringify(a) === JSON.stringify(b));
check("dedupKey === event id (idempotency)", a?.dedupKey === "evt-9");

console.log(`\n${failed === 0 ? "🟢" : "🔴"} Autopilot tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
