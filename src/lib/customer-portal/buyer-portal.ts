/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Buyer/renter PORTAL selector (server-only). getBuyerPortalData(token)
// returns ONLY a customer-safe DTO for the persistent /my/[token] experience:
// the customer's recommended properties (with THEIR own price delta + availability
// + viewing + feedback status), a summary, requirements, one next step, and their
// agent's public contact. It re-validates the token version (revocation) AND the
// (org, contact) relationship on every load. It NEVER returns seller identity,
// other buyers, deal-admin state, scores or CRM internals — the DTO shape is the
// privacy boundary. Reuses the recommendation ledger + meetings; no 2nd store.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyPortalToken, signPortalToken, portalUrl } from "./portal-tokens";
import { unsubUrl } from "@/lib/customer-comm/unsubscribe";
import {
  deriveCardStatus, derivePortalPriceDelta, summarizeCards, derivePortalNextStep,
  CARD_STATUS_LABEL, type PortalCard, type PortalSummary,
} from "./buyer-portal-core";

const VIEWING_TYPES = ["viewing", "open_house"];
const MAX_CARDS = 100;

export interface PortalAgent { name: string | null; office: string; phone: string | null; whatsapp: string | null; avatarUrl: string | null }
export interface PortalRequirement { label: string; value: string }
export interface PortalViewing { propertyId: string; propertyTitle: string; at: string | null; status: string; feedbackPending: boolean }
export interface BuyerPortalData {
  contactType: "buyer" | "lead"; firstName: string;
  officeName: string; agent: PortalAgent;
  summary: PortalSummary; nextStep: string | null;
  cards: PortalCard[];
  viewings: { upcoming: PortalViewing[]; completed: PortalViewing[] };
  requirements: PortalRequirement[];
  commPreferencesUrl: string | null;
}

const firstNameOf = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] || "";
function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return null;
}

