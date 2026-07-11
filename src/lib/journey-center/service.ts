// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.4 · Journey Center service — CANONICAL FIRST.
//
// WHAT CHANGED AND WHY.
// Until this batch the Journey Center DERIVED its lifecycle from the digital twins
// and, in its own words, "never [read] the `journeys` table". That was the right
// call when `journeys` was empty. It no longer is: Batch 5.2 fills it from real
// events and Batch 5.3 backfilled the 9 real property journeys. Continuing to
// derive means the page can disagree with the spine — two Journey systems again.
//
// The read order is now:
//   1. CANONICAL  — journeys + journey_events. The spine is the truth.
//   2. FALLBACK   — the derived twin model, ONLY for entities that have no
//                   canonical journey yet, always MARKED, and re-expressed in the
//                   canonical vocabulary through the Batch 5.3 registry.
//   3. NEVER BOTH for the same entity (guaranteed by the canonicalKeys set).
//   4. A stale fallback can never outrank a newer canonical stage — it is not
//      even considered when a canonical journey exists.
//
// Anything whose stage cannot be mapped is EXCLUDED and reported in `diagnostics`,
// never guessed onto a stage. No writes. Org-scoped by RLS.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getBuyerTwins } from "@/lib/digital-twin/buyers/service";
import { getSellerTwins } from "@/lib/digital-twin/sellers/service";
import { getLeadTwins } from "@/lib/digital-twin/leads/service";
import { getListingScorecards } from "@/lib/listing-agent/service";
import { isJourneyType, type JourneyType } from "@/lib/journey-canonical";
import { fromBuyerTwin, fromSellerTwin, fromLeadTwin, fromScorecard, type JourneyExtras } from "./derive";
import {
  fromCanonicalJourney, markFallback,
  type CanonicalJourneyRow, type CanonicalTransition, type EntityFacts,
} from "./canonical";
import { applyFilters, computeJourneyKpis, sortByBusinessPriority } from "./kpis";
import type { JourneyCenter, JourneyEntityType, JourneyFilters, UnifiedJourney } from "./types";

const CAP = 60;

type FkRow = { buyer_id: string | null; seller_id: string | null; lead_id: string | null; property_id: string | null };

const HREF: Record<string, (id: string) => string> = {
  buyer: (id) => `/buyers/${id}`,
  seller: (id) => `/sellers/${id}`,
  lead: (id) => `/leads/${id}`,
  property: (id) => `/properties/${id}`,
  deal: (id) => `/deals?deal=${id}`,
};

/** Batched open-task counts + next upcoming meeting per entity (2 queries, no N+1). */
async function batchExtras(orgId: string): Promise<{ tasks: Map<string, number>; meetings: Map<string, string> }> {
  const db = await createClient();
  const nowIso = new Date().toISOString();
  const tasks = new Map<string, number>();
  const meetings = new Map<string, string>();
  const key = (t: string, id: string) => `${t}:${id}`;

  const [tRes, mRes] = await Promise.all([
    db.from("tasks").select("buyer_id,seller_id,lead_id,property_id,status").eq("org_id", orgId).neq("status", "done").neq("status", "cancelled").limit(2000),
    db.from("meetings").select("buyer_id,seller_id,lead_id,property_id,start_at").eq("org_id", orgId).gte("start_at", nowIso).order("start_at", { ascending: true }).limit(2000),
  ]);

  for (const r of ((tRes.data ?? []) as FkRow[])) {
    for (const [t, id] of ([["buyer", r.buyer_id], ["seller", r.seller_id], ["lead", r.lead_id], ["property", r.property_id]] as [string, string | null][])) {
      if (id) { const k = key(t, id); tasks.set(k, (tasks.get(k) ?? 0) + 1); }
    }
  }
  for (const r of ((mRes.data ?? []) as (FkRow & { start_at: string })[])) {
    for (const [t, id] of ([["buyer", r.buyer_id], ["seller", r.seller_id], ["lead", r.lead_id], ["property", r.property_id]] as [string, string | null][])) {
      if (id) { const k = key(t, id); if (!meetings.has(k)) meetings.set(k, r.start_at); }
    }
  }
  return { tasks, meetings };
}

/** Entity titles for the canonical journeys — batched per table, never N+1. */
async function batchTitles(orgId: string, byType: Map<string, string[]>): Promise<Map<string, string>> {
  const db = await createClient();
  const out = new Map<string, string>();
  const TABLE: Record<string, { table: string; col: string }> = {
    buyer: { table: "buyers", col: "full_name" },
    seller: { table: "sellers", col: "full_name" },
    lead: { table: "leads", col: "full_name" },
    property: { table: "properties", col: "title" },
    deal: { table: "deals", col: "title" },
  };
  await Promise.all([...byType.entries()].map(async ([t, ids]) => {
    const spec = TABLE[t];
    if (!spec || !ids.length) return;
    const { data } = await db.from(spec.table).select(`id,${spec.col}`).eq("org_id", orgId).in("id", ids);
    for (const r of ((data ?? []) as Record<string, string>[])) {
      if (r.id && r[spec.col]) out.set(`${t}:${r.id}`, r[spec.col]);
    }
  }));
  return out;
}

