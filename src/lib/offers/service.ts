/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Offers & Negotiation · Service (server-only)
// ----------------------------------------------------------------------------
// A real offer entity with an APPEND-ONLY negotiation trail (offer_events).
// Historical amounts/terms are never overwritten — every submit/counter/response
// is a new immutable event. An accepted offer converts into the EXISTING
// canonical `deals` table (no new deal engine). Org-isolated; writes require the
// agent role (RLS-enforced too). Tables are newer than the checked-in generated
// types, so DB access uses a loose client; the public API stays typed.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { OFFER_OPEN_STATUSES, offerNextAction, offerActionAllowed } from "./rules";
import { deriveSellerId, conversionDecision } from "./linkage-rules";

export type OfferStatus = "draft" | "submitted" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";
export type OfferSide = "buyer" | "seller" | "agent";

export interface OfferSummary {
  id: string; status: OfferStatus; amount: number | null; original_amount: number | null; currency: string;
  property_id: string | null; buyer_id: string | null; seller_id: string | null; deal_id: string | null;
  current_responder: string | null; financing: string | null; requested_entry_date: string | null;
  expires_at: string | null; submitted_at: string | null; created_at: string; updated_at: string;
  nextAction: string;
}
export interface OfferEventDTO {
  event_type: string; actor_side: string | null; amount: number | null; note: string | null; created_at: string;
}
export interface OfferDetail extends OfferSummary {
  conditions: string | null; included_items: string | null; note: string | null; events: OfferEventDTO[];
}
export interface CreateOfferInput {
  propertyId?: string | null; buyerId?: string | null; sellerId?: string | null; matchId?: string | null;
  amount?: number | null; financing?: string | null; conditions?: string | null; includedItems?: string | null;
  requestedEntryDate?: string | null; expiresAt?: string | null; note?: string | null;
}

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const supabase = await createClient();
  const db = supabase as any;
  return { userId: user.id, orgId: profile.org_id, db };
}
type DB = any;

function mapSummary(d: Record<string, unknown>): OfferSummary {
  const status = ((d.status as string) ?? "draft") as OfferStatus;
  return {
    id: d.id as string, status, amount: (d.amount as number) ?? null, original_amount: (d.original_amount as number) ?? null,
    currency: (d.currency as string) ?? "ILS", property_id: (d.property_id as string) ?? null,
    buyer_id: (d.buyer_id as string) ?? null, seller_id: (d.seller_id as string) ?? null, deal_id: (d.deal_id as string) ?? null,
    current_responder: (d.current_responder as string) ?? null, financing: (d.financing as string) ?? null,
    requested_entry_date: (d.requested_entry_date as string) ?? null, expires_at: (d.expires_at as string) ?? null,
    submitted_at: (d.submitted_at as string) ?? null, created_at: d.created_at as string, updated_at: d.updated_at as string,
    nextAction: offerNextAction(status, (d.current_responder as string) ?? null),
  };
}

async function appendEvent(db: DB, orgId: string, userId: string, offerId: string, eventType: string, opts?: { side?: OfferSide; amount?: number | null; note?: string | null; terms?: Record<string, unknown> }): Promise<void> {
  await db.from("offer_events").insert({
    org_id: orgId, offer_id: offerId, actor_id: userId, actor_side: opts?.side ?? "agent",
    event_type: eventType, amount: opts?.amount ?? null, note: opts?.note ?? null, terms: opts?.terms ?? {},
  });
}

async function loadOffer(db: DB, orgId: string, offerId: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("offers").select("*").eq("org_id", orgId).eq("id", offerId).maybeSingle();
  if (!data) throw new Error("ההצעה לא נמצאה");
  return data as Record<string, unknown>;
}

/**
 * Guard a linked FK target against cross-org tampering. RLS protects the offers
 * row itself but does NOT constrain the values written into its FK columns, so a
 * crafted request could point buyer_id/property_id/seller_id/match_id at another
 * org's row. We verify each provided id belongs to the caller's org. No-op for
 * null/undefined (links are optional).
 */
