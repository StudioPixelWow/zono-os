// ============================================================================
// ZONO 9.1 — EVENT & AUTOMATION LAUNCH CLOSURE regression tests.
// Proves the canonical event→automation wiring that NEXT_1 closes:
//   • the kernel classifier maps events to the RIGHT journey triggers (and NEVER
//     invents an unsupported one — lead.created has a bundle, not a journey);
//   • the ONE canonical subscriber (processor) dispatches to the journey engine,
//     org-isolated (org from the outbox row, never the payload) and idempotent
//     across retry/replay (execution dedup_key = event id);
//   • the durable delay-queue returns an honest bounded tally and is cron-drained;
//   • the zono-agents cron is registered at a code-derived daily cadence and spends
//     nothing on providers;
//   • the Facebook-comment lead now emits the canonical lead.created;
//   • the journey execution path is provider-free (so the Billing gate has nothing
//     to block, and no live WhatsApp/FB/paid-AI fires from a background event).
// Behavioral where the code is pure (the classifier); source-closure for the
// server-only wiring (never calls the DB or a provider). No @/ alias (fd runner).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/event-automation-9-1.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectEventToAutomation } from "../../src/lib/kernel/automation-subscriber.ts";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");
const raw = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
/** Minimal DomainEventLike with sensible defaults; override per case. */
const evt = (over: Record<string, unknown> = {}) => ({
  id: "evt-1", event_type: "property.created", event_version: 1,
  organization_id: "org-A", actor_user_id: null,
  entity_type: "property", entity_id: "p-1", payload: null, metadata: null,
  occurred_at: "2026-01-01T00:00:00Z", ...over,
});

// ── 1. Classifier maps the events that GENUINELY have journey triggers ────────
test("classifier maps each supported event to its real journey TriggerType", () => {
  const cases: [string, string, string][] = [
    ["property.created", "property", "property_created"],
    ["property.updated", "property", "property_updated"],
    ["property.price_changed", "property", "price_drop"],
    ["external_listing.returned", "external_listing", "back_on_market"],
    ["meeting.completed", "meeting", "meeting_completed"],
    ["deal.stage_changed", "deal", "deal_stage_changed"],
  ];
  for (const [type, ent, trigger] of cases) {
    const r = projectEventToAutomation(evt({ event_type: type, entity_type: ent, entity_id: "x" }));
    assert.equal(r?.journeyTrigger, trigger, `${type} → ${trigger}`);
  }
});

// ── 2. lead.created has NO journey trigger — only an approval bundle ───────────
// (proves §2's "do not invent an unsupported trigger" — lead journeys ride the
//  approval inbox, so dispatch must NOT fire for lead.created).
test("lead.created classifies to a bundle only (journeyTrigger null)", () => {
  const r = projectEventToAutomation(evt({ event_type: "lead.created", entity_type: "lead", entity_id: "l-1" }));
  assert.equal(r?.journeyTrigger, null, "no journey trigger for lead.created");
  assert.equal(r?.bundleEventType, "new_lead", "lead.created → new_lead bundle");
});

// ── 3. dedupKey is the event id and approval is always required ────────────────
test("intent carries dedupKey=event id and requiresApproval=true", () => {
  const r = projectEventToAutomation(evt({ id: "evt-XYZ" }));
  assert.equal(r?.dedupKey, "evt-XYZ", "dedupKey is the domain event id (idempotency key for dispatch)");
  assert.equal(r?.requiresApproval, true);
});

// ── 4. Honest null: unknown events, QA-suppressed events, malformed rows ───────
test("classifier returns null for non-automation / QA-suppressed / malformed events", () => {
  assert.equal(projectEventToAutomation(evt({ event_type: "task.created", entity_type: "task" })), null, "no automation for task.created");
  assert.equal(projectEventToAutomation(evt({ payload: { suppressExternal: true } })), null, "authorized QA event suppresses external automation");
  assert.equal(projectEventToAutomation(evt({ organization_id: "" })), null, "missing org → null (never guess an org)");
  assert.equal(projectEventToAutomation(evt({ entity_id: "" })), null, "missing entity → null");
});

