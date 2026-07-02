// ============================================================================
// 🧭 Unified Customer Journey — service (server-only). 28.5.
// REUSES the built Buyer / Seller / Lead Digital Twins, summarises them into
// members, resolves one customer identity across roles (contacts + conversion
// links) and builds one continuous journey per customer. Read-only; evidence-
// only; no schema changes; no engine / twin modified.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getBuyerTwins, type BuyerTwin } from "../buyers";
import { getSellerTwins, type SellerTwin } from "../sellers";
import { getLeadTwins, type LeadTwin } from "../leads";
import { resolveCustomers, type IdentityEntry } from "./identity";
import { buildCustomerJourney } from "./journey";
import type { MemberSummary, CustomerJourney } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const norm = (v: string | null): string => (v ?? "").trim().toLowerCase().replace(/[^0-9a-z@.]/g, "");

function buyerMember(t: BuyerTwin): MemberSummary {
  return {
    kind: "buyer", id: t.identity.id, name: t.identity.name,
    healthScore: t.health.score, healthLabel: t.health.label,
    activities: t.memory.activities, recencyScore: t.memory.recencyScore, engagementScore: t.memory.engagementScore,
    trust: t.profile.trust, intentScore: t.profile.probabilityToBuy, value: t.profile.budget.max,
    classification: t.classification, decisions: t.decisions, missions: t.missions, learnings: t.learnings,
    relationshipDegree: t.relationships?.degree ?? 0, sourceReferral: false,
    dealSignal: t.profile.behavior.offers > 0, createdAt: t.identity.createdAt, updatedAt: t.identity.updatedAt,
  };
}
function sellerMember(t: SellerTwin): MemberSummary {
  return {
    kind: "seller", id: t.identity.id, name: t.identity.name,
    healthScore: t.health.score, healthLabel: t.health.label,
    activities: t.memory.activities, recencyScore: t.memory.recencyScore, engagementScore: t.memory.engagementScore,
    trust: t.profile.trust, intentScore: t.profile.readinessToSign, value: t.profile.priceExpectation,
    classification: t.classification, decisions: t.decisions, missions: t.missions, learnings: t.learnings,
    relationshipDegree: t.relationships?.degree ?? 0, sourceReferral: false,
    dealSignal: t.classification.includes("חתום") || t.profile.behavior.agreements > 0, createdAt: t.identity.createdAt, updatedAt: t.identity.updatedAt,
  };
}
function leadMember(t: LeadTwin): MemberSummary {
  return {
    kind: "lead", id: t.identity.id, name: t.identity.name,
    healthScore: t.health.score, healthLabel: t.health.label,
    activities: t.memory.activities, recencyScore: t.memory.recencyScore, engagementScore: t.memory.engagementScore,
    trust: 50, intentScore: t.profile.conversionProbability, value: null,
    classification: t.classification, decisions: t.decisions, missions: t.missions, learnings: t.learnings,
    relationshipDegree: t.relationships?.degree ?? 0, sourceReferral: (t.profile.source ?? "").toLowerCase() === "referral",
    dealSignal: t.classification.includes("הומר"), createdAt: t.identity.createdAt, updatedAt: t.identity.updatedAt,
  };
}

export interface CustomerJourneysOverview {
  version: string; generatedAt: string;
  totals: { customers: number; multiRole: number; repeat: number; investors: number; referrals: number; dormant: number; highValue: number; transitions: number };
  journeys: CustomerJourney[];
  notes: string[];
}

