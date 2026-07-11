// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.2 · Journey applier (server-only).
//
// THE ONLY event-driven writer of canonical journeys. Takes the pure intents
// from journey-subscriber.ts and performs them through:
//   · buildTransition()  — Batch 5.1's validator. current_stage is NEVER set
//                          without it, so an invalid/regressive/terminal move
//                          cannot mutate a journey.
//   · the DB constraints from migration 20260927120000:
//       journeys_entity_uniq                  → one journey per (org,type,entity)
//       journey_events_source_transition_uniq → one history row per
//                                               (journey, source_event, to_stage)
//
// Those two indexes — not application logic — are what make replay safe.
// ============================================================================
import "server-only";
import { emitBusinessEvent } from "./emit";
import { DOMAIN_EVENTS } from "./events";
import { buildTransition, initialStage, isValidStage, type JourneyType } from "@/lib/journey-canonical";
import type { JourneyIntent } from "./journey-subscriber";
import type { DomainEventLike } from "./subscriber";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type JourneyOutcome =
  | "created" | "advanced" | "completed" | "blocked"
  | "skipped" | "duplicate" | "failed";

export interface JourneyApplyResult {
  outcome: JourneyOutcome;
  journeyId: string | null;
  fromStage: string | null;
  toStage: string | null;
  reason: string;
}

interface JourneyRow {
  id: string;
  current_stage: string;
  status: string;
  org_id: string;
}

const isDuplicate = (e: { message?: string } | null) =>
  !!e?.message && /duplicate key|unique constraint/i.test(e.message);

/**
 * Apply ONE intent. Never throws — the kernel must not die on a journey.
 */
export async function applyJourneyIntent(
  db: Db,
  evt: DomainEventLike,
  intent: JourneyIntent,
): Promise<JourneyApplyResult> {
  const org = evt.organization_id;
  const jt: JourneyType = intent.journeyType;

  const fail = (reason: string): JourneyApplyResult =>
    ({ outcome: "failed", journeyId: null, fromStage: null, toStage: intent.targetStage, reason });
  const skip = (reason: string, journeyId: string | null = null, from: string | null = null): JourneyApplyResult =>
    ({ outcome: "skipped", journeyId, fromStage: from, toStage: intent.targetStage, reason });

  try {
    // ── 1. Find the existing canonical journey (org-scoped — a cross-org entity
    //       simply has no journey here, so nothing can be mutated across orgs).
    const { data: found, error: findErr } = await db
      .from("journeys")
      .select("id,current_stage,status,org_id")
      .eq("org_id", org)
      .eq("journey_type", jt)
      .eq("entity_type", intent.entityType)
      .eq("entity_id", intent.entityId)
      .maybeSingle();
    if (findErr) return fail(`lookup failed: ${findErr.message}`);

    let journey = found as JourneyRow | null;

    // ── 2. Create when absent ────────────────────────────────────────────────
    if (!journey) {
      const open = buildTransition(jt, null, intent.targetStage, {
        reason: intent.reason, evidence: { ...intent.evidence, sourceEvent: evt.event_type },
      });
      if (!open) return skip(`cannot open ${jt} journey at '${intent.targetStage}'`);

      const now = new Date().toISOString();
      const insert: Record<string, unknown> = {
        org_id: org,
        journey_type: jt,
        entity_type: intent.entityType,
        entity_id: intent.entityId,
        current_stage: open.toStage,
        status: open.status,
        owner_user_id: intent.ownerUserId,
        source: "event",
        metadata: { openedBy: evt.event_type, sourceEventId: evt.id },
        stage_entered_at: now,
        last_activity_at: now,
        started_at: evt.occurred_at ?? now,
      };
      if (open.timestampField) insert[open.timestampField] = now;

      const { data: made, error: insErr } = await db
        .from("journeys").insert(insert).select("id,current_stage,status,org_id").maybeSingle();

      if (insErr) {
        // journeys_entity_uniq fired: a concurrent drain won the race. Re-read
        // and continue as an advancement — never a second journey.
        if (isDuplicate(insErr)) {
          const { data: again } = await db
            .from("journeys").select("id,current_stage,status,org_id")
            .eq("org_id", org).eq("journey_type", jt)
            .eq("entity_type", intent.entityType).eq("entity_id", intent.entityId)
            .maybeSingle();
          journey = (again as JourneyRow | null) ?? null;
          if (!journey) return fail("journey vanished after unique-violation re-read");
        } else {
          return fail(`insert failed: ${insErr.message}`);
        }
      } else {
        const created = made as JourneyRow;
        await appendHistory(db, org, created.id, evt, null, open.toStage, open.reason, open.evidence, intent);
        await emitJourneyEvent(db, evt, created.id, jt, intent, null, open.toStage, "created");
        return { outcome: "created", journeyId: created.id, fromStage: null, toStage: open.toStage, reason: open.reason };
      }
    }

    // ── 3. The journey exists ────────────────────────────────────────────────
    const from = journey.current_stage;

    // LEGACY DUAL-WRITE GUARD (Batch 5.2 finding).
    // journey-intelligence/service.ts::ensureJourney still writes THIS table
    // directly (called from buyers/sellers/leads/social) using its own legacy
    // vocabulary — e.g. a seller journey opens at 'potential', which is not a
    // canonical stage. buildTransition() would then see an unknown `from` and
    // reject every move, blocking the journey FOREVER and silently.
    // We refuse to guess and refuse to overwrite: record an explicit, actionable
    // skip. Batch 5.3's backfill maps these onto canonical stages (the maps
    // already exist in journey-canonical/legacy-map.ts).
    if (!isValidStage(jt, from)) {
      return skip(
        `legacy non-canonical stage '${from}' on this ${jt} journey (written by journey-intelligence ensureJourney) — awaiting Batch 5.3 backfill`,
        journey.id, from,
      );
    }

    // A `created` event must not drag an existing journey back to its initial
    // stage. This is the replay/late-event guard: it is a no-op, not a regression.
    if (intent.createOnly) {
      return skip(
        from === initialStage(jt)
          ? "journey already open at initial stage (replay no-op)"
          : `journey already exists at '${from}' — a create event will not reset it`,
        journey.id, from,
      );
    }

    const t = buildTransition(jt, from, intent.targetStage, {
      reason: intent.reason, evidence: { ...intent.evidence, sourceEvent: evt.event_type },
    });

    // buildTransition returned null ⇒ no-op / invalid / won-is-final.
    // The journey is NOT touched.
    if (!t) {
      return {
        outcome: "blocked", journeyId: journey.id, fromStage: from, toStage: intent.targetStage,
        reason: from === intent.targetStage
          ? "already at target stage (no-op)"
          : `transition ${from} → ${intent.targetStage} rejected by the stage machine`,
      };
    }

    // ── 4. History FIRST. The unique index (journey_id, source_event_id,
    //       to_stage) is the replay guard: if this exact event already produced
    //       this exact transition, we stop here and never touch current_stage.
    const hist = await appendHistory(db, org, journey.id, evt, from, t.toStage, t.reason, t.evidence, intent);
    if (hist === "duplicate") {
      return { outcome: "duplicate", journeyId: journey.id, fromStage: from, toStage: t.toStage, reason: "source event already produced this transition" };
    }
    if (hist === "error") return fail("history append failed");

    // ── 5. Then the head. Guarded by `.eq("current_stage", from)` — optimistic
    //       concurrency: if another drain moved the journey since step 1, this
    //       updates 0 rows and we do NOT overwrite the newer stage with a stale one.
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      current_stage: t.toStage,
      status: t.status,
      stage_entered_at: now,
      last_activity_at: now,
      updated_at: now,
    };
    if (t.timestampField) patch[t.timestampField] = now;
    if (t.kind === "reopen") { patch.paused_at = null; patch.lost_at = null; }
    if (intent.ownerUserId) patch.owner_user_id = intent.ownerUserId;

    const { data: moved, error: upErr } = await db
      .from("journeys").update(patch)
      .eq("id", journey.id).eq("org_id", org)
      .eq("current_stage", from)          // ← stale-event / concurrency guard
      .select("id");
    if (upErr) return fail(`stage update failed: ${upErr.message}`);
    if (!moved || (moved as unknown[]).length === 0) {
      return skip(`journey moved on by a concurrent drain (was '${from}') — stale transition not applied`, journey.id, from);
    }

    const outcome: JourneyOutcome = t.status === "won" ? "completed" : "advanced";
    await emitJourneyEvent(db, evt, journey.id, jt, intent, from, t.toStage, outcome);
    return { outcome, journeyId: journey.id, fromStage: from, toStage: t.toStage, reason: t.reason };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "journey apply crashed");
  }
}

