// ============================================================================
// 🗂️ Brokerage profile extras (Phase 26.9.7 Parts 8–9, server-only). Real
// connected data for the broker/office profile drawer: a broker's recent linked
// external listings, and an office's detected brokers + listing volume. RLS-
// scoped reads (the office/agent rows are national but listings are org-scoped
// via the links). Additive; nothing computed or fabricated.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : v == null ? null : Number(v));

export interface ProfileListing {
  id: string; title: string | null; city: string | null; price: number | null; source: string | null; listingUrl: string | null;
}
export interface ProfileBroker { id: string; fullName: string; city: string | null; listingCount: number; confidenceScore: number }

export interface BrokerProfileExtras { kind: "broker"; listings: ProfileListing[]; listingCount: number }
export interface OfficeProfileExtras { kind: "office"; brokers: ProfileBroker[]; listings: ProfileListing[]; listingCount: number; brokerCount: number }
export type ProfileExtras = BrokerProfileExtras | OfficeProfileExtras;

async function listingsForLinkColumn(column: "agent_id" | "office_id", id: string): Promise<{ listings: ProfileListing[]; total: number }> {
  const db = await createClient();
  const { data: links } = await db.from("brokerage_external_listing_links" as never)
    .select("external_listing_id").eq(column, id).order("created_at", { ascending: false }).limit(500);
  const ids = Array.from(new Set(((links ?? []) as Row[]).map((r) => s(r.external_listing_id)).filter(Boolean)));
  if (!ids.length) return { listings: [], total: 0 };
  const top = ids.slice(0, 12);
  const { data } = await db.from("external_listings" as never)
    .select("id,title,city,price,source,listing_url").in("id", top);
  const byId = new Map<string, ProfileListing>();
  for (const r of (data ?? []) as Row[]) {
    byId.set(s(r.id), { id: s(r.id), title: s(r.title) || null, city: s(r.city) || null, price: num(r.price), source: s(r.source) || null, listingUrl: s(r.listing_url) || null });
  }
  return { listings: top.map((i) => byId.get(i)).filter((x): x is ProfileListing => !!x), total: ids.length };
}

export async function getProfileExtras(kind: "broker" | "office", id: string): Promise<ProfileExtras> {
  if (kind === "broker") {
    const { listings, total } = await listingsForLinkColumn("agent_id", id);
    return { kind: "broker", listings, listingCount: total };
  }
  const db = await createClient();
  const [{ listings, total }, agentsRes] = await Promise.all([
    listingsForLinkColumn("office_id", id),
    db.from("brokerage_agents" as never).select("id,full_name,city,confidence_score").eq("office_id", id).order("confidence_score", { ascending: false }).limit(100),
  ]);
  const brokers: ProfileBroker[] = ((agentsRes.data ?? []) as Row[]).map((r) => ({
    id: s(r.id), fullName: s(r.full_name), city: s(r.city) || null, listingCount: 0, confidenceScore: Number(r.confidence_score ?? 0),
  }));
  return { kind: "office", brokers, listings, listingCount: total, brokerCount: brokers.length };
}
