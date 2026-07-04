// ============================================================================
// 📘 ZONO Facebook Growth Platform™ — server service (server-only). 37.0.
// COMPOSES the EXISTING read models into one Facebook Home. Reuses:
//   getDistributionCenter · getGroupsIntelligence · distributionCommentService
//   · getMarketDomination · facebookConnectionPathService · properties table.
// Adds NO table, NO scoring engine, NO publishing. Assisted/manual + approval-
// gated everywhere. Never throws (each source degrades independently).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getDistributionCenter } from "@/lib/distribution/center-data";
import { getGroupsIntelligence } from "@/lib/facebook-groups-intelligence/service";
import { distributionCommentService } from "@/lib/distribution/distribution-comment-service";
import { getPhoneReceivedPending } from "@/lib/distribution/comment-journey-service";
import { PHONE_RECEIVED_NOTE } from "@/lib/distribution/comment-journey-core";
import { getMarketDomination } from "@/lib/market-domination/service";
import { facebookConnectionPathService } from "@/lib/distribution/facebook-connection-paths";
import { assembleFacebookHome } from "./assemble";
import type { FacebookHome, FbInput, FbConnection, FbCommentItem, Impact } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numOr = (v: unknown, d = 0): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : d; };

const EXT_LIVE = new Set(["paired", "active", "installed", "connected", "publishing"]);

async function connection(): Promise<FbConnection> {
  try {
    const { meta, extension } = await facebookConnectionPathService.getPaths();
    const metaOk = meta.status === "connected";
    const extOk = EXT_LIVE.has(String(extension.status));
    const warnings: string[] = [];
    if (meta.status === "expired") warnings.push("חיבור Meta פג תוקף — יש לחדש.");
    if (meta.status === "error") warnings.push("שגיאת חיבור Meta.");
    if (!metaOk && !extOk) warnings.push("אין חיבור פעיל (Meta או תוסף).");
    return { metaStatus: String(meta.status), extensionStatus: String(extension.status), connected: metaOk || extOk, warnings };
  } catch { return { metaStatus: "unknown", extensionStatus: "unknown", connected: false, warnings: ["לא ניתן לקרוא סטטוס חיבור."] }; }
}

/** Active properties + last Facebook exposure date (max published_at per property). */
async function propertiesWithExposure(orgId: string | null, ownerId?: string | null): Promise<FbInput["properties"]> {
  if (!orgId) return [];
  const db = await createClient();
  try {
    let pq = db.from("properties").select("id,title,city,status,zono_score,owner_id").eq("org_id", orgId).eq("status", "active").limit(200);
    if (ownerId) pq = pq.eq("owner_id", ownerId);
    const { data: props } = await pq;
    const rows = (props ?? []) as unknown as Row[];
    const ids = rows.map((r) => str(r.id)).filter((x): x is string => !!x);
    const lastMap = new Map<string, string>();
    if (ids.length) {
      const { data: posts } = await db.from("distribution_posts" as never).select("property_id,published_at" as never)
        .eq("org_id" as never, orgId as never).in("property_id" as never, ids as never).not("published_at" as never, "is", null as never);
      for (const p of (posts ?? []) as unknown as Row[]) {
        const pid = str(p.property_id), at = str(p.published_at);
        if (pid && at && (!lastMap.has(pid) || at > lastMap.get(pid)!)) lastMap.set(pid, at);
      }
    }
    return rows.map((r) => { const id = str(r.id) ?? ""; return { id, title: str(r.title) ?? "נכס", city: str(r.city), status: str(r.status) ?? "active", lastExposureAt: lastMap.get(id) ?? null, zonoScore: r.zono_score == null ? null : numOr(r.zono_score) }; });
  } catch { return []; }
}

