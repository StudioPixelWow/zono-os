// ============================================================================
// ZONO — BROKER LISTING CLAIM (server-only). A brand-new office whose broker
// already has listings OBSERVED in the shared market graph can claim them on
// first login: we detect listings whose broker name / phone matches the office's
// own broker identity, show a confirmation popup, and on confirm COPY them into
// the office's own inventory permanently — so the map, market intelligence and
// listings populate instantly, with NO dependency on a live scrape.
//
// TENANT-SAFE: identity comes from the office's OWN seeded broker profile (never
// the client). Phone match is strong (any city); a name-only match additionally
// requires the listing city to match the office city, so a shared personal name
// never pulls in another city's broker. The user still explicitly confirms.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizePhoneIL } from "@/lib/util/identity";
import { normalizeHebrewName } from "@/lib/broker/engine";
import { makeCityMatch } from "@/lib/brokerage-data/brokerage-knowledge";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClaimDecision = "pending" | "claimed" | "dismissed";
export interface ClaimSample { id: string; propertyType: string | null; neighborhood: string | null; price: number | null; imageUrl: string | null }
export interface ClaimableListings {
  status: "available" | "none" | "decided";
  decision: ClaimDecision;
  brokerName: string | null;
  count: number;
  sample: ClaimSample[];
}

interface ClaimIdentity { name: string; normName: string; normPhone: string; city: string }

const firstImage = (v: unknown): string | null => {
  let arr: unknown = v;
  if (typeof v === "string") { try { arr = JSON.parse(v); } catch { return v.trim() ? v : null; } }
  if (!Array.isArray(arr)) return null;
  for (const it of arr) {
    if (typeof it === "string" && it.trim()) return it;
    if (it && typeof it === "object" && typeof (it as { url?: string }).url === "string") return (it as { url: string }).url;
  }
  return null;
};

/** The office's OWN broker identity — the profile seeded at onboarding (earliest,
 *  non-competitor), plus the office city, used to match observed listings. */
async function claimIdentity(db: any, orgId: string): Promise<ClaimIdentity | null> {
  const { data: profs } = await (db.from("broker_profiles" as never)
    .select("display_name,phone,normalized_phone,metadata,created_at")
    .eq("org_id", orgId).order("created_at", { ascending: true }).limit(20) as any);
  const rows = (profs ?? []) as Array<{ display_name: string | null; phone: string | null; normalized_phone: string | null; metadata: any }>;
  const self = rows.find((r) => (r.metadata?.is_competitor !== true)) ?? rows[0];
  let city = "";
  try {
    const { data: org } = await (db.from("organizations" as never).select("city").eq("id", orgId).maybeSingle() as any);
    city = String(org?.city ?? "").trim();
  } catch { /* ignore */ }
  if (!self) return city ? { name: "", normName: "", normPhone: "", city } : null;
  const name = String(self.display_name ?? "").trim();
  const normPhone = normalizePhoneIL(self.normalized_phone || self.phone || "");
  return { name, normName: normalizeHebrewName(name), normPhone, city };
}

async function existingDecision(db: any, orgId: string): Promise<{ decision: ClaimDecision; count: number } | null> {
  try {
    const { data } = await (db.from("org_listing_claims" as never).select("decision,claimed_count").eq("org_id", orgId).maybeSingle() as any);
    if (data && (data.decision === "claimed" || data.decision === "dismissed")) return { decision: data.decision, count: data.claimed_count ?? 0 };
  } catch { /* table may be empty */ }
  return null;
}

