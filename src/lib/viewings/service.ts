/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Viewings · Service (server-only, Epic 3 · Part 9)
// ----------------------------------------------------------------------------
// A viewing-specific read over the EXISTING meetings table (type ∈ viewing/
// open_house) — no second model. Buckets by status/time for the viewings
// workspace; mutations reuse the calendar-os meeting lifecycle actions.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export interface ViewingItem {
  id: string; title: string; type: string; status: string; start_at: string; end_at: string | null;
  buyer_id: string | null; property_id: string | null; buyerName: string | null; propertyTitle: string | null;
  bucket: "today" | "upcoming" | "awaiting_confirmation" | "completed" | "cancelled";
}
export interface ViewingsBoard {
  today: ViewingItem[]; upcoming: ViewingItem[]; awaitingConfirmation: ViewingItem[]; completed: ViewingItem[]; cancelled: ViewingItem[];
  total: number;
}

function bucketOf(status: string, startAt: string): ViewingItem["bucket"] {
  if (status === "cancelled" || status === "no_show") return "cancelled";
  if (status === "completed") return "completed";
  const start = new Date(startAt).getTime();
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  if (status === "scheduled") return "awaiting_confirmation";
  if (start >= startOfToday.getTime() && start <= endOfToday.getTime()) return "today";
  return start >= now ? "upcoming" : "today";
}

export async function getViewingsBoard(): Promise<ViewingsBoard> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const orgId = profile.org_id;
  const db = (await createClient()) as any;

  const { data } = await db.from("meetings").select("id,title,type,status,start_at,end_at,buyer_id,property_id")
    .eq("org_id", orgId).in("type", ["viewing", "open_house"]).order("start_at", { ascending: true }).limit(400);
  const rows = (data ?? []) as Record<string, unknown>[];

  const buyerIds = Array.from(new Set(rows.map((r) => r.buyer_id as string).filter(Boolean)));
  const propIds = Array.from(new Set(rows.map((r) => r.property_id as string).filter(Boolean)));
  const [buyersRes, propsRes] = await Promise.all([
    buyerIds.length ? db.from("buyers").select("id,full_name").eq("org_id", orgId).in("id", buyerIds) : Promise.resolve({ data: [] }),
    propIds.length ? db.from("properties").select("id,title").eq("org_id", orgId).in("id", propIds) : Promise.resolve({ data: [] }),
  ]);
  const buyerName = new Map<string, string>(); for (const b of (buyersRes.data ?? []) as { id: string; full_name: string }[]) buyerName.set(b.id, b.full_name);
  const propTitle = new Map<string, string>(); for (const p of (propsRes.data ?? []) as { id: string; title: string }[]) propTitle.set(p.id, p.title);

  const items: ViewingItem[] = rows.map((r) => {
    const status = (r.status as string) ?? "scheduled";
    const start_at = r.start_at as string;
    return {
      id: r.id as string, title: (r.title as string) ?? "צפייה", type: (r.type as string) ?? "viewing", status, start_at,
      end_at: (r.end_at as string) ?? null, buyer_id: (r.buyer_id as string) ?? null, property_id: (r.property_id as string) ?? null,
      buyerName: r.buyer_id ? buyerName.get(r.buyer_id as string) ?? null : null,
      propertyTitle: r.property_id ? propTitle.get(r.property_id as string) ?? null : null,
      bucket: bucketOf(status, start_at),
    };
  });

  return {
    today: items.filter((i) => i.bucket === "today"),
    upcoming: items.filter((i) => i.bucket === "upcoming"),
    awaitingConfirmation: items.filter((i) => i.bucket === "awaiting_confirmation"),
    completed: items.filter((i) => i.bucket === "completed"),
    cancelled: items.filter((i) => i.bucket === "cancelled"),
    total: items.length,
  };
}