async function buildInput(ownerId?: string | null): Promise<FbInput> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;

  const [conn, center, gi, comments, dom, properties] = await Promise.all([
    connection(),
    getDistributionCenter().catch(() => null),
    getGroupsIntelligence().catch(() => null),
    distributionCommentService.board().catch(() => null),
    getMarketDomination().catch(() => null),
    propertiesWithExposure(orgId, ownerId),
  ]);

  const st = center?.stats;
  const stats: FbInput["stats"] = {
    groups: st?.groups ?? 0, activeGroups: st?.activeGroups ?? 0, campaigns: st?.campaigns ?? 0, activeCampaigns: st?.activeCampaigns ?? 0,
    scheduledPosts: st?.scheduledPosts ?? 0, publishedPosts: st?.publishedPosts ?? 0, comments: st?.comments ?? 0,
    needsReply: comments?.counts.needsReply ?? 0, leads: st?.leads ?? 0, newLeads: st?.newLeads ?? 0,
    reach: st?.impressions ?? 0, conversionRate: st?.conversionRate ?? 0,
  };

  const groups = (gi?.groups ?? []).map((g) => ({ id: g.id, name: g.name, city: g.city, folder: g.folder, performance: g.performance, leadScore: g.leadScore, totalLeads: g.totalLeads, daysSincePost: g.daysSincePost, recommendation: g.recommendation?.action ?? null }));
  const groupSummary = { total: gi?.summary.totalGroups ?? 0, strong: gi?.summary.strong ?? 0, weak: gi?.summary.weak ?? 0, inactive: gi?.summary.inactive ?? 0, noLeads: gi?.summary.noLeads ?? 0 };

  const commentToItem = (c: { id: string; authorName: string | null; text: string; category: string | null; suggestedReply: string | null; shouldCreateLead: boolean }): FbCommentItem => ({ id: c.id, author: c.authorName ?? "אנונימי", text: c.text, category: c.category ?? "—", suggestedReply: c.suggestedReply ?? "", shouldCreateLead: c.shouldCreateLead, href: "/distribution/groups" });
  const cViews = comments?.comments ?? [];
  const needsReplyItems = cViews.filter((c) => !c.handled && (c.suggestedReply || c.shouldCreateLead)).map(commentToItem);
  const leadCandidates = cViews.filter((c) => c.shouldCreateLead && !c.isLead).map(commentToItem);

  const campaigns = (center?.campaigns ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, city: c.targetCity, totalGroups: c.totalGroups, totalLeads: c.totalLeads, href: "/distribution" }));
  const scheduled = (center?.posts ?? []).filter((p) => p.status === "scheduled" || p.status === "queued").map((p) => ({ id: p.id, title: p.postTitle ?? "פוסט", status: p.status, scheduledAt: p.scheduledAt, href: "/distribution" }));

  const territoryActions = (dom?.actionQueue ?? []).map((a) => ({ title: a.title, why: a.why, evidence: a.evidence, impact: a.impact as Impact, href: a.cta.href, label: a.cta.label, kind: a.kind as string, areaName: a.areaName }));
  const weakAreas = (dom?.weakAreas ?? []).map((a) => ({ name: a.name, score: a.dominationScore }));
  const missingAreas = (dom?.missingAreas ?? []).map((a) => ({ name: a.name }));

  const notes: string[] = [];
  if (!center) notes.push("מרכז ההפצה לא נטען.");
  if (!gi) notes.push("מודיעין הקבוצות לא נטען.");

  return { connection: conn, stats, groups, groupSummary, comments: comments?.counts ? { total: comments.counts.comments, needsReply: comments.counts.needsReply, hotLeads: comments.counts.hotLeads, leads: comments.counts.leads } : { total: 0, needsReply: 0, hotLeads: 0, leads: 0 }, needsReplyItems, leadCandidates, campaigns, scheduled, territoryActions, weakAreas, missingAreas, properties, notes };
}

/** The unified Facebook Home cockpit. */
export async function getFacebookHome(): Promise<FacebookHome> {
  return assembleFacebookHome(await buildInput());
}

// ── Broker-scoped Facebook summary (for /my) ────────────────────────────────
export interface BrokerFacebook {
  scheduledToday: number; commentsWaiting: number; leadApprovals: number; groupsToPublish: number;
  phoneReceived: number;
  tasks: { title: string; detail: string; href: string }[];
}

