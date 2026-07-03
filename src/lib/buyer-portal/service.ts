// ============================================================================
// 🛒 ZONO — Buyer Portal™ — service (server-only). 32.3.
// Resolves the AUTHENTICATED buyer (buyers.portal_user_id → else email match),
// then assembles their personal workspace by REUSING the Buyer Agent scorecard
// (twin + matches + journey + strategy + risks/opps), the AI Brokerage Website
// framework (property view), Ask ZONO and the buyers read model.
//
// AUTHORIZATION: getters accept NO client-supplied buyerId — each resolves the
// session's own buyer and scopes every read to that buyerId + orgId. A buyer can
// only ever see their own data. Public/buyer-safe + evidence-only; nothing runs.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import type { BuyerScorecard } from "@/lib/buyer-agent";
import { getListingScorecards } from "@/lib/listing-agent";
import { askZono } from "@/lib/ask-zono";
import { buildProperty, containsForbidden } from "@/lib/brokerage-site";
import type { SiteListingInput, PropertyAI, MarketPosition } from "@/lib/brokerage-site/types";
import { buildDashboard, buildFavorites } from "./assemble";
import { buyerGuides } from "./content";
import type {
  BuyerPortalInput, BuyerProfile, BuyerDashboard, BuyerFavorites, Appointment, Conversation,
  PortalListingFacts, PortalMatchFacts, MatchTier, JourneyStage, RecoProperty, BuyerPortalPropertyView, PortalDoc,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const PUBLIC_STATUSES = ["active", "published", "under_offer"];
const CONVO_TYPES = ["call", "whatsapp", "email", "sms", "meeting", "viewing"];

// ── Resolution + authorization boundary ─────────────────────────────────────
export type PortalResolution =
  | { state: "unauthenticated" }
  | { state: "unlinked"; email: string | null }
  | { state: "ready"; orgId: string; buyerId: string; buyer: Row };

export async function resolvePortalBuyer(): Promise<PortalResolution> {
  const user = await getAuthUser();
  if (!user) return { state: "unauthenticated" };
  const db = createServiceRoleClient();
  // 1) explicit link
  let row: Row | null = null;
  try {
    const byLink = await db.from("buyers").select("*").eq("portal_user_id" as never, user.id as never).limit(1).maybeSingle();
    row = (byLink.data as Row) ?? null;
  } catch { /* column may not exist yet — fall through to email */ }
  // 2) email fallback
  if (!row && user.email) {
    const byEmail = await db.from("buyers").select("*").ilike("email", user.email).limit(1).maybeSingle();
    row = (byEmail.data as Row) ?? null;
  }
  if (!row) return { state: "unlinked", email: user.email ?? null };
  return { state: "ready", orgId: s(row.org_id), buyerId: s(row.id), buyer: row };
}

function profileFromRow(r: Row): BuyerProfile {
  const prefs = (r.preferences as Row) ?? {};
  const name = s(r.full_name) || "קונה";
  return {
    name, firstName: name.split(" ")[0] || name,
    budgetMin: num(r.budget_min), budgetMax: num(r.budget_max),
    roomsMin: num(r.rooms_min), roomsMax: num(r.rooms_max), sizeMin: num(r.size_min_sqm), sizeMax: num(r.size_max_sqm),
    preferredCities: arr(r.preferred_regions),
    preferredAreas: arr(r.preferred_areas), preferredTypes: arr(r.preferred_types),
    timeline: sn(prefs.timeline), languages: arr(prefs.languages),
    preferredChannel: sn(r.preferred_channel), hasPreapproval: !!r.has_preapproval,
    investmentGoal: sn(prefs.investment_goal),
    mustHaveParking: !!r.must_have_parking, mustHaveElevator: !!r.must_have_elevator, mustHaveSafeRoom: !!r.must_have_safe_room,
  };
}

const STRATEGY_STAGE: Record<string, JourneyStage> = {
  CLOSE_DEAL: "closing", LAWYER_STAGE: "closing", NEGOTIATE: "offer",
  SEND_PROPERTIES: "active_search", BOOK_VISIT: "active_search", BOOK_SECOND_VISIT: "active_search",
  COLLECT_INFORMATION: "evaluating", FINANCING: "evaluating",
  CONTACT: "discovery", WAIT: "discovery", LONG_TERM_NURTURE: "dormant",
};
function stageFor(sc: BuyerScorecard | null, hasActivity: boolean): JourneyStage {
  if (!sc) return hasActivity ? "discovery" : "new";
  if (sc.health.label === "רדום" || sc.classification.includes("רדום")) return "dormant";
  if (sc.health.label === "חדש" && !hasActivity) return "new";
  return STRATEGY_STAGE[sc.strategy.recommendedStrategy] ?? (hasActivity ? "active_search" : "new");
}

function listingToFacts(p: Row): PortalListingFacts {
  return {
    id: s(p.id), title: s(p.title) || "נכס", price: num(p.price), image: sn(p.primary_image_url),
    city: sn(p.city), neighborhood: sn(p.neighborhood), rooms: num(p.rooms), area: num(p.size_sqm),
    priceDropPct: null, sold: s(p.status) === "sold",
  };
}

async function buildInput(orgId: string, buyerId: string, buyer: Row): Promise<BuyerPortalInput> {
  const db = createServiceRoleClient();
  const profile = profileFromRow(buyer);

  const [scOverview, meetingsR, activitiesR] = await Promise.all([
    getBuyerAgentScorecards(orgId, 80).catch(() => null),
    db.from("meetings").select("id,title,start_at,end_at,type,status,location,buyer_id,property_id").eq("org_id", orgId).eq("buyer_id", buyerId).order("start_at", { ascending: false }).limit(40),
    db.from("activities").select("type,direction,subject,property_id,occurred_at,buyer_id").eq("org_id", orgId).eq("buyer_id", buyerId).order("occurred_at", { ascending: false }).limit(60),
  ]);

  const sc = scOverview?.scorecards.find((c) => c.id === buyerId) ?? null;

  // Matches → PortalMatchFacts (from the Buyer Agent match intelligence).
  const matches: PortalMatchFacts[] = [];
  const listingIds = new Set<string>();
  if (sc) {
    const push = (items: typeof sc.matchIntel.perfect, tier: MatchTier) => items.forEach((m) => { matches.push({ listingId: m.listingId, score: m.score, tier, why: m.why }); listingIds.add(m.listingId); });
    push(sc.matchIntel.perfect, "perfect"); push(sc.matchIntel.emerging, "emerging"); push(sc.matchIntel.hidden, "hidden"); push(sc.matchIntel.future, "future");
  }

  // Activities → conversations + viewed listings.
  const activities = (activitiesR.data ?? []) as Row[];
  const conversations: Conversation[] = activities
    .filter((a) => CONVO_TYPES.includes(s(a.type)))
    .slice(0, 12)
    .map((a) => ({ at: s(a.occurred_at), kind: s(a.type), summary: sn(a.subject) ?? convoLabel(s(a.type)), fromBroker: s(a.direction) === "outbound" }));
  const viewedListingIds = [...new Set(activities.filter((a) => (s(a.type) === "viewing" || s(a.type) === "meeting") && sn(a.property_id)).map((a) => s(a.property_id)))].slice(0, 24);
  viewedListingIds.forEach((id) => listingIds.add(id));

  // Appointments (public-safe subset — no internal description).
  const appointments: Appointment[] = ((meetingsR.data ?? []) as Row[]).map((m) => ({
    id: s(m.id), title: s(m.title) || "פגישה", startAt: s(m.start_at), endAt: sn(m.end_at),
    kind: s(m.type) || "meeting", status: s(m.status) || "scheduled", locationText: locationText(m.location), propertyId: sn(m.property_id),
  }));
  appointments.forEach((a) => { if (a.propertyId) listingIds.add(a.propertyId); });

  // Listing facts for every referenced id (org-scoped).
  const listings: Record<string, PortalListingFacts> = {};
  if (listingIds.size) {
    const { data } = await db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).in("id", [...listingIds] as never).limit(200);
    for (const p of (data ?? []) as Row[]) listings[s(p.id)] = listingToFacts(p);
  }

  const hasActivity = activities.length > 0;
  const lastActivityAt = activities[0] ? s(activities[0].occurred_at) : null;

  return {
    buyerId, profile,
    stage: stageFor(sc, hasActivity),
    readiness: sc?.health.buyingReadiness ?? (num(buyer.readiness) ?? 0),
    healthLabel: sc?.health.label ?? "חדש", confidence: sc?.aiConfidence ?? 0, momentum: sc?.health.buyingMomentum ?? 0,
    classification: sc?.classification ?? [],
    strategyPlaybook: sc ? sc.strategy.playbook.map((a) => ({ order: a.order, action: a.action, why: a.why })) : [],
    risks: sc ? sc.risks.map((r) => ({ title: r.title, evidence: r.evidence })) : [],
    opportunities: sc ? sc.opportunities.map((o) => ({ title: o.title, evidence: o.evidence })) : [],
    matches, listings, appointments, conversations, drafts: [],
    savedListingIds: [], viewedListingIds, hasActivity, lastActivityAt,
    docs: [],
  };
}

