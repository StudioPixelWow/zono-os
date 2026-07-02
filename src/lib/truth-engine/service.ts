// ============================================================================
// 🛡️ ZONO Truth Engine™ — service / org truth report (server-only). 27.7.
// Builds REAL, evidence-backed Truth Scores per office / broker / listing from
// the connected brokerage graph (offices · agents · external listing links),
// aggregates scope-level Data Health, and produces the executive-trust
// adjustment the Chief of Staff consumes (read-only). Evidence-only; no
// fabricated confidence. Reuses continuous-learning freshness. No modification
// to any protected engine.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBrokerageDataOverview } from "../brokerage-data/overview";
import { getChiefOfStaff } from "../chief-of-staff";
import { computeTruthScore } from "./truth-score";
import { computeDataHealth, buildExecutiveTrust } from "./data-health";
import {
  TRUTH_ENGINE_VERSION,
  type TruthScore, type EvidenceItem, type OrgTruthReport, type ExecutiveTrust,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numOr = (v: unknown, d = 0): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : d; };
const MAX_OFFICES = 60, MAX_BROKERS = 60, MAX_LISTINGS = 60, MAX_LINKS = 20000;

interface LinkRow { officeId: string | null; agentId: string | null; listingId: string | null; source: string | null; phone: string | null; name: string | null; conf: number; at: string | null; city: string | null }

const evFromLinks = (links: LinkRow[]): EvidenceItem[] =>
  links.map((l) => ({ source: l.source ?? "link", sourceType: l.source ?? "unknown_source", at: l.at, stance: "support" as const }));