/** Append-only stage history. `duplicate` means the replay guard fired. */
async function appendHistory(
  db: Db, org: string, journeyId: string, evt: DomainEventLike,
  from: string | null, to: string, reason: string,
  evidence: Record<string, unknown>, intent: JourneyIntent,
): Promise<"ok" | "duplicate" | "error"> {
  const { error } = await db.from("journey_events").insert({
    org_id: org,
    journey_id: journeyId,
    entity_type: intent.entityType,
    entity_id: intent.entityId,
    event_type: from === null ? "journey_opened" : "stage_change",
    from_stage: from,
    to_stage: to,
    title: from === null ? `מסע נפתח: ${to}` : `מעבר שלב: ${from} → ${to}`,
    occurred_at: evt.occurred_at,
    source_event_id: evt.id,       // ← idempotency anchor
    actor_user_id: evt.actor_user_id,
    reason,
    evidence,
  });
  if (!error) return "ok";
  if (isDuplicate(error)) return "duplicate";
  console.error("[journey] history append failed:", error.message);
  return "error";
}

/**
 * Emit the canonical journey domain event so the EXISTING kernel subscribers
 * (timeline / search / graph / memory / notification / recommendation) react.
 * Journey code never calls those systems directly.
 *
 * Recursion is impossible by construction: the journey subscriber skips every
 * `journey.*` event (isJourneyEvent), and the idempotency key pins one event per
 * (journey, stage, source event) even if a drain replays.
 */
async function emitJourneyEvent(
  db: Db, evt: DomainEventLike, journeyId: string, jt: JourneyType,
  intent: JourneyIntent, from: string | null, to: string, outcome: JourneyOutcome,
): Promise<void> {
  void db;
  const type =
    outcome === "created" ? DOMAIN_EVENTS.journeyCreated
      : outcome === "completed" ? DOMAIN_EVENTS.journeyCompleted
        : DOMAIN_EVENTS.journeyStageChanged;
  try {
    await emitBusinessEvent({
      type,
      entityType: "journey",
      entityId: journeyId,
      orgId: evt.organization_id,          // service-role context (background drain)
      actorUserId: evt.actor_user_id,
      payload: {
        journeyType: jt,
        subjectType: intent.entityType,
        subjectId: intent.entityId,
        fromStage: from,
        toStage: to,
        reason: intent.reason,
      },
      metadata: { sourceEventType: evt.event_type },
      causationId: evt.id,                 // this event caused that one
      correlationId: evt.id,
      idempotencyKey: `journey:${journeyId}:${to}:${evt.id}`,
    });
  } catch (e) {
    // Best-effort: a failed downstream emit must never roll back a real journey.
    console.error("[journey] emit failed:", e);
  }
}
