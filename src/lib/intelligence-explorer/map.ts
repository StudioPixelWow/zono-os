// ============================================================================
// ZONO — Live Market Intelligence Map™ data (server-only). Presentation only.
// ----------------------------------------------------------------------------
// Builds map overlays from EXISTING geocoded rows: external listings + internal
// properties (both already carry latitude/longitude). Each point is tagged with
// the layers it belongs to (external/office/mine/new/offmarket/opportunity) so
// the client can toggle layers. Neighborhood markers are the centroid of their
// existing listings (positioning only — no intelligence is recomputed). The
// Zone Explorer drawer reads the existing territory intelligence on demand.
// ============================================================================
import "server-only";
import { externalListingRepository } from "@/lib/external-listings/repository";
import { listProperties } from "@/lib/properties/repository";
import { matchesInventoryTab } from "@/lib/properties/inventory";
import { getAgencyOpportunityFeed } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { getSessionContext } from "@/lib/auth/session";

export type MapLayer = "external" | "office" | "mine" | "new" | "offmarket" | "opportunity";
export interface MapPoint { id: string; lat: number; lng: number; title: string; details: string[]; tone: "brand" | "success" | "warning" | "danger"; href: string; layers: MapLayer[] }
export interface MapZone { id: string; city: string; neighborhood: string; lat: number; lng: number; listings: number; privateListings: number }
export interface MapFeedItem { id: string; kind: string; title: string; detail: string; at: string | null; href: string | null }
export interface MapSignal { label: string; reason: string; city: string | null; neighborhood: string | null }
export interface MapIntelligenceDTO { points: MapPoint[]; zones: MapZone[]; feed: MapFeedItem[]; signals: MapSignal[]; counts: Record<MapLayer, number> }

const num = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? (n as number) : NaN; };
const ils = (n: number | null): string => (n == null ? "" : `₪${Math.round(n).toLocaleString("he-IL")}`);
const RECENT = Date.now() - 30 * 86_400_000;

export async function getMapIntelligence(): Promise<MapIntelligenceDTO> {
  const { user } = await getSessionContext().catch(() => ({ user: null }));
  const userId = user?.id ?? null;
  const orgId = await currentSessionOrgId();

  const [external, internal, oppFeed] = await Promise.all([
    externalListingRepository.listForOrg(2000).catch((e) => { console.error("[map] external failed:", e); return []; }),
    listProperties({}).catch((e) => { console.error("[map] internal failed:", e); return []; }),
    orgId ? getAgencyOpportunityFeed(orgId, { limit: 50 }).catch(() => null) : Promise.resolve(null),
  ]);

  const points: MapPoint[] = [];
  const counts: Record<MapLayer, number> = { external: 0, office: 0, mine: 0, new: 0, offmarket: 0, opportunity: 0 };

  // ── External market listings ───────────────────────────────────────────────
  for (const l of external) {
    const lat = num((l as { latitude?: unknown }).latitude), lng = num((l as { longitude?: unknown }).longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const layers: MapLayer[] = ["external"];
    counts.external++;
    if (l.first_seen_at && new Date(l.first_seen_at).getTime() >= RECENT) { layers.push("new"); counts.new++; }
    if (l.has_agent === false) { layers.push("offmarket"); counts.offmarket++; }
    if (l.opportunity_score >= 70) { layers.push("opportunity"); counts.opportunity++; }
    const tone = layers.includes("opportunity") ? "danger" : layers.includes("offmarket") ? "warning" : "brand";
    points.push({
      id: `ext_${l.id}`, lat, lng, title: l.title ?? "מודעה חיצונית",
      details: [[l.neighborhood, l.city].filter(Boolean).join(" · "), ils(l.price == null ? null : Number(l.price)), l.has_agent === false ? "ללא מתווך" : ""].filter(Boolean),
      tone, href: `/external-listings/${encodeURIComponent(l.id)}`, layers,
    });
  }

  // ── Internal inventory → office / mine layers ──────────────────────────────
  for (const p of internal) {
    const lat = num((p as { latitude?: unknown }).latitude), lng = num((p as { longitude?: unknown }).longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const isMine = matchesInventoryTab(p, "mine", userId);
    const isOffice = matchesInventoryTab(p, "office", userId);
    if (!isMine && !isOffice) continue;
    const layers: MapLayer[] = [];
    if (isMine) { layers.push("mine"); counts.mine++; }
    if (isOffice) { layers.push("office"); counts.office++; }
    points.push({
      id: `int_${p.id}`, lat, lng, title: (p as { title?: string | null }).title ?? "נכס",
      details: [[(p as { neighborhood?: string | null }).neighborhood, (p as { city?: string | null }).city].filter(Boolean).join(" · ")].filter(Boolean),
      tone: isMine ? "success" : "warning", href: `/properties/${encodeURIComponent(p.id)}`, layers,
    });
  }

  // ── Neighborhood centroids (positioning only) ──────────────────────────────
  const agg = new Map<string, { city: string; neighborhood: string; sumLat: number; sumLng: number; n: number; priv: number }>();
  for (const l of external) {
    if (!l.neighborhood) continue;
    const lat = num((l as { latitude?: unknown }).latitude), lng = num((l as { longitude?: unknown }).longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const city = l.city ?? "";
    const key = `${city}|${l.neighborhood}`;
    const e = agg.get(key) ?? { city, neighborhood: l.neighborhood, sumLat: 0, sumLng: 0, n: 0, priv: 0 };
    e.sumLat += lat; e.sumLng += lng; e.n++; if (l.has_agent === false) e.priv++;
    agg.set(key, e);
  }
  const zones: MapZone[] = [...agg.entries()].map(([id, e]) => ({ id, city: e.city, neighborhood: e.neighborhood, lat: e.sumLat / e.n, lng: e.sumLng / e.n, listings: e.n, privateListings: e.priv }))
    .sort((a, b) => b.listings - a.listings);

  // ── Live feed (chronological from existing events) ─────────────────────────
  const feed: MapFeedItem[] = external
    .filter((l) => l.first_seen_at)
    .sort((a, b) => new Date(b.first_seen_at!).getTime() - new Date(a.first_seen_at!).getTime())
    .slice(0, 30)
    .map((l) => ({
      id: `feed_${l.id}`, kind: l.has_agent === false ? "off_market" : l.opportunity_score >= 70 ? "opportunity" : "new_listing",
      title: l.title ?? "מודעה חדשה", detail: [[l.neighborhood, l.city].filter(Boolean).join(" · "), ils(l.price == null ? null : Number(l.price))].filter(Boolean).join(" · "),
      at: l.first_seen_at, href: `/external-listings/${encodeURIComponent(l.id)}`,
    }));

  const signals: MapSignal[] = (oppFeed?.opportunities ?? []).map((o) => ({ label: o.label, reason: o.reason, city: o.city, neighborhood: o.neighborhood }));

  return { points, zones, feed, signals, counts };
}
