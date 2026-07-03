// ============================================================================
// 🏷️ ZONO — Seller Portal™ — service (server-only). 32.4.
// Resolves the AUTHENTICATED seller (sellers.portal_user_id → else email match),
// then assembles their personal workspace by REUSING the Seller Agent scorecard
// (twin + listing/valuation + market perf + buyer matching + journey + strategy),
// the AI Brokerage Website framework (property view) and Ask ZONO.
//
// AUTHORIZATION: getters accept NO client-supplied sellerId/propertyId — each
// resolves the session's own seller and scopes every read to that seller + org;
// the property view is fixed to the seller's own listing. Buyers are anonymized.
// Seller/public-safe + evidence-only; nothing auto-executes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { getSellerAgentScorecards, SELLER_STRATEGY_HE } from "@/lib/seller-agent";
import type { SellerScorecard } from "@/lib/seller-agent";
import { getListingScorecards } from "@/lib/listing-agent";
import { askZono } from "@/lib/ask-zono";
import { buildProperty, containsForbidden } from "@/lib/brokerage-site";
import type { SiteListingInput, PropertyAI, MarketPosition } from "@/lib/brokerage-site/types";
import { buildDashboard, buildActivityTimeline, groupBuyers } from "./assemble";
import { sellerGuides } from "./content";
import type {
  SellerPortalInput, SellerProfile, SellerDashboard, PropertyPerformance, BuyerInterest,
  Appointment, Conversation, ActivityEvent, PortalDoc, SellerPortalPropertyView, ValuationPosition,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const PUBLIC_STATUSES = ["active", "published", "under_offer"];
const CONVO_TYPES = ["call", "whatsapp", "email", "sms", "meeting", "viewing"];

// ── Resolution + authorization boundary ─────────────────────────────────────
export type PortalResolution =
  | { state: "unauthenticated" }
  | { state: "unlinked"; email: string | null }
  | { state: "ready"; orgId: string; sellerId: string; seller: Row };

export async function resolvePortalSeller(): Promise<PortalResolution> {
  const user = await getAuthUser();
  if (!user) return { state: "unauthenticated" };
  const db = createServiceRoleClient();
  let row: Row | null = null;
  try {
    const byLink = await db.from("sellers").select("*").eq("portal_user_id" as never, user.id as never).limit(1).maybeSingle();
    row = (byLink.data as Row) ?? null;
  } catch { /* column may not exist yet */ }
  if (!row && user.email) {
    const byEmail = await db.from("sellers").select("*").ilike("email", user.email).limit(1).maybeSingle();
    row = (byEmail.data as Row) ?? null;
  }
  if (!row) return { state: "unlinked", email: user.email ?? null };
  return { state: "ready", orgId: s(row.org_id), sellerId: s(row.id), seller: row };
}

function profileFromRow(r: Row): SellerProfile {
  const name = s(r.full_name) || "מוכר";
  return {
    name, firstName: name.split(" ")[0] || name,
    city: sn(r.city), address: sn(r.address),
    expectedPrice: num(r.expected_price) ?? num(r.desired_price), desiredPrice: num(r.desired_price),
    targetSaleDate: sn(r.target_sale_date), urgency: sn(r.urgency_level),
    motivation: sn(r.motivation) ?? sn(r.motivation_type), sellerType: sn(r.seller_type),
    preferredChannel: sn(r.preferred_channel) ?? sn(r.preferred_contact_method), timeline: sn(r.target_sale_date),
  };
}

const TRUST_TIER = (score: number | null): PropertyPerformance["truthTier"] => (score == null ? "listed" : score >= 70 ? "verified" : score >= 40 ? "reviewed" : "listed");

function propertyFromScorecard(sc: SellerScorecard | null): PropertyPerformance {
  const p = sc?.property;
  const asking = p?.askingPrice ?? null;
  const gap = p?.priceGapPct ?? null;
  const estimated = asking != null && gap != null ? Math.round(asking / (1 + gap / 100)) : null;
  return {
    hasProperty: !!p?.hasProperty, propertyId: p?.propertyId ?? null, status: p?.status ?? null,
    askingPrice: asking, estimatedValue: estimated, priceGapPct: gap,
    valuationPosition: (p?.valuationPosition ?? "unknown") as ValuationPosition, valuationConfidence: p?.valuationConfidence ?? null,
    marketScore: p?.marketScore ?? null, pricingHealth: p?.pricingHealth ?? null, competitionPressure: p?.competitionPressure ?? null,
    buyerDemandScore: p?.buyerDemandScore ?? null, daysOnMarket: p?.timeOnMarketDays ?? null, campaignActive: p?.campaignActive ?? null,
    truthTier: TRUST_TIER(sc?.truthScore ?? null), strategyLabel: sc ? (SELLER_STRATEGY_HE[sc.strategy.recommendedStrategy] ?? "—") : "—",
  };
}

/** Anonymize the scorecard's buyer connection into tiered interest (no PII). */
function anonBuyers(sc: SellerScorecard | null): BuyerInterest[] {
  if (!sc) return [];
  const out: BuyerInterest[] = [];
  const add = (list: { score: number }[], tier: BuyerInterest["tier"], label: string) => list.forEach((b) => out.push({ rank: 0, score: b.score, tier, label, why: whyForScore(b.score) }));
  add(sc.buyerConnection.priorityBuyers, "perfect", "קונה מוביל תואם");
  add(sc.buyerConnection.matchingBuyers.filter((m) => !sc.buyerConnection.priorityBuyers.some((p) => p.buyerId === m.buyerId)), "emerging", "קונה מתפתח");
  add(sc.buyerConnection.waitingBuyers.filter((m) => !sc.buyerConnection.matchingBuyers.some((p) => p.buyerId === m.buyerId) && !sc.buyerConnection.priorityBuyers.some((p) => p.buyerId === m.buyerId)), "waiting", "קונה בהמתנה");
  return out.sort((a, b) => b.score - a.score).map((b, i) => ({ ...b, rank: i + 1 }));
}
function whyForScore(score: number): string[] {
  const w = ["תואם להעדפות הקונה"];
  if (score >= 85) w.push("התאמה גבוהה מאוד לנכס"); else if (score >= 65) w.push("התאמה טובה לנכס");
  return w;
}

function convoLabel(t: string): string { const m: Record<string, string> = { call: "שיחה טלפונית", whatsapp: "וואטסאפ", email: "אימייל", sms: "SMS", meeting: "פגישה", viewing: "צפייה" }; return m[t] ?? "פעילות"; }
function activityKind(t: string): ActivityEvent["kind"] { if (t === "viewing" || t === "meeting") return "appointment"; if (t === "call" || t === "whatsapp" || t === "email" || t === "sms") return "message"; if (t === "status_change") return "price"; return "view"; }
function locationText(loc: unknown): string | null { if (typeof loc === "string") return loc || null; if (loc && typeof loc === "object") { const o = loc as Row; return sn(o.address) ?? sn(o.name) ?? sn(o.text); } return null; }

async function buildInput(orgId: string, sellerId: string, seller: Row): Promise<SellerPortalInput> {
  const db = createServiceRoleClient();
  const profile = profileFromRow(seller);

  const [scOverview, meetingsR, activitiesR] = await Promise.all([
    getSellerAgentScorecards(orgId, 80).catch(() => null),
    db.from("meetings").select("id,title,start_at,end_at,type,status,location,seller_id").eq("org_id", orgId).eq("seller_id", sellerId).order("start_at", { ascending: false }).limit(40),
    db.from("activities").select("type,direction,subject,occurred_at,seller_id").eq("org_id", orgId).eq("seller_id", sellerId).order("occurred_at", { ascending: false }).limit(80),
  ]);

  const sc = scOverview?.scorecards.find((c) => c.id === sellerId) ?? null;
  const property = propertyFromScorecard(sc);
  const buyerInterest = anonBuyers(sc);

  const activitiesRows = (activitiesR.data ?? []) as Row[];
  const conversations: Conversation[] = activitiesRows.filter((a) => CONVO_TYPES.includes(s(a.type))).slice(0, 12)
    .map((a) => ({ at: s(a.occurred_at), kind: s(a.type), summary: sn(a.subject) ?? convoLabel(s(a.type)), fromBroker: s(a.direction) === "outbound" }));
  const activity: ActivityEvent[] = activitiesRows.slice(0, 40).map((a) => ({ at: s(a.occurred_at), kind: activityKind(s(a.type)), title: sn(a.subject) ?? convoLabel(s(a.type)), detail: convoLabel(s(a.type)) }));

  const appointments: Appointment[] = ((meetingsR.data ?? []) as Row[]).map((m) => ({
    id: s(m.id), title: s(m.title) || "פגישה", startAt: s(m.start_at), endAt: sn(m.end_at),
    kind: s(m.type) || "meeting", status: s(m.status) || "scheduled", locationText: locationText(m.location),
  }));

  const hasActivity = activitiesRows.length > 0 || appointments.length > 0;
  const lastActivityAt = activitiesRows[0] ? s(activitiesRows[0].occurred_at) : null;

  return {
    sellerId, profile, property,
    healthScore: sc?.health.sellerHealth ?? null, healthLabel: sc?.health.label ?? "חדש", confidence: sc?.aiConfidence ?? 0, churnRisk: sc?.health.churnRisk ?? 0,
    classification: sc?.classification ?? [],
    strategyPlaybook: sc ? sc.strategy.playbook.map((a) => ({ order: a.order, action: a.action, why: a.why })) : [],
    strategyLabel: property.strategyLabel, aiRecommendation: sc?.aiRecommendation ?? "",
    risks: sc ? sc.risks.map((r) => ({ title: r.title, evidence: r.evidence })) : [],
    opportunities: sc ? sc.opportunities.map((o) => ({ title: o.title, evidence: o.evidence })) : [],
    buyerInterest, appointments, conversations, activity,
    hasActivity, lastActivityAt, hasValuation: property.valuationPosition !== "unknown" && property.estimatedValue != null,
    docs: [],
  };
}

// ── Public getters (each enforces the authorization boundary) ────────────────
export type PortalResult<T> = { state: "unauthenticated" } | { state: "unlinked"; email: string | null } | { state: "ready"; data: T };

async function withSeller<T>(fn: (orgId: string, sellerId: string, seller: Row) => Promise<T>): Promise<PortalResult<T>> {
  const r = await resolvePortalSeller();
  if (r.state === "unauthenticated") return { state: "unauthenticated" };
  if (r.state === "unlinked") return { state: "unlinked", email: r.email };
  return { state: "ready", data: await fn(r.orgId, r.sellerId, r.seller) };
}

export function getSellerDashboard(): Promise<PortalResult<{ profileName: string; dashboard: SellerDashboard }>> {
  return withSeller(async (o, sId, seller) => { const input = await buildInput(o, sId, seller); return { profileName: input.profile.name, dashboard: buildDashboard(input) }; });
}
export function getSellerBuyerDemand(): Promise<PortalResult<SellerDashboard["buyerDemand"]>> {
  return withSeller(async (o, sId, seller) => groupBuyers((await buildInput(o, sId, seller)).buyerInterest));
}
export function getSellerActivity(): Promise<PortalResult<{ activity: ActivityEvent[] }>> {
  return withSeller(async (o, sId, seller) => ({ activity: buildActivityTimeline(await buildInput(o, sId, seller)) }));
}
export function getSellerAppointments(): Promise<PortalResult<{ upcoming: Appointment[]; past: Appointment[] }>> {
  return withSeller(async (o, sId, seller) => { const input = await buildInput(o, sId, seller); const now = Date.now();
    return { upcoming: input.appointments.filter((a) => new Date(a.startAt).getTime() >= now - 3600_000).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)), past: input.appointments.filter((a) => new Date(a.startAt).getTime() < now - 3600_000) }; });
}
export function getSellerMessages(): Promise<PortalResult<{ conversations: Conversation[] }>> {
  return withSeller(async (o, sId, seller) => ({ conversations: (await buildInput(o, sId, seller)).conversations }));
}
export function getSellerDocuments(): Promise<PortalResult<{ docs: PortalDoc[] }>> {
  return withSeller(async (o, sId, seller) => ({ docs: sellerGuides(await buildInput(o, sId, seller)) }));
}
export function getSellerProfile(): Promise<PortalResult<SellerProfile>> {
  return withSeller(async (_o, _s, seller) => profileFromRow(seller));
}

