/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Property Lifecycle Control Center: ONE authoritative server selector.
// Composes the EXISTING canonical selectors (seller lifecycle spine + comm
// summary) with bounded, org-scoped direct reads (matching, recommendation funnel,
// responses, viewings, follow-up tasks, deal/offers, timeline) into a single
// operational picture for ONE property. Everything runs in ONE Promise.all — no
// N+1, no fabricated metrics. The pure core derives the single next action. Reused
// by the control-center UI and the ZI property copilot (same facts, no drift).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSellerLifecycle, getSellerCommunicationSummary, type SellerLifecycle, type SellerCommSummary } from "@/lib/sellers/lifecycle";
import { derivePropertyNextAction, buildRecoFunnel, recoStatusLabel, type ControlSignals, type PropertyNextAction, type RecoFunnel } from "./control-center-core";

const VIEWING_TYPES = ["viewing", "open_house"];
const STRONG_MATCH = 70;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface CcMatch { buyerId: string; name: string; compatibility: number | null; status: string; statusLabel: string; reason: string | null }
export interface CcResponse { contactType: string; contactId: string; name: string; status: string; statusLabel: string; at: string | null }
export interface CcViewing { id: string; at: string | null; buyerName: string | null; status: string }
export interface CcFollowup { id: string; title: string; priority: string | null; overdue: boolean }
export interface CcDeal { id: string; stage: string; status: string; value: number | null; buyerName: string | null; daysInStage: number; offers: Array<{ id: string; amount: number | null; status: string }> }
export interface CcTimelineItem { eventType: string; title: string | null; at: string | null }

export interface PropertyControlCenter {
  property: { id: string; title: string | null; city: string | null; price: number | null; status: string | null; imageUrl: string | null; agentName: string | null };
  lifecycleState: string; stateLabel: string; marketingHealth: string; closed: boolean;
  nextAction: PropertyNextAction & { href: string };
  marketing: { activeCampaign: boolean; publications: number; nextScheduledAt: string | null; failedPublications: number; priceUpdatesSent: number };
  matching: { total: number; top: CcMatch[] };
  funnel: RecoFunnel;
  responses: CcResponse[];
  viewings: { upcoming: CcViewing[]; completed: CcViewing[]; scheduled: number; completedCount: number };
  followups: CcFollowup[];
  deal: CcDeal | null; dealReadyBuyer: boolean;
  seller: { sellerId: string | null; sellerName: string | null; receivesReports: boolean; lastUpdate: SellerCommSummary["lastUpdate"]; reportsSent: number; updatesLast30d: number; attentionReasons: string[] };
  timeline: CcTimelineItem[];
  ziSummary: string;
  isManager: boolean;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const daysSince = (iso: string | null | undefined, nowMs: number) => { if (!iso) return 0; const t = Date.parse(iso); return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((nowMs - t) / DAY_MS)); };

function hrefFor(code: string, id: string): string {
  switch (code) {
    case "publish_failed": return "/distribution/daily";
    case "schedule_marketing":
    case "start_marketing": return `/distribution/campaign-wizard?property=${id}`;
    case "refresh_creative": return `/creative-studio/property/${id}`;
    default: return `/properties/${id}`;
  }
}