/** The unified organization Truth Report. Read-only over the brokerage graph. */
export async function getOrgTruthReport(orgId: string | null): Promise<OrgTruthReport> {
  const db = createServiceRoleClient();
  const notes: string[] = [];

  const safeSelect = async (table: string, columns: string, build?: (q: ReturnType<typeof db.from>) => unknown): Promise<Row[]> => {
    try {
      let q = db.from(table as never).select(columns) as unknown as { limit: (n: number) => Promise<{ data: Row[] | null }> } & ReturnType<typeof db.from>;
      if (build) q = build(q as ReturnType<typeof db.from>) as never;
      const { data } = await (q as { limit: (n: number) => Promise<{ data: Row[] | null }> }).limit(MAX_LINKS);
      return (data ?? []) as Row[];
    } catch { return []; }
  };

  const [officeRows, agentRows, linkRowsRaw, overview] = await Promise.all([
    safeSelect("brokerage_offices", "id,name,brand_network,city,primary_phone,status,confidence_score"),
    safeSelect("brokerage_agents", "id,full_name,office_id,city,confidence_score,status"),
    safeSelect("brokerage_external_listing_links", "office_id,agent_id,external_listing_id,matched_source,matched_phone,matched_name,confidence_score,last_seen_at,created_at,city"),
    getBrokerageDataOverview(orgId).catch(() => null),
  ]);

  if (!officeRows.length) notes.push("אין משרדים מקושרים — הפעל גילוי/שיוך לפני חישוב אמון. אין אמון מפוברק.");

  const links: LinkRow[] = linkRowsRaw.map((r) => ({
    officeId: s(r.office_id), agentId: s(r.agent_id), listingId: s(r.external_listing_id),
    source: s(r.matched_source), phone: s(r.matched_phone), name: s(r.matched_name),
    conf: numOr(r.confidence_score), at: s(r.last_seen_at) ?? s(r.created_at), city: s(r.city),
  }));

  const byOffice = new Map<string, LinkRow[]>();
  const byAgent = new Map<string, LinkRow[]>();
  const byListing = new Map<string, LinkRow[]>();
  const byCity = new Map<string, LinkRow[]>();
  for (const l of links) {
    if (l.officeId) (byOffice.get(l.officeId) ?? byOffice.set(l.officeId, []).get(l.officeId)!).push(l);
    if (l.agentId) (byAgent.get(l.agentId) ?? byAgent.set(l.agentId, []).get(l.agentId)!).push(l);
    if (l.listingId) (byListing.get(l.listingId) ?? byListing.set(l.listingId, []).get(l.listingId)!).push(l);
    if (l.city) (byCity.get(l.city) ?? byCity.set(l.city, []).get(l.city)!).push(l);
  }

  // ── Offices ─────────────────────────────────────────────────────────────────
  const officeScores: TruthScore[] = officeRows.slice(0, MAX_OFFICES).map((o) => {
    const id = s(o.id) ?? "";
    const oLinks = byOffice.get(id) ?? [];
    const present: string[] = [];
    if (s(o.primary_phone)) present.push("phone");
    if (s(o.city)) present.push("city");
    if (s(o.brand_network)) present.push("brand");
    const phones = [s(o.primary_phone), ...oLinks.map((l) => l.phone)];
    const names = oLinks.map((l) => l.name);
    return computeTruthScore({
      entityType: "office", entityId: id, entityName: s(o.name),
      evidence: evFromLinks(oLinks), baseConfidence: numOr(o.confidence_score),
      requiredFields: ["phone", "city", "brand"], presentFields: present,
      contradictionSignals: { phones, offices: names },
    });
  });

  // ── Brokers ─────────────────────────────────────────────────────────────────
  const brokerScores: TruthScore[] = agentRows
    .filter((a) => (byAgent.get(s(a.id) ?? "")?.length ?? 0) > 0)
    .slice(0, MAX_BROKERS)
    .map((a) => {
      const id = s(a.id) ?? "";
      const aLinks = byAgent.get(id) ?? [];
      const present: string[] = [];
      if (s(a.city)) present.push("city");
      if (s(a.office_id)) present.push("office");
      const offices = aLinks.map((l) => l.officeId);
      return computeTruthScore({
        entityType: "broker", entityId: id, entityName: s(a.full_name),
        evidence: evFromLinks(aLinks), baseConfidence: numOr(a.confidence_score),
        requiredFields: ["city", "office"], presentFields: present,
        contradictionSignals: { offices, phones: aLinks.map((l) => l.phone) },
      });
    });

  // ── Listings / properties ────────────────────────────────────────────────────
  const propertyScores: TruthScore[] = [...byListing.entries()].slice(0, MAX_LISTINGS).map(([lid, lLinks]) => (
    computeTruthScore({
      entityType: "listing", entityId: lid, entityName: `מודעה ${lid.slice(0, 8)}`,
      evidence: evFromLinks(lLinks),
      contradictionSignals: { brokers: lLinks.map((l) => l.agentId), offices: lLinks.map((l) => l.officeId), phones: lLinks.map((l) => l.phone) },
    })
  ));

  // ── Market (per-city truth) ──────────────────────────────────────────────────
  const cityScores: TruthScore[] = [...byCity.entries()].map(([city, cLinks]) => (
    computeTruthScore({ entityType: "market", entityId: city, entityName: city, evidence: evFromLinks(cLinks) })
  ));

  // ── Organization truth (single score from graph-wide evidence) ───────────────
  const sourceTypesAll = new Set(links.map((l) => l.source).filter((x): x is string => !!x));
  const latestAll = links.reduce<string | null>((acc, l) => (l.at && (!acc || l.at > acc) ? l.at : acc), null);
  const orgEvidence: EvidenceItem[] = [...sourceTypesAll].map((src) => ({ source: src, sourceType: src, at: latestAll, stance: "support" as const }));
  const orgPresent: string[] = [];
  if ((overview?.dataQuality.linkCoverage ?? 0) >= 50) orgPresent.push("link_coverage");
  if ((overview?.dataQuality.resolutionRate ?? 0) >= 50) orgPresent.push("broker_resolution");
  if (officeRows.length > 0) orgPresent.push("offices");
  const organization = computeTruthScore({
    entityType: "organization", entityId: orgId ?? "org", entityName: "הארגון",
    evidence: orgEvidence, baseConfidence: overview?.dataQuality.score ?? null,
    requiredFields: ["link_coverage", "broker_resolution", "offices"], presentFields: orgPresent,
    lastSeenAt: latestAll,
  });

  // ── Scope-level data health ──────────────────────────────────────────────────
  const dataHealth = {
    organization: computeDataHealth("organization", [...officeScores, ...brokerScores]),
    office: computeDataHealth("office", officeScores),
    broker: computeDataHealth("broker", brokerScores),
    property: computeDataHealth("property", propertyScores),
    market: computeDataHealth("market", cityScores),
  };

  // ── Executive integration — Chief of Staff consumes the Truth Score ──────────
  let executive: ExecutiveTrust | null = null;
  try {
    const cos = await getChiefOfStaff(orgId);
    executive = buildExecutiveTrust(cos.organizationScore.overall, cos.dashboard.aiConfidence, organization.truthScore);
  } catch { notes.push("לא ניתן לטעון את ה-Chief of Staff לצורך התאמת ביטחון."); }

  const allEntity = [...officeScores, ...brokerScores];
  const lowestTrust = [...allEntity].filter((x) => x.evidenceCount > 0).sort((a, b) => a.truthScore - b.truthScore).slice(0, 8);
  const staleEntities = allEntity.filter((x) => x.freshnessLevel === "stale" || x.freshnessLevel === "expired").sort((a, b) => a.freshness - b.freshness).slice(0, 8);
  const sevRank: Record<string, number> = { high: 3, moderate: 2, low: 1 };
  const topContradictions = allEntity.flatMap((x) => x.contradictionDetail).sort((a, b) => sevRank[b.severity] - sevRank[a.severity]).slice(0, 10);

  return {
    version: TRUTH_ENGINE_VERSION, orgId, generatedAt: new Date().toISOString(),
    organization, dataHealth, lowestTrust, topContradictions, staleEntities, executive,
    sampleOffices: [...officeScores].sort((a, b) => b.truthScore - a.truthScore).slice(0, 8),
    sampleBrokers: [...brokerScores].sort((a, b) => b.truthScore - a.truthScore).slice(0, 8),
    notes,
  };
}