/** Property page — always the seller's OWN listing (no client id). Reuses 32.1. */
export function getSellerProperty(): Promise<PortalResult<SellerPortalPropertyView | null>> {
  return withSeller(async (orgId, sellerId, seller) => {
    const input = await buildInput(orgId, sellerId, seller);
    const propertyId = input.property.propertyId;
    if (!propertyId) return null;
    const db = createServiceRoleClient();
    const { data } = await db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).eq("id", propertyId).maybeSingle();
    const row = data as Row | null;
    if (!row) return null;

    const scOverview = await getListingScorecards(orgId, 200).catch(() => null);
    type SC = NonNullable<typeof scOverview>["scorecards"][number];
    const intel = new Map<string, SC>(); for (const c of scOverview?.scorecards ?? []) intel.set(c.id, c);
    const toInput = (p: Row): SiteListingInput => { const c = intel.get(s(p.id)); const dom = c?.marketPerformance.domVsMarket.band ?? null; return {
      id: s(p.id), title: s(p.title) || "נכס", city: sn(p.city), neighborhood: sn(p.neighborhood), price: num(p.price), rooms: num(p.rooms), area: num(p.size_sqm),
      type: s(p.type) || "apartment", status: s(p.status), image: sn(p.primary_image_url), gallery: sn(p.primary_image_url) ? [s(p.primary_image_url)] : [],
      healthLabel: c?.health.label ?? "", classification: c?.classification ?? [], truthScore: c?.truthScore ?? null,
      valuationAvailable: c?.valuation.available ?? false, rangePosition: (c?.valuation.rangePosition as MarketPosition) ?? "unknown", priceGapPct: c?.valuation.priceGapPct ?? null,
      marketScore: c?.marketPerformance.score ?? null, domBand: (dom as SiteListingInput["domBand"]) ?? null,
      buyerDemandScore: c?.marketPerformance.buyerDemand.demandScore ?? null, matchingBuyers: c?.marketPerformance.buyerDemand.activeMatches ?? 0,
      competitionPressure: c?.health.competitionPressure ?? null, strategy: c?.strategy.recommendedStrategy ?? "hold", recommendationAction: null,
    }; };
    const { data: sibs } = await db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).in("status", PUBLIC_STATUSES as never).limit(60);
    const all = ((sibs ?? []) as Row[]).map(toInput);
    const property: PropertyAI = buildProperty(toInput(row), all);
    return { property, performance: input.property };
  });
}