function convoLabel(t: string): string {
  const m: Record<string, string> = { call: "שיחה טלפונית", whatsapp: "הודעת וואטסאפ", email: "אימייל", sms: "SMS", meeting: "פגישה", viewing: "צפייה בנכס" };
  return m[t] ?? "פעילות";
}
function locationText(loc: unknown): string | null {
  if (typeof loc === "string") return loc || null;
  if (loc && typeof loc === "object") { const o = loc as Row; return sn(o.address) ?? sn(o.name) ?? sn(o.text); }
  return null;
}

// ── Public getters (each enforces the authorization boundary) ────────────────
export type PortalResult<T> = { state: "unauthenticated" } | { state: "unlinked"; email: string | null } | { state: "ready"; data: T };

async function withBuyer<T>(fn: (orgId: string, buyerId: string, buyer: Row) => Promise<T>): Promise<PortalResult<T>> {
  const r = await resolvePortalBuyer();
  if (r.state === "unauthenticated") return { state: "unauthenticated" };
  if (r.state === "unlinked") return { state: "unlinked", email: r.email };
  return { state: "ready", data: await fn(r.orgId, r.buyerId, r.buyer) };
}

export function getBuyerDashboard(): Promise<PortalResult<{ profileName: string; dashboard: BuyerDashboard }>> {
  return withBuyer(async (orgId, buyerId, buyer) => {
    const input = await buildInput(orgId, buyerId, buyer);
    return { profileName: input.profile.name, dashboard: buildDashboard(input) };
  });
}
export function getBuyerFavorites(): Promise<PortalResult<BuyerFavorites>> {
  return withBuyer(async (orgId, buyerId, buyer) => buildFavorites(await buildInput(orgId, buyerId, buyer)));
}
export function getBuyerProfile(): Promise<PortalResult<BuyerProfile>> {
  return withBuyer(async (_o, _b, buyer) => profileFromRow(buyer));
}
export function getBuyerAppointments(): Promise<PortalResult<{ upcoming: Appointment[]; past: Appointment[] }>> {
  return withBuyer(async (orgId, buyerId, buyer) => {
    const input = await buildInput(orgId, buyerId, buyer);
    const now = Date.now();
    return { upcoming: input.appointments.filter((a) => new Date(a.startAt).getTime() >= now - 3600_000).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)), past: input.appointments.filter((a) => new Date(a.startAt).getTime() < now - 3600_000) };
  });
}
export function getBuyerMessages(): Promise<PortalResult<{ conversations: Conversation[] }>> {
  return withBuyer(async (orgId, buyerId, buyer) => ({ conversations: (await buildInput(orgId, buyerId, buyer)).conversations }));
}
export function getBuyerDocuments(): Promise<PortalResult<{ docs: PortalDoc[] }>> {
  return withBuyer(async (orgId, buyerId, buyer) => ({ docs: buyerGuides(await buildInput(orgId, buyerId, buyer)) }));
}
export function getBuyerRecommendations(): Promise<PortalResult<{ perfect: RecoProperty[]; emerging: RecoProperty[]; hidden: RecoProperty[]; future: RecoProperty[] }>> {
  return withBuyer(async (orgId, buyerId, buyer) => buildDashboard(await buildInput(orgId, buyerId, buyer)).recommendations);
}

