// ============================================================================
// Broker sold-properties provider — REAL closed deals (deals.status='won') the
// org itself completed, joined to their property location. Powers the critical
// "נכסים שמכרתי באזור" trust section. Reads only the org's own data; if the org
// has no closed deals in the area it returns an empty list (honest empty state).
// performance_vs_market_percent is filled by the service once the market median
// price/sqm is known — never invented.
// ============================================================================
import type { BrokerSoldProperty, ValuationInput } from "../types";
import type { createClient } from "@/lib/supabase/server";
import { distanceMeters } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;

interface DealRow {
  id?: string; value?: number; closed_at?: string; property_id?: string; owner_id?: string;
}
interface PropRow {
  id?: string; city?: string; neighborhood?: string; name?: string; street?: string; building_number?: string;
  rooms?: number; size_sqm?: number; latitude?: number; longitude?: number;
  primary_image_url?: string; assigned_agent_id?: string;
}

export async function getBrokerSoldProperties(
  db: DB, orgId: string, input: ValuationInput, limit = 24,
): Promise<BrokerSoldProperty[]> {
  const { data: deals, error } = await db
    .from("deals" as never)
    .select("id,value,closed_at,property_id,owner_id")
    .eq("org_id", orgId)
    .eq("status", "won")
    .not("property_id", "is", null)
    .order("closed_at", { ascending: false })
    .limit(limit);
  if (error || !deals) return [];

  const dealRows = deals as unknown as DealRow[];
  const propertyIds = [...new Set(dealRows.map((d) => d.property_id).filter(Boolean))] as string[];
  if (propertyIds.length === 0) return [];

  const { data: props } = await db
    .from("properties" as never)
    .select("id,city,neighborhood,name,street,building_number,rooms,size_sqm,latitude,longitude,primary_image_url,assigned_agent_id")
    .in("id", propertyIds);
  const propMap = new Map<string, PropRow>();
  for (const p of (props ?? []) as unknown as PropRow[]) if (p.id) propMap.set(p.id, p);

  const out: BrokerSoldProperty[] = [];
  for (const d of dealRows) {
    const p = d.property_id ? propMap.get(d.property_id) : undefined;
    if (!p) continue;
    // Same-city gate (honest geographic relevance). If subject has no city, keep all.
    if (input.city && p.city && p.city.trim() !== input.city.trim()) continue;
    const sqm = p.size_sqm ?? null;
    const salePrice = d.value ?? null;
    const ppsqm = salePrice && sqm ? Math.round(salePrice / sqm) : null;
    const addr = [p.street ?? p.name, p.building_number].filter(Boolean).join(" ") || p.name || null;
    out.push({
      propertyId: p.id ?? null,
      dealId: d.id ?? null,
      address: addr,
      city: p.city ?? null,
      neighborhood: p.neighborhood ?? null,
      street: p.street ?? null,
      salePrice,
      pricePerSqm: ppsqm,
      saleDate: d.closed_at?.slice(0, 10) ?? null,
      rooms: p.rooms ?? null,
      sqm,
      distanceMeters: distanceMeters(input, p.latitude, p.longitude),
      agentId: p.assigned_agent_id ?? d.owner_id ?? null,
      buyerType: null,
      imageUrl: p.primary_image_url ?? null,
      performanceVsMarketPercent: null, // filled by service from real market median
    });
  }
  return out;
}