async function assertOrgOwned(db: DB, orgId: string, table: string, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const { data } = await db.from(table).select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data) throw new Error("מזהה מקושר אינו שייך לארגון שלך");
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function listOffers(filter?: { status?: OfferStatus | "open" | "all"; propertyId?: string; buyerId?: string }): Promise<OfferSummary[]> {
  const { orgId, db } = await ctx();
  let q = db.from("offers").select("*").eq("org_id", orgId);
  if (filter?.propertyId) q = q.eq("property_id", filter.propertyId);
  if (filter?.buyerId) q = q.eq("buyer_id", filter.buyerId);
  if (filter?.status && filter.status !== "all") {
    if (filter.status === "open") q = q.in("status", OFFER_OPEN_STATUSES as string[]);
    else q = q.eq("status", filter.status);
  }
  const { data } = await q.order("updated_at", { ascending: false }).limit(300);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSummary);
}

export async function getOfferDetail(offerId: string): Promise<OfferDetail | null> {
  const { orgId, db } = await ctx();
  const { data } = await db.from("offers").select("*").eq("org_id", orgId).eq("id", offerId).maybeSingle();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const { data: ev } = await db.from("offer_events").select("event_type,actor_side,amount,note,created_at").eq("org_id", orgId).eq("offer_id", offerId).order("created_at", { ascending: true });
  return {
    ...mapSummary(d), conditions: (d.conditions as string) ?? null, included_items: (d.included_items as string) ?? null, note: (d.note as string) ?? null,
    events: ((ev ?? []) as Record<string, unknown>[]).map((e) => ({ event_type: e.event_type as string, actor_side: (e.actor_side as string) ?? null, amount: (e.amount as number) ?? null, note: (e.note as string) ?? null, created_at: e.created_at as string })),
  };
}

// ── lifecycle ────────────────────────────────────────────────────────────────
export async function createDraftOffer(input: CreateOfferInput): Promise<{ id: string }> {
  const { orgId, userId, db } = await ctx();
  // Reject cross-org FK targets before they are written (RLS doesn't cover them).
  await assertOrgOwned(db, orgId, "buyers", input.buyerId);
  await assertOrgOwned(db, orgId, "properties", input.propertyId);
  await assertOrgOwned(db, orgId, "sellers", input.sellerId);
  await assertOrgOwned(db, orgId, "match_intelligence_profiles", input.matchId);
  // Derive the seller from the property's owner when not explicitly supplied.
  let sellerId: string | null = input.sellerId ?? null;
  if (input.propertyId && !sellerId) {
    const { data: prop } = await db.from("properties").select("seller_id").eq("org_id", orgId).eq("id", input.propertyId).maybeSingle();
    sellerId = deriveSellerId((prop as { seller_id?: string | null } | null)?.seller_id ?? null, input.sellerId ?? null);
  }
  const amount = typeof input.amount === "number" && input.amount >= 0 ? Math.round(input.amount) : null;
  const { data, error } = await db.from("offers").insert({
    org_id: orgId, owner_id: userId, created_by: userId, status: "draft",
    property_id: input.propertyId ?? null, buyer_id: input.buyerId ?? null, seller_id: sellerId, match_id: input.matchId ?? null,
    amount, original_amount: amount, financing: input.financing ?? null, conditions: input.conditions ?? null,
    included_items: input.includedItems ?? null, requested_entry_date: input.requestedEntryDate ?? null,
    expires_at: input.expiresAt ?? null, note: input.note ?? null, current_responder: "seller",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת ההצעה נכשלה");
  const id = (data as { id: string }).id;
  await appendEvent(db, orgId, userId, id, "created", { side: "buyer", amount, note: "טיוטת הצעה נוצרה" });
  return { id };
}

/**
 * Create a draft offer straight from a match: derives buyer/property/seller from
 * the (org-scoped) match_intelligence_profiles row, so the offer is linked to the
 * full triangle without the agent re-picking entities.
 */
export async function createOfferFromMatch(matchId: string, extra?: { amount?: number | null; note?: string | null }): Promise<{ id: string }> {
  const { orgId, db } = await ctx();
  const { data: m } = await db.from("match_intelligence_profiles").select("buyer_id,property_id,seller_id").eq("org_id", orgId).eq("id", matchId).maybeSingle();
  if (!m) throw new Error("ההתאמה לא נמצאה");
  const match = m as { buyer_id: string | null; property_id: string | null; seller_id: string | null };
  return createDraftOffer({
    buyerId: match.buyer_id, propertyId: match.property_id, sellerId: match.seller_id, matchId,
    amount: extra?.amount ?? null, note: extra?.note ?? null,
  });
}

function assertStatus(cur: string, allowed: OfferStatus[]): void {
  if (!offerActionAllowed(cur, allowed)) throw new Error(`פעולה לא חוקית במצב "${cur}"`);
}

export async function submitOffer(offerId: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["draft"]);
  await db.from("offers").update({ status: "submitted", current_responder: "seller", submitted_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "submitted", { side: "buyer", amount: (o.amount as number) ?? null, note: "ההצעה הוגשה למוכר" });
}

/** Seller response: counter (new amount), accept, or reject — appends an event. */
export async function recordSellerResponse(offerId: string, resp: { kind: "counter" | "accept" | "reject"; amount?: number | null; note?: string | null }): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["submitted", "countered"]);
  if (resp.kind === "counter") {
    const amount = typeof resp.amount === "number" && resp.amount >= 0 ? Math.round(resp.amount) : (o.amount as number) ?? null;
    await db.from("offers").update({ status: "countered", amount, current_responder: "buyer" }).eq("org_id", orgId).eq("id", offerId);
    await appendEvent(db, orgId, userId, offerId, "seller_response", { side: "seller", amount, note: resp.note ?? "המוכר הגיש הצעה נגדית" });
  } else if (resp.kind === "accept") {
    await db.from("offers").update({ status: "accepted", closed_at: new Date().toISOString(), current_responder: null }).eq("org_id", orgId).eq("id", offerId);
    await appendEvent(db, orgId, userId, offerId, "accepted", { side: "seller", amount: (o.amount as number) ?? null, note: resp.note ?? "המוכר קיבל את ההצעה" });
    // Accepted ⇒ deterministically become exactly one deal (idempotent + race-safe).
    try { await convertOfferToDeal(offerId); } catch (e) { console.error("[offers] auto-convert (seller accept) failed:", e); }
  } else {
    await db.from("offers").update({ status: "rejected", closed_at: new Date().toISOString(), current_responder: null }).eq("org_id", orgId).eq("id", offerId);
    await appendEvent(db, orgId, userId, offerId, "rejected", { side: "seller", note: resp.note ?? "המוכר דחה את ההצעה" });
  }
}