/** Seller Ask AI — scoped to this seller; returns only a public-safe subset. */
export function askSeller(query: string): Promise<PortalResult<{ answer: string; followUps: string[]; confidence: number }>> {
  return withSeller(async (orgId, sellerId, seller) => {
    const q = (query ?? "").trim();
    const name = s(seller.full_name) || "המוכר";
    if (!q) return { answer: "אנא כתבו שאלה.", followUps: [], confidence: 0 };
    const scoped = `בהקשר של המוכר ${name} (מזהה ${sellerId}) — הנכס שלהם, הערכת השווי, הביקוש והקונים התואמים בלבד. אל תחשוף מידע על מוכרים או קונים אחרים בשמם, נתונים פנימיים של המשרד, משימות או תהליכים. שאלה: ${q}`;
    const r = await askZono(orgId, scoped).catch(() => null);
    if (!r) return { answer: "לא הצלחתי לענות כרגע — נסו שוב או פנו לברוקר שלכם.", followUps: [], confidence: 0 };
    const answer = r.answer.executiveAnswer;
    if (containsForbidden({ answer }) !== null) return { answer: "לשאלה זו כדאי לפנות ישירות לברוקר שלכם.", followUps: [], confidence: 0 };
    return { answer, followUps: r.answer.followUps.slice(0, 4), confidence: r.answer.confidence };
  });
}
