// ============================================================================
// ZONO — OFFICE DETAIL selector (server-only, READ-ONLY). One office's full
// intelligence for /brokerage-data/offices/[officeId]: identity, KPI strip,
// agents (canonical memberships ∪ directory office_id), the org's observed
// listings for that office, and a ranked-neighborhood territory. Org-scoped
// (listings come only from THIS org's observed office↔listing links). Aggregation
// is done server-side; only a compact model reaches the client.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { localityHe } from "@/lib/geo/locality";

const DAY = 86_400_000;
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ms = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

export interface OfficeDetailAgent { id: string; name: string; listings: number; lastSeen: string | null }
export interface OfficeDetailListing { id: string; title: string | null; neighborhood: string | null; city: string | null; rooms: number | null; sqm: number | null; price: number | null; source: string | null; firstSeen: string | null }
export interface OfficeDetailArea { name: string; listings: number }
export interface OfficeDetail {
  id: string; name: string; city: string | null; brand: string | null; phone: string | null; website: string | null;
  status: string | null; lastActivity: string | null;
  kpis: { agents: number; activeListings: number; new7d: number; new30d: number; neighborhoods: number; avgPriceIls: number | null };
  agents: OfficeDetailAgent[];
  listings: OfficeDetailListing[];
  territory: OfficeDetailArea[];
}

export async function getOfficeDetail(officeId: string): Promise<OfficeDetail | null> {
  const db = createServiceRoleClient();
  let orgId: string | null = null;
  try { orgId = (await getSessionContext()).profile?.org_id ?? null; } catch { /* ignore */ }

  const { data: office } = await (db.from("brokerage_offices" as never)
    .select("id,name,brand_network,city,primary_phone,website_url,status,last_seen_at")
    .eq("id", officeId).maybeSingle() as unknown as Promise<{ data: Record<string, unknown> | null }>);
  if (!office) return null;

  // Agents = directory agents on this office (canonical memberships also feed the
  // count via the cockpit; here we list the concrete directory rows).
  const { data: agentRows } = await (db.from("brokerage_agents" as never)
    .select("id,full_name,last_seen_at").eq("office_id", officeId).limit(500) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>);

  // This org's observed listings for the office (org-scoped links → listings).
  const { data: links } = await (db.from("brokerage_external_listing_links" as never)
    .select("external_listing_id").eq("office_id", officeId).eq("organization_id", orgId ?? "").limit(5000) as unknown as Promise<{ data: Array<{ external_listing_id: string }> | null }>);
  const listingIds = [...new Set((links ?? []).map((l) => l.external_listing_id).filter(Boolean))];

  let listRows: Array<Record<string, unknown>> = [];
  if (listingIds.length) {
    const { data } = await (db.from("external_listings" as never)
      .select("id,title,neighborhood,city,rooms,sqm,price,source,first_seen_at,contact_name,status")
      .in("id", listingIds).neq("status", "removed").limit(5000) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>);
    listRows = data ?? [];
  }

  const now = Date.now();
  const listings: OfficeDetailListing[] = listRows.map((r) => ({
    id: String(r.id), title: (r.title as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null, city: localityHe((r.city as string) ?? null),
    rooms: num(r.rooms), sqm: num(r.sqm), price: num(r.price), source: (r.source as string) ?? null,
    firstSeen: (r.first_seen_at as string) ?? null,
  }));
  const new7d = listRows.filter((r) => { const t = ms(r.first_seen_at); return t != null && now - t < 7 * DAY; }).length;
  const new30d = listRows.filter((r) => { const t = ms(r.first_seen_at); return t != null && now - t < 30 * DAY; }).length;
  const prices = listRows.map((r) => num(r.price)).filter((p): p is number => p != null && p > 0);
  const avgPriceIls = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  // Territory: ranked neighborhoods (fall back to city).
  const areaMap = new Map<string, number>();
  for (const r of listRows) { const a = ((r.neighborhood as string) || localityHe((r.city as string) ?? "") || "").trim(); if (!a) continue; areaMap.set(a, (areaMap.get(a) ?? 0) + 1); }
  const territory = [...areaMap.entries()].map(([name, listings]) => ({ name, listings })).sort((a, b) => b.listings - a.listings).slice(0, 15);

  // Agent listing counts (from this office's listings, by contact name).
  const byContact = new Map<string, number>();
  for (const r of listRows) { const c = ((r.contact_name as string) ?? "").trim().toLowerCase(); if (c) byContact.set(c, (byContact.get(c) ?? 0) + 1); }
  const agents: OfficeDetailAgent[] = (agentRows ?? []).map((a) => {
    const nm = ((a.full_name as string) ?? "").trim() || "מתווך";
    return { id: String(a.id), name: nm, listings: byContact.get(nm.toLowerCase()) ?? 0, lastSeen: (a.last_seen_at as string) ?? null };
  }).sort((x, y) => y.listings - x.listings);

  return {
    id: String(office.id), name: ((office.name as string) ?? "").trim() || "משרד",
    city: localityHe((office.city as string) ?? null), brand: (office.brand_network as string) ?? null,
    phone: (office.primary_phone as string) ?? null, website: (office.website_url as string) ?? null,
    status: (office.status as string) ?? null, lastActivity: (office.last_seen_at as string) ?? null,
    kpis: { agents: Math.max(agents.length, byContact.size), activeListings: listings.length, new7d, new30d, neighborhoods: areaMap.size, avgPriceIls },
    agents, listings: listings.slice(0, 200), territory,
  };
}