/** The single authoritative operational picture for one property. Bounded, org-scoped. */
export async function getPropertyLifecycleControlCenter(orgId: string, propertyId: string, opts?: { isManager?: boolean; db?: any }): Promise<PropertyControlCenter | null> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const isManager = opts?.isManager === true;

  const { data: prop } = await db.from("properties")
    .select("id,org_id,title,city,price,status,primary_image_url,owner_id")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop) return null;

  const [
    life, comm, matchTop, matchTotal, recoRows, upcoming, completed, taskRows, dealRow, offerRows, failedPubs, timelineRows, agent,
  ] = await Promise.all([
    getSellerLifecycle(orgId, propertyId, db),
    getSellerCommunicationSummary(orgId, propertyId, db),
    db.from("match_intelligence_profiles").select("buyer_id,compatibility_score,strongest_advantage").eq("org_id", orgId).eq("property_id", propertyId).order("compatibility_score", { ascending: false }).limit(8),
    db.from("match_intelligence_profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId),
    db.from("customer_property_recommendations").select("contact_type,contact_id,status,responded_at,price_at_send").eq("org_id", orgId).eq("property_id", propertyId).limit(300),
    db.from("meetings").select("id,start_at,status,buyer_id").eq("org_id", orgId).eq("property_id", propertyId).in("type", VIEWING_TYPES).in("status", ["scheduled", "confirmed"]).gte("start_at", nowIso).order("start_at", { ascending: true }).limit(5),
    db.from("meetings").select("id,start_at,status,buyer_id").eq("org_id", orgId).eq("property_id", propertyId).in("type", VIEWING_TYPES).eq("status", "completed").order("start_at", { ascending: false }).limit(5),
    db.from("tasks").select("id,title,priority,status,intelligence_source,due_at").eq("org_id", orgId).eq("property_id", propertyId).in("status", ["todo", "in_progress", "blocked"]).order("created_at", { ascending: false }).limit(30),
    db.from("deals").select("id,stage,status,value,buyer_id,updated_at,created_at").eq("org_id", orgId).eq("property_id", propertyId).eq("status", "open").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("offers").select("id,amount,status").eq("org_id", orgId).eq("property_id", propertyId).in("status", ["submitted", "countered", "accepted"]).limit(3),
    db.from("distribution_posts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).in("publish_state", ["failed", "dead_letter"]),
    db.from("activity_events").select("event_type,title,occurred_at").eq("org_id", orgId).eq("entity_type", "property").eq("entity_id", propertyId).order("occurred_at", { ascending: false }).limit(20),
    prop.owner_id ? db.from("users").select("full_name").eq("id", prop.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const L = life as SellerLifecycle | null;
  const currentPrice = prop.price != null ? Number(prop.price) : null;

  // ── Recommendation status by buyer + funnel + responses ────────────────────
  const recos = (recoRows?.data ?? []) as Array<{ contact_type: string; contact_id: string; status: string; responded_at: string | null; price_at_send: number | null }>;
  const statusCounts: Record<string, number> = {};
  const recoByBuyer = new Map<string, string>();
  let priceDropResponses = 0;
  for (const r of recos) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.contact_type === "buyer") recoByBuyer.set(r.contact_id, r.status);
    if ((r.status === "interested" || r.status === "viewing_requested") && r.responded_at && r.price_at_send != null && currentPrice != null && currentPrice < r.price_at_send) priceDropResponses++;
  }

  // Collect all buyer/lead ids we need names for (matches + responses + viewings + deal).
  const buyerIds = new Set<string>(); const leadIds = new Set<string>();
  const matches = (matchTop?.data ?? []) as Array<{ buyer_id: string; compatibility_score: number | null; strongest_advantage: string | null }>;
  for (const m of matches) if (m.buyer_id) buyerIds.add(m.buyer_id);
  const respondedRows = recos.filter((r) => r.responded_at).sort((a, b) => (b.responded_at ?? "").localeCompare(a.responded_at ?? "")).slice(0, 6);
  for (const r of respondedRows) { if (r.contact_type === "buyer") buyerIds.add(r.contact_id); else leadIds.add(r.contact_id); }
  const upRows = (upcoming?.data ?? []) as Array<{ id: string; start_at: string; status: string; buyer_id: string | null }>;
  const compRows = (completed?.data ?? []) as Array<{ id: string; start_at: string; status: string; buyer_id: string | null }>;
  for (const v of [...upRows, ...compRows]) if (v.buyer_id) buyerIds.add(v.buyer_id);
  const deal = (dealRow?.data ?? null) as { id: string; stage: string; status: string; value: number | null; buyer_id: string | null; updated_at: string | null; created_at: string | null } | null;
  if (deal?.buyer_id) buyerIds.add(deal.buyer_id);

  const [buyerNames, leadNames] = await Promise.all([
    buyerIds.size ? db.from("buyers").select("id,full_name").in("id", [...buyerIds]).eq("org_id", orgId) : Promise.resolve({ data: [] }),
    leadIds.size ? db.from("leads").select("id,full_name").in("id", [...leadIds]).eq("org_id", orgId) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const b of (buyerNames?.data ?? []) as any[]) nameOf.set(`buyer:${b.id}`, b.full_name ?? "קונה");
  for (const l of (leadNames?.data ?? []) as any[]) nameOf.set(`lead:${l.id}`, l.full_name ?? "ליד");

  const top: CcMatch[] = matches.slice(0, 5).map((m) => {
    const status = recoByBuyer.get(m.buyer_id) ?? "none";
    return { buyerId: m.buyer_id, name: nameOf.get(`buyer:${m.buyer_id}`) ?? "קונה", compatibility: m.compatibility_score, status, statusLabel: recoStatusLabel(status), reason: m.strongest_advantage ?? null };
  });
  const strongUncontactedMatches = matches.filter((m) => (m.compatibility_score ?? 0) >= STRONG_MATCH && !recoByBuyer.has(m.buyer_id)).length;

  const funnel = buildRecoFunnel({ matchCount: matchTotal?.count ?? matches.length, statusCounts });

  const responses: CcResponse[] = respondedRows.map((r) => ({
    contactType: r.contact_type, contactId: r.contact_id, name: nameOf.get(`${r.contact_type}:${r.contact_id}`) ?? "לקוח",
    status: r.status, statusLabel: recoStatusLabel(r.status), at: r.responded_at,
  }));

  const viewUp: CcViewing[] = upRows.map((v) => ({ id: v.id, at: v.start_at, buyerName: v.buyer_id ? nameOf.get(`buyer:${v.buyer_id}`) ?? null : null, status: v.status }));
  const viewDone: CcViewing[] = compRows.map((v) => ({ id: v.id, at: v.start_at, buyerName: v.buyer_id ? nameOf.get(`buyer:${v.buyer_id}`) ?? null : null, status: v.status }));

  // Follow-up exceptions (property-scoped, actionable) + signals derived from them.
  const tasks = (taskRows?.data ?? []) as Array<{ id: string; title: string | null; priority: string | null; intelligence_source: string | null; due_at: string | null }>;
  const isOverdue = (t: { due_at: string | null }) => !!t.due_at && Date.parse(t.due_at) < nowMs;
  const sellerActionRequested = tasks.some((t) => (t.intelligence_source ?? "").match(/^wa:\w+:seller:/));
  const hotBuyerWaiting = tasks.some((t) => (t.intelligence_source ?? "").match(/^wa:(callback|viewing):(buyer|lead):/) || (t.intelligence_source ?? "").startsWith("reco:viewing_request:"));
  const viewingFollowupOverdue = tasks.some((t) => ((t.intelligence_source ?? "").startsWith("viewing:") || (t.intelligence_source ?? "").includes("post_meeting")) && isOverdue(t));
  const followups: CcFollowup[] = tasks
    .filter((t) => isOverdue(t) || /^(wa:|reco:|viewing:|followup:)/.test(t.intelligence_source ?? "") || t.priority === "urgent")
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title ?? "משימה", priority: t.priority, overdue: isOverdue(t) }));

  const offers = (offerRows?.data ?? []) as Array<{ id: string; amount: number | null; status: string }>;
  const ccDeal: CcDeal | null = deal ? {
    id: deal.id, stage: deal.stage, status: deal.status, value: deal.value,
    buyerName: deal.buyer_id ? nameOf.get(`buyer:${deal.buyer_id}`) ?? null : null,
    daysInStage: daysSince(deal.updated_at ?? deal.created_at, nowMs), offers,
  } : null;

  const metrics = L?.metrics;
  const viewingFeedbackPending = Math.max(0, num(metrics?.viewingsCompleted) - num(metrics?.responses));
  const dealReadyBuyer = !ccDeal && (funnel.viewingRequested > 0 || (num(metrics?.viewingsCompleted) > 0 && num(metrics?.interested) > 0));

  // Report-due-unsent (bounded single check).
  let reportDueUnsent = false;
  if (comm?.receivesReports && comm?.sellerId && ["active", "under_offer", "in_contract"].includes(String(prop.status))) {
    try {
      const weekBucket = Math.floor(nowMs / WEEK_MS);
      const { count } = await db.from("notification_deliveries").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).like("dedup_key", `seller_weekly:${propertyId}:%:${weekBucket}`);
      reportDueUnsent = (count ?? 0) === 0;
    } catch { /* best-effort */ }
  }

  const health = L?.marketingHealth ?? "not_marketed";
  const signals: ControlSignals = {
    closed: L?.closed ?? false,
    failedPublications: failedPubs?.count ?? 0,
    sellerActionRequested,
    hotBuyerWaiting,
    priceDropResponses,
    viewingFollowupOverdue,
    dealReadyBuyer,
    hasOpenDeal: !!ccDeal,
    strongUncontactedMatches,
    viewingFeedbackPending,
    sellerStrategyNeeded: health === "needs_attention" || health === "viewings_no_progress",
    noFutureMarketing: health === "no_future_marketing",
    notMarketed: health === "not_marketed",
    noRecentInterest: health === "no_recent_interest",
    reportDueUnsent,
  };
  const next = derivePropertyNextAction(signals);

  const timeline: CcTimelineItem[] = ((timelineRows?.data ?? []) as any[]).map((e) => ({ eventType: e.event_type, title: e.title ?? null, at: e.occurred_at ?? null }));

  const ziSummary = [
    `מצב: ${L?.stateLabel ?? "—"}`,
    `${funnel.matched} התאמות · ${funnel.sent} נשלחו · ${funnel.interested} מעוניינים`,
    `${num(metrics?.viewingsScheduled)} ביקורים מתוכננים · ${num(metrics?.viewingsCompleted)} התקיימו`,
    ccDeal ? `עסקה פעילה בשלב ${ccDeal.stage}` : "אין עסקה פעילה",
    `הפעולה הבאה: ${next.label}`,
  ].join(" · ");

  return {
    property: { id: propertyId, title: prop.title ?? null, city: prop.city ?? null, price: currentPrice, status: prop.status ?? null, imageUrl: prop.primary_image_url ?? null, agentName: (agent?.data?.full_name as string | null) ?? null },
    lifecycleState: L?.lifecycleState ?? "preparing",
    stateLabel: L?.stateLabel ?? "הנכס בהכנה",
    marketingHealth: health,
    closed: L?.closed ?? false,
    nextAction: { ...next, href: hrefFor(next.code, propertyId) },
    marketing: {
      activeCampaign: !!metrics?.activeCampaign, publications: num(metrics?.publications),
      nextScheduledAt: metrics?.nextScheduledAt ?? null, failedPublications: failedPubs?.count ?? 0,
      priceUpdatesSent: num(metrics?.priceUpdatesSent),
    },
    matching: { total: matchTotal?.count ?? matches.length, top },
    funnel,
    responses,
    viewings: { upcoming: viewUp, completed: viewDone, scheduled: num(metrics?.viewingsScheduled), completedCount: num(metrics?.viewingsCompleted) },
    followups,
    deal: ccDeal, dealReadyBuyer,
    seller: {
      sellerId: comm?.sellerId ?? null, sellerName: comm?.sellerName ?? null, receivesReports: comm?.receivesReports ?? false,
      lastUpdate: comm?.lastUpdate ?? null, reportsSent: comm?.reportsSent ?? 0, updatesLast30d: comm?.updatesLast30d ?? 0,
      attentionReasons: L?.attentionReasons ?? [],
    },
    timeline,
    ziSummary,
    isManager,
  };
}