export async function getJourneyCenter(filters: JourneyFilters = {}): Promise<JourneyCenter> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const empty: JourneyCenter = {
    version: "journey-center@2-canonical", generatedAt: new Date().toISOString(), journeys: [],
    kpis: computeJourneyKpis([]),
    totals: { buyers: 0, sellers: 0, leads: 0, properties: 0 },
    hasEntities: false, hasActivity: false, notes: [], diagnostics: [],
  };
  if (!orgId) return empty;

  const db = await createClient();
  const nowMs = Date.now();
  const diagnostics: JourneyCenter["diagnostics"] = [];

  // ── 1. CANONICAL — the spine. RLS scopes this to the caller's org. ─────────
  const { data: jRows } = await db
    .from("journeys")
    .select("id,org_id,journey_type,entity_type,entity_id,current_stage,status,owner_user_id,stage_entered_at,last_activity_at,started_at,source,metadata")
    .eq("org_id", orgId)
    .limit(500);

  const canonicalRows: CanonicalJourneyRow[] = [];
  for (const r of ((jRows ?? []) as Record<string, unknown>[])) {
    const jt = String(r.journey_type);
    if (!isJourneyType(jt)) {
      diagnostics.push({ entityType: String(r.entity_type), entityId: String(r.entity_id), reason: `unknown journey_type '${jt}'` });
      continue;
    }
    canonicalRows.push({
      id: String(r.id), orgId: String(r.org_id), journeyType: jt as JourneyType,
      entityType: String(r.entity_type), entityId: String(r.entity_id),
      currentStage: String(r.current_stage), status: String(r.status ?? "active"),
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      stageEnteredAt: (r.stage_entered_at as string | null) ?? null,
      lastActivityAt: (r.last_activity_at as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      source: (r.source as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    });
  }

  // Last transition per journey (one query, newest first).
  const lastByJourney = new Map<string, CanonicalTransition>();
  if (canonicalRows.length) {
    const { data: evs } = await db
      .from("journey_events")
      .select("journey_id,from_stage,to_stage,occurred_at,reason,actor_user_id,created_at")
      .eq("org_id", orgId)
      .in("journey_id", canonicalRows.map((j) => j.id))
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const e of ((evs ?? []) as Record<string, unknown>[])) {
      const jid = String(e.journey_id);
      if (lastByJourney.has(jid)) continue;            // ordered desc → first is newest
      lastByJourney.set(jid, {
        journeyId: jid,
        fromStage: (e.from_stage as string | null) ?? null,
        toStage: String(e.to_stage),
        occurredAt: (e.occurred_at as string | null) ?? null,
        reason: (e.reason as string | null) ?? null,
        actorUserId: (e.actor_user_id as string | null) ?? null,
      });
    }
  }

  const extras = await batchExtras(orgId).catch(() => ({ tasks: new Map<string, number>(), meetings: new Map<string, string>() }));
  const idsByType = new Map<string, string[]>();
  for (const j of canonicalRows) {
    const arr = idsByType.get(j.entityType) ?? [];
    arr.push(j.entityId);
    idsByType.set(j.entityType, arr);
  }
  const titles = await batchTitles(orgId, idsByType).catch(() => new Map<string, string>());

  const facts = (t: string, id: string): EntityFacts => ({
    title: titles.get(`${t}:${id}`) ?? null,
    href: HREF[t]?.(id) ?? null,
    ownerName: null,                    // not resolved yet → NULL, never invented
    openTasks: extras.tasks.get(`${t}:${id}`) ?? 0,
    upcomingMeetingAt: extras.meetings.get(`${t}:${id}`) ?? null,
    linked: [],
  });

  const canonicalJourneys: UnifiedJourney[] = canonicalRows.map((j) =>
    fromCanonicalJourney(j, lastByJourney.get(j.id) ?? null, facts(j.entityType, j.entityId), nowMs));

  // The set that makes "never both" true.
  const canonicalKeys = new Set(canonicalRows.map((j) => `${j.entityType}:${j.entityId}`));

  // ── 2. FALLBACK — only for entities WITHOUT a canonical journey. ───────────
  const [buyers, sellers, leads, props] = await Promise.all([
    getBuyerTwins(orgId, CAP).catch(() => null),
    getSellerTwins(orgId, CAP).catch(() => null),
    getLeadTwins(orgId, CAP).catch(() => null),
    getListingScorecards(orgId, CAP).catch(() => null),
  ]);

  const ex = (t: JourneyEntityType, id: string): JourneyExtras => ({
    openTasks: extras.tasks.get(`${t}:${id}`) ?? 0,
    upcomingMeetingAt: extras.meetings.get(`${t}:${id}`) ?? null,
  });

  const derived: UnifiedJourney[] = [
    ...(buyers?.twins ?? []).map((t) => fromBuyerTwin(t, ex("buyer", t.identity.id), nowMs)),
    ...(sellers?.twins ?? []).map((t) => fromSellerTwin(t, ex("seller", t.identity.id), nowMs)),
    ...(leads?.twins ?? []).map((t) => fromLeadTwin(t, ex("lead", t.identity.id), nowMs)),
    ...(props?.scorecards ?? []).map((s) => fromScorecard(s, ex("property", s.id), nowMs)),
  ];

  const fallbacks: UnifiedJourney[] = [];
  for (const d of derived) {
    if (canonicalKeys.has(`${d.entityType}:${d.entityId}`)) continue;   // canonical wins — never both
    const marked = markFallback(d);
    if (!marked) {
      diagnostics.push({
        entityType: d.entityType, entityId: d.entityId,
        reason: `derived stage '${d.currentStage}' has no canonical peer — excluded rather than guessed`,
      });
      continue;
    }
    fallbacks.push(marked);
  }

  const all = sortByBusinessPriority(applyFilters([...canonicalJourneys, ...fallbacks], filters));

  const totals = {
    buyers: buyers?.twins.length ?? 0, sellers: sellers?.twins.length ?? 0,
    leads: leads?.twins.length ?? 0, properties: props?.scorecards.length ?? 0,
  };
  const hasEntities = totals.buyers + totals.sellers + totals.leads + totals.properties > 0 || canonicalRows.length > 0;
  const hasActivity = all.some((j) => j.lastActivityAt != null || j.openTasks > 0 || j.upcomingMeetingAt != null || j.progress > 10);

  const notes: string[] = [];
  if (fallbacks.length) notes.push(`${fallbacks.length} רשומות תאימות — טרם נוצר עבורן מסע קנוני`);
  if (diagnostics.length) notes.push(`${diagnostics.length} רשומות לא הוצגו — שלב ללא מיפוי קנוני`);

  return {
    version: "journey-center@2-canonical",
    generatedAt: new Date().toISOString(),
    journeys: all,
    kpis: computeJourneyKpis(all),
    totals, hasEntities, hasActivity, notes, diagnostics,
  };
}

