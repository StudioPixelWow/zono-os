/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Deal detail reader (Epic 3 · Part 11, server-only)
// ----------------------------------------------------------------------------
// Aggregates one deal with its linked offers, commissions (+collection totals),
// documents, journey history and merged activity timeline for the deal-detail
// workspace. Read-only; mutations stay in DealService / domain actions. Loose
// client for tables newer than the generated types (offers/commissions).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { activityEventRepository } from "@/lib/activity/repository";

export interface DealOfferRef { id: string; amount: number | null; status: string }
export interface DealCommissionRef { id: string; gross_amount: number; net_amount: number; status: string; totalDue: number; totalCollected: number }
export interface DealDocRef { id: string; title: string; signature_status: string }
export interface DealTimelineItem { event_type: string; title: string | null; occurred_at: string }
export interface DealDetail {
  id: string; title: string; stage: string; status: string; value: number | null;
  buyer_id: string | null; seller_id: string | null; property_id: string | null;
  buyerName: string | null; sellerName: string | null; propertyTitle: string | null;
  expected_close_date: string | null; probability: number | null; lost_reason: string | null;
  nextBestAction: string | null; primaryBlocker: string | null;   // canonical projection (deal_profiles) — same value DealsView shows
  offers: DealOfferRef[]; commissions: DealCommissionRef[]; documents: DealDocRef[];
  journeys: { stage: string | null; note: string | null; created_at: string }[]; timeline: DealTimelineItem[];
}

export async function getDealDetail(dealId: string): Promise<DealDetail | null> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const orgId = profile.org_id;
  const db = (await createClient()) as any;

  const { data: d } = await db.from("deals").select("*").eq("org_id", orgId).eq("id", dealId).maybeSingle();
  if (!d) return null;
  const deal = d as Record<string, unknown>;

  const [offersRes, commRes, docsRes] = await Promise.all([
    db.from("offers").select("id,amount,status").eq("org_id", orgId).eq("deal_id", dealId).order("updated_at", { ascending: false }),
    db.from("commissions").select("*").eq("org_id", orgId).eq("deal_id", dealId),
    db.from("documents").select("id,title,signature_status").eq("org_id", orgId).eq("deal_id", dealId).order("updated_at", { ascending: false }),
  ]);

  // collection totals per commission
  const commRows = (commRes?.data ?? []) as Record<string, unknown>[];
  const commIds = commRows.map((c) => c.id as string);
  const colsByComm = new Map<string, { due: number; collected: number }>();
  if (commIds.length) {
    const { data: cols } = await db.from("collections").select("commission_id,amount_due,amount_collected").eq("org_id", orgId).in("commission_id", commIds);
    for (const c of (cols ?? []) as Record<string, unknown>[]) {
      const k = c.commission_id as string;
      const cur = colsByComm.get(k) ?? { due: 0, collected: 0 };
      cur.due += (c.amount_due as number) ?? 0; cur.collected += (c.amount_collected as number) ?? 0;
      colsByComm.set(k, cur);
    }
  }

  // journeys (append-only history) — best-effort
  let journeys: { stage: string | null; note: string | null; created_at: string }[] = [];
  try {
    const { data: j } = await db.from("deal_journeys").select("stage,note,created_at").eq("org_id", orgId).eq("deal_id", dealId).order("created_at", { ascending: false }).limit(50);
    journeys = ((j ?? []) as Record<string, unknown>[]).map((r) => ({ stage: (r.stage as string) ?? null, note: (r.note as string) ?? null, created_at: r.created_at as string }));
  } catch { /* table shape may differ; non-fatal */ }

  // names
  const nameOf = async (table: string, id: string | null, col = "full_name"): Promise<string | null> => {
    if (!id) return null;
    try { const { data } = await db.from(table).select(col).eq("org_id", orgId).eq("id", id).maybeSingle(); return (data as Record<string, unknown> | null)?.[col] as string ?? null; } catch { return null; }
  };
  const [buyerName, sellerName, propertyTitle] = await Promise.all([
    nameOf("buyers", (deal.buyer_id as string) ?? null),
    nameOf("sellers", (deal.seller_id as string) ?? null),
    nameOf("properties", (deal.property_id as string) ?? null, "title"),
  ]);

  let timeline: DealTimelineItem[] = [];
  try {
    const events = await activityEventRepository.listForEntity("deal", dealId, 40);
    timeline = events.map((e) => ({ event_type: e.event_type, title: e.title ?? null, occurred_at: e.occurred_at }));
  } catch { /* best-effort */ }

  // Canonical next-best-action — reuse the SAME value DealsView renders (the deal
  // engine's projection persisted on deal_profiles). Best-effort: a canonical-only
  // deal with no projection simply shows no next-action block. dealId is already
  // org-verified above, so a deal_id filter is sufficient.
  let nextBestAction: string | null = null; let primaryBlocker: string | null = null;
  try {
    const { data: prof } = await db.from("deal_profiles").select("next_best_action,primary_blocker").eq("deal_id", dealId).maybeSingle();
    const pr = prof as Record<string, unknown> | null;
    nextBestAction = (pr?.next_best_action as string) ?? null;
    primaryBlocker = (pr?.primary_blocker as string) ?? null;
  } catch { /* projection optional */ }
  // Terminal deals (won/lost/closed) have no "next action" — the projection may
  // still hold a stale one from the last active recompute, so clear it here. Same
  // terminal test the Daily command center uses on deals.stage/status.
  {
    const terminalRe = /won|lost|clos|cancel/i;
    const stageRaw = (deal.stage as string) ?? "";
    const statusRaw = (deal.status as string) ?? "";
    if (terminalRe.test(stageRaw) || terminalRe.test(statusRaw)) { nextBestAction = null; primaryBlocker = null; }
  }

  return {
    id: deal.id as string, title: (deal.title as string) ?? "עסקה", stage: (deal.stage as string) ?? "new", status: (deal.status as string) ?? "open",
    value: (deal.value as number) ?? null, buyer_id: (deal.buyer_id as string) ?? null, seller_id: (deal.seller_id as string) ?? null, property_id: (deal.property_id as string) ?? null,
    buyerName, sellerName, propertyTitle,
    expected_close_date: (deal.expected_close_date as string) ?? null, probability: (deal.probability as number) ?? null, lost_reason: (deal.lost_reason as string) ?? null,
    nextBestAction, primaryBlocker,
    offers: ((offersRes?.data ?? []) as Record<string, unknown>[]).map((o) => ({ id: o.id as string, amount: (o.amount as number) ?? null, status: (o.status as string) ?? "draft" })),
    commissions: commRows.map((c) => {
      const t = colsByComm.get(c.id as string) ?? { due: 0, collected: 0 };
      return { id: c.id as string, gross_amount: (c.gross_amount as number) ?? 0, net_amount: (c.net_amount as number) ?? 0, status: (c.status as string) ?? "draft", totalDue: t.due, totalCollected: t.collected };
    }),
    documents: ((docsRes?.data ?? []) as Record<string, unknown>[]).map((x) => ({ id: x.id as string, title: (x.title as string) ?? "מסמך", signature_status: (x.signature_status as string) ?? "draft" })),
    journeys, timeline,
  };
}
