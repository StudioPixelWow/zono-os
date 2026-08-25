// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 2 · Event Kernel · Outbox processor (server-only).
// Drains the append-only domain_events outbox and projects each event into the
// ONE canonical activity timeline (idempotently, with related-entity fan-out).
// Runs under the service role (cron / worker) — no user session.
//
// State machine per row:
//   pending / failed / stale-processing
//     → claim ('processing')
//     → project → upsert activity_events (idempotent per target timeline)
//     → mark 'done' + processed_at
//   duplicate projection (already present) → counted, NOT an error
//   error → retry_count+1; keep 'pending' until MAX_RETRIES, then 'failed'
//           (dead-letter) with error_summary (last_error)
// Best-effort per row: one bad row never blocks the batch. Self-healing: a row
// stuck in 'processing' (crashed mid-drain) is re-scanned and reprocessed —
// safe because the timeline projection is idempotent.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { invalidateCache } from "@/lib/platform-persistence/compute-cache";
import { projectEventToTimeline, type DomainEventLike } from "./subscriber";
import { projectEventToNotification, notificationEntityColumn, decideNotificationDelivery } from "./notification-subscriber";
import { projectEventToGraphEdges } from "./graph-subscriber";
import { projectEventToMemory } from "./memory-subscriber";
import { projectEventToAutomation } from "./automation-subscriber";
import { projectEventToRecommendationRefresh } from "./recommendation-subscriber";
import { projectEventToMatchRecompute } from "./matching-subscriber";
import { generateMatchesForBuyerId, generateMatchesForPropertyId } from "@/lib/matching-intelligence/recompute";
import { recordDelivery } from "./subscriber-deliveries";
import { classifyEventForSearch } from "@/lib/search-projection/subscriber";
import { indexEntity, softDeleteEntity } from "@/lib/search-projection/indexer";
import { ingestMemoryForEvent } from "@/lib/memory-canonical/ingest";
import { projectEventToJourney } from "./journey-subscriber";
import { applyJourneyIntent, type JourneyOutcome } from "./journey-applier";
import { dispatchForOrg } from "@/lib/journey-automation/orchestrator";
import type { TriggerContext, TriggerEvent, TriggerType } from "@/lib/journey-automation/types";

const MAX_RETRIES = 5;

/**
 * Flatten a domain event's payload into a journey TriggerContext (primitives only).
 * The journey engine evaluates conditions against these fields; anything non-scalar
 * is dropped (never stringified) so a workflow condition sees an honest value or
 * undefined. Org is NEVER taken from here — it comes from the outbox row.
 */
