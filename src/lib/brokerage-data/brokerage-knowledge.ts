// ============================================================================
// 🧠 Persistent Brokerage Knowledge Base™ (Phase 26.4.8). Server-only, READ layer.
// Brokerage intelligence is SYSTEM data — not owned by one broker/run/workflow.
// getBrokerageKnowledgeForCity(orgId, city) returns everything the org already
// learned about a city so callers reuse it BEFORE running expensive research.
// Uses existing tables only. No schema change.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { detectFranchise } from "./franchise";
import { isAcceptableOfficeName } from "./office-name-guard";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export function normCityKb(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}
/** Stable office key shared across discovery, matching and relink. */
export function officeKey(name: string): string {
  const fr = detectFranchise(name);
  return `${fr.normalizedBrand}|${normalizeHebrewName(name)}`;
}

export interface KnownOffice {
  id: string; name: string; normalizedName: string; key: string;
  brandNetwork: string | null; status: string;
  phones: string[]; domains: string[]; website: string | null;
  confidence: number; brokerCount: number; lastSeenAt: string | null; lastVerifiedAt: string | null;
  fromKnowledgeBase: true;
}
export interface KnownBroker { id: string; name: string; phone: string | null; officeId: string | null }
export interface CityKnowledge {
  city: string; cityNormalized: string; cityVariants: string[];
  verifiedOffices: KnownOffice[];          // status active, evidence-backed
  candidateOffices: { name: string; status: string; confidence: number }[];
  brokers: KnownBroker[];
  brokersWithOffice: number;
  brokerOfficeLinks: number;
  contactPoints: { phones: string[]; domains: string[] };
  listingsLinked: number;
  knownAliases: string[];                  // distinct office-name spellings seen
}

/** Everything the org already knows about a city. Read-only; existing tables only. */
export async function getBrokerageKnowledgeForCity(orgId: string, cityRaw: string): Promise<CityKnowledge> {
  const db = createServiceRoleClient();
  const cityNorm = normCityKb(cityRaw);
  const stem = cityRaw.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? cityRaw.trim();
  const inCity = (c: unknown) => normCityKb(s(c)) === cityNorm;
  void orgId; // brokerage tables are national (service-role); city is the scope key.

  const [officeRes, agentRes, candRes, linkRes] = await Promise.all([
    db.from("brokerage_offices" as never).select("id,name,normalized_name,brand_network,city,status,primary_phone,email,website,confidence_score,last_seen_at,last_verified_at,metadata").limit(20000),
    db.from("brokerage_agents" as never).select("id,full_name,primary_phone,whatsapp_phone,city,office_id").limit(20000),
    db.from("brokerage_office_candidates" as never).select("office_name,city,status,confidence,phone,domain").limit(20000),
    db.from("brokerage_external_listing_links" as never).select("office_id,external_listing_id,city").limit(50000),
  ]);

  const agents = ((agentRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  const variants = new Set<string>();
  for (const a of agents) if (s(a.city)) variants.add(s(a.city));

  const brokerCountByOffice = new Map<string, number>();
  for (const a of agents) { const oid = s(a.office_id); if (oid) brokerCountByOffice.set(oid, (brokerCountByOffice.get(oid) ?? 0) + 1); }

  const officeRows = ((officeRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const o of officeRows) if (s(o.city)) variants.add(s(o.city));
  const candRows = ((candRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const c of candRows) if (s(c.city)) variants.add(s(c.city));

  const phonesAll = new Set<string>();
  const domainsAll = new Set<string>();
  const aliases = new Set<string>();

  const verifiedOffices: KnownOffice[] = officeRows
    .filter((o) => (s(o.status) || "active") === "active" && isAcceptableOfficeName(s(o.name)))
    .map((o) => {
      const name = s(o.name);
      aliases.add(name);
      const phone = normalizePhoneNumber(s(o.primary_phone));
      const website = s(o.website) || null;
      if (phone) phonesAll.add(phone);
      const phones = phone ? [phone] : [];
      const domains = website ? [website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]] : [];
      for (const d of domains) domainsAll.add(d);
      return {
        id: s(o.id), name, normalizedName: s(o.normalized_name) || normalizeHebrewName(name), key: officeKey(name),
        brandNetwork: s(o.brand_network) || null, status: s(o.status) || "active",
        phones, domains, website, confidence: Number(o.confidence_score ?? 0),
        brokerCount: brokerCountByOffice.get(s(o.id)) ?? 0,
        lastSeenAt: s(o.last_seen_at) || null, lastVerifiedAt: s(o.last_verified_at) || null,
        fromKnowledgeBase: true as const,
      };
    });

  const candidateOffices = candRows
    .filter((c) => s(c.status) !== "rejected")
    .map((c) => { aliases.add(s(c.office_name)); if (s(c.phone)) phonesAll.add(normalizePhoneNumber(s(c.phone))); if (s(c.domain)) domainsAll.add(s(c.domain)); return { name: s(c.office_name), status: s(c.status) || "candidate_pending_verification", confidence: Number(c.confidence ?? 0) }; });

  const brokers: KnownBroker[] = agents.map((a) => ({ id: s(a.id), name: s(a.full_name), phone: normalizePhoneNumber(s(a.primary_phone) || s(a.whatsapp_phone)) || null, officeId: s(a.office_id) || null }));
  const brokersWithOffice = brokers.filter((b) => b.officeId).length;

  // Listings linked in this city (via the links table — count distinct listings).
  const cityListingIds = new Set<string>();
  const { data: cityListings } = await db.from("external_listings" as never).select("id").ilike("city", `%${stem}%`).limit(50000);
  for (const r of (cityListings ?? []) as Row[]) cityListingIds.add(s(r.id));
  const linkedSet = new Set<string>();
  for (const r of ((linkRes.data ?? []) as Row[])) { const lid = s(r.external_listing_id); if (s(r.office_id) && (cityListingIds.has(lid) || inCity(r.city))) linkedSet.add(lid); }

  return {
    city: cityRaw.trim(), cityNormalized: cityNorm, cityVariants: [...variants].slice(0, 10),
    verifiedOffices, candidateOffices, brokers, brokersWithOffice,
    brokerOfficeLinks: brokersWithOffice,
    contactPoints: { phones: [...phonesAll].filter(Boolean).slice(0, 50), domains: [...domainsAll].filter(Boolean).slice(0, 50) },
    listingsLinked: linkedSet.size,
    knownAliases: [...aliases].slice(0, 50),
  };
}
