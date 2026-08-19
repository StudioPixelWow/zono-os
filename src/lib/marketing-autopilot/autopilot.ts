/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot SERVER selectors. Composes the EXISTING per-property
// Lifecycle Control Center + distribution/creative/group facts into ONE marketing
// picture, and derives the deterministic recommendation + prepared weekly plan via
// the pure core. Two tiers, both org-scoped + bounded (no N+1): a cheap batched
// PORTFOLIO scan (distribution home / Morning Brief / weekly cron) and a rich
// PER-PROPERTY view (Control Center block / plan page / ZI). Reuses the buyer-
// match, campaign-wizard, creative-studio and viewing engines for execution — it
// only DETECTS + EXPLAINS + PREPARES; it never publishes or messages by itself.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getPropertyLifecycleControlCenter } from "@/lib/properties/control-center";
import { getCreativeFacebookReadiness } from "@/lib/facebook-groups/creative-readiness";
import {
  deriveMarketingRecommendation, deriveMarketingState, deriveMarketingReasons, marketingUrgency,
  buildWeeklyPlan, signalsFromCoverage, MARKETING_STATE_LABEL,
  type MarketingSignals, type MarketingRecommendation, type MarketingState, type WeeklyPlanItem,
} from "./health-core";

const MARKETABLE = ["active", "published", "under_offer", "in_contract", "ready"];
const CAMPAIGN_ACTIVE = ["active", "scheduled", "running"];
const STRONG_MATCH = 70;
const DAY_MS = 86_400_000;

function hrefForAction(actionType: string, propertyId: string): string {
  switch (actionType) {
    case "fix_publication": return "/distribution/daily";
    case "prepare_creative":
    case "refresh_creative": return `/creative-studio/property/${propertyId}?source=marketing_autopilot`;
    case "start_marketing":
    case "schedule_marketing":
    case "expand_groups": return `/distribution/campaign-wizard?property=${propertyId}`;
    case "prepare_week": return `/distribution/marketing-plan/${propertyId}`;
    default: return `/properties/${propertyId}`;
  }
}
const daysSince = (iso: string | null | undefined, nowMs: number) => { if (!iso) return Infinity; const t = Date.parse(iso); return Number.isNaN(t) ? Infinity : Math.max(0, Math.floor((nowMs - t) / DAY_MS)); };

export interface PortfolioItem {
  propertyId: string; title: string; city: string | null; imageUrl: string | null;
  state: MarketingState; stateLabel: string; priority: MarketingRecommendation["priority"];
  primaryTitle: string; primaryReason: string; actionType: string; href: string; urgency: number;
  lastPublishedAt: string | null; nextScheduledAt: string | null;
}

/** Cheap batched per-org marketing scan (distribution-focused). No N+1. */
export async function scanOrgMarketing(db: any, orgId: string, opts?: { limit?: number }): Promise<PortfolioItem[]> {
  const nowMs = Date.now();
  const { data: props } = await db.from("properties")
    .select("id,title,city,status,primary_image_url").eq("org_id", orgId).in("status", MARKETABLE).limit(opts?.limit ?? 200);
  const properties = (props ?? []) as Array<{ id: string; title: string | null; city: string | null; status: string; primary_image_url: string | null }>;
  if (!properties.length) return [];
  const propIds = properties.map((p) => p.id);

  const { data: camps } = await db.from("distribution_campaigns").select("id,property_id,status").eq("org_id", orgId).in("property_id", propIds).limit(1000);
  const campaigns = (camps ?? []) as Array<{ id: string; property_id: string; status: string }>;
  const campaignIds = campaigns.map((c) => c.id);
  const activeByProp = new Map<string, boolean>();
  const campToProp = new Map<string, string>();
  for (const c of campaigns) { campToProp.set(c.id, c.property_id); if (CAMPAIGN_ACTIVE.includes(c.status)) activeByProp.set(c.property_id, true); }

  const pubByProp = new Map<string, { count: number; last: string | null; future: boolean; failed: number }>();
  for (let i = 0; i < campaignIds.length; i += 300) {
    const chunk = campaignIds.slice(i, i + 300);
    if (!chunk.length) break;
    const { data: posts } = await db.from("distribution_posts").select("campaign_id,publish_state,published_at,scheduled_at").in("campaign_id", chunk).limit(2000);
    const nowIso = new Date(nowMs).toISOString();
    for (const p of (posts ?? []) as any[]) {
      const pid = campToProp.get(p.campaign_id); if (!pid) continue;
      const cur = pubByProp.get(pid) ?? { count: 0, last: null, future: false, failed: 0 };
      if (p.publish_state === "published") { cur.count++; if (p.published_at && (!cur.last || p.published_at > cur.last)) cur.last = p.published_at; }
      if (["failed", "dead_letter"].includes(p.publish_state)) cur.failed++;
      if (["queued", "scheduled"].includes(p.publish_state) && p.scheduled_at && p.scheduled_at >= nowIso) cur.future = true;
      pubByProp.set(pid, cur);
    }
  }

  const items: PortfolioItem[] = [];
  for (const p of properties) {
    const pub = pubByProp.get(p.id) ?? { count: 0, last: null, future: false, failed: 0 };
    const signals = signalsFromCoverage({
      propertyStatus: p.status, status: "", activeCampaignCount: activeByProp.get(p.id) ? 1 : 0,
      attentionCount: pub.failed, publishedBefore: pub.count > 0, hasFuture: pub.future,
      lastPublishedDaysAgo: daysSince(pub.last, nowMs),
    });
    const rec = deriveMarketingRecommendation(signals);
    const state = deriveMarketingState(signals);
    items.push({
      propertyId: p.id, title: p.title ?? "נכס", city: p.city, imageUrl: p.primary_image_url,
      state, stateLabel: MARKETING_STATE_LABEL[state], priority: rec.priority,
      primaryTitle: rec.title, primaryReason: rec.reason, actionType: rec.actionType,
      href: hrefForAction(rec.actionType, p.id), urgency: marketingUrgency(rec),
      lastPublishedAt: pub.last, nextScheduledAt: null,
    });
  }
  return items.sort((a, b) => b.urgency - a.urgency);
}

