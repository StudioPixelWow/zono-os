// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5C · COCKPIT JOURNEY SERVICE (server-only).
//
// The ONE read every entity cockpit uses. Canonical-first, exactly like 5.4 made
// the Journey Center:
//     1. CANONICAL  — `journeys` + `journey_events`. The spine is the truth.
//     2. FALLBACK   — no canonical journey ⇒ a MARKED compatibility record with
//                     an empty history and no commands. Never a legacy stage
//                     dressed up as a canonical one.
//     3. never both. never a stale legacy value outranking the spine.
//
// All shaping happens in the PURE assembler (5.5B). This file only reads rows and
// hands them over — so the rules stay testable without a database.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { TaskStatus } from "@/lib/supabase/types";
import type { CanonicalJourneyRow } from "@/lib/journey-center/canonical";
import { isJourneyType, type JourneyType } from "@/lib/journey-canonical";
import {
  assembleCockpitJourney, fallbackCockpitJourney,
  type CockpitEventRow,
} from "./assemble";
import type { CockpitEntityType, CockpitFacts, CockpitJourney } from "./types";

/** Which task/meeting column links a row to this entity. Deal included — tasks has deal_id. */
const LINK_COLUMN: Record<CockpitEntityType, string> = {
  buyer: "buyer_id",
  seller: "seller_id",
  lead: "lead_id",
  property: "property_id",
  deal: "deal_id",
};

const OPEN_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];

/**
 * The canonical journey for one entity, as the cockpit renders it.
 * Never throws — a cockpit that 500s because its journey read failed is worse than
 * a cockpit that says "no canonical journey yet".
 */
export async function getCockpitJourney(
  entityType: CockpitEntityType,
  entityId: string,
): Promise<CockpitJourney> {
  const nowMs = Date.now();
  const noFacts: CockpitFacts = {
    ownerUserId: null, openTasks: 0, upcomingMeetingAt: null, linked: [], recommendation: null,
  };

  try {
    const { profile } = await getSessionContext();
    const orgId = profile?.org_id;
    if (!orgId) {
      return fallbackCockpitJourney({
        entityType, entityId, canonicalStage: null,
        reason: "אין הקשר ארגון", facts: noFacts, nowMs,
      });
    }

    const db = await createClient();

    // 1. THE SPINE.
    const { data: jRow } = await db
      .from("journeys")
      .select("id,org_id,journey_type,entity_type,entity_id,current_stage,status,owner_user_id,stage_entered_at,last_activity_at,started_at,source,metadata")
      .eq("org_id", orgId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    const facts = await readFacts(entityType, entityId, orgId).catch(() => noFacts);

    if (!jRow) {
      // No canonical journey. We say so — and we do NOT reach for a legacy table to
      // fill the silence. 5.3 backfilled the real ones; anything still missing here
      // is a genuine gap the broker deserves to see.
      return fallbackCockpitJourney({
        entityType, entityId, canonicalStage: null,
        reason: "טרם נוצר מסע קנוני לישות הזו", facts, nowMs,
      });
    }

    const r = jRow as Record<string, unknown>;
    const rawType = String(r.journey_type);
    if (!isJourneyType(rawType)) {
      return fallbackCockpitJourney({
        entityType, entityId, canonicalStage: null,
        reason: `סוג מסע לא מוכר '${rawType}'`, facts, nowMs,
      });
    }

    const journey: CanonicalJourneyRow = {
      id: String(r.id),
      orgId: String(r.org_id),
      journeyType: rawType as JourneyType,
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      currentStage: String(r.current_stage),
      status: String(r.status ?? "active"),
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      stageEnteredAt: (r.stage_entered_at as string | null) ?? null,
      lastActivityAt: (r.last_activity_at as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      source: (r.source as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    };

    // 2. REAL HISTORY. Newest first; the assembler re-sorts and caps.
    // 5.6I: `source_event_id` selected too — it is the ONLY admissible stage-
    // entry evidence (the shared verified-dwell gate in the assembler needs it).
    const { data: evs } = await db
      .from("journey_events")
      .select("id,journey_id,event_type,from_stage,to_stage,occurred_at,reason,actor_user_id,evidence,source_event_id")
      .eq("org_id", orgId)
      .eq("journey_id", journey.id)
      .order("occurred_at", { ascending: false })
      .limit(100);

    const events: CockpitEventRow[] = ((evs ?? []) as Record<string, unknown>[]).map((e) => ({
      id: String(e.id),
      journeyId: String(e.journey_id),
      eventType: String(e.event_type ?? ""),
      fromStage: (e.from_stage as string | null) ?? null,
      toStage: (e.to_stage as string | null) ?? null,
      occurredAt: (e.occurred_at as string | null) ?? null,
      reason: (e.reason as string | null) ?? null,
      actorUserId: (e.actor_user_id as string | null) ?? null,
      evidence: (e.evidence as Record<string, unknown> | null) ?? null,
      sourceEventId: (e.source_event_id as string | null) ?? null,
    }));

    return assembleCockpitJourney({
      journey,
      events,
      facts: { ...facts, ownerUserId: journey.ownerUserId ?? facts.ownerUserId },
      nowMs,
    });
  } catch (err) {
    console.error("[journey-cockpit] read failed:", err);
    // 5.6I: a FAILED read is "unavailable" — a different claim from "no
    // canonical journey yet". The flag keeps the two distinct in the UI.
    return fallbackCockpitJourney({
      entityType, entityId, canonicalStage: null,
      reason: "קריאת המסע נכשלה", facts: noFacts, nowMs,
      providerFailure: true,
    });
  }
}

/** Context that does not live on the journey row. Counted, never estimated. */
async function readFacts(
  entityType: CockpitEntityType,
  entityId: string,
  orgId: string,
): Promise<CockpitFacts> {
  const db = await createClient();
  const col = LINK_COLUMN[entityType];
  const nowIso = new Date().toISOString();

  const [tasksRes, meetRes] = await Promise.all([
    db.from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq(col, entityId)
      .in("status", OPEN_TASK_STATUSES),
    db.from("meetings")
      .select("start_at")
      .eq("org_id", orgId)
      .eq(col, entityId)
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(1),
  ]);

  const meeting = ((meetRes.data ?? []) as { start_at?: string }[])[0]?.start_at ?? null;

  return {
    ownerUserId: null,                       // the journey row owns this; merged by the caller
    openTasks: tasksRes.count ?? 0,
    upcomingMeetingAt: meeting,
    linked: [],                              // 5.5F wires cross-entity links
    recommendation: null,                    // null until a real engine produces one
  };
}