/** 5.4F — the detail view: the journey plus its REAL transition history. */
export async function getJourneyDetail(journeyId: string): Promise<{
  journey: UnifiedJourney | null;
  history: CanonicalTransition[];
} | null> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return null;
  const db = await createClient();

  const { data } = await db
    .from("journeys")
    .select("id,org_id,journey_type,entity_type,entity_id,current_stage,status,owner_user_id,stage_entered_at,last_activity_at,started_at,source,metadata")
    .eq("org_id", orgId).eq("id", journeyId).maybeSingle();
  const r = data as Record<string, unknown> | null;
  if (!r || !isJourneyType(String(r.journey_type))) return null;

  const row: CanonicalJourneyRow = {
    id: String(r.id), orgId: String(r.org_id), journeyType: String(r.journey_type) as JourneyType,
    entityType: String(r.entity_type), entityId: String(r.entity_id),
    currentStage: String(r.current_stage), status: String(r.status ?? "active"),
    ownerUserId: (r.owner_user_id as string | null) ?? null,
    stageEnteredAt: (r.stage_entered_at as string | null) ?? null,
    lastActivityAt: (r.last_activity_at as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  };

  const { data: evs } = await db
    .from("journey_events")
    .select("journey_id,from_stage,to_stage,occurred_at,reason,actor_user_id")
    .eq("org_id", orgId).eq("journey_id", journeyId)
    .order("created_at", { ascending: false }).limit(100);

  const history: CanonicalTransition[] = ((evs ?? []) as Record<string, unknown>[]).map((e) => ({
    journeyId: String(e.journey_id),
    fromStage: (e.from_stage as string | null) ?? null,
    toStage: String(e.to_stage),
    occurredAt: (e.occurred_at as string | null) ?? null,
    reason: (e.reason as string | null) ?? null,
    actorUserId: (e.actor_user_id as string | null) ?? null,
  }));

  const extras = await batchExtras(orgId).catch(() => ({ tasks: new Map<string, number>(), meetings: new Map<string, string>() }));
  const titles = await batchTitles(orgId, new Map([[row.entityType, [row.entityId]]])).catch(() => new Map<string, string>());

  const journey = fromCanonicalJourney(row, history[0] ?? null, {
    title: titles.get(`${row.entityType}:${row.entityId}`) ?? null,
    href: HREF[row.entityType]?.(row.entityId) ?? null,
    ownerName: null,
    openTasks: extras.tasks.get(`${row.entityType}:${row.entityId}`) ?? 0,
    upcomingMeetingAt: extras.meetings.get(`${row.entityType}:${row.entityId}`) ?? null,
    linked: [],
  }, Date.now());

  return { journey, history };
}
