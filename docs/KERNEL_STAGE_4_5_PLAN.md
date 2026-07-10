# ZONO OS 2.0 — Event Kernel · Stages 4–5 Execution Plan

Ready-to-run design for the two remaining Kernel stages. Written so it can be
executed as small, verified, additive commits (same discipline as Stages 1–3):
each piece is a pure module + a server binding + offline QA + scoped tsc/eslint.

**Precondition (blocking):** the `domain_events` table must exist — run
`docs/SUPABASE_RUNBOOK_FINAL.sql`, then regenerate Supabase types so the
`as never` casts on `domain_events` can be dropped.

**Non-negotiables (unchanged):** additive/reversible only; approval gates stay;
no auto-send/publish/book/sign; every subscriber is best-effort and never blocks
the outbox; org-scoped throughout.

---

## Where Stages 1–3 leave us

- **Stage 1** — `domain_events` append-only store + `emitBusinessEvent()` (best-effort). ~15 emitters wired across CRM/deals/properties/leads/websites.
- **Stage 2** — Timeline subscriber: pure `projectEventToTimeline` + `drainDomainEvents` outbox drainer + `/api/cron/kernel-drain` (every 10 min) + offline QA.
- **Stage 3** — Notification subscriber: pure `projectEventToNotification` for high-signal events, wired as a second consumer inside the same drain loop (best-effort).
- **Observability** — `getKernelOutboxHealth()` (pending/processing/done/failed + drain lag).

The drain loop is the extension point: Stages 4–5 add **more subscribers to the
same loop**, each a pure projector + a best-effort writer. No new cron needed.

---

## Stage 4 — Search / Graph / Memory subscribers

Goal: every business event also (a) keeps the relationship **graph** fresh, and
(b) feeds durable **org-memory**, so Ask ZONO and the graph views reflect reality
without a separate recompute pass.

### 4A · Graph subscriber
- **Pure:** `projectEventToGraphEdge(evt) → GraphEdgeUpsert | null`. Maps linkage
  events to `entity_relationships` upserts:
  - `seller.linked_to_property` → edge (seller)—owns—(property)
  - `deal.created` (payload buyerId/propertyId/sellerId) → deal edges
  - `lead.converted_to_buyer` / `_to_seller` → identity edge (lead)—became—(buyer/seller)
  - `property.sold` (payload buyerId) → edge (buyer)—purchased—(property)
- **Writer:** upsert into `entity_relationships` via the existing
  `entityRelationshipRepository` (reuse — do NOT create a new table). Idempotent
  on `(org, source, target, relationship_type)`.
- **Reuse:** `src/lib/activity/repository.ts` (entity_relationships), the
  Universal Graph (`src/lib/universal-graph`) reads these edges already.

### 4B · Org-Memory subscriber
- **Pure:** `projectEventToMemory(evt) → MemoryEventUpsert | null`. Selects the
  events worth remembering (deal.won/lost, property.sold, lead.converted,
  meeting.completed, document.signed) and shapes a durable memory row.
- **Writer:** insert into `zono_org_memory_events` (already exists, per the
  audit pack). Best-effort.
- **Reuse:** `src/lib/org-memory` service already harvests/reads these; the
  subscriber just makes the write event-driven instead of batch.

### 4C · Ask ZONO consumption (read-side, no new writes)
- Ask ZONO already has a memory/timeline reader. Confirm it reads the
  event-fed `entity_relationships` + `zono_org_memory_events`; if a gap exists,
  point its context loader at them. No schema change.

### Wiring
- Extend `drainDomainEvents` to also run the graph + memory projectors after the
  timeline insert (same best-effort pattern as Stage 3): each in its own
  try/catch, counted in `DrainResult` (`graphEdges`, `memoryRows`).
- Add QA cases to `src/lib/kernel/qa.ts` for both new pure projectors.

### Acceptance
- New buyer→property purchase shows as a graph edge without a recompute.
- A won deal appears in org-memory within one drain cycle.
- `getKernelOutboxHealth` still drains to 0 pending; no event stuck > MAX_RETRIES.

---

## Stage 5 — Journey consolidation

Goal: the customer **journey** advances from events instead of ad-hoc writes, so
`journeys` / `journey_stages` stay consistent with what actually happened.

### 5A · Journey subscriber
- **Pure:** `projectEventToJourneyTransition(evt) → JourneyTransition | null`.
  Maps lifecycle events to a journey stage move:
  - `lead.created` → journey opened (stage: new)
  - `buyer.stage_changed` / `seller.risk_changed` → stage sync
  - `deal.created` → journey stage: in_deal
  - `deal.won` → journey completed (won); `deal.lost` → journey blocked/closed
- **Writer:** call the existing journey service (`ensureJourney` +
  stage-advance) — reuse, don't reimplement. Idempotent per (entity, stage).
- **Reuse:** `src/lib/journey-intelligence` + `src/lib/journey-center`.

### 5B · De-dup the parallel journey writers
- Audit found ad-hoc journey writes in a few flows. Once the subscriber owns
  stage transitions, convert those call sites to emit an event (if not already)
  and drop the direct journey write — single source of truth.

### Acceptance
- Creating a lead opens exactly one journey (no duplicates).
- Winning a deal marks its journey completed within one drain cycle.
- JourneysView reflects event-driven state with no manual recompute.

---

## Suggested commit sequence (small + verified)

1. `Stage 4A` graph projector (pure) + QA.
2. `Stage 4A` wire graph writer into drain loop + DrainResult counter.
3. `Stage 4B` memory projector (pure) + QA.
4. `Stage 4B` wire memory writer into drain loop.
5. `Stage 4C` verify/point Ask ZONO reader (no schema).
6. `Stage 5A` journey projector (pure) + QA.
7. `Stage 5A` wire journey writer (reuse journey service).
8. `Stage 5B` retire duplicate journey writers.
9. Final: `getKernelOutboxHealth` sanity + docs update.

Each step: scoped tsc + eslint + `npx tsx src/lib/kernel/qa.ts`, one small commit.
No `git gc`. Stop if disk is still full.

---

## Operational preconditions (owner)
1. Free machine disk (currently ~100% full).
2. Run `docs/SUPABASE_RUNBOOK_FINAL.sql` in Supabase.
3. Regenerate Supabase types; drop `as never` on `domain_events`.
4. Confirm `CRON_SECRET` is set so `/api/cron/kernel-drain` runs.
