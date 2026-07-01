// ============================================================================
// 🔍 City Repository Cross-Check (Phase 26.4.14). Server-only, READ-ONLY.
// ----------------------------------------------------------------------------
// For a city, counts rows across EVERY relevant table and shows exactly why the
// City Learning / Census panels used to read 0: exact vs normalized vs missing
// vs English-variant city rows. Proves the repository/city-field mismatch. No
// writes, no schema change, no engine change.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb, makeCityMatch } from "./brokerage-knowledge";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const hasLatin = (v: string): boolean => /[a-z]/i.test(v);

export interface TableCityAudit {
  table: string; exists: boolean; error: string | null;
  totalOrgRows: number;
  exactCityRows: number;         // stored value === typed value (trimmed)
  normalizedCityRows: number;    // robust matcher (what the fixed read layer uses)
  missingCityRows: number;       // no city value at all
  englishVariantRows: number;    // city stored with Latin letters
  cityFieldUsed: string | null;
  sampleCities: string[];
}

export interface CityRepositoryAudit {
  city: string; cityNormalized: string;
  tables: TableCityAudit[];
  rootCause: string;
  verdict: "REPOSITORY_OK" | "CITY_FIELD_MISMATCH" | "ROWS_NOT_CITY_TAGGED" | "NO_DATA";
}

interface Spec { table: string; cityFields: string[] }
const SPECS: Spec[] = [
  { table: "brokerage_agents", cityFields: ["city"] },
  { table: "brokerage_offices", cityFields: ["city"] },
  { table: "brokerage_office_candidates", cityFields: ["city"] },
  { table: "brokerage_research_dossier", cityFields: ["city"] },
  { table: "brokerage_broker_identity", cityFields: ["city"] },
  { table: "brokerage_external_listing_links", cityFields: ["city"] },
  { table: "external_listings", cityFields: ["city", "city_name"] },
  { table: "properties", cityFields: ["city", "city_name"] },
  { table: "market_property_sources", cityFields: ["city", "city_name"] },
];

async function auditTable(db: ReturnType<typeof createServiceRoleClient>, spec: Spec, cityRaw: string): Promise<TableCityAudit> {
  const match = makeCityMatch(cityRaw);
  const exactTarget = cityRaw.trim();
  const base: TableCityAudit = {
    table: spec.table, exists: true, error: null, totalOrgRows: 0,
    exactCityRows: 0, normalizedCityRows: 0, missingCityRows: 0, englishVariantRows: 0,
    cityFieldUsed: null, sampleCities: [],
  };
  let rows: Row[] | null = null;
  try {
    const { data, error } = await db.from(spec.table as never).select("*").limit(20000);
    if (error) return { ...base, exists: !/does not exist|relation/i.test(error.message), error: error.message };
    rows = (data ?? []) as Row[];
  } catch (e) { return { ...base, exists: false, error: e instanceof Error ? e.message : String(e) }; }

  base.totalOrgRows = rows.length;
  const cityField = spec.cityFields.find((f) => rows!.some((r) => s(r[f]))) ?? spec.cityFields[0];
  base.cityFieldUsed = cityField;
  const sample = new Set<string>();
  for (const r of rows) {
    const raw = spec.cityFields.map((f) => s(r[f])).find(Boolean) ?? "";
    if (!raw) { base.missingCityRows++; continue; }
    if (sample.size < 12) sample.add(raw);
    if (raw.trim() === exactTarget) base.exactCityRows++;
    if (spec.cityFields.some((f) => match(r[f]))) base.normalizedCityRows++;
    if (hasLatin(raw)) base.englishVariantRows++;
  }
  base.sampleCities = [...sample];
  return base;
}

/** Cross-check every repository for a city and diagnose the read mismatch. */
export async function crossCheckCityRepositories(cityRaw: string): Promise<CityRepositoryAudit> {
  const db = createServiceRoleClient();
  const tables = await Promise.all(SPECS.map((spec) => auditTable(db, spec, cityRaw)));

  const agents = tables.find((t) => t.table === "brokerage_agents");
  const listings = tables.find((t) => t.table === "external_listings");
  const anyNormalized = tables.some((t) => t.normalizedCityRows > 0);
  const anyTotal = tables.some((t) => t.totalOrgRows > 0);

  let verdict: CityRepositoryAudit["verdict"];
  let rootCause: string;
  if (!anyTotal) { verdict = "NO_DATA"; rootCause = "אין נתונים כלל באף טבלה — לא מדובר בתקלת קריאה."; }
  else if (!anyNormalized) {
    verdict = "ROWS_NOT_CITY_TAGGED";
    rootCause = "קיימות שורות בארגון אך אף אחת אינה מתויגת לעיר זו (city ריק/שונה) — הפאנלים קראו 0 כי אין תיוג עיר, לא כי אין נתונים.";
  } else if (agents && agents.normalizedCityRows > agents.exactCityRows) {
    verdict = "CITY_FIELD_MISMATCH";
    rootCause = `שורות קיימות באיות עיר שונה מהמדויק (${agents.exactCityRows} מדויק מול ${agents.normalizedCityRows} בהתאמה מנורמלת) — המסנן הישן (שוויון מדויק) החריג אותן; השכבה החדשה מתקנת זאת.`;
  } else {
    verdict = "REPOSITORY_OK";
    rootCause = `נתונים תואמים נמצאו (מתווכים: ${agents?.normalizedCityRows ?? 0}, מודעות: ${listings?.normalizedCityRows ?? 0}) — הפאנלים המתוקנים אמורים להציגם.`;
  }

  return { city: cityRaw.trim(), cityNormalized: normCityKb(cityRaw), tables, rootCause, verdict };
}
