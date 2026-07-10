// ============================================================================
// 🧭 ZONO — Journey Center service (server-only). A pure READ/composition layer
// over existing ZONO truth: it reuses the digital twins (buyer/seller/lead) and
// listing scorecards — all of which read directly from buyers/sellers/leads/
// properties — so it is never empty while those entities exist. It writes
// nothing and creates no journey rows. Two batched queries add open-task counts
// and the next upcoming meeting per entity (no N+1). Org-scoped.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getBuyerTwins } from "@/lib/digital-twin/buyers/service";
import { getSellerTwins } from "@/lib/digital-twin/sellers/service";
import { getLeadTwins } from "@/lib/digital-twin/leads/service";
import { getListingScorecards } from "@/lib/listing-agent/service";
import { fromBuyerTwin, fromSellerTwin, fromLeadTwin, fromScorecard, computeKpis, type JourneyExtras } from "./derive";
import type { JourneyCenter, JourneyEntityType, UnifiedJourney } from "./types";

const CAP = 60; // per entity type — twins/scorecards are batched internally

type FkRow = { buyer_id: string | null; seller_id: string | null; lead_id: string | null; property_id: string | null };

/** Batched open-task counts + next upcoming meeting per entity (2 queries). */
async function batchExtras(orgId: string): Promise<{ tasks: Map<string, number>; meetings: Map<string, string> }> {
  const db = await createClient();
  const nowIso = new Date().toISOString();
  const tasks = new Map<string, number>();
  const meetings = new Map<string, string>();
  const key = (t: JourneyEntityType, id: string) => `${t}:${id}`;

  const [tRes, mRes] = await Promise.all([
    db.from("tasks").select("buyer_id,seller_id,lead_id,property_id,status").eq("org_id", orgId).neq("status", "done").neq("status", "cancelled").limit(2000),
    db.from("meetings").select("buyer_id,seller_id,lead_id,property_id,start_at").eq("org_id", orgId).gte("start_at", nowIso).order("start_at", { ascending: true }).limit(2000),
  ]);

  for (const r of ((tRes.data ?? []) as FkRow[])) {
    for (const [t, id] of ([["buyer", r.buyer_id], ["seller", r.seller_id], ["lead", r.lead_id], ["property", r.property_id]] as [JourneyEntityType, string | null][])) {
      if (id) { const k = key(t, id); tasks.set(k, (tasks.get(k) ?? 0) + 1); }
    }
  }
  for (const r of ((mRes.data ?? []) as (FkRow & { start_at: string })[])) {
    for (const [t, id] of ([["buyer", r.buyer_id], ["seller", r.seller_id], ["lead", r.lead_id], ["property", r.property_id]] as [JourneyEntityType, string | null][])) {
      if (id) { const k = key(t, id); if (!meetings.has(k)) meetings.set(k, r.start_at); } // ordered asc → first = earliest
    }
  }
  return { tasks, meetings };
}

export async function getJourneyCenter(): Promise<JourneyCenter> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const empty: JourneyCenter = {
    version: "journey-center@1", generatedAt: new Date().toISOString(), journeys: [],
    kpis: { active: 0, atRisk: 0, waiting: 0, advancing: 0, noActivity: 0, upcomingMeetings: 0 },
    totals: { buyers: 0, sellers: 0, leads: 0, properties: 0 }, hasEntities: false, hasActivity: false, notes: [],
  };
  if (!orgId) return empty;

  const nowMs = Date.now();
  const [buyers, sellers, leads, props, extras] = await Promise.all([
    getBuyerTwins(orgId, CAP).catch(() => null),
    getSellerTwins(orgId, CAP).catch(() => null),
    getLeadTwins(orgId, CAP).catch(() => null),
    getListingScorecards(orgId, CAP).catch(() => null),
    batchExtras(orgId).catch(() => ({ tasks: new Map<string, number>(), meetings: new Map<string, string>() })),
  ]);

  const ex = (t: JourneyEntityType, id: string): JourneyExtras => ({
    openTasks: extras.tasks.get(`${t}:${id}`) ?? 0,
    upcomingMeetingAt: extras.meetings.get(`${t}:${id}`) ?? null,
  });

  const journeys: UnifiedJourney[] = [
    ...(buyers?.twins ?? []).map((t) => fromBuyerTwin(t, ex("buyer", t.identity.id), nowMs)),
    ...(sellers?.twins ?? []).map((t) => fromSellerTwin(t, ex("seller", t.identity.id), nowMs)),
    ...(leads?.twins ?? []).map((t) => fromLeadTwin(t, ex("lead", t.identity.id), nowMs)),
    ...(props?.scorecards ?? []).map((s) => fromScorecard(s, ex("property", s.id), nowMs)),
  ];

  // Priority-first, then most-recent activity.
  journeys.sort((a, b) => b.priority - a.priority || (Date.parse(b.lastActivityAt ?? "0") - Date.parse(a.lastActivityAt ?? "0")));

  const totals = {
    buyers: buyers?.twins.length ?? 0, sellers: sellers?.twins.length ?? 0,
    leads: leads?.twins.length ?? 0, properties: props?.scorecards.length ?? 0,
  };
  const hasEntities = totals.buyers + totals.sellers + totals.leads + totals.properties > 0;
  const hasActivity = journeys.some((j) => j.lastActivityAt != null || j.openTasks > 0 || j.upcomingMeetingAt != null || j.progress > 10);

  return {
    version: "journey-center@1", generatedAt: new Date().toISOString(),
    journeys, kpis: computeKpis(journeys), totals, hasEntities, hasActivity, notes: [],
  };
}
