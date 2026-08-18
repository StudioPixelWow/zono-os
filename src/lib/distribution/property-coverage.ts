// ============================================================================
// ZONO — Property Marketing Coverage (server-only, ONE authoritative selector).
// ----------------------------------------------------------------------------
// Answers the office question "האם פרסמתי את כל הנכסים שלי?" at the PROPERTY level,
// reusing the existing publishing truth. Posts do NOT carry property_id, so the
// authoritative link is property → distribution_campaigns(property_id) →
// distribution_posts(campaign_id). Bounded queries only (no N+1): 3 batched reads
// for the whole office regardless of property count. Org-scoped via session.
// Reused by /distribution Home and the property page — never recomputed elsewhere.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
/* eslint-disable @typescript-eslint/no-explicit-any */

export type CoverageStatus =
  | "marketing_now"       // משווק כעת   — has a future post AND published history
  | "scheduled"           // מתוזמן      — has a future post, nothing published yet
  | "no_future"           // אין פרסום נוסף מתוזמן — published before, no future post
  | "attention"           // דורש טיפול  — a failed/reconciliation/dead-letter post
  | "never_published";    // לא פורסם עדיין — no campaign, no posts

export interface PropertyCoverage {
  propertyId: string;
  title: string;
  city: string | null;
  thumbnailUrl: string | null;
  status: CoverageStatus;
  lastPublishedAt: string | null;
  lastPublishedUrl: string | null;
  nextScheduledAt: string | null;   // earliest non-terminal post (may be overdue)
  nextGroupName: string | null;
  nextOverdue: boolean;             // its scheduled_at already passed
  activeCampaignCount: number;
  attentionCount: number;
}

export interface PropertyCoverageSummary {
  marketable: number;
  covered: number;        // published OR a future/pending post
  marketingNow: number;
  scheduled: number;
  neverPublished: number;
  noFuture: number;
  attention: number;
}

export interface PropertyMarketingCoverage {
  summary: PropertyCoverageSummary;
  properties: PropertyCoverage[];   // sorted attention-first (operational)
}

// Marketable = live listings. Equivalent to excluding draft/sold/rented/withdrawn/archived,
// but an explicit include-list is a more robust PostgREST filter than a not-in string.
const MARKETABLE_INCLUDE = ["active", "published", "under_offer", "in_contract", "ready"];
const EMPTY: PropertyMarketingCoverage = {
  summary: { marketable: 0, covered: 0, marketingNow: 0, scheduled: 0, neverPublished: 0, noFuture: 0, attention: 0 },
  properties: [],
};

// Operational ordering: risk/attention first (Phase 14).
const STATUS_RANK: Record<CoverageStatus, number> = {
  attention: 0, never_published: 1, no_future: 2, scheduled: 3, marketing_now: 4,
};