export interface PortfolioAutopilot { items: PortfolioItem[]; needAction: number; publishingPlanned: number; total: number }

/** Session-scoped portfolio (distribution home / Morning Brief). */
export async function getPortfolioMarketingAutopilot(opts?: { limit?: number }): Promise<PortfolioAutopilot> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return { items: [], needAction: 0, publishingPlanned: 0, total: 0 };
  const db: any = createServiceRoleClient();
  const items = await scanOrgMarketing(db, orgId, { limit: opts?.limit ?? 200 });
  const needAction = items.filter((i) => i.priority === "P0" || i.priority === "P1").length;
  const publishingPlanned = items.filter((i) => i.actionType === "prepare_week" || i.state === "healthy" || i.state === "active").length;
  return { items, needAction, publishingPlanned, total: items.length };
}

// ── Rich per-property autopilot ──────────────────────────────────────────────
export interface PropertyMarketingAutopilot {
  propertyId: string; title: string | null; imageUrl: string | null; status: string | null;
  state: MarketingState; stateLabel: string;
  recommendation: MarketingRecommendation & { href: string };
  reasons: string[];
  evidence: Record<string, number | boolean | string | null>;
  plan: WeeklyPlanItem[];
  lastMarketingAt: string | null; nextMarketingAt: string | null;
  urgency: number; isManager: boolean;
}