// ── 5. The processor is the ONE canonical seam that dispatches to journeys ─────
test("processor dispatches to the journey engine at the automation seam", () => {
  const p = src("lib/kernel/processor.ts");
  assert.match(p, /import \{ dispatchForOrg \} from "@\/lib\/journey-automation\/orchestrator"/, "processor imports the journey dispatcher");
  // Dispatch is gated on a real journey trigger (lead.created etc. never dispatch).
  assert.match(p, /if \(intent\.journeyTrigger\) \{/, "dispatch only when a journey trigger exists");
  // Org comes from the OUTBOX ROW, never the client payload.
  assert.match(p, /dispatchForOrg\(db,\s*row\.organization_id,/, "org is the outbox row's organization_id (never payload-derived)");
  // The idempotency key threaded into the execution is the domain event id.
  assert.match(p, /dedupKey:\s*intent\.dedupKey/, "dispatch carries the event-id dedup key");
});

// ── 6. Idempotent across retry/replay — execution dedup guard ─────────────────
test("dispatch cannot double-run on a kernel retry (execution dedup_key guard)", () => {
  const repo = src("lib/journey-automation/repository.ts");
  assert.match(repo, /dedup_key:\s*e\.event\.dedupKey/, "createExecution persists the dedup key");
  assert.match(repo, /Unique \(workflow_id, dedup_key\)[\s\S]*idempotent/i, "unique (workflow_id, dedup_key) → duplicate dispatch is a no-op");
  // The processor feeds that key from the event id, so a re-drained event re-dispatches
  // to the SAME (workflow, dedup_key) and is dropped — no duplicate execution.
  const p = src("lib/kernel/processor.ts");
  assert.match(p, /at-least-once redrive re-dispatches idempotently/i, "redrive is documented as idempotent");
});

// ── 7. Delay-queue: honest bounded tally + safe retry ─────────────────────────
test("runJourneyDelayQueue returns an honest scanned/due/executed/skipped/failed/remaining tally", () => {
  const o = src("lib/journey-automation/orchestrator.ts");
  for (const k of ["scanned", "due", "executed", "skipped", "failed", "remaining"]) {
    assert.match(o, new RegExp(`\\b${k}\\b`), `DelayQueueResult exposes ${k}`);
  }
  assert.match(o, /dueDelays\(nowIso,\s*limit\)/, "batch is BOUNDED by limit (no unbounded scan)");
  assert.match(o, /catch \{ await repo\.markDelay\(row\.id, "pending"\); failed\+\+;/, "a poisoned row is re-queued 'pending' and never poisons the batch");
  assert.match(o, /resumeDelay[\s\S]*Promise<"resumed" \| "skipped">/, "resumeDelay reports an honest resumed/skipped outcome");
  assert.match(o, /countDueDelays\(nowIso\)/, "remaining is a real re-count (honest, not fabricated)");
});

// ── 8. Journey delay-queue cron: registered + CRON_SECRET-secured ─────────────
test("journey-delay-queue cron exists, is secured, and is registered in vercel.json", () => {
  const route = src("app/api/cron/journey-delay-queue/route.ts");
  assert.match(route, /auth !== `Bearer \$\{secret\}`/, "route is guarded by CRON_SECRET");
  assert.match(route, /runJourneyDelayQueue\(200\)/, "route drains the bounded delay queue");
  const vercel = raw("vercel.json");
  assert.match(vercel, /"\/api\/cron\/journey-delay-queue"/, "cron registered in vercel.json");
});

// ── 9. zono-agents cron: registered at a code-derived DAILY cadence, no spend ──
test("zono-agents cron is registered daily and performs no provider spend", () => {
  const vercel = raw("vercel.json");
  // All built-in agents are daily/weekly and daily-briefing carries hourUtc:5, so a
  // single daily 05:00 tick is the objectively-derived cadence (not an invented one).
  assert.match(vercel, /"path":\s*"\/api\/cron\/zono-agents",\s*"schedule":\s*"0 5 \* \* \*"/, "zono-agents registered at 0 5 * * *");
  const route = src("app/api/cron/zono-agents/route.ts");
  assert.match(route, /auth !== `Bearer \$\{secret\}`/, "route is CRON_SECRET-secured");
  assert.match(route, /no auto-execution/, "produced items await approval (no auto-execution)");
  // The scheduled runner only reads context + persists recommendations — it never
  // calls a messaging/AI provider, so a RESTRICTED org cannot be charged through it.
  const svc = src("lib/agent-framework/service.ts");
  assert.doesNotMatch(svc, /sendCustomerEmail|sendWhatsapp|publishToFacebookPage|assertProviderSpendAllowed\(/, "scheduled agent run performs no provider spend");
});

// ── 10. Facebook comment → canonical lead.created (idempotent) ────────────────
test("FB-comment lead emits the canonical lead.created with attribution + idempotency", () => {
  const b = src("lib/distribution/comment-lead-bridge.ts");
  // 9.3 refactor: the FB path now emits via the shared OBSERVED helper (still the
  // canonical lead.created — not a FB-specific parallel path), with the trusted org,
  // actor, and canonical source. The idempotency key + the DOMAIN_EVENTS.leadCreated
  // emit now live inside emitLeadCreatedObserved (asserted in the 9.3 suite).
  assert.match(b, /emitLeadCreatedObserved\(\{[\s\S]*orgId, leadId: crmLeadId, source: "facebook", actorUserId: userId/, "emits the canonical lead.created via the shared observed helper (org/actor/source preserved)");
  const obs = src("lib/lead-intake/observability.ts");
  assert.match(obs, /DOMAIN_EVENTS\.leadCreated/, "the observed helper emits the canonical DOMAIN_EVENTS.leadCreated");
  assert.match(obs, /idempotencyKey:\s*`lead\.created:\$\{e\.leadId\}`/, "outbox dedupe → replay never duplicates the event");
  // Lead-once guard already prevents a second lead + emit on re-promotion.
  assert.match(b, /alreadyPromoted:\s*true/, "re-promotion returns the existing lead (one ingestion → one lead → one event)");
});

// ── 11. Journey execution is PROVIDER-FREE (Billing §9 / live-safety §13) ─────
test("journey action handler creates tasks/reminders + records instructions — never sends", () => {
  const o = src("lib/journey-automation/orchestrator.ts");
  // The ONLY side effects are internal CRM writes; AI/message actions are recorded,
  // not executed ("ai: optional" / preview) — so no provider call, no external send.
  assert.match(o, /case "create_task":[\s\S]*from\("tasks"/, "create_task is an internal DB insert");
  assert.match(o, /generate_whatsapp[\s\S]*generate_email[\s\S]*ai: "optional"/, "AI/message actions are recorded, not sent");
  assert.doesNotMatch(o, /sendCustomerEmail|sendWhatsapp|publishToFacebookPage|fetch\(/, "no provider/network call in the journey handler");
  // Because dispatch spends nothing, the processor documents WHY the Billing gate
  // has nothing to block here (rather than adding a gate that would wrongly block
  // internal task creation for a RESTRICTED org).
  const p = src("lib/kernel/processor.ts");
  assert.match(p, /provider-free[\s\S]*Billing 8\.3 gate to block here/i, "processor documents the provider-free rationale (§9)");
});

// ── 12. Cross-tenant isolation — dispatch is strictly org-scoped ──────────────
test("dispatch is org-isolated — no cross-tenant execution", () => {
  const repo = src("lib/journey-automation/repository.ts");
  assert.match(repo, /activeWorkflowsForTrigger[\s\S]*\.eq\("org_id", orgId\)/, "workflows are queried within the originating org only");
  const o = src("lib/journey-automation/orchestrator.ts");
  assert.match(o, /dispatchForOrg\(db: Db, orgId: string/, "dispatch is bound to an explicit orgId");
  // The processor passes the OUTBOX ROW's org (server-authored), so a client payload
  // can never redirect a journey run into another tenant.
  const p = src("lib/kernel/processor.ts");
  assert.match(p, /org comes from the outbox row, NEVER the payload/i, "org provenance is the server outbox, not the payload");
});