/** Buyer counter (after a seller counter) — new amount, ball back to seller. */
export async function counterOffer(offerId: string, input: { amount: number; note?: string | null }): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["countered", "submitted"]);
  const amount = Math.round(input.amount);
  await db.from("offers").update({ status: "submitted", amount, current_responder: "seller" }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "countered", { side: "buyer", amount, note: input.note ?? "הקונה הגיש הצעה נגדית" });
}

export async function acceptOffer(offerId: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["submitted", "countered"]);
  await db.from("offers").update({ status: "accepted", closed_at: new Date().toISOString(), current_responder: null }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "accepted", { side: "agent", amount: (o.amount as number) ?? null, note: "ההצעה סומנה כמאושרת" });
  // Accepted ⇒ deterministically become exactly one deal (idempotent + race-safe).
  try { await convertOfferToDeal(offerId); } catch (e) { console.error("[offers] auto-convert (accept) failed:", e); }
}

export async function rejectOffer(offerId: string, reason?: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["submitted", "countered"]);
  await db.from("offers").update({ status: "rejected", closed_at: new Date().toISOString(), current_responder: null }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "rejected", { side: "agent", note: reason ?? "ההצעה נדחתה" });
}

export async function withdrawOffer(offerId: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["draft", "submitted", "countered"]);
  await db.from("offers").update({ status: "withdrawn", closed_at: new Date().toISOString(), current_responder: null }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "withdrawn", { side: "buyer", note: "ההצעה בוטלה" });
}

export async function expireOffer(offerId: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  assertStatus(o.status as string, ["submitted", "countered"]);
  await db.from("offers").update({ status: "expired", closed_at: new Date().toISOString(), current_responder: null }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "expired", { side: "agent", note: "פג תוקף ההצעה" });
}

