/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Seller lifecycle SERVER projection (server-only). Loads the REAL signals
// for ONE property (marketing, interest, viewings, deals/offers) and resolves the
// deterministic lifecycle state + marketing health + next agent action via the
// pure core. Reused by the weekly report, the secure /s view, the property-detail
// seller block, ZI and the Morning Brief. NEVER fabricates metrics — every number
// comes from a real table; a signal that cannot be read degrades to 0/false.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  deriveSellerLifecycleState, deriveMarketingHealth, nextAgentAction, isSellerLifecycleClosed,
  type SellerSignals, type SellerLifecycleState, type MarketingHealth, type NextAgentAction,
} from "./lifecycle-core";

const CAMPAIGN_ACTIVE = ["active", "scheduled", "running"];
const VIEWING_TYPES = ["viewing", "open_house"];
const DAY_MS = 86_400_000;

export interface SellerLifecycleMetrics {
  publications: number;
  activeCampaign: boolean;
  nextScheduledAt: string | null;
  interested: number;
  qualifiedLeads: number;
  viewingsScheduled: number;
  viewingsCompleted: number;
  responses: number;
  priceUpdatesSent: number;      // real delivery rows for propupd:*:<property>:*
}

export interface SellerLifecycle {
  propertyId: string;
  sellerId: string | null;
  lifecycleState: SellerLifecycleState;
  stateLabel: string;
  since: string | null;
  marketingHealth: MarketingHealth;
  attentionReasons: string[];
  lastMeaningfulActivity: string | null;
  nextRecommendedAgentAction: { code: NextAgentAction; label: string };
  metrics: SellerLifecycleMetrics;
  closed: boolean;
}

const STATE_LABEL: Record<SellerLifecycleState, string> = {
  preparing: "הנכס בהכנה",
  ready_to_market: "הנכס מוכן לשיווק",
  marketing: "השיווק התחיל",
  interest: "יש התעניינות",
  viewings: "מתקיימים ביקורים",
  needs_strategy: "נדרש עדכון אסטרטגיה",
  progressing: "יש התקדמות לעסקה",
  closed: "נמכר / נסגר",
};

