// ============================================================================
// 🏢 Brokerage Office Profile read model (server-only). Composes a single
// office's header + its linked agents + its listings/properties + stats from
// real connected data only (brokerage_offices · brokerage_agents ·
// brokerage_external_listing_links · external_listings). Nothing fabricated.
// Service-role read (offices are national; QA/owner tool).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : v == null || v === "" ? null : Number(v));

export interface OfficeProfileAgent {
  id: string; fullName: string; city: string | null; phone: string | null;
  listingCount: number; confidenceScore: number; status: string | null;
}
export interface OfficeProfileListing {
  id: string; title: string | null; city: string | null; neighborhood: string | null;
  price: number | null; source: string | null; listingUrl: string | null;
}
export interface OfficeProfile {
  id: string; name: string; brandNetwork: string | null; city: string | null;
  phone: string | null; email: string | null; website: string | null; status: string;
  confidenceScore: number; dataQualityScore: number;
  agents: OfficeProfileAgent[];
  listings: OfficeProfileListing[];
  stats: { agentCount: number; listingCount: number; cities: string[]; sources: string[] };
}

/** Full office profile, or null when the office doesn't exist / is rejected. */
export async function getBrokerageOfficeProfile(officeId: string): Promise<OfficeProfile | null> {
  const db = createServiceRoleClient();

  const { data: officeRow } = await db.from("brokerage_offices" as never).select("*").eq("id", officeId).maybeSingle();
  if (!officeRow) return null;
  const o = officeRow as Row;

  // Agents linked to this office.
  const { data: agentRows } = await db.from("brokerage_agents" as never)
    .select("id,full_name,city,primary_phone,whatsapp_phone,confidence_score,status")
    .eq("office_id", officeId).order("confidence_score", { ascending: false }).limit(500);

  // Links for this office → per-agent counts + listing ids.
  const { data: linkRows } = await db.from("brokerage_external_listing_links" as never)
    .select("external_listing_id,agent_id").eq("office_id", officeId).limit(5000);
  const linkList = (linkRows ?? []) as Row[];
  const listingIds = Array.from(new Set(linkList.map((r) => s(r.external_listing_id)).filter(Boolean)));
  const perAgent = new Map<string, Set<string>>();
  for (const r of linkList) {
    const aid = s(r.agent_id), lid = s(r.external_listing_id);
    if (!aid || !lid) continue;
    (perAgent.get(aid) ?? perAgent.set(aid, new Set()).get(aid)!).add(lid);
  }

  // Fetch listing details (cap the display set; total comes from distinct ids).
  const listings: OfficeProfileListing[] = [];
  const top = listingIds.slice(0, 60);
  for (let i = 0; i < top.length; i += 200) {
    const { data } = await db.from("external_listings" as never)
      .select("id,title,city,neighborhood,price,source,listing_url").in("id", top.slice(i, i + 200));
    for (const r of (data ?? []) as Row[]) listings.push({
      id: s(r.id), title: s(r.title) || null, city: s(r.city) || null, neighborhood: s(r.neighborhood) || null,
      price: num(r.price), source: s(r.source) || null, listingUrl: s(r.listing_url) || null,
    });
  }

  const agents: OfficeProfileAgent[] = ((agentRows ?? []) as Row[]).map((r) => ({
    id: s(r.id), fullName: s(r.full_name), city: s(r.city) || null,
    phone: s(r.primary_phone) || s(r.whatsapp_phone) || null,
    listingCount: perAgent.get(s(r.id))?.size ?? 0,
    confidenceScore: Number(r.confidence_score ?? 0), status: s(r.status) || null,
  }));

  const cities = Array.from(new Set([s(o.city), ...agents.map((a) => a.city), ...listings.map((l) => l.city)].filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, "he"));
  const sources = Array.from(new Set(listings.map((l) => l.source).filter(Boolean) as string[])).sort();

  return {
    id: s(o.id), name: s(o.name), brandNetwork: s(o.brand_network) || null, city: s(o.city) || null,
    phone: s(o.primary_phone) || null, email: s(o.email) || null, website: s(o.website) || null,
    status: s(o.status) || "active",
    confidenceScore: Number(o.confidence_score ?? 0), dataQualityScore: Number(o.data_quality_score ?? 0),
    agents, listings,
    stats: { agentCount: agents.length, listingCount: listingIds.length, cities, sources },
  };
}