/**
 * Convert an ACCEPTED offer into a real deal on the canonical deals table.
 *
 * IDEMPOTENT + RACE-SAFE. Two layers guarantee exactly one deal per offer:
 *  1. Fast-path guard: `if (o.deal_id) return { dealId }` — a repeat call (UI
 *     button, double-accept, retry) never inserts a second deal.
 *  2. DB unique index `uq_deals_offer` — under true concurrency two callers can
 *     both pass the guard, but only one INSERT wins; the loser gets Postgres
 *     23505 and RE-READS the winner's deal instead of throwing.
 * Never produces two deals; never throws on the benign concurrent case.
 */
export async function convertOfferToDeal(offerId: string): Promise<{ dealId: string }> {
  const { orgId, userId, db } = await ctx();
  const o = await loadOffer(db, orgId, offerId);
  const decision = conversionDecision({ status: o.status as string, deal_id: (o.deal_id as string) ?? null });
  // "invalid" ⇒ not accepted: raise the canonical Hebrew status error.
  if (decision === "invalid") assertStatus(o.status as string, ["accepted"]);
  // Layer 1 — idempotency guard: already converted.
  if (o.deal_id) return { dealId: o.deal_id as string };

  const value = typeof o.amount === "number" && (o.amount as number) >= 0 ? (o.amount as number) : null;
  const { data: deal, error } = await db.from("deals").insert({
    org_id: orgId, owner_id: userId, title: "עסקה מהצעה מאושרת", stage: "new", status: "open", value, offer_id: offerId,
    buyer_id: (o.buyer_id as string) ?? null, seller_id: (o.seller_id as string) ?? null, property_id: (o.property_id as string) ?? null,
  }).select("id").single();

  if (error || !deal) {
    // Layer 2 — race resolution: a concurrent conversion already inserted the
    // deal for this offer and tripped uq_deals_offer (SQLSTATE 23505). Re-read
    // that deal and adopt it rather than failing.
    const code = (error as { code?: string } | null)?.code;
    const msg = error?.message ?? "";
    if (code === "23505" || /23505|duplicate key|unique/i.test(msg)) {
      const { data: existing } = await db.from("deals").select("id").eq("org_id", orgId).eq("offer_id", offerId).maybeSingle();
      const existingId = (existing as { id: string } | null)?.id;
      if (existingId) {
        await db.from("offers").update({ deal_id: existingId }).eq("org_id", orgId).eq("id", offerId);
        return { dealId: existingId };
      }
      const reloaded = await loadOffer(db, orgId, offerId);
      if (reloaded.deal_id) return { dealId: reloaded.deal_id as string };
    }
    throw new Error(msg || "המרת ההצעה לעסקה נכשלה");
  }

  const dealId = (deal as { id: string }).id;
  await db.from("offers").update({ deal_id: dealId }).eq("org_id", orgId).eq("id", offerId);
  await appendEvent(db, orgId, userId, offerId, "converted_to_deal", { side: "agent", amount: value, note: "ההצעה הומרה לעסקה" });
  // Emit the SAME canonical event the manual deal-create path emits, so buyer/
  // seller/property/deal timelines update on conversion (best-effort; never throws).
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.dealCreated, entityType: "deal", entityId: dealId,
      payload: {
        stage: "new", fromOffer: offerId,
        buyerId: (o.buyer_id as string) ?? null, sellerId: (o.seller_id as string) ?? null, propertyId: (o.property_id as string) ?? null,
      },
    });
  } catch (e) { console.error("[offers] emit dealCreated failed:", e); }
  return { dealId };
}

export interface OffersCommandCenter {
  offers: OfferSummary[]; open: number; accepted: number; awaitingSeller: number; awaitingBuyer: number;
}
export async function getOffersCommandCenter(): Promise<OffersCommandCenter> {
  const offers = await listOffers({ status: "all" });
  return {
    offers,
    open: offers.filter((o) => OFFER_OPEN_STATUSES.includes(o.status)).length,
    accepted: offers.filter((o) => o.status === "accepted").length,
    awaitingSeller: offers.filter((o) => o.status === "submitted" && o.current_responder === "seller").length,
    awaitingBuyer: offers.filter((o) => o.status === "countered" && o.current_responder === "buyer").length,
  };
}