/** Compact deterministic ZI answer about one property (facts only, never invented). */
export async function summarizePropertyForZi(orgId: string, propertyId: string, isManager: boolean, db?: any): Promise<string | null> {
  const cc = await getPropertyLifecycleControlCenter(orgId, propertyId, { isManager, db });
  if (!cc) return null;
  const lines: string[] = [
    `📍 ${cc.property.title ?? "נכס"} — ${cc.stateLabel}`,
    `שיווק: ${cc.marketing.activeCampaign ? "קמפיין פעיל" : "אין קמפיין פעיל"} · ${cc.marketing.publications} פרסומים${cc.marketing.failedPublications > 0 ? ` · ${cc.marketing.failedPublications} נכשלו` : ""}`,
    `התאמות: ${cc.matching.total} · נשלחו: ${cc.funnel.sent} · מעוניינים: ${cc.funnel.interested} · ביקשו ביקור: ${cc.funnel.viewingRequested}`,
    `ביקורים: ${cc.viewings.scheduled} מתוכננים · ${cc.viewings.completedCount} התקיימו`,
    cc.deal ? `עסקה: שלב ${cc.deal.stage}${cc.deal.buyerName ? ` · ${cc.deal.buyerName}` : ""}` : "אין עסקה פעילה",
    `בעל הנכס: ${cc.seller.sellerName ?? "לא מקושר"}${cc.seller.lastUpdate ? ` · עודכן לאחרונה ${cc.seller.lastUpdate.kind}` : " · טרם עודכן"}`,
    `➡️ הפעולה הבאה (${cc.nextAction.priority}): ${cc.nextAction.label}`,
  ];
  return lines.join("\n");
}