export async function getPropertyMarketingCoverage(): Promise<PropertyMarketingCoverage> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return EMPTY;
  const orgId = profile.org_id;
  const db: any = createServiceRoleClient();

  // 1) Marketable inventory (bounded).
  const { data: propRows } = await db
    .from("properties")
    .select("id,title,city,primary_image_url,status")
    .eq("org_id", orgId)
    .in("status", MARKETABLE_INCLUDE)
    .limit(1000);
  const props = (propRows ?? []) as Array<{ id: string; title: string | null; city: string | null; primary_image_url: string | null; status: string }>;
  if (props.length === 0) return EMPTY;
  const propIds = props.map((p) => p.id);

  // 2) Non-cancelled campaigns for those properties (the property↔post bridge).
  const { data: campRows } = await db
    .from("distribution_campaigns")
    .select("id,property_id,status")
    .eq("org_id", orgId)
    .in("property_id", propIds)
    .neq("status", "cancelled");
  const camps = (campRows ?? []) as Array<{ id: string; property_id: string | null; status: string }>;
  const propByCampaign = new Map<string, string>();
  const activeCampaignsByProp = new Map<string, number>();
  for (const c of camps) {
    if (!c.property_id) continue;
    propByCampaign.set(c.id, c.property_id);
    if (["active", "running", "scheduled"].includes((c.status ?? "").toLowerCase())) {
      activeCampaignsByProp.set(c.property_id, (activeCampaignsByProp.get(c.property_id) ?? 0) + 1);
    }
  }
  const campIds = camps.map((c) => c.id);

  // 3) Posts for those campaigns (bounded), plus group-name resolution (batched).
  const posts = campIds.length
    ? ((await db.from("distribution_posts")
        .select("campaign_id,publish_state,terminal,scheduled_at,published_at,external_post_url,group_id")
        .eq("org_id", orgId).in("campaign_id", campIds).limit(4000)).data ?? [])
    : [];
  const postRows = posts as Array<{ campaign_id: string | null; publish_state: string | null; terminal: boolean | null; scheduled_at: string | null; published_at: string | null; external_post_url: string | null; group_id: string | null }>;

  const groupIds = [...new Set(postRows.map((p) => p.group_id).filter(Boolean) as string[])];
  const groupName = new Map<string, string>();
  if (groupIds.length) {
    const { data: g } = await db.from("distribution_groups").select("id,name").in("id", groupIds).eq("org_id", orgId);
    for (const row of (g ?? []) as Array<{ id: string; name: string | null }>) groupName.set(row.id, row.name ?? "");
  }

  // ── Aggregate per property (in memory — no per-property query) ──────────────
  const now = Date.now();
  interface Acc { lastPub: string | null; lastUrl: string | null; nextAt: string | null; nextGroup: string | null; attention: number; }
  const acc = new Map<string, Acc>();
  for (const p of props) acc.set(p.id, { lastPub: null, lastUrl: null, nextAt: null, nextGroup: null, attention: 0 });

  for (const post of postRows) {
    const pid = post.campaign_id ? propByCampaign.get(post.campaign_id) : undefined;
    if (!pid) continue;
    const a = acc.get(pid);
    if (!a) continue;
    if (post.publish_state === "published" && post.published_at) {
      if (!a.lastPub || post.published_at > a.lastPub) { a.lastPub = post.published_at; a.lastUrl = post.external_post_url ?? null; }
    }
    if (["failed", "awaiting_reconciliation", "dead_letter"].includes(post.publish_state ?? "")) a.attention += 1;
    const pending = post.terminal !== true && ["queued", "scheduled", "draft"].includes(post.publish_state ?? "queued");
    if (pending && post.scheduled_at) {
      if (!a.nextAt || post.scheduled_at < a.nextAt) { a.nextAt = post.scheduled_at; a.nextGroup = post.group_id ? groupName.get(post.group_id) ?? null : null; }
    }
  }

  const properties: PropertyCoverage[] = props.map((p) => {
    const a = acc.get(p.id)!;
    let status: CoverageStatus;
    if (a.attention > 0) status = "attention";
    else if (a.nextAt) status = a.lastPub ? "marketing_now" : "scheduled";
    else if (a.lastPub) status = "no_future";
    else status = "never_published";
    return {
      propertyId: p.id, title: p.title ?? "נכס", city: p.city, thumbnailUrl: p.primary_image_url,
      status, lastPublishedAt: a.lastPub, lastPublishedUrl: a.lastUrl,
      nextScheduledAt: a.nextAt, nextGroupName: a.nextGroup,
      nextOverdue: !!a.nextAt && new Date(a.nextAt).getTime() <= now,
      activeCampaignCount: activeCampaignsByProp.get(p.id) ?? 0,
      attentionCount: a.attention,
    };
  }).sort((x, y) => (STATUS_RANK[x.status] - STATUS_RANK[y.status]) || (x.nextScheduledAt ?? "").localeCompare(y.nextScheduledAt ?? ""));

  const summary: PropertyCoverageSummary = {
    marketable: properties.length,
    covered: properties.filter((p) => p.lastPublishedAt || p.nextScheduledAt).length,
    marketingNow: properties.filter((p) => p.status === "marketing_now").length,
    scheduled: properties.filter((p) => p.status === "scheduled").length,
    neverPublished: properties.filter((p) => p.status === "never_published").length,
    noFuture: properties.filter((p) => p.status === "no_future").length,
    attention: properties.filter((p) => p.status === "attention").length,
  };
  return { summary, properties };
}