export async function getPropertyMarketingAutopilot(orgId: string, propertyId: string, opts?: { isManager?: boolean; db?: any }): Promise<PropertyMarketingAutopilot | null> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const isManager = opts?.isManager === true;
  const nowMs = Date.now();

  const cc = await getPropertyLifecycleControlCenter(orgId, propertyId, { isManager, db });
  if (!cc) return null;

  const [campRes, activeGroupsRes, creativeRes, strongRes] = await Promise.all([
    db.from("distribution_campaigns").select("id").eq("org_id", orgId).eq("property_id", propertyId).limit(50),
    db.from("distribution_groups").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
    db.from("zono_quick_creative_outputs").select("id,is_approved,status,creative_version").eq("org_id", orgId).eq("property_id", propertyId).order("created_at", { ascending: false }).limit(5),
    db.from("match_intelligence_profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("property_id", propertyId).gte("compatibility_score", STRONG_MATCH),
  ]);
  const campaignIds = ((campRes?.data ?? []) as any[]).map((c) => c.id);

  const usedGroups = new Set<string>();
  let lastPublishedAt: string | null = null;
  const creativeReuse = new Map<string, number>();
  if (campaignIds.length) {
    const { data: posts } = await db.from("distribution_posts").select("group_id,published_at,creative_output_id,publish_state").eq("org_id", orgId).in("campaign_id", campaignIds).limit(400);
    for (const p of (posts ?? []) as any[]) {
      if (p.publish_state !== "published") continue;
      if (p.group_id) usedGroups.add(p.group_id);
      if (p.published_at && (!lastPublishedAt || p.published_at > lastPublishedAt)) lastPublishedAt = p.published_at;
      if (p.creative_output_id) creativeReuse.set(p.creative_output_id, (creativeReuse.get(p.creative_output_id) ?? 0) + 1);
    }
  }
  const activeGroups = activeGroupsRes?.count ?? 0;
  const unusedGroups = Math.max(0, activeGroups - usedGroups.size);

  const approved = ((creativeRes?.data ?? []) as any[]).find((c) => c.is_approved || c.status === "approved") ?? null;
  let selectedCreativeReady: boolean | null = null;
  let creativeReuseCount = 0;
  if (approved) {
    creativeReuseCount = creativeReuse.get(approved.id) ?? 0;
    try { const r = await getCreativeFacebookReadiness(approved.id); selectedCreativeReady = r.status === "ready"; } catch { /* best-effort */ }
  }

  const strongMatches = strongRes?.count ?? 0;
  const strongUnsent = Math.max(0, strongMatches - cc.funnel.sent);
  const interestedNoViewing = Math.max(0, cc.funnel.interested - cc.viewings.scheduled - cc.viewings.completedCount);

  const signals: MarketingSignals = {
    propertyStatus: String(cc.property.status ?? "active"),
    daysListed: 0,
    hasActiveCampaign: cc.marketing.activeCampaign,
    publications: cc.marketing.publications,
    failedPublications: cc.marketing.failedPublications,
    hasFuturePublication: cc.marketing.nextScheduledAt != null,
    lastPublishedDaysAgo: daysSince(lastPublishedAt, nowMs),
    activeGroups, usedGroups: usedGroups.size, unusedGroups,
    hasPrimaryImage: !!cc.property.imageUrl,
    approvedCreativeExists: !!approved,
    selectedCreativeReady,
    creativeReuseCount,
    strongMatches, strongUnsent,
    interested: cc.funnel.interested, interestedNoViewing,
    viewingsCompleted: cc.viewings.completedCount,
    viewingsNoProgress: cc.marketingHealth === "viewings_no_progress",
    hasOpenDeal: !!cc.deal,
    facebookConnected: activeGroups > 0,
    canPromote: isManager,
    sellerMarketingHealth: cc.marketingHealth,
  };

  const rec = deriveMarketingRecommendation(signals);
  const state = deriveMarketingState(signals);
  const reasons = deriveMarketingReasons(signals);
  const plan = buildWeeklyPlan(propertyId, signals);

  return {
    propertyId, title: cc.property.title, imageUrl: cc.property.imageUrl, status: cc.property.status,
    state, stateLabel: MARKETING_STATE_LABEL[state],
    recommendation: { ...rec, href: hrefForAction(rec.actionType, propertyId) },
    reasons,
    evidence: {
      publications: cc.marketing.publications, failedPublications: cc.marketing.failedPublications,
      nextScheduledAt: cc.marketing.nextScheduledAt, activeGroups, unusedGroups,
      strongMatches, strongUnsent, interested: cc.funnel.interested, interestedNoViewing,
      viewingsScheduled: cc.viewings.scheduled, viewingsCompleted: cc.viewings.completedCount,
      approvedCreativeExists: !!approved, selectedCreativeReady, creativeReuseCount,
    },
    plan,
    lastMarketingAt: lastPublishedAt, nextMarketingAt: cc.marketing.nextScheduledAt,
    urgency: marketingUrgency(rec), isManager,
  };
}

/** Deterministic ZI answer about a property's marketing (facts only, never invented). */
export async function summarizeMarketingForZi(orgId: string, propertyId: string, isManager: boolean, db?: any): Promise<string | null> {
  const a = await getPropertyMarketingAutopilot(orgId, propertyId, { isManager, db });
  if (!a) return null;
  const lines: string[] = [
    `📣 ${a.title ?? "נכס"} — ${a.stateLabel}`,
    ...a.reasons.slice(0, 4).map((r) => `• ${r}`),
    `➡️ הפעולה הבאה (${a.recommendation.priority}): ${a.recommendation.title}`,
  ];
  if (a.plan.length) lines.push("תוכנית מוצעת: " + a.plan.map((i) => i.title).join(" · "));
  return lines.join("\n");
}

/** CRON: weekly restrained scan — emit marketing.attention_required per property
 *  that needs work (idempotent per day). NEVER publishes/messages. */
export async function runMarketingAttentionScan(opts?: { orgLimit?: number; perOrgLimit?: number }): Promise<{ orgs: number; flagged: number }> {
  const db: any = createServiceRoleClient();
  const { data: orgs } = await db.from("organizations").select("id").limit(opts?.orgLimit ?? 100);
  const orgIds = ((orgs ?? []) as any[]).map((o) => o.id).filter(Boolean);
  const dayBucket = new Date().toISOString().slice(0, 10);
  let flagged = 0;
  const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
  for (const orgId of orgIds) {
    const items = await scanOrgMarketing(db, orgId, { limit: opts?.perOrgLimit ?? 200 });
    const needy = items.filter((i) => i.priority === "P0" || i.priority === "P1").slice(0, 50);
    for (const it of needy) {
      try {
        await emitBusinessEvent({
          type: DOMAIN_EVENTS.marketingAttentionRequired, entityType: "property", entityId: it.propertyId, orgId,
          payload: { title: it.title, state: it.state, priority: it.priority, action: it.primaryTitle, reason: it.primaryReason },
          idempotencyKey: `marketing.attention_required:${it.propertyId}:${dayBucket}`,
        });
        flagged++;
      } catch { /* best-effort */ }
    }
  }
  return { orgs: orgIds.length, flagged };
}