const ACTION_LABEL: Record<NextAgentAction, string> = {
  start_marketing: "להתחיל שיווק לנכס",
  schedule_more_marketing: "לתזמן פרסום נוסף",
  contact_interested_buyers: "ליצור קשר עם המתעניינים",
  collect_viewing_feedback: "לאסוף משוב מהביקורים",
  discuss_strategy_with_seller: "לעבור עם בעל הנכס על אסטרטגיית השיווק",
  refresh_creative: "לרענן את המדיה והשיווק",
  advance_deal: "לקדם את העסקה",
  none: "",
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const daysBetween = (iso: string | null | undefined, nowMs: number): number => {
  if (!iso) return Infinity;
  const t = Date.parse(iso); return Number.isNaN(t) ? Infinity : Math.max(0, Math.floor((nowMs - t) / DAY_MS));
};

async function countHead(q: any): Promise<number> { try { const { count } = await q; return count ?? 0; } catch { return 0; } }

/** Load the REAL per-property signals + resolve the lifecycle projection. */
export async function getSellerLifecycle(orgId: string, propertyId: string, db?: any): Promise<SellerLifecycle | null> {
  const client: any = db ?? createServiceRoleClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data: prop } = await client.from("properties")
    .select("id,org_id,status,price,title,city,primary_image_url,listed_at,created_at")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop) return null;

  const listedIso = (prop.listed_at as string | null) ?? (prop.created_at as string | null) ?? null;
  const daysListed = daysBetween(listedIso, nowMs);

  // Primary report-recipient seller.
  const { data: link } = await client.from("property_sellers")
    .select("seller_id,is_primary,receives_reports,status")
    .eq("org_id", orgId).eq("property_id", propertyId).eq("status", "active")
    .order("is_primary", { ascending: false }).limit(1).maybeSingle();
  const sellerId = (link?.seller_id as string | null) ?? null;

  const [
    activeCampaigns, publications, futurePosts,
    interestedRecos, interestEdges, qualifiedLeads,
    viewingsScheduled, viewingsCompleted, responses,
    openDeals, wonDeals, offers, priceUpdatesSent,
  ] = await Promise.all([
    countHead(client.from("distribution_campaigns").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("status", CAMPAIGN_ACTIVE)),
    countHead(client.from("distribution_posts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).eq("publish_state", "published")),
    countHead(client.from("distribution_posts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("publish_state", ["queued", "scheduled"]).gte("scheduled_at", nowIso)),
    countHead(client.from("customer_property_recommendations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("status", ["interested", "viewing_requested"])),
    countHead(client.from("entity_relationships").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("target_entity_type", "property").eq("target_entity_id", propertyId).eq("relationship_type", "buyer_interested_in_property").eq("status", "active")),
    countHead(client.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).eq("stage", "qualified")),
    countHead(client.from("meetings").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("type", VIEWING_TYPES).in("status", ["scheduled", "confirmed"])),
    countHead(client.from("meetings").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("type", VIEWING_TYPES).eq("status", "completed")),
    countHead(client.from("customer_property_recommendations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("status", ["interested", "rejected", "viewing_requested"]).not("responded_at", "is", null)),
    countHead(client.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).eq("status", "open")),
    countHead(client.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).eq("status", "won")),
    countHead(client.from("offers").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("status", ["submitted", "countered", "accepted"])),
    countHead(client.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["sent", "delivered", "read"]).like("dedup_key", `propupd:%:${propertyId}:%`)),
  ]);

  // Next scheduled publication timestamp (real).
  let nextScheduledAt: string | null = null;
  try {
    const { data } = await client.from("distribution_posts").select("scheduled_at")
      .eq("org_id", orgId).eq("property_id", propertyId).in("publish_state", ["queued", "scheduled"]).gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
    nextScheduledAt = (data?.scheduled_at as string | null) ?? null;
  } catch { /* best-effort */ }

  // Last meaningful activity = most recent real timestamp across signals.
  let lastActivity: string | null = null;
  try {
    const picks = await Promise.all([
      client.from("distribution_posts").select("published_at").eq("org_id", orgId).eq("property_id", propertyId).not("published_at", "is", null).order("published_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("customer_property_recommendations").select("responded_at").eq("org_id", orgId).eq("property_id", propertyId).not("responded_at", "is", null).order("responded_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("meetings").select("start_at").eq("org_id", orgId).eq("property_id", propertyId).in("type", VIEWING_TYPES).order("start_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const cands = [picks[0].data?.published_at, picks[1].data?.responded_at, picks[2].data?.start_at].filter(Boolean) as string[];
    lastActivity = cands.sort().slice(-1)[0] ?? null;
  } catch { /* best-effort */ }

  const interested = Math.max(num(interestedRecos), num(interestEdges));
  const signals: SellerSignals = {
    status: String(prop.status ?? "draft"),
    daysListed: Number.isFinite(daysListed) ? daysListed : 0,
    hasActiveCampaign: num(activeCampaigns) > 0,
    publications: num(publications),
    hasFuturePublication: num(futurePosts) > 0,
    interestedCount: interested,
    qualifiedLeads: num(qualifiedLeads),
    viewingsScheduled: num(viewingsScheduled),
    viewingsCompleted: num(viewingsCompleted),
    feedbackCount: num(responses),
    hasOpenDeal: num(openDeals) > 0,
    hasOffer: num(offers) > 0,
    dealWon: num(wonDeals) > 0,
    lastActivityDaysAgo: daysBetween(lastActivity, nowMs),
  };

  const lifecycleState = deriveSellerLifecycleState(signals);
  const { health, reasons } = deriveMarketingHealth(signals);
  const actionCode = nextAgentAction(lifecycleState, health);

  // Deterministic Hebrew attention reasons from real counts.
  const attentionReasons = buildAttentionReasons(signals, reasons);

  return {
    propertyId,
    sellerId,
    lifecycleState,
    stateLabel: STATE_LABEL[lifecycleState],
    since: listedIso,
    marketingHealth: health,
    attentionReasons,
    lastMeaningfulActivity: lastActivity,
    nextRecommendedAgentAction: { code: actionCode, label: ACTION_LABEL[actionCode] },
    metrics: {
      publications: signals.publications,
      activeCampaign: signals.hasActiveCampaign,
      nextScheduledAt,
      interested: signals.interestedCount,
      qualifiedLeads: signals.qualifiedLeads,
      viewingsScheduled: signals.viewingsScheduled,
      viewingsCompleted: signals.viewingsCompleted,
      responses: signals.feedbackCount,
      priceUpdatesSent: num(priceUpdatesSent),
    },
    closed: isSellerLifecycleClosed(signals.status, signals.dealWon),
  };
}

function buildAttentionReasons(s: SellerSignals, codes: string[]): string[] {
  const out: string[] = [];
  if (codes.includes("viewings_without_progress")) out.push(`${s.viewingsCompleted} ביקורים הסתיימו ללא התקדמות לעסקה`);
  if (codes.includes("no_interest_yet")) out.push(`${s.daysListed} ימים בשיווק ללא התעניינות`);
  if (codes.includes("stalled_no_activity")) out.push(`${s.lastActivityDaysAgo} ימים ללא פעילות משמעותית`);
  if (codes.includes("no_future_publication")) out.push("אין פרסום עתידי מתוזמן");
  if (codes.includes("not_marketed")) out.push("הנכס עדיין לא בשיווק פעיל");
  return out;
}

// ── Seller communication summary (property-detail block + agent visibility) ──
export interface SellerCommSummary {
  sellerId: string | null;
  sellerName: string | null;
  receivesReports: boolean;
  lastUpdate: { at: string; channel: string; status: string; kind: string } | null;
  updatesLast30d: number;
  reportsSent: number;
}

const SELLER_DEDUP_PREFIXES: Record<string, string> = {
  seller_weekly: "דוח שבועי",
  "seller-live": "הנכס עלה לשיווק",
  "seller-first-interest": "התעניינות ראשונה",
  "seller-price-update": "עדכון מחיר",
  "seller-closed": "עסקה נסגרה",
  "seller-strategy": "עדכון אסטרטגיה",
};
function kindFromDedup(key: string): string {
  const prefix = key.split(":")[0];
  return SELLER_DEDUP_PREFIXES[prefix] ?? "עדכון לבעל הנכס";
}

export async function getSellerCommunicationSummary(orgId: string, propertyId: string, db?: any): Promise<SellerCommSummary> {
  const client: any = db ?? createServiceRoleClient();
  const { data: link } = await client.from("property_sellers")
    .select("seller_id,receives_reports,is_primary,status")
    .eq("org_id", orgId).eq("property_id", propertyId).eq("status", "active")
    .order("is_primary", { ascending: false }).limit(1).maybeSingle();
  const sellerId = (link?.seller_id as string | null) ?? null;
  let sellerName: string | null = null;
  if (sellerId) {
    const { data: s } = await client.from("sellers").select("full_name").eq("id", sellerId).maybeSingle();
    sellerName = (s?.full_name as string | null) ?? null;
  }

  let lastUpdate: SellerCommSummary["lastUpdate"] = null;
  let updatesLast30d = 0, reportsSent = 0;
  try {
    // All seller-facing deliveries for THIS property (dedup keys embed :propertyId:).
    const { data: rows } = await client.from("notification_deliveries")
      .select("channel,status,dedup_key,created_at")
      .eq("org_id", orgId).like("dedup_key", `seller%:${propertyId}:%`)
      .order("created_at", { ascending: false }).limit(60);
    const list = (rows ?? []) as Array<{ channel: string; status: string; dedup_key: string; created_at: string }>;
    const since = Date.now() - 30 * DAY_MS;
    for (const r of list) {
      if (r.dedup_key.startsWith("seller_weekly")) reportsSent++;
      if (Date.parse(r.created_at) >= since) updatesLast30d++;
    }
    const first = list.find((r) => r.status === "sent" || r.status === "delivered" || r.status === "read") ?? list[0];
    if (first) lastUpdate = { at: first.created_at, channel: first.channel, status: first.status, kind: kindFromDedup(first.dedup_key) };
  } catch { /* best-effort */ }

  return { sellerId, sellerName, receivesReports: link?.receives_reports !== false, lastUpdate, updatesLast30d, reportsSent };
}

const WEEK_MS = 7 * DAY_MS;
/** Report-subscribed properties that have NOT received a weekly report this week (ZI + brief). Bounded. */
export async function listPropertiesMissingWeeklyReport(orgId: string, db?: any, limit = 100): Promise<Array<{ propertyId: string; title: string | null }>> {
  const client: any = db ?? createServiceRoleClient();
  const weekBucket = Math.floor(Date.now() / WEEK_MS);
  const { data: props } = await client.from("properties")
    .select("id,title").eq("org_id", orgId).in("status", ["active", "under_offer", "in_contract"]).limit(limit);
  const list = (props ?? []) as Array<{ id: string; title: string | null }>;
  if (!list.length) return [];
  const ids = list.map((p) => p.id);
  const { data: links } = await client.from("property_sellers")
    .select("property_id").in("property_id", ids).eq("status", "active").eq("receives_reports", true);
  const subscribed = new Set(((links ?? []) as Array<{ property_id: string }>).map((l) => l.property_id));
  const out: Array<{ propertyId: string; title: string | null }> = [];
  for (const p of list) {
    if (!subscribed.has(p.id)) continue;
    try {
      const { count } = await client.from("notification_deliveries").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).like("dedup_key", `seller_weekly:${p.id}:%:${weekBucket}`);
      if ((count ?? 0) === 0) out.push({ propertyId: p.id, title: p.title });
    } catch { /* best-effort */ }
  }
  return out;
}
