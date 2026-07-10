/**
 * Notification Center (server-only). Aggregates live signals from every engine
 * into ONE unified feed — Decision Brain attention + opportunities, forecast,
 * revenue leakage, transaction radar, competitors, marketing — and overlays the
 * user's read/archived/pinned state. Read-only over the signal tables (no
 * duplicate notification system); only the lightweight state is persisted.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export type NotifCategory = "opportunity" | "warning" | "task" | "approval" | "review" | "system";
export interface NotifItem {
  key: string; category: NotifCategory; source: string; title: string; subtitle: string | null;
  href: string; score: number; createdAt: string; read: boolean; pinned: boolean;
}
export interface NotificationFeed { items: NotifItem[]; unread: number; counts: Record<string, number> }

function entityHref(entityType: string | null, entityId: string | null, fallback: string): string {
  if (!entityId) return fallback;
  switch (entityType) {
    case "property": return `/properties/${entityId}`;
    case "seller": return `/sellers/${entityId}`;
    case "buyer": return `/buyers/${entityId}`;
    case "external_listing": return `/external-listings/${entityId}`;
    default: return fallback;
  }
}

export async function getNotificationFeed(category?: string): Promise<NotificationFeed> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { items: [], unread: 0, counts: {} };
  const orgId = profile.org_id;
  const supabase = await createClient();

  const [attention, opps, fc, leak, radar, comp, mkt, kernel, state] = await Promise.all([
    supabase.from("attention_items").select("id,title,reason,recommended_action,attention_score,entity_type,entity_id,status,detected_at").eq("org_id", orgId).eq("status", "open").order("attention_score", { ascending: false }).limit(30),
    supabase.from("opportunity_signals").select("id,title,opportunity_score,entity_type,entity_id,created_at").eq("org_id", orgId).order("opportunity_score", { ascending: false }).limit(20),
    supabase.from("deal_forecast_signals").select("id,signal_type,title,description,impact_score,created_at").eq("organization_id", orgId).eq("status", "new").order("impact_score", { ascending: false }).limit(20),
    supabase.from("revenue_leakage_events").select("id,title,reason,severity,entity_type,entity_id,created_at").eq("organization_id", orgId).eq("status", "open").order("created_at", { ascending: false }).limit(20),
    supabase.from("transaction_opportunity_radar_alerts").select("id,opportunity_type,city_name,reason_hebrew,opportunity_score,property_listing_id,created_at").eq("organization_id", orgId).in("status", ["new", "reviewing"]).order("opportunity_score", { ascending: false }).limit(20),
    supabase.from("competitor_signals").select("id,signal_type,title,description,confidence_score,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
    supabase.from("marketing_opportunity_signals").select("id,signal_type,title,description,impact_score,entity_type,entity_id,created_at").eq("organization_id", orgId).order("impact_score", { ascending: false }).limit(12),
    // Stage 3 · event-driven notifications from the Event Kernel subscriber.
    supabase.from("notifications").select("id,level,category,title,body,href,is_read,created_at").eq("org_id", orgId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("notification_state").select("item_key,state").eq("user_id", user.id).limit(2000),
  ]);

  const stateMap = new Map<string, string>();
  for (const s of (state.data ?? []) as { item_key: string; state: string }[]) stateMap.set(s.item_key, s.state);

  const items: NotifItem[] = [];
  const add = (key: string, category: NotifCategory, source: string, title: string, subtitle: string | null, href: string, score: number, createdAt: string) => {
    const st = stateMap.get(key);
    if (st === "archived") return;
    items.push({ key, category, source, title, subtitle, href, score: Math.round(score), createdAt, read: st === "read" || st === "pinned", pinned: st === "pinned" });
  };

  for (const a of attention.data ?? []) add(`attention:${a.id}`, a.entity_type === "system" ? "system" : "warning", "מוח ההחלטות", a.title, a.reason ?? a.recommended_action, entityHref(a.entity_type, a.entity_id, "/command"), a.attention_score, a.detected_at);
  for (const o of opps.data ?? []) add(`opp:${o.id}`, "opportunity", "הזדמנויות", o.title, null, entityHref(o.entity_type, o.entity_id, "/command"), o.opportunity_score, o.created_at);
  for (const f of fc.data ?? []) add(`fc:${f.id}`, f.signal_type?.includes("likely") || f.signal_type?.includes("pricing") ? "opportunity" : "warning", "תחזית", f.title, f.description, "/forecast", f.impact_score, f.created_at);
  for (const l of leak.data ?? []) add(`leak:${l.id}`, "warning", "הכנסות", l.title, l.reason, entityHref(l.entity_type, l.entity_id, "/revenue"), l.severity === "high" ? 80 : 60, l.created_at);
  for (const r of radar.data ?? []) add(`radar:${r.id}`, "opportunity", "רדאר עסקאות", r.reason_hebrew ?? r.opportunity_type, r.city_name, r.property_listing_id ? `/properties/${r.property_listing_id}` : "/transactions/radar", r.opportunity_score, r.created_at);
  for (const c of comp.data ?? []) add(`comp:${c.id}`, "warning", "מתחרים", c.title, c.description, "/competitors", c.confidence_score, c.created_at);
  for (const m of mkt.data ?? []) add(`mkt:${m.id}`, "opportunity", "שיווק", m.title, m.description, "/marketing", m.impact_score, m.created_at);

  // Stage 3 · kernel event notifications (event → subscriber → notifications table
  // → here → Attention Center → header badge). Idempotent upstream (one row per
  // event), so no duplicates. Read state overlays notification_state AND the row's
  // own is_read.
  const KLEVEL_CAT: Record<string, NotifCategory> = { critical: "warning", warning: "warning", success: "opportunity", info: "system" };
  const KLEVEL_SCORE: Record<string, number> = { critical: 90, warning: 70, success: 60, info: 40 };
  for (const n of (kernel.data ?? []) as { id: string; level: string; category: string | null; title: string; body: string | null; href: string | null; is_read: boolean | null; created_at: string }[]) {
    const key = `notif:${n.id}`;
    const st = stateMap.get(key);
    if (st === "archived") continue;
    items.push({
      key,
      category: KLEVEL_CAT[n.level] ?? "system",
      source: "עדכונים",
      title: n.title,
      subtitle: n.body,
      href: n.href ?? "/notifications",
      score: KLEVEL_SCORE[n.level] ?? 40,
      createdAt: n.created_at,
      read: st === "read" || st === "pinned" || n.is_read === true,
      pinned: st === "pinned",
    });
  }

  const filtered = category ? items.filter((i) => i.category === category) : items;
  filtered.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.score - a.score) || b.createdAt.localeCompare(a.createdAt));

  const counts: Record<string, number> = {};
  for (const i of items) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const unread = items.filter((i) => !i.read).length;
  return { items: filtered.slice(0, 80), unread, counts };
}