/** Current stored portal version for a contact (buyers store it in preferences jsonb; leads are v=1). */
export async function currentPortalVersion(db: any, orgId: string, contactType: "buyer" | "lead", contactId: string): Promise<number | null> {
  if (contactType === "lead") {
    const { data } = await db.from("leads").select("id").eq("id", contactId).eq("org_id", orgId).maybeSingle();
    return data ? 1 : null;
  }
  const { data } = await db.from("buyers").select("preferences").eq("id", contactId).eq("org_id", orgId).maybeSingle();
  if (!data) return null;
  const v = Number((data.preferences as any)?.portal_token_version ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** Mint the persistent portal URL for a contact (agent-side; uses the current version). */
export async function getPortalLink(db: any, orgId: string, contactType: "buyer" | "lead", contactId: string): Promise<string | null> {
  const v = await currentPortalVersion(db, orgId, contactType, contactId);
  if (v == null) return null;
  return portalUrl({ o: orgId, t: contactType, c: contactId, v });
}

/** Revoke + rotate a buyer's portal access (bumps the stored version → old links stop working). */
export async function revokePortalAccess(db: any, orgId: string, buyerId: string): Promise<{ ok: boolean; newUrl?: string }> {
  const { data } = await db.from("buyers").select("preferences").eq("id", buyerId).eq("org_id", orgId).maybeSingle();
  if (!data) return { ok: false };
  const prefs = (data.preferences && typeof data.preferences === "object") ? data.preferences : {};
  const next = Number((prefs as any).portal_token_version ?? 1) + 1;
  await db.from("buyers").update({ preferences: { ...prefs, portal_token_version: next } }).eq("id", buyerId).eq("org_id", orgId);
  return { ok: true, newUrl: portalUrl({ o: orgId, t: "buyer", c: buyerId, v: next }) ?? undefined };
}

function buyerRequirements(b: any): PortalRequirement[] {
  const out: PortalRequirement[] = [];
  const areas: string[] = [...(b.preferred_areas ?? []), ...(b.preferred_regions ?? [])].filter(Boolean);
  if (areas.length) out.push({ label: "אזורים", value: areas.slice(0, 4).join(" · ") });
  if (b.rooms_min != null || b.rooms_max != null) out.push({ label: "חדרים", value: b.rooms_min != null && b.rooms_max != null ? `${b.rooms_min}–${b.rooms_max}` : `${b.rooms_min ?? b.rooms_max}` });
  if (b.budget_max != null) out.push({ label: "תקציב", value: `עד ₪${Math.round(b.budget_max).toLocaleString("he-IL")}` });
  const feats: string[] = [];
  if (b.must_have_parking) feats.push("חניה");
  if (b.must_have_elevator) feats.push("מעלית");
  if (b.must_have_safe_room) feats.push("ממ״ד");
  if (feats.length) out.push({ label: "חשוב", value: feats.join(" · ") });
  return out;
}

/** THE customer-safe portal payload. Returns null on invalid/revoked/cross-org token. */
export async function getBuyerPortalData(token: string, db?: any): Promise<BuyerPortalData | null> {
  const p = verifyPortalToken(token);
  if (!p) return null;
  const client: any = db ?? createServiceRoleClient();
  const nowMs = Date.now();

  // Revocation + relationship re-check (never trust the token payload alone).
  const version = await currentPortalVersion(client, p.o, p.t, p.c);
  if (version == null || version !== p.v) return null;

  // Contact identity (+ requirements for buyers).
  let contact: any = null;
  if (p.t === "buyer") {
    const { data } = await client.from("buyers")
      .select("id,full_name,owner_id,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,preferred_regions,preferred_types,must_have_parking,must_have_elevator,must_have_safe_room")
      .eq("id", p.c).eq("org_id", p.o).maybeSingle();
    contact = data;
  } else {
    const { data } = await client.from("leads").select("id,full_name,owner_id").eq("id", p.c).eq("org_id", p.o).maybeSingle();
    contact = data;
  }
  if (!contact) return null;

  const [recoRes, orgRes, agentRes] = await Promise.all([
    client.from("customer_property_recommendations").select("property_id,status,price_at_send,responded_at,recommended_at,match_score").eq("org_id", p.o).eq("contact_type", p.t).eq("contact_id", p.c).order("recommended_at", { ascending: false }).limit(MAX_CARDS),
    client.from("organizations").select("name").eq("id", p.o).maybeSingle(),
    contact.owner_id ? client.from("users").select("full_name,phone,avatar_url").eq("id", contact.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const recos = (recoRes?.data ?? []) as Array<{ property_id: string; status: string; price_at_send: number | null; responded_at: string | null; recommended_at: string | null; match_score: number | null }>;
  const propertyIds = [...new Set(recos.map((r) => r.property_id))];

  const [propsRes, meetRes, matchRes] = await Promise.all([
    propertyIds.length ? client.from("properties").select("id,title,city,rooms,price,status,primary_image_url").in("id", propertyIds).eq("org_id", p.o) : Promise.resolve({ data: [] }),
    propertyIds.length ? client.from("meetings").select("property_id,status,start_at").eq("org_id", p.o).eq("buyer_id", p.t === "buyer" ? p.c : "00000000-0000-0000-0000-000000000000").in("type", VIEWING_TYPES).in("property_id", propertyIds) : Promise.resolve({ data: [] }),
    // Match reason — the SAME canonical value the broker sees (strongest_advantage).
    // Buyers only; a lead has no buyer_id in match_intelligence_profiles.
    propertyIds.length && p.t === "buyer" ? client.from("match_intelligence_profiles").select("property_id,strongest_advantage").eq("org_id", p.o).eq("buyer_id", p.c).in("property_id", propertyIds) : Promise.resolve({ data: [] }),
  ]);
  const propById = new Map<string, any>();
  for (const pr of (propsRes?.data ?? []) as any[]) propById.set(pr.id, pr);
  const reasonByProp = new Map<string, string>();
  for (const m of (matchRes?.data ?? []) as Array<{ property_id: string; strongest_advantage: string | null }>) {
    if (m.strongest_advantage) reasonByProp.set(m.property_id, m.strongest_advantage);
  }
  // property → best viewing signal
  const viewByProp = new Map<string, { status: string; at: string | null }>();
  for (const m of (meetRes?.data ?? []) as Array<{ property_id: string; status: string; start_at: string | null }>) {
    const cur = viewByProp.get(m.property_id);
    const rank = (s: string) => (s === "completed" ? 3 : s === "confirmed" || s === "scheduled" ? 2 : 1);
    if (!cur || rank(m.status) >= rank(cur.status)) viewByProp.set(m.property_id, { status: m.status, at: m.start_at });
  }

  // Build cards.
  const cards: PortalCard[] = [];
  const upcoming: PortalViewing[] = []; const completed: PortalViewing[] = [];
  let feedbackPending = 0; let scheduledSoon = false;
  for (const r of recos) {
    const pr = propById.get(r.property_id);
    if (!pr) continue;
    const mv = viewByProp.get(r.property_id);
    const viewing: "none" | "scheduled" | "completed" = mv?.status === "completed" ? "completed" : (mv?.status === "scheduled" || mv?.status === "confirmed") ? "scheduled" : "none";
    const available = !["sold", "rented", "withdrawn", "archived"].includes(String(pr.status));
    const status = deriveCardStatus({ recoStatus: r.status, propertyStatus: String(pr.status), viewing });
    const priceDrop = available ? derivePortalPriceDelta(r.price_at_send, pr.price) : null;
    const feedbackGiven = ["interested", "rejected", "viewing_requested"].includes(r.status) && !!r.responded_at;
    cards.push({
      propertyId: r.property_id, title: pr.title ?? "נכס", city: pr.city ?? null, rooms: pr.rooms ?? null, price: pr.price ?? null,
      imageUrl: pr.primary_image_url ?? null, status, statusLabel: CARD_STATUS_LABEL[status], available, priceDrop,
      viewingAt: mv?.at ?? null, reason: reasonByProp.get(r.property_id) ?? null, feedbackGiven,
    });
    if (viewing === "scheduled") {
      upcoming.push({ propertyId: r.property_id, propertyTitle: pr.title ?? "נכס", at: mv?.at ?? null, status: mv!.status, feedbackPending: false });
      if (mv?.at && Date.parse(mv.at) - nowMs < 2 * 86_400_000) scheduledSoon = true;
    } else if (viewing === "completed") {
      const pending = !feedbackGiven;
      completed.push({ propertyId: r.property_id, propertyTitle: pr.title ?? "נכס", at: mv?.at ?? null, status: "completed", feedbackPending: pending });
      if (pending) feedbackPending++;
    }
  }

  const summary = summarizeCards(cards);
  const nextStep = derivePortalNextStep({ summary, scheduledSoon, feedbackPending });

  const agentRow = agentRes?.data as { full_name: string | null; phone: string | null; avatar_url: string | null } | null;
  const agentPhone = agentRow?.phone ?? null;
  const agent: PortalAgent = {
    name: agentRow?.full_name ?? null, office: (orgRes?.data?.name as string) || "ZONO",
    phone: agentPhone, whatsapp: normalizePhone(agentPhone), avatarUrl: agentRow?.avatar_url ?? null,
  };

  return {
    contactType: p.t, firstName: firstNameOf(contact.full_name),
    officeName: (orgRes?.data?.name as string) || "ZONO", agent,
    summary, nextStep, cards,
    viewings: { upcoming: upcoming.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")), completed: completed.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")) },
    requirements: p.t === "buyer" ? buyerRequirements(contact) : [],
    commPreferencesUrl: unsubUrl({ o: p.o, t: p.t, c: p.c, ch: "all" }),
  };
}

/** Agent-facing ZI summary of what the customer sees in their portal (facts only). */
export async function summarizeBuyerPortalForZi(orgId: string, buyerId: string, db?: any): Promise<string | null> {
  const client: any = db ?? createServiceRoleClient();
  const v = await currentPortalVersion(client, orgId, "buyer", buyerId);
  if (v == null) return null;
  const token = signPortalToken({ o: orgId, t: "buyer", c: buyerId, v });
  if (!token) return null;
  const data = await getBuyerPortalData(token, client);
  if (!data) return null;
  const responded = data.cards.filter((c) => c.status === "interested" || c.status === "rejected" || c.status === "viewing_requested" || c.status === "viewed");
  const lines: string[] = [
    `👤 ${data.firstName || "הלקוח"} — פורטל לקוח`,
    `${data.summary.total} נכסים · ${data.summary.newCount} חדשים · ${data.summary.interested} מעניינים · ${data.summary.viewings} ביקורים${data.summary.priceDrops > 0 ? ` · ${data.summary.priceDrops} עדכוני מחיר` : ""}`,
    responded.length ? "סימן: " + responded.slice(0, 8).map((c) => `${c.title} (${c.statusLabel})`).join(" · ") : "טרם סימן נכסים",
    data.viewings.upcoming.length ? `הביקור הבא: ${data.viewings.upcoming[0].propertyTitle}` : "אין ביקור מתוכנן",
    data.nextStep ? `➡️ ${data.nextStep}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