/** Property page — verifies the listing is in the buyer's org + public, then reuses the 32.1 framework. */
export function getBuyerProperty(propertyId: string): Promise<PortalResult<BuyerPortalPropertyView | null>> {
  return withBuyer(async (orgId, buyerId, buyer) => {
    const db = createServiceRoleClient();
    const { data } = await db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url,owner_id").eq("org_id", orgId).eq("id", propertyId).maybeSingle();
    const row = data as Row | null;
    if (!row || !PUBLIC_STATUSES.includes(s(row.status))) return null;

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

    // Sibling listings for "related" (org public inventory).
    const { data: sibs } = await db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).in("status", PUBLIC_STATUSES as never).limit(60);
    const all = ((sibs ?? []) as Row[]).map(toInput);
    const property: PropertyAI = buildProperty(toInput(row), all);

    // Buyer match overlay (from this buyer's scorecard).
    const input = await buildInput(orgId, buyerId, buyer);
    const m = input.matches.find((x) => x.listingId === propertyId);
    return { property, match: m ? { score: m.score, tier: m.tier, why: m.why } : null };
  });
}

/** Buyer Ask AI — scoped to this buyer; returns only a public-safe subset. */
export function askBuyer(query: string): Promise<PortalResult<{ answer: string; followUps: string[]; confidence: number }>> {
  return withBuyer(async (orgId, buyerId, buyer) => {
    const q = (query ?? "").trim();
    const name = s(buyer.full_name) || "הקונה";
    if (!q) return { answer: "אנא כתבו שאלה.", followUps: [], confidence: 0 };
    const scoped = `בהקשר של הקונה ${name} (מזהה ${buyerId}) — ההעדפות, המסע, ההמלצות והנכסים הציבוריים שלהם בלבד. אל תחשוף מידע על לקוחות אחרים, נתונים פנימיים של המשרד, משימות או תהליכים. שאלה: ${q}`;
    const r = await askZono(orgId, scoped).catch(() => null);
    if (!r) return { answer: "לא הצלחתי לענות כרגע — נסו שוב או פנו לברוקר שלכם.", followUps: [], confidence: 0 };
    const answer = r.answer.executiveAnswer;
    // Defensive: never leak forbidden internals to a buyer.
    if (containsForbidden({ answer }) !== null) return { answer: "לשאלה זו כדאי לפנות ישירות לברוקר שלכם.", followUps: [], confidence: 0 };
    return { answer, followUps: r.answer.followUps.slice(0, 4), confidence: r.answer.confidence };
  });
}