export async function getCustomerJourneys(orgId: string | null): Promise<CustomerJourneysOverview> {
  const notes: string[] = [];
  const [buyersO, sellersO, leadsO] = await Promise.all([
    getBuyerTwins(orgId).catch(() => null),
    getSellerTwins(orgId).catch(() => null),
    getLeadTwins(orgId).catch(() => null),
  ]);

  const members = new Map<string, MemberSummary>();
  const key = (kind: string, id: string) => `${kind}:${id}`;
  for (const t of buyersO?.twins ?? []) members.set(key("buyer", t.identity.id), buyerMember(t));
  for (const t of sellersO?.twins ?? []) members.set(key("seller", t.identity.id), sellerMember(t));
  for (const t of leadsO?.twins ?? []) members.set(key("lead", t.identity.id), leadMember(t));

  // Contact + conversion-link maps (lightweight) for identity resolution.
  const db = await createClient();
  const safe = async (t: string, cols: string): Promise<Row[]> => { try { const { data } = await db.from(t as never).select(cols).limit(1000); return (data ?? []) as Row[]; } catch { return []; } };
  const [buyerRows, sellerRows, leadRows] = await Promise.all([
    safe("buyers", "id,phone,email"), safe("sellers", "id,phone,email"),
    safe("leads", "id,phone,email,converted_buyer_id,converted_seller_id"),
  ]);
  const contactsById = new Map<string, string[]>();
  const put = (kind: string, id: string, phone: unknown, email: unknown) => contactsById.set(key(kind, id), [norm(s(phone)), norm(s(email))].filter(Boolean));
  for (const r of buyerRows) put("buyer", String(r.id), r.phone, r.email);
  for (const r of sellerRows) put("seller", String(r.id), r.phone, r.email);
  const leadLinks = new Map<string, { buyer: string | null; seller: string | null }>();
  for (const r of leadRows) { put("lead", String(r.id), r.phone, r.email); leadLinks.set(key("lead", String(r.id)), { buyer: s(r.converted_buyer_id), seller: s(r.converted_seller_id) }); }

  // Build identity entries only for members we actually have twins for.
  const entries: IdentityEntry[] = [];
  for (const [k, m] of members) {
    const links: IdentityEntry["links"] = [];
    if (m.kind === "lead") { const l = leadLinks.get(k); if (l?.buyer && members.has(key("buyer", l.buyer))) links.push({ kind: "buyer", id: l.buyer }); if (l?.seller && members.has(key("seller", l.seller))) links.push({ kind: "seller", id: l.seller }); }
    entries.push({ kind: m.kind, id: m.id, name: m.name, contacts: contactsById.get(k) ?? [], links });
  }

  const groups = resolveCustomers(entries);
  const journeys: CustomerJourney[] = groups.map((g) => {
    const mem = g.members.map((x) => members.get(key(x.kind, x.id))).filter((x): x is MemberSummary => !!x);
    // Explicit conversion links inside this customer.
    let leadToBuyer = false, leadToSeller = false;
    for (const x of g.members) if (x.kind === "lead") { const l = leadLinks.get(key("lead", x.id)); if (l?.buyer && g.members.some((y) => y.kind === "buyer" && y.id === l.buyer)) leadToBuyer = true; if (l?.seller && g.members.some((y) => y.kind === "seller" && y.id === l.seller)) leadToSeller = true; }
    return buildCustomerJourney(mem, { leadToBuyer, leadToSeller });
  }).filter((j) => j.identity.members.length > 0);

  if (!journeys.length) notes.push("אין עדיין לקוחות — צור לידים/קונים/מוכרים כדי לבנות מסע לקוח. אין המצאות.");
  const tag = (j: CustomerJourney, t: string) => j.classification.includes(t);
  return {
    version: "28.5", generatedAt: new Date().toISOString(),
    totals: {
      customers: journeys.length,
      multiRole: journeys.filter((j) => tag(j, "רב-תפקידי")).length,
      repeat: journeys.filter((j) => tag(j, "לקוח חוזר")).length,
      investors: journeys.filter((j) => tag(j, "משקיע")).length,
      referrals: journeys.filter((j) => tag(j, "מקור הפניה")).length,
      dormant: journeys.filter((j) => tag(j, "רדום")).length,
      highValue: journeys.filter((j) => tag(j, "ערך גבוה")).length,
      transitions: journeys.reduce((sum, j) => sum + j.transitions.length, 0),
    },
    journeys: [...journeys].sort((a, b) => b.health.lifetimeValue - a.health.lifetimeValue),
    notes,
  };
}
