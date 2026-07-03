// ============================================================================
// 🗂️ ZONO — Property Marketing Log — service (server-only). 33.1.x.
// Aggregates the property's marketing file from EXISTING sources (RLS-scoped):
// distribution_campaigns + distribution_posts + distribution_groups +
// community_comments, and the Creative Studio assets (reused via asset-service).
// Read-only; adds no tables; nothing executes. Never exposes internal scores.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listEntityCreativeAssets } from "@/lib/creative-studio/asset-service";
import { buildMarketingLog, type MarketingEvent, type MarketingLog } from "./timeline";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : 0; };

const POST_KIND: Record<string, MarketingEvent["kind"]> = { published: "post_published", failed: "post_failed", scheduled: "post_scheduled", queued: "post_scheduled", pending: "post_pending", draft: "post_pending" };
const STATUS_HE: Record<string, string> = { published: "פורסם", failed: "נכשל", scheduled: "מתוזמן", queued: "בתור", pending: "ממתין", draft: "טיוטה", approved: "מאושר", waiting_approval: "ממתין לאישור" };

export async function getPropertyMarketingLog(propertyId: string): Promise<MarketingLog> {
  if (!propertyId) return buildMarketingLog([]);
  const db = await createClient();

  const [campR, postR, commR, assets] = await Promise.all([
    db.from("distribution_campaigns" as never).select("id,name,objective,status,total_posts,total_groups,total_leads,created_at,starts_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(100),
    db.from("distribution_posts" as never).select("id,post_title,status,platform,group_id,scheduled_at,published_at,external_post_url,reach,engagement,leads_count,created_at,failure_reason").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(500),
    db.from("community_comments" as never).select("id,author_name,comment_text,intent,intent_score,lead_created,status,created_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(300),
    listEntityCreativeAssets("property", propertyId).catch(() => [] as Row[]),
  ]);

  const posts = (postR.data ?? []) as unknown as Row[];
  const groupIds = [...new Set(posts.map((p) => s(p.group_id)).filter((x): x is string => !!x))];
  const groupNames = new Map<string, string>();
  if (groupIds.length) {
    const { data } = await db.from("distribution_groups" as never).select("id,name").in("id", groupIds as never);
    for (const g of (data ?? []) as unknown as Row[]) groupNames.set(s(g.id) ?? "", s(g.name) ?? "");
  }

  const events: MarketingEvent[] = [];
  let totalReach = 0, totalLeads = 0;

  for (const c of (campR.data ?? []) as unknown as Row[]) events.push({
    at: s(c.created_at) ?? "", kind: "campaign", title: `קמפיין: ${s(c.name) ?? "ללא שם"}`,
    detail: `${s(c.objective) ?? "שיווק"} · ${num(c.total_groups)} קבוצות · ${num(c.total_posts)} פוסטים${num(c.total_leads) ? ` · ${num(c.total_leads)} לידים` : ""}`,
    status: STATUS_HE[s(c.status) ?? ""] ?? s(c.status), channel: "קבוצות פייסבוק", url: null, source: "distribution",
  });

  for (const p of posts) {
    const st = s(p.status) ?? "pending";
    const kind = POST_KIND[st] ?? "post_pending";
    const gname = s(p.group_id) ? groupNames.get(s(p.group_id) ?? "") ?? "קבוצה" : "קבוצה";
    const at = s(p.published_at) ?? s(p.scheduled_at) ?? s(p.created_at) ?? "";
    totalReach += num(p.reach); totalLeads += num(p.leads_count);
    events.push({
      at, kind, title: `פוסט: ${s(p.post_title) ?? gname}`,
      detail: [gname, STATUS_HE[st] ?? st, num(p.reach) ? `${num(p.reach)} חשיפות` : null, num(p.leads_count) ? `${num(p.leads_count)} לידים` : null, s(p.failure_reason)].filter(Boolean).join(" · "),
      status: STATUS_HE[st] ?? st, channel: gname, url: s(p.external_post_url), source: "distribution",
    });
  }

  for (const c of (commR.data ?? []) as unknown as Row[]) {
    const at = s(c.created_at) ?? "";
    events.push({ at, kind: "comment", title: "תגובה בקבוצה", detail: [s(c.intent), s(c.comment_text)?.slice(0, 60)].filter(Boolean).join(" · ") || "תגובה", status: s(c.status), channel: "קבוצות פייסבוק", url: null, source: "distribution" });
    if (c.lead_created) events.push({ at, kind: "lead", title: "ליד מתגובה", detail: `נוצר ליד מתגובה${s(c.intent) ? ` (${s(c.intent)})` : ""}`, status: "מאושר", channel: "קבוצות פייסבוק", url: null, source: "distribution" });
  }

  for (const a of assets as Row[]) {
    const approved = s(a.status) === "approved" || a.approved === true;
    events.push({ at: s(a.created_at) ?? "", kind: approved ? "creative_approved" : "creative", title: `קריאייטיב: ${s(a.asset_type) ?? s(a.title) ?? "נכס יצירתי"}`, detail: [s(a.purpose) ?? s(a.title), approved ? "מאושר" : STATUS_HE[s(a.status) ?? ""] ?? s(a.status)].filter(Boolean).join(" · "), status: approved ? "מאושר" : s(a.status), channel: "Creative Studio", url: s(a.image_url) ?? s(a.file_url), source: "creative-studio" });
  }

  return buildMarketingLog(events, { totalReach, totalLeads });
}
