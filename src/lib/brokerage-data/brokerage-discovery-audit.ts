// ============================================================================
// 🔎 City Brokerage Discovery Audit (Phase 26.4.3) — READ-ONLY. Explains, for a
// city, why few offices were discovered: how many brokers were scanned, how many
// office-name strings appear in source evidence, how many offices/candidates
// exist, and a classification. NO writes, NO AI. Reuses the franchise detector +
// office-name guard (the same logic the discovery engine uses) so the audit
// reflects the real creation conditions.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { detectFranchise } from "./franchise";
import { isAcceptableOfficeName } from "./office-name-guard";
import { normalizeHebrewName } from "./normalize";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function normCity(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי")                      // קריית → קרית
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}

export interface CityDiscoveryAudit {
  city: string;
  cityNormalized: string;
  cityVariants: string[];
  brokersScanned: number;
  brokersWithOffice: number;
  brokersResearching: number;
  officesActive: number;
  officesList: { id: string; name: string; brandNetwork: string | null; brokerCount: number; status: string }[];
  candidates: { total: number; pendingVerification: number; verified: number; rejected: number };
  officeNameEvidence: {
    listingsInCity: number;
    withDetectedOfficeName: number;   // detected_broker_name/contact_name that is an acceptable office name
    brandMentions: number;            // a known franchise brand detected in evidence text
    distinctOfficeNames: number;
    topOfficeNames: { name: string; count: number }[];
  };
  classification: "DISCOVERY_OK" | "OFFICE_CREATION_TOO_STRICT" | "OFFICE_NAME_EXTRACTION_MISSING" | "SOURCE_COVERAGE_TOO_WEAK" | "GROUPING_TOO_AGGRESSIVE" | "UNKNOWN";
  notes: string[];
}

