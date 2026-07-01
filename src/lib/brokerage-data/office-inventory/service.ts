// ============================================================================
// 📦 Office Inventory read model (server-only). Phase 26.5 · Part 5.
// Rolls up listings explicitly linked to the office PLUS listings linked through
// its brokers, deduped, with per-listing attribution + conflicts. READ-ONLY.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveBrandBranch } from "../brand-identity/resolver";
import { attributeLink, stronger, type Attribution, type LinkFacts } from "./attribution";
import { OFFICE_INVENTORY_VERSION, type OfficeInventory, type InventoryListing, type CountBy, type BrokerInventory } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const arrOf = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);
const tally = (xs: (string | null)[]): CountBy[] => { const m = new Map<string, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count); };
function priceBand(p: number | null): string | null { if (p == null || p <= 0) return null; if (p < 1_000_000) return "< 1M"; if (p < 2_000_000) return "1–2M"; if (p < 3_000_000) return "2–3M"; if (p < 5_000_000) return "3–5M"; return "5M+"; }

/** Full office inventory with attribution (direct + broker-derived). */
export async function getOfficeInventory(officeId: string): Promise<OfficeInventory | null> {
  const db = createServiceRoleClient();
  const { data: officeRow } = await db.from("brokerage_offices" as never).select("*").eq("id", officeId).maybeSingle();
  if (!officeRow) return null;
  const o = officeRow as Row;
  const officeName = s(o.name);
  const res = resolveBrandBranch(officeName);

  // Office brokers.
  const { data: agentRows } = await db.from("brokerage_agents" as never).select("id,full_name,office_id").eq("office_id", officeId).limit(2000);
  const brokers = (agentRows ?? []) as Row[];
  const brokerName = new Map(brokers.map((a) => [s(a.id), s(a.full_name)] as const));
  const brokerIds = brokers.map((a) => s(a.id)).filter(Boolean);

  // Links: explicit (office_id = office) + derived (agent_id in office brokers).
  const cols = "external_listing_id,agent_id,office_id,match_reasons,status";
  const explicitRes = await db.from("brokerage_external_listing_links" as never).select(cols).eq("office_id", officeId).limit(50000);
  const derivedRes = brokerIds.length
    ? await db.from("brokerage_external_listing_links" as never).select(cols).in("agent_id", brokerIds).limit(50000)
    : { data: [] as unknown };
  const rawLinks: Row[] = [...((explicitRes.data ?? []) as Row[]), ...((derivedRes.data ?? []) as Row[])];

  // Attribute + dedupe (strongest per listing).
  const byListing = new Map<string, { attr: Attribution; agentId: string | null }>();
  const conflicts: { listingId: string; note: string }[] = [];
  for (const l of rawLinks) {
    const lid = s(l.external_listing_id); if (!lid) continue;
    const agentId = s(l.agent_id) || null;
    const link: LinkFacts = { linkOfficeId: s(l.office_id) || null, agentId, matchReasons: arrOf(l.match_reasons) };
    const brokerOfficeId = agentId && brokerName.has(agentId) ? officeId : null;   // agent belongs to this office
    const attr = attributeLink(link, brokerOfficeId, officeId, agentId ? brokerName.get(agentId) ?? null : null, officeName);
    if (!attr.included) continue;
    const prev = byListing.get(lid);
    const chosen = prev ? { attr: stronger(prev.attr, attr), agentId: prev.agentId ?? agentId } : { attr, agentId };
    byListing.set(lid, chosen);
    if (attr.conflict && attr.conflictNote && !conflicts.some((c) => c.listingId === lid)) conflicts.push({ listingId: lid, note: attr.conflictNote });
  }

  const listingIds = [...byListing.keys()];
  // Fetch listing details (bounded) for stats + display.
  const details = new Map<string, Row>();
  for (let i = 0; i < Math.min(listingIds.length, 4000); i += 300) {
    const chunk = listingIds.slice(i, i + 300);
    const { data } = await db.from("external_listings" as never).select("id,title,city,neighborhood,property_type,price,sqm,area_sqm,source,listing_url,is_active,first_seen_at,published_at").in("id", chunk);
    for (const r of (data ?? []) as Row[]) details.set(s(r.id), r);
  }

  const inv: InventoryListing[] = [];
  const brokerAgg = new Map<string, BrokerInventory>();
  let active = 0, inactive = 0, direct = 0, derived = 0, lastActivity: string | null = null;
  for (const [lid, { attr, agentId }] of byListing) {
    const d = details.get(lid) ?? {};
    const isActive = d.is_active !== false;
    if (isActive) active++; else inactive++;
    if (attr.derived) derived++; else direct++;
    const seen = s(d.published_at) || s(d.first_seen_at) || null;
    if (seen && (!lastActivity || seen > lastActivity)) lastActivity = seen;
    const bId = agentId, bName = agentId ? brokerName.get(agentId) ?? null : null;
    if (bId) { const ex = brokerAgg.get(bId) ?? { brokerId: bId, brokerName: bName ?? "", active: 0, total: 0 }; ex.total++; if (isActive) ex.active++; brokerAgg.set(bId, ex); }
    const price = num(d.price);
    const sqm = num(d.sqm) ?? num(d.area_sqm);
    inv.push({
      listingId: lid, title: s(d.title) || null, city: s(d.city) || null, neighborhood: s(d.neighborhood) || null,
      propertyType: s(d.property_type) || null, price, pricePerSqm: price && sqm && sqm > 0 ? Math.round(price / sqm) : null,
      source: s(d.source) || null, listingUrl: s(d.listing_url) || null, active: isActive,
      brokerId: bId, brokerName: bName,
      attribution: { kind: attr.kind!, reason: attr.reason, derived: attr.derived, conflict: attr.conflict, conflictNote: attr.conflictNote },
    });
  }

  inv.sort((a, b) => Number(b.active) - Number(a.active) || (b.price ?? 0) - (a.price ?? 0));
  const byBroker = [...brokerAgg.values()].sort((a, b) => b.active - a.active || b.total - a.total).slice(0, 100);
  const activeBrokers = brokers.filter((a) => brokerAgg.get(s(a.id))?.active).length;

  return {
    officeId, officeName, brand: res.brand, branch: res.branch, city: s(o.city) || null,
    totals: { active, inactive, total: byListing.size, direct, derivedThroughBrokers: derived, conflicts: conflicts.length, brokers: brokers.length, activeBrokers },
    byCity: tally(inv.map((l) => l.city)), byNeighborhood: tally(inv.map((l) => l.neighborhood)).slice(0, 30),
    byType: tally(inv.map((l) => l.propertyType)), byPriceBand: tally(inv.map((l) => priceBand(l.price))),
    byBroker, listings: inv.slice(0, 100), conflicts, lastActivityAt: lastActivity, empty: byListing.size === 0,
    version: OFFICE_INVENTORY_VERSION,
  };
}