export async function getBrokerFacebook(ownerId: string | null): Promise<BrokerFacebook> {
  const empty: BrokerFacebook = { scheduledToday: 0, commentsWaiting: 0, leadApprovals: 0, groupsToPublish: 0, phoneReceived: 0, tasks: [] };
  try {
    const [home, phonePending] = await Promise.all([
      assembleFacebookHome(await buildInput(ownerId)),
      getPhoneReceivedPending().catch(() => ({ count: 0, items: [] as never[] })),
    ]);
    const scheduledToday = home.scheduled.filter((p) => { const t = p.scheduledAt ? Date.parse(p.scheduledAt) : NaN; if (!Number.isFinite(t)) return false; return new Date(t).toDateString() === new Date().toDateString(); }).length;
    const groupsToPublish = home.groups.inactive.length + home.groups.opportunity.length;
    const tasks: BrokerFacebook["tasks"] = [];
    // 41.1.1 — phone-received FB suggestions waiting for CRM promotion (top priority).
    if (phonePending.count > 0) tasks.push({ title: PHONE_RECEIVED_NOTE, detail: `${phonePending.count} לידים מפייסבוק`, href: "/distribution" });
    if (home.comments.counts.needsReply > 0) tasks.push({ title: "תגובות ממתינות למענה", detail: `${home.comments.counts.needsReply} תגובות`, href: "/facebook" });
    if (home.comments.leadCandidates.length > 0) tasks.push({ title: "לידים לאישור מתגובות", detail: `${home.comments.leadCandidates.length} מועמדים`, href: "/facebook" });
    if (groupsToPublish > 0) tasks.push({ title: "קבוצות לפרסום", detail: `${groupsToPublish} קבוצות ללא פרסום/הזדמנות`, href: "/distribution/campaign-wizard" });
    return { scheduledToday, commentsWaiting: home.comments.counts.needsReply, leadApprovals: home.comments.leadCandidates.length, groupsToPublish, phoneReceived: phonePending.count, tasks };
  } catch { return empty; }
}

// ── Ask ZONO for Facebook (Part 12) — from composed signals ─────────────────
export interface FbAnswer { question: string; answer: string; items: { title: string; detail: string; href: string }[] }

export async function answerFacebookQuestion(question: string): Promise<FbAnswer> {
  const q = (question || "").trim();
  const home = assembleFacebookHome(await buildInput());
  const ref = (title: string, detail: string, href: string) => ({ title, detail, href });

  if (/לפרסם|איפה.*פרס|שעה|מתי/.test(q)) {
    const best = home.groups.best.slice(0, 5);
    return { question: q, answer: best.length ? `הקבוצות המניבות ביותר לפרסום היום: ${best.map((g) => g.name).join(", ")}.` : "אין עדיין נתוני קבוצות.", items: best.map((g) => ref(g.name, `ביצועים ${g.performance} · ${g.totalLeads} לידים`, g.href)) };
  }
  if (/הפסיק|לא עוב|רדומ|לא פעיל|inactive/.test(q)) {
    const inact = home.groups.inactive.slice(0, 8);
    return { question: q, answer: inact.length ? `${inact.length} קבוצות ללא פרסום 3+ שבועות.` : "אין קבוצות רדומות.", items: inact.map((g) => ref(g.name, `${g.daysSincePost} ימים ללא פרסום`, g.href)) };
  }
  if (/חסר.*פוסט|חסר.*קבוצ|כיסוי|missing/.test(q)) {
    const gaps = home.groups.coverageGaps.slice(0, 8);
    const missCamp = home.recommendations.filter((r) => r.kind === "missing_campaigns");
    return { question: q, answer: gaps.length ? `חסר כיסוי ב-${gaps.length} אזורים${missCamp.length ? " + נכסים ללא קמפיין" : ""}.` : "הכיסוי מלא.", items: [...gaps.map((c) => ref(c.area, c.why, "/distribution/groups")), ...missCamp.map((r) => ref(r.title, r.why, r.cta?.href ?? "/distribution/campaign-wizard"))] };
  }
  // Where am I missing leads?
  const leadOps = home.groups.opportunity.slice(0, 8);
  const waiting = home.comments.leadCandidates.slice(0, 5);
  return { question: q, answer: (leadOps.length || waiting.length) ? `${waiting.length} לידים ממתינים בתגובות ו-${leadOps.length} קבוצות עם פוטנציאל לידים גבוה.` : "אין כרגע הזדמנויות לידים בולטות.", items: [...waiting.map((c) => ref(c.author, "ליד לאישור מתגובה", c.href)), ...leadOps.map((g) => ref(g.name, `ציון לידים ${g.leadScore}`, g.href))] };
}