/** Detect the matching listing ids (shared graph, excluding this org). */
async function matchListingIds(db: any, orgId: string, id: ClaimIdentity): Promise<{ ids: string[]; rows: any[] }> {
  if (!id.normName && !id.normPhone) return { ids: [], rows: [] };
  const cityMatch = id.city ? makeCityMatch(id.city) : null;
  const filters: string[] = [];
  if (id.name) { filters.push(`detected_broker_name.ilike.%${id.name}%`); filters.push(`contact_name.ilike.%${id.name}%`); }
  if (id.normPhone) filters.push(`contact_phone.ilike.%${id.normPhone}%`);
  if (!filters.length) return { ids: [], rows: [] };
  let q = db.from("external_listings" as never)
    .select("id,detected_broker_name,contact_name,contact_phone,city,property_type,neighborhood,price,images,org_id,status")
    .neq("org_id", orgId).neq("status", "removed").limit(600);
  q = q.or(filters.join(","));
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const out: any[] = [];
  for (const r of rows) {
    const nameHit = !!id.normName && (normalizeHebrewName(r.detected_broker_name) === id.normName || normalizeHebrewName(r.contact_name) === id.normName);
    const phoneHit = !!id.normPhone && normalizePhoneIL(r.contact_phone) === id.normPhone;
    if (phoneHit) { out.push(r); continue; }               // phone = strong, any city
    if (nameHit && (!cityMatch || cityMatch(r.city))) out.push(r);  // name-only needs city
  }
  return { ids: out.map((r) => String(r.id)), rows: out };
}

/** First-login detection: are there claimable listings for this office? */
export async function detectClaimableListings(orgId: string): Promise<ClaimableListings> {
  const db = createServiceRoleClient();
  const decided = await existingDecision(db, orgId);
  if (decided) return { status: "decided", decision: decided.decision, brokerName: null, count: decided.count, sample: [] };

  const id = await claimIdentity(db, orgId);
  if (!id || (!id.normName && !id.normPhone)) return { status: "none", decision: "pending", brokerName: id?.name ?? null, count: 0, sample: [] };

  const { rows } = await matchListingIds(db, orgId, id);
  if (rows.length === 0) return { status: "none", decision: "pending", brokerName: id.name || null, count: 0, sample: [] };

  const sample: ClaimSample[] = rows.filter((r) => firstImage(r.images)).slice(0, 6).map((r) => ({
    id: String(r.id), propertyType: (r.property_type as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null, price: typeof r.price === "number" ? r.price : null,
    imageUrl: firstImage(r.images),
  }));
  return { status: "available", decision: "pending", brokerName: id.name || null, count: rows.length, sample };
}

/** Confirm: copy the matching listings into the office permanently. Idempotent. */
export async function confirmListingClaim(orgId: string): Promise<{ ok: boolean; count: number }> {
  const db = createServiceRoleClient();
  const id = await claimIdentity(db, orgId);
  if (!id) return { ok: false, count: 0 };
  const { ids } = await matchListingIds(db, orgId, id);
  let count = 0;
  if (ids.length) {
    const { data, error } = await ((db as any).rpc("copy_external_listings_to_org", { p_org: orgId, p_ids: ids }));
    if (error) { console.error("[listing-claim] copy failed:", error.message); return { ok: false, count: 0 }; }
    count = typeof data === "number" ? data : Number(data ?? 0);
  }
  await recordDecision(db, orgId, "claimed", id.name, count);
  return { ok: true, count };
}

/** Dismiss: never offer this claim again for the office. */
export async function dismissListingClaim(orgId: string): Promise<{ ok: boolean }> {
  const db = createServiceRoleClient();
  const id = await claimIdentity(db, orgId);
  await recordDecision(db, orgId, "dismissed", id?.name ?? null, 0);
  return { ok: true };
}

async function recordDecision(db: any, orgId: string, decision: ClaimDecision, brokerName: string | null, count: number): Promise<void> {
  try {
    await (db.from("org_listing_claims" as never).upsert({
      org_id: orgId, decision, broker_name: brokerName, claimed_count: count,
      decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    } as never, { onConflict: "org_id" }) as any);
  } catch (e) { console.error("[listing-claim] record decision failed:", e instanceof Error ? e.message : e); }
}
