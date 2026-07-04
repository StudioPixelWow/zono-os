// ============================================================================
// 📱 ZONO Mobile Field Operations™ — server service (server-only). 41.0.
// Property Visit Mode composed from the EXISTING reads (getPropertyById +
// getPropertySellers + sellers contact + getPropertyDocuments), cached via the
// 34.2 compute-cache for offline-ready field use. No new engine, no schema.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getPropertyById, getPropertyDocuments } from "@/lib/properties/repository";
import { getPropertySellers } from "@/lib/sellers/service360";
import { getCache, setCache } from "@/lib/platform-persistence";
import type { Json } from "@/lib/supabase/types";
import { buildVisitMode } from "./assemble";
import type { VisitMode, PropertyLean, SellerLean, DocLean } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };

async function orgId(): Promise<string | null> {
  const sc = await getSessionContext();
  return sc.profile?.org_id ?? sc.organization?.id ?? null;
}

async function sellerContact(propertyId: string): Promise<SellerLean | null> {
  try {
    const sellers = await getPropertySellers(propertyId);
    if (!sellers.length) return null;
    const primary = sellers.find((x) => x.isPrimary) ?? sellers[0];
    const db = await createClient();
    const { data } = await db.from("sellers").select("full_name,phone").eq("id", primary.sellerId).limit(1).maybeSingle();
    const row = (data as Row | null) ?? null;
    return { name: s(row?.full_name) ?? primary.name, phone: s(row?.phone) };
  } catch { return null; }
}

/** Property Visit Mode (cached ~5 min for offline field use). */
export async function getVisitMode(propertyId: string): Promise<VisitMode | null> {
  if (!propertyId) return null;
  const org = await orgId();
  const key = [propertyId];
  if (org) {
    const hit = await getCache<VisitMode>(org, "visit_mode", key);
    if (hit) return hit.value;
  }

  const prop = await getPropertyById(propertyId).catch(() => null);
  if (!prop) return null;
  const r = prop as unknown as Row;
  const lean: PropertyLean = {
    id: s(r.id) ?? propertyId, title: s(r.title) ?? "נכס", city: s(r.city), neighborhood: s(r.neighborhood), buildingNumber: s(r.building_number),
    price: num(r.price), rooms: num(r.rooms), size: num(r.size_sqm), type: s(r.type), status: s(r.status),
    image: s(r.primary_image_url), aiDescription: s(r.ai_description), zonoScore: num(r.zono_score), lat: num(r.latitude), lng: num(r.longitude),
  };

  const [seller, docsRaw] = await Promise.all([sellerContact(propertyId), getPropertyDocuments(propertyId).catch(() => [])]);
  const docs: DocLean[] = (docsRaw as unknown as Row[]).map((d) => ({ id: s(d.id) ?? "", title: s(d.title) ?? "מסמך", url: s(d.file_url) }));

  const vm = buildVisitMode(lean, seller, docs);
  if (org) await setCache(org, "visit_mode", key, vm as unknown as Json, { ttlSeconds: 300, version: vm.version });
  return vm;
}
