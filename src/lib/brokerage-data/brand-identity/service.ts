// ============================================================================
// 🏷️ Brand & Branch Identity — hierarchy service (server-only, READ-ONLY). 26.4.19.
// Builds Brand → Branch → Broker from the existing offices + agents. Flags
// possible duplicates on STRONG identity only (never merges). No writes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb, makeCityMatch } from "../brokerage-knowledge";
import {
  resolveBrandBranch, identityOf, sharedIdentitySignals, explainBrand, explainSeparate, explainNotMerged,
} from "./resolver";
import {
  BRAND_IDENTITY_VERSION,
  type BranchOffice, type BrandNode, type BrandHierarchy, type PossibleDuplicate, type BrokerRef,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const numOf = (v: unknown): number | null => { const x = Number(v); return Number.isFinite(x) ? x : null; };

/** Build the brand→branch→broker hierarchy (optionally scoped to a city). */
export async function getBrandHierarchy(cityRaw?: string | null): Promise<BrandHierarchy> {
  const db = createServiceRoleClient();
  const notes: string[] = [];
  const cityFilter = cityRaw && cityRaw.trim() ? makeCityMatch(cityRaw) : null;

  const [offRes, agentRes] = await Promise.all([
    db.from("brokerage_offices" as never).select("*").limit(20000),
    db.from("brokerage_agents" as never).select("id,full_name,office_id,city").limit(20000),
  ]);
  const offices = ((offRes.data ?? []) as Row[]).filter((o) => s(o.status) !== "rejected" && (!cityFilter || cityFilter(o.city)));
  const brokersByOffice = new Map<string, BrokerRef[]>();
  for (const a of (agentRes.data ?? []) as Row[]) {
    const oid = s(a.office_id); if (!oid) continue;
    (brokersByOffice.get(oid) ?? brokersByOffice.set(oid, []).get(oid)!).push({ id: s(a.id), name: s(a.full_name) });
  }

  // Build a BranchOffice per office row.
  const branchOffices: BranchOffice[] = offices.map((o) => {
    const displayName = s(o.name);
    const res = resolveBrandBranch(displayName);
    const website = s(o.website) || null;
    const address = s(o.address) || s(o.full_address) || null;
    const identity = identityOf({ phone: s(o.primary_phone) || null, website, address, latitude: numOf(o.latitude), longitude: numOf(o.longitude) });
    const brokers = brokersByOffice.get(s(o.id)) ?? [];
    return {
      officeId: s(o.id), displayName, brand: res.brand, branch: res.branch, city: s(o.city) || null,
      phone: identity.phone, website, address, confidence: Number(o.confidence_score ?? 0),
      verificationState: s(o.status) || "active", brokerCount: brokers.length, brokers,
      identity, explain: { whyBrand: explainBrand(res), whySeparate: explainSeparate(res), whyNotMerged: "" },
    };
  });

  // Possible duplicates — STRONG identity only, and NEVER merged (Part 2/4).
  const possibleDuplicates: PossibleDuplicate[] = [];
  const sharesWithAny = new Set<string>();
  for (let i = 0; i < branchOffices.length; i++) {
    for (let j = i + 1; j < branchOffices.length; j++) {
      const a = branchOffices[i], b = branchOffices[j];
      const signals = sharedIdentitySignals(a.identity, b.identity);
      if (signals.length > 0) {
        possibleDuplicates.push({ officeAId: a.officeId, officeAName: a.displayName, officeBId: b.officeId, officeBName: b.displayName, sharedSignals: signals, recommendation: "לבדיקה ידנית בלבד — לעולם לא ממוזג אוטומטית" });
        sharesWithAny.add(a.officeId); sharesWithAny.add(b.officeId);
      }
    }
  }
  for (const bo of branchOffices) bo.explain.whyNotMerged = explainNotMerged(sharesWithAny.has(bo.officeId));

  // Group by brand; independents kept separate (brand = null).
  const brandMap = new Map<string, BrandNode>();
  const independentOffices: BranchOffice[] = [];
  for (const bo of branchOffices) {
    if (!bo.brand) { independentOffices.push(bo); continue; }
    const res = resolveBrandBranch(bo.displayName);
    let node = brandMap.get(res.normalizedBrand);
    if (!node) { node = { brand: bo.brand, normalizedBrand: res.normalizedBrand, branchCount: 0, brokerCount: 0, branches: [] }; brandMap.set(res.normalizedBrand, node); }
    node.branches.push(bo);
  }
  const brands = [...brandMap.values()].map((b) => ({
    ...b, branchCount: b.branches.length, brokerCount: b.branches.reduce((n, x) => n + x.brokerCount, 0),
    branches: b.branches.sort((x, y) => y.brokerCount - x.brokerCount || x.displayName.localeCompare(y.displayName)),
  })).sort((a, b) => b.branchCount - a.branchCount || b.brokerCount - a.brokerCount);
  independentOffices.sort((a, b) => b.brokerCount - a.brokerCount || a.displayName.localeCompare(b.displayName));

  if (branchOffices.length === 0) notes.push("לא נמצאו משרדים — הפעל גילוי/מחקר עיר תחילה.");

  return {
    city: cityRaw?.trim() || null, cityNormalized: cityRaw?.trim() ? normCityKb(cityRaw) : null,
    brands, independentOffices, possibleDuplicates,
    totals: { brands: brands.length, branches: brands.reduce((n, b) => n + b.branchCount, 0), independents: independentOffices.length, brokers: branchOffices.reduce((n, b) => n + b.brokerCount, 0), possibleDuplicates: possibleDuplicates.length },
    notes, version: BRAND_IDENTITY_VERSION,
  };
}