function toTriggerContext(payload: Record<string, unknown> | null): TriggerContext {
  const out: TriggerContext = {};
  if (!payload) return out;
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * A GENUINE notification-delivery failure (not a duplicate). Thrown out of the
 * secondary-subscriber pass so the per-row catch re-drives the event instead of
 * marking it consumed. Every OTHER subscriber still runs first (they are truly
 * best-effort); only a real notification insert failure blocks completion — which
 * is exactly the silent-loss bug this closes. Retry is idempotent (notifications
 * dedupe on org_id+event_id; timeline/graph/memory/journey are all idempotent),
 * and bounded by MAX_RETRIES → dead-letter 'failed'.
 */
class NotificationDeliveryError extends Error {
  constructor(reason: string) { super(reason); this.name = "NotificationDeliveryError"; }
}

export interface DrainResult {
  scanned: number;
  projected: number;       // domain events that produced ≥1 timeline row
  timelineRows: number;    // total activity_events rows written (fan-out counted)
  duplicateSkips: number;  // idempotent no-ops (already projected)
  skipped: number;         // events with no timeline projection
  notified: number;
  graphEdges: number;
  memoryRows: number;
  automationCandidates: number; // events classified into a downstream automation
  recommendationRefreshes: number; // events that invalidated a live-read cache
  cachesInvalidated: number;    // daily_os / executive_os invalidations issued
  searchIndexed: number;        // search_documents upserts/soft-deletes applied
  memoriesIngested: number;     // canonical ai_memory create/reinforce/supersede
  journeysCreated: number;      // canonical journeys opened from real events
  journeysAdvanced: number;     // canonical stage transitions applied
  failed: number;
}

type Row = DomainEventLike & { id: string; retry_count: number };
type Db = ReturnType<typeof createServiceRoleClient>;

/**
 * Process up to `limit` unprocessed domain events into the timeline.
 * Safe to call repeatedly (cron) — only touches unprocessed / stuck rows.
 */
export async function drainDomainEvents(limit = 200): Promise<DrainResult> {
  const db = createServiceRoleClient();
  const out: DrainResult = {
    scanned: 0, projected: 0, timelineRows: 0, duplicateSkips: 0,
    skipped: 0, notified: 0, graphEdges: 0, memoryRows: 0,
    automationCandidates: 0, recommendationRefreshes: 0, cachesInvalidated: 0, searchIndexed: 0, memoriesIngested: 0,
    journeysCreated: 0, journeysAdvanced: 0, failed: 0,
  };

  // Oldest-first so the timeline stays chronological. 'processing' is included
  // so a row stuck by a crashed drain self-heals (idempotent reprocess).
  const { data, error } = await db
    .from("domain_events" as never)
    .select("id,event_type,event_version,organization_id,actor_user_id,entity_type,entity_id,payload,metadata,occurred_at,retry_count")
    .in("processing_status", ["pending", "failed", "processing"] as never)
    .order("occurred_at", { ascending: true })
    .limit(limit);

  if (error || !data) return out;
  const rows = data as unknown as Row[];
  if (rows.length === 0) return out;

  // Claim the batch → 'processing' (best-effort; idempotency covers double-drain).
  await db
    .from("domain_events" as never)
    .update({ processing_status: "processing" } as never)
    .in("id", rows.map((r) => r.id) as never);

  for (const row of rows) {
    out.scanned++;
    const t0 = Date.now();
    try {
      const projections = projectEventToTimeline(row);
      if (projections.length === 0) {
        await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "timeline", status: "skipped", latencyMs: Date.now() - t0 });
        // A timeline-skipped event can still drive automation / recommendations.
        await runDownstreamSubscribers(db, row, out, t0);
        await markDone(db, row.id);
        out.skipped++;
        continue;
      }

      // Idempotent projection: one row per (event_id, target entity). A repeat
      // is a unique-violation we swallow and count — never a duplicate row.
      for (const p of projections) {
        const { error: insErr } = await db.from("activity_events").insert({
          org_id: p.org_id,
          event_id: p.event_id,
          event_type: p.event_type,
          entity_type: p.entity_type,
          entity_id: p.entity_id,
          related_entity_type: p.related_entity_type,
          related_entity_id: p.related_entity_id,
          title: p.title,
          description: p.description,
          actor_user_id: p.actor_user_id,
          occurred_at: p.occurred_at,
          visibility: p.visibility,
          source: p.source,
          metadata: p.metadata,
        } as never);
        if (insErr) {
          if (isDuplicate(insErr)) { out.duplicateSkips++; continue; }
          throw new Error(insErr.message);
        }
        out.timelineRows++;
      }
      await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "timeline", status: "done", latencyMs: Date.now() - t0 });

      // All other subscribers (notification / graph / memory / automation /
      // recommendation) — SECONDARY + best-effort; a failure here never fails
      // the event (the timeline projection already landed).
      await runDownstreamSubscribers(db, row, out, t0);

      await markDone(db, row.id);
      out.projected++;
    } catch (e) {
      out.failed++;
      const nextRetry = (row.retry_count ?? 0) + 1;
      const status = nextRetry >= MAX_RETRIES ? "failed" : "pending"; // 'failed' = dead-letter
      await db
        .from("domain_events" as never)
        .update({
          retry_count: nextRetry,
          processing_status: status,
          error_summary: e instanceof Error ? e.message.slice(0, 500) : "project failed",
        } as never)
        .eq("id", row.id);
    }
  }
  return out;
}