/** Read-only discovery audit for one city. */
export async function getCityDiscoveryAudit(cityQuery: string): Promise<CityDiscoveryAudit> {
  const db = createServiceRoleClient();
  const cityNorm = normCity(cityQuery);
  const stem = cityQuery.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? cityQuery.trim();

  const [agentRes, officeRes, candRes, listingRes] = await Promise.all([
    db.from("brokerage_agents" as never).select("id,full_name,city,office_id").limit(20000),
    db.from("brokerage_offices" as never).select("id,name,brand_network,city,status").limit(20000),
    db.from("brokerage_office_candidates" as never).select("office_name,city,status").limit(20000),
    db.from("external_listings" as never).select("detected_broker_name,contact_name,title,city,source").ilike("city", `%${stem}%`).limit(20000),
  ]);

  const inCity = (c: unknown) => normCity(s(c)) === cityNorm;
  const variants = new Set<string>();

  // Brokers
  const agents = ((agentRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const a of agents) if (s(a.city)) variants.add(s(a.city));
  const brokersScanned = agents.length;
  const brokersWithOffice = agents.filter((a) => s(a.office_id)).length;

  // Offices (active) + broker counts
  const officeRows = ((officeRes.data ?? []) as Row[]).filter((r) => inCity(r.city) && (s(r.status) || "active") === "active" && isAcceptableOfficeName(s(r.name)));
  for (const o of officeRows) if (s(o.city)) variants.add(s(o.city));
  const brokerCountByOffice = new Map<string, number>();
  for (const a of agents) { const oid = s(a.office_id); if (oid) brokerCountByOffice.set(oid, (brokerCountByOffice.get(oid) ?? 0) + 1); }
  const officesList = officeRows.map((o) => ({
    id: s(o.id), name: s(o.name), brandNetwork: s(o.brand_network) || null,
    brokerCount: brokerCountByOffice.get(s(o.id)) ?? 0, status: s(o.status) || "active",
  })).sort((a, b) => b.brokerCount - a.brokerCount);

  // Candidates
  const candRows = ((candRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const c of candRows) if (s(c.city)) variants.add(s(c.city));
  const candidates = {
    total: candRows.length,
    pendingVerification: candRows.filter((c) => s(c.status) === "candidate_pending_verification").length,
    verified: candRows.filter((c) => s(c.status) === "verified").length,
    rejected: candRows.filter((c) => s(c.status) === "rejected").length,
  };

  // Office-name evidence from listings
  const listings = ((listingRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const l of listings) if (s(l.city)) variants.add(s(l.city));
  let withDetectedOfficeName = 0, brandMentions = 0;
  const nameCounts = new Map<string, { name: string; count: number }>();
  for (const l of listings) {
    const detected = s(l.detected_broker_name).trim();
    const contact = s(l.contact_name).trim();
    const text = `${detected} ${contact} ${s(l.title)}`.trim();
    if (detectFranchise(text).matched) brandMentions++;
    for (const cand of [detected, contact]) {
      if (cand.length >= 2 && isAcceptableOfficeName(cand)) {
        withDetectedOfficeName++;
        const fr = detectFranchise(cand);
        const display = fr.matched ? fr.brandNetwork : cand;
        const key = normalizeHebrewName(display);
        const cur = nameCounts.get(key) ?? { name: display, count: 0 };
        cur.count++; nameCounts.set(key, cur);
        break;
      }
    }
  }
  const topOfficeNames = [...nameCounts.values()].sort((a, b) => b.count - a.count).slice(0, 15);

  // ── Classification ──────────────────────────────────────────────────────────
  const notes: string[] = [];
  let classification: CityDiscoveryAudit["classification"];
  const distinctNames = nameCounts.size;
  const topShare = officesList.length > 0 ? (officesList[0]?.brokerCount ?? 0) / Math.max(1, brokersWithOffice) : 0;

  if (listings.length < 10 && brokersScanned < 10) {
    classification = "SOURCE_COVERAGE_TOO_WEAK";
    notes.push(`כיסוי מקורות חלש לעיר — ${listings.length} מודעות, ${brokersScanned} מתווכים. נדרשת סריקה רחבה יותר.`);
  } else if (withDetectedOfficeName === 0 && brandMentions === 0) {
    classification = "OFFICE_NAME_EXTRACTION_MISSING";
    notes.push("המודעות בעיר אינן נושאות שם משרד/מותג (detected_broker_name ריק) — אי אפשר לחלץ משרדים מהמקור. נדרש מחקר ציבורי (web) לחילוץ שמות משרד.");
  } else if (distinctNames >= Math.max(5, officesList.length * 3) && officesList.length <= 3) {
    classification = "OFFICE_CREATION_TOO_STRICT";
    notes.push(`זוהו ${distinctNames} שמות משרד שונים בראיות, אך נוצרו רק ${officesList.length} משרדים — סף היצירה (≥2 מתווכים/≥3 צפיות) מחמיר מדי עבור עיר זו, או המתווכים אינם מקובצים יחד.`);
  } else if (officesList.length > 0 && topShare >= 0.8 && distinctNames >= 4) {
    classification = "GROUPING_TOO_AGGRESSIVE";
    notes.push("רוב המתווכים קובצו תחת משרד יחיד למרות מספר שמות משרד שונים בראיות — ייתכן קיבוץ אגרסיבי מדי (סניפים שונים נדחסו לאחד).");
  } else if (officesList.length >= 3) {
    classification = "DISCOVERY_OK";
  } else {
    classification = "UNKNOWN";
    notes.push("הסיבה אינה חד-משמעית — ראה ספירות הראיות.");
  }

  if (brokersWithOffice < brokersScanned) notes.push(`${brokersScanned - brokersWithOffice} מתווכים עדיין במחקר (ללא שיוך משרד).`);
  if (candidates.pendingVerification > 0) notes.push(`${candidates.pendingVerification} מועמדי משרד ממתינים לאימות — הצג אותם כ"משרדים במחקר".`);

  return {
    city: cityQuery.trim(), cityNormalized: cityNorm, cityVariants: [...variants].slice(0, 12),
    brokersScanned, brokersWithOffice, brokersResearching: Math.max(0, brokersScanned - brokersWithOffice),
    officesActive: officesList.length, officesList,
    candidates,
    officeNameEvidence: {
      listingsInCity: listings.length, withDetectedOfficeName, brandMentions,
      distinctOfficeNames: distinctNames, topOfficeNames,
    },
    classification, notes,
  };
}