/**
 * Run every SECONDARY subscriber for one event (notification, graph, memory,
 * automation, recommendation). Each is independently best-effort and records its
 * own per-subscriber delivery. Automation NEVER executes — it classifies the
 * event into a downstream candidate that surfaces via the stateless approval
 * inbox. Recommendation keeps Daily OS / Executive event-driven by invalidating
 * their compute caches (replacing polling). Idempotent: notifications dedupe on
 * (org_id,event_id); cache invalidation + delivery inserts are safe on reprocess.
 */
async function runDownstreamSubscribers(db: Db, row: Row, out: DrainResult, t0: number): Promise<void> {
  // A GENUINE notification failure is recorded here and RE-THROWN at the very end
  // (after every other subscriber has run) so the event is NOT marked consumed.
  let notificationHardFailure: string | null = null;

  // ── Notification — idempotent via notifications(org_id, event_id). ──────────
  //    ALWAYS records a delivery (see the graph subscriber below for why silence
  //    is unacceptable): `skipped` + reason when the event is not notifiable,
  //    `duplicate` on an idempotent replay, `done` on success, and `failed` +
  //    reason on a GENUINE insert error — which then re-drives the event rather
  //    than being swallowed while the event is marked done (the silent-loss bug).
  try {
    const note = projectEventToNotification(row);
    if (!note) {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "notification",
        status: "skipped", latencyMs: Date.now() - t0,
        metadata: { reason: "event_not_notifiable" },
      });
    } else {
      const fkCol = notificationEntityColumn(note.entityType);
      const noteRow: Record<string, unknown> = {
        org_id: note.org_id, user_id: note.user_id, level: note.level,
        category: note.category, title: note.title, href: note.href, event_id: row.id,
      };
      if (fkCol) noteRow[fkCol] = note.entityId;
      const { error: nErr } = await db.from("notifications").insert(noteRow as never);
      const decision = decideNotificationDelivery(nErr);
      if (decision.notified) out.notified++;
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "notification",
        status: decision.status, latencyMs: Date.now() - t0,
        error: decision.status === "failed" ? (decision.reason ?? undefined) : undefined,
      });
      if (decision.hardFailure) {
        // Genuine failure — observable (delivery ledger + log) and NOT swallowed.
        notificationHardFailure = decision.reason ?? "notification_insert_failed";
        console.error(`[kernel] notification insert failed for event ${row.id} (${row.event_type}): ${notificationHardFailure}`);
      }
    }
  } catch (e) {
    // A throw here means the pure projection or the delivery-ledger write itself
    // failed. Record it and re-drive — never silently continue as if notified.
    notificationHardFailure = e instanceof Error ? e.message : "notification subscriber crashed";
    console.error(`[kernel] notification subscriber crashed for event ${row.id} (${row.event_type}):`, e);
    try {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "notification",
        status: "failed", latencyMs: Date.now() - t0, error: notificationHardFailure,
      });
    } catch { /* ledger write failed too — the re-drive below is the safety net */ }
  }

  // ── Graph — incremental edges on the canonical entity_relationships substrate.
  //    upsert = create/refresh (idempotent on the 6-part key; reactivates a retired
  //    edge); retire = inactivate (status→inactive, valid_to=now — history kept). ──
  try {
    let applied = 0;
    const now = new Date().toISOString();
    const graphOps = projectEventToGraphEdges(row);
    for (const op of graphOps) {
      if (op.op === "retire") {
        const { error } = await db.from("entity_relationships")
          .update({ status: "inactive", valid_to: now, last_seen_at: now } as never)
          .eq("org_id", op.org_id)
          .eq("source_entity_type", op.source_entity_type).eq("source_entity_id", op.source_entity_id)
          .eq("target_entity_type", op.target_entity_type).eq("target_entity_id", op.target_entity_id)
          .eq("relationship_type", op.relationship_type);
        if (!error) applied++;
      } else {
        const { error } = await db.from("entity_relationships").upsert({
          org_id: op.org_id,
          source_entity_type: op.source_entity_type, source_entity_id: op.source_entity_id,
          target_entity_type: op.target_entity_type, target_entity_id: op.target_entity_id,
          relationship_type: op.relationship_type,
          status: "active",
          strength_score: op.strength ?? 0,
          metadata: op.metadata ?? {},
          last_seen_at: now,
          valid_to: null, // reactivate if it had been retired
          source_event_id: row.id,
        } as never, { onConflict: "org_id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type" });
        if (!error) { out.graphEdges++; applied++; }
      }
    }
    // Always record a delivery — an honest `skipped` when the event legitimately
    // yields no edges (e.g. lead.created: a brand-new lead has no relationships
    // yet). Recording SILENCE would make "ran, nothing to do" indistinguishable
    // from "never ran / crashed before recording", which is exactly what the
    // delivery ledger exists to prevent.
    await recordDelivery(db, {
      orgId: row.organization_id, eventId: row.id, subscriber: "graph",
      status: applied ? "done" : "skipped",
      latencyMs: Date.now() - t0,
      metadata: { edgesApplied: applied, opsPlanned: graphOps.length, reason: applied ? null : "no_edges_for_event" },
    });
  } catch { /* graph is non-critical */ }

  // ── Org-Memory (LEGACY milestone ledger) — kept for compatibility; no delivery
  //    is recorded here (the canonical memory subscriber below owns 'memory'). ────
  try {
    const mem = projectEventToMemory(row);
    if (mem) { const { error: mErr } = await db.from("zono_org_memory_events" as never).insert(mem as never); if (!mErr) out.memoryRows++; }
  } catch { /* legacy memory is non-critical */ }

  // ── Canonical AI Memory — event-driven ingestion into ai_memory (create /
  //    reinforce / supersede / skip), idempotent per identity + source event. ────
  try {
    const r = await ingestMemoryForEvent(db, row);
    const touched = r.created + r.reinforced + r.superseded;
    out.memoriesIngested += touched;
    // Always record a delivery. When the event carries no salient fact the
    // honest outcome is `skipped` WITH a reason — never an absent row (see the
    // graph subscriber above for why silence is unacceptable in the ledger).
    await recordDelivery(db, {
      orgId: row.organization_id, eventId: row.id, subscriber: "memory",
      status: r.failed > 0 && touched === 0 ? "failed" : touched > 0 ? "done" : "skipped",
      latencyMs: Date.now() - t0,
      metadata: {
        created: r.created, reinforced: r.reinforced, superseded: r.superseded,
        skipped: r.skipped, failed: r.failed,
        reason: touched > 0 ? null : r.failed > 0 ? "ingest_failed" : "no_salient_fact_in_event",
      },
    });
  } catch { /* canonical memory is non-critical */ }

  // ── Journey (Batch 5.2) — canonical journeys created/advanced from real events.
  //    The PURE subscriber decides WHAT (evidence only); the applier performs it
  //    through buildTransition() + the 5.1 DB constraints. Every event yields a
  //    delivery — created / advanced / completed / blocked / skipped / duplicate /
  //    failed — never silence.
  try {
    const proj = projectEventToJourney(row);

    if (proj.kind === "skip") {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "journey",
        status: "skipped", latencyMs: Date.now() - t0,
        metadata: { reason: proj.reason, detail: proj.detail ?? null },
      });
    } else {
      const results: { outcome: JourneyOutcome; journeyId: string | null; from: string | null; to: string | null; reason: string; subject: string }[] = [];
      for (const intent of proj.intents) {
        const r = await applyJourneyIntent(db, row, intent);
        if (r.outcome === "created") out.journeysCreated++;
        if (r.outcome === "advanced" || r.outcome === "completed") out.journeysAdvanced++;
        results.push({
          outcome: r.outcome, journeyId: r.journeyId, from: r.fromStage, to: r.toStage,
          reason: r.reason, subject: `${intent.journeyType}:${intent.entityId}`,
        });
      }
      // One delivery per EVENT. With fan-out (e.g. deal.won touches deal+buyer+
      // seller+property) the status is the worst real outcome, and every
      // per-journey result is preserved in metadata — no detail is lost.
      const anyFailed = results.some((r) => r.outcome === "failed");
      const anyApplied = results.some((r) => r.outcome === "created" || r.outcome === "advanced" || r.outcome === "completed");
      const allDuplicate = results.length > 0 && results.every((r) => r.outcome === "duplicate");
      const status = anyFailed && !anyApplied ? "failed"
        : anyApplied ? "done"
          : allDuplicate ? "duplicate"
            : "skipped";
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "journey",
        status, latencyMs: Date.now() - t0,
        error: anyFailed ? results.find((r) => r.outcome === "failed")?.reason : undefined,
        metadata: { intents: results.length, results },
      });
    }
  } catch (e) {
    await recordDelivery(db, {
      orgId: row.organization_id, eventId: row.id, subscriber: "journey",
      status: "failed", latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : "journey subscriber crashed",
    });
    // Journey is non-critical to the rest of the drain — other subscribers ran.
  }

  // ── Automation — the ONE canonical seam between the event kernel and the
  //    journey-automation engine. The pure classifier decides the intent; here we
  //    (a) DISPATCH to the event-driven journey workflows when the event maps to a
  //    journey TriggerType, and (b) leave the approval-bundle candidate to surface
  //    via the stateless inbox on next read (nothing is auto-sent).
  //
  //    Dispatch is org-isolated (org comes from the outbox row, NEVER the payload),
  //    idempotent across retries/replay (the execution's unique (workflow_id,
  //    dedup_key=event id) guard drops a duplicate dispatch), and provider-free:
  //    the journey action handler only creates tasks/reminders and records
  //    deterministic instructions — it performs NO external send / provider spend,
  //    so there is nothing for the Billing 8.3 gate to block here (§9), and no live
  //    WhatsApp/Facebook/paid-AI side effect (§13). Best-effort: a dispatch failure
  //    is recorded (never silent) but does not fail the event — the outbox's
  //    at-least-once redrive re-dispatches idempotently on a later reprocess.
  try {
    const intent = projectEventToAutomation(row);
    if (!intent) {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "automation",
        status: "skipped", latencyMs: Date.now() - t0,
        metadata: { reason: "no_automation_for_event" },
      });
    } else {
      out.automationCandidates++;
      let journeyDispatched: number | null = null;
      let journeyError: string | null = null;
      if (intent.journeyTrigger) {
        try {
          const ev: TriggerEvent = {
            triggerType: intent.journeyTrigger as TriggerType,
            entityType: row.entity_type, entityId: row.entity_id, entityLabel: null,
            context: toTriggerContext(row.payload), dedupKey: intent.dedupKey,
          };
          const r = await dispatchForOrg(db, row.organization_id, row.actor_user_id ?? null, ev, "execution");
          journeyDispatched = r.started;
        } catch (e) {
          journeyError = e instanceof Error ? e.message : "journey dispatch failed";
          console.error(`[kernel] journey dispatch failed for event ${row.id} (${row.event_type}): ${journeyError}`);
        }
      }
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "automation",
        status: journeyError ? "failed" : "done",
        latencyMs: Date.now() - t0,
        error: journeyError ?? undefined,
        metadata: {
          journeyTrigger: intent.journeyTrigger, bundleEventType: intent.bundleEventType,
          requiresApproval: intent.requiresApproval, journeyDispatched,
        },
      });
    }
  } catch { /* automation classification is non-critical */ }

  // ── Search — keep the canonical search_documents projection event-driven. ────
  try {
    const intent = classifyEventForSearch(row);
    if (!intent) {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "search",
        status: "skipped", latencyMs: Date.now() - t0,
        metadata: { reason: "event_not_searchable" },
      });
    } else {
      const oc = intent.action === "soft_delete"
        ? await softDeleteEntity(db, row.organization_id, intent.entityType, intent.entityId, row.id)
        : await indexEntity(db, row.organization_id, intent.entityType, intent.entityId, row.id);
      if (oc.status === "done") out.searchIndexed++;
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "search",
        status: oc.status === "done" ? "done" : oc.status === "error" ? "failed" : "skipped",
        latencyMs: Date.now() - t0,
        metadata: { action: intent.action, entityType: intent.entityType, result: oc.status, reason: oc.reason ?? null },
      });
    }
  } catch { /* search projection is non-critical */ }

  // ── Recommendation — keep Daily OS / Executive event-driven (no polling). ────
  try {
    const refresh = projectEventToRecommendationRefresh(row);
    if (!refresh) {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "recommendation",
        status: "skipped", latencyMs: Date.now() - t0,
        metadata: { reason: "no_affected_recommendation_area" },
      });
    } else {
      out.recommendationRefreshes++;
      if (refresh.refreshDaily) { if (await invalidateCache(row.organization_id, "daily_os")) out.cachesInvalidated++; }
      if (refresh.refreshExecutive) { if (await invalidateCache(row.organization_id, "executive_os")) out.cachesInvalidated++; }
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "recommendation", status: "done",
        latencyMs: Date.now() - t0,
        metadata: { areas: refresh.affectedAreas, refreshDaily: refresh.refreshDaily, refreshExecutive: refresh.refreshExecutive },
      });
    }
  } catch { /* recommendation refresh is non-critical */ }

  // ── Matching — BOUNDED, event-driven recompute (buyer 1×P / property 1×B). ───
  //    Keeps a buyer's match set fresh the instant criteria or inventory change,
  //    without the org-wide daily scan. Best-effort: the daily reconcile cron is
  //    the safety net, so a failure here never fails the event. Idempotent
  //    (upsert on (org,buyer,property); child rows regenerated per match_id).
  try {
    const intent = projectEventToMatchRecompute(row);
    if (!intent) {
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "matching",
        status: "skipped", latencyMs: Date.now() - t0, metadata: { reason: "no_match_recompute_for_event" },
      });
    } else {
      const r = intent.scope === "buyer"
        ? await generateMatchesForBuyerId(row.organization_id, intent.id, { db })
        : await generateMatchesForPropertyId(row.organization_id, intent.id, { db });
      // 9.7 OBSERVABILITY — never silently label an incomplete scan complete. When the
      // candidate universe exceeded the scan ceiling, `truncated` + the resume cursor
      // ride the delivery metadata (and a warn log) so operators can see continuation
      // is pending; the daily reconcile is the safety net.
      if (r.truncated) console.warn(`[matching] recompute TRUNCATED scope=${r.scope} id=${r.id} scanned=${r.scanned} total=${r.total} nextCursor=${r.nextCursor ?? "-"}`);
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "matching", status: "done",
        latencyMs: Date.now() - t0,
        metadata: { scope: intent.scope, id: intent.id, reason: intent.reason, matches: r.kept, scanned: r.scanned, total: r.total, truncated: r.truncated, continuationPending: r.truncated },
      });
    }
  } catch (e) {
    await recordDelivery(db, {
      orgId: row.organization_id, eventId: row.id, subscriber: "matching",
      status: "failed", latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : "match recompute failed",
    });
    // Non-critical to the event — the daily reconcile cron will heal it.
  }

  // ── Re-drive on a GENUINE notification failure ──────────────────────────────
  // Every other subscriber has now run (they are best-effort). But a real
  // notification insert failure must NOT let the event be marked consumed — throw
  // so the per-row catch increments retry_count and keeps it 'pending' (then
  // dead-letters at MAX_RETRIES). Idempotent on replay; bounded; observable.
  if (notificationHardFailure) throw new NotificationDeliveryError(notificationHardFailure);
}

/** Postgres unique-violation (idempotent no-op), not a real failure. */
function isDuplicate(err: { code?: string; message?: string }): boolean {
  return err.code === "23505" || (err.message ?? "").toLowerCase().includes("duplicate key");
}

async function markDone(db: ReturnType<typeof createServiceRoleClient>, id: string): Promise<void> {
  await db
    .from("domain_events" as never)
    .update({ processing_status: "done", processed_at: new Date().toISOString() } as never)
    .eq("id", id);
}
