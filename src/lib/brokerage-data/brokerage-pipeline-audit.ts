// ============================================================================
// 🧪 Brokerage Discovery Pipeline Audit™ (Phase 26.4.4) — READ-ONLY forensic.
// Measures every stage of the discovery pipeline against the real tables, cross-
// checks repositories, breaks down broker→office links, builds city coverage,
// and flags duplicate spellings. NO writes, NO engine/schema/confidence changes.
// It only counts and reports — it never fixes anything.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAcceptableOfficeName } from "./office-name-guard";
import { normalizeHebrewName } from "./normalize";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

// CORRECT Hebrew city fold (proves the duplicate-spelling problem honestly).
const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function normCityCorrect(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי")                      // CORRECT: double-yod קריית → קרית
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}

export interface PipelineStage { name: string; input: number; output: number; lost: number; lostPct: number; healthPct: number }
export interface RepoCount { repository: string; table: string; rows: number | null; error: string | null }
export interface OfficeLinkRow { officeId: string; office: string; brokers: number; status: string }
export interface CityCoverageRow { city: string; brokersScanned: number; offices: number; candidates: number }
export interface NormDup { normalized: string; spellings: string[]; rows: number }

export interface BrokeragePipelineAudit {
  totals: { brokers: number; researched: number; candidates: number; linkedBrokers: number; officesTotal: number; officesActiveAcceptable: number };
  stages: PipelineStage[];
  weakestStage: string;
  repositories: RepoCount[];
  linkByOffice: OfficeLinkRow[];
  linkedBrokersInOfficeCount: number;
  cityCoverage: CityCoverageRow[];
  cityNormalizationDuplicates: NormDup[];
  officeNameDuplicates: NormDup[];
  contradictions: string[];
  verdict: "OFFICE_EXTRACTION_FAILURE" | "OFFICE_CREATION_FAILURE" | "OFFICE_VERIFICATION_TOO_STRICT" | "CITY_NORMALIZATION_FAILURE" | "REPOSITORY_MISMATCH" | "UI_SHOWING_INCOMPLETE_DATA" | "MULTIPLE_PIPELINE_FAILURES";
  notes: string[];
}

async function headCount(db: ReturnType<typeof createServiceRoleClient>, table: string): Promise<{ rows: number | null; error: string | null }> {
  try {
    const { count, error } = await db.from(table as never).select("id", { count: "exact", head: true });
    if (error) return { rows: null, error: error.message };
    return { rows: count ?? 0, error: null };
  } catch (e) { return { rows: null, error: e instanceof Error ? e.message : String(e) }; }
}

export async function auditBrokerageDiscoveryPipeline(): Promise<BrokeragePipelineAudit> {
  const db = createServiceRoleClient();

  // ── Repository cross-check (head counts) ────────────────────────────────────
  const repoSpecs: { repository: string; table: string }[] = [
    { repository: "Broker Profiles / Workspace", table: "brokerage_agents" },
    { repository: "Office Profiles / Directory / Intelligence", table: "brokerage_offices" },
    { repository: "Office Candidates (Registry)", table: "brokerage_office_candidates" },
    { repository: "Research Workspace (dossiers)", table: "brokerage_research_dossier" },
    { repository: "Broker Identity", table: "brokerage_broker_identity" },
    { repository: "Listing Links", table: "brokerage_external_listing_links" },
    { repository: "External Listings", table: "external_listings" },
  ];
  const repositories: RepoCount[] = [];
  for (const r of repoSpecs) { const c = await headCount(db, r.table); repositories.push({ ...r, rows: c.rows, error: c.error }); }

  // ── Detailed rows for the stage trace + breakdowns ──────────────────────────
  const [agentRes, officeRes, candRes] = await Promise.all([
    db.from("brokerage_agents" as never).select("id,full_name,city,office_id").limit(50000),
    db.from("brokerage_offices" as never).select("id,name,city,status").limit(50000),
    db.from("brokerage_office_candidates" as never).select("office_name,city,status").limit(50000),
  ]);
  let researchedCount = 0;
  try { const { count } = await db.from("brokerage_research_dossier" as never).select("agent_id", { count: "exact", head: true }); researchedCount = count ?? 0; } catch { researchedCount = 0; }

  const agents = (agentRes.data ?? []) as Row[];
  const offices = (officeRes.data ?? []) as Row[];
  const candidates = (candRes.data ?? []) as Row[];

  const brokers = agents.length;
  const linkedBrokers = agents.filter((a) => s(a.office_id)).length;
  const candidatesTotal = candidates.length;
  const officesTotal = offices.length;
  const officesActiveAcceptable = offices.filter((o) => (s(o.status) || "active") === "active" && isAcceptableOfficeName(s(o.name))).length;

  // ── Link breakdown by office (Part 11) ──────────────────────────────────────
  const officeName = new Map<string, { name: string; status: string }>();
  for (const o of offices) officeName.set(s(o.id), { name: s(o.name), status: s(o.status) || "active" });
  const byOffice = new Map<string, number>();
  for (const a of agents) { const oid = s(a.office_id); if (oid) byOffice.set(oid, (byOffice.get(oid) ?? 0) + 1); }
  const linkByOffice: OfficeLinkRow[] = [...byOffice.entries()]
    .map(([oid, n]) => ({ officeId: oid, office: officeName.get(oid)?.name ?? "(משרד לא נמצא)", status: officeName.get(oid)?.status ?? "?", brokers: n }))
    .sort((a, b) => b.brokers - a.brokers);
  const linkedBrokersInOfficeCount = linkByOffice.length;

  // ── Stage trace (Part 1/2/7) ────────────────────────────────────────────────
  const mkStage = (name: string, input: number, output: number): PipelineStage => {
    const lost = Math.max(0, input - output);
    return { name, input, output, lost, lostPct: input > 0 ? Math.round((lost / input) * 100) : 0, healthPct: input > 0 ? Math.round((output / input) * 100) : 0 };
  };
  const base = brokers || 1;
  const stages: PipelineStage[] = [
    mkStage("סריקת מתווכים", brokers, brokers),
    mkStage("מחקר הושלם (dossier)", brokers, researchedCount),
    mkStage("מועמדי משרד נוצרו", brokers, candidatesTotal),
    mkStage("שיוך מתווך↔משרד", brokers, linkedBrokers),
    mkStage("ישויות משרד (פעיל+תקין)", brokers, officesActiveAcceptable),
  ];
  // healthPct relative to the broker base for the visualization
  for (const st of stages) st.healthPct = Math.round((st.output / base) * 100);
  const weakest = [...stages].filter((s2) => s2.name !== "סריקת מתווכים").sort((a, b) => a.healthPct - b.healthPct)[0];

  // ── City coverage (Part 5) ──────────────────────────────────────────────────
  const cityAgg = new Map<string, { city: string; brokers: number; offices: number; candidates: number }>();
  const ckey = (c: string) => normCityCorrect(c) || "(ללא עיר)";
  for (const a of agents) { const k = ckey(s(a.city)); const cur = cityAgg.get(k) ?? { city: s(a.city) || "(ללא עיר)", brokers: 0, offices: 0, candidates: 0 }; cur.brokers++; cityAgg.set(k, cur); }
  for (const o of offices) { if ((s(o.status) || "active") !== "active") continue; const k = ckey(s(o.city)); const cur = cityAgg.get(k) ?? { city: s(o.city) || "(ללא עיר)", brokers: 0, offices: 0, candidates: 0 }; cur.offices++; cityAgg.set(k, cur); }
  for (const c of candidates) { const k = ckey(s(c.city)); const cur = cityAgg.get(k) ?? { city: s(c.city) || "(ללא עיר)", brokers: 0, offices: 0, candidates: 0 }; cur.candidates++; cityAgg.set(k, cur); }
  const cityCoverage: CityCoverageRow[] = [...cityAgg.values()]
    .map((c) => ({ city: c.city, brokersScanned: c.brokers, offices: c.offices, candidates: c.candidates }))
    .sort((a, b) => b.brokersScanned - a.brokersScanned).slice(0, 40);

  // ── Normalization duplicates (Part 6) — report only, never merge ────────────
  const cityDups = findDuplicates(agents.map((a) => s(a.city)).concat(offices.map((o) => s(o.city))), normCityCorrect);
  const officeDups = findDuplicates(offices.map((o) => s(o.name)).concat(candidates.map((c) => s(c.office_name))), (x) => normalizeHebrewName(x));

  // ── Contradictions + verdict (Part 13/14) ───────────────────────────────────
  const contradictions: string[] = [];
  const repoAgents = repositories.find((r) => r.table === "brokerage_agents")?.rows ?? null;
  const repoOffices = repositories.find((r) => r.table === "brokerage_offices")?.rows ?? null;
  if (repoAgents != null && repoAgents !== brokers) contradictions.push(`brokerage_agents head-count=${repoAgents} ≠ scanned rows=${brokers}`);
  if (repoOffices != null && repoOffices !== officesTotal) contradictions.push(`brokerage_offices head-count=${repoOffices} ≠ fetched rows=${officesTotal}`);
  if (officesActiveAcceptable < officesTotal) contradictions.push(`${officesTotal - officesActiveAcceptable} משרדים קיימים אך אינם פעילים/תקינים — אינם מוצגים במדריך (UI מציג חלקי).`);
  if (linkedBrokers > 0 && officesActiveAcceptable <= 2) contradictions.push(`${linkedBrokers} מתווכים משויכים אך רק ${officesActiveAcceptable} משרדים מוצגים — בדוק את פירוט linkByOffice (כמה משרדים שונים באמת).`);

  const notes: string[] = [];
  let verdict: BrokeragePipelineAudit["verdict"];
  const failures: BrokeragePipelineAudit["verdict"][] = [];

  if (cityDups.length > 0) { failures.push("CITY_NORMALIZATION_FAILURE"); notes.push(`${cityDups.length} ערים עם איות כפול (לא ממוזגות) — מפצל ספירות לפי עיר.`); }
  if (officesTotal > officesActiveAcceptable) { failures.push("UI_SHOWING_INCOMPLETE_DATA"); notes.push("יש משרדים שאינם פעילים/תקינים ולכן לא מוצגים — הנתון 'משרדים' בממשק חלקי."); }
  if (linkByOffice.length > officesActiveAcceptable && linkByOffice.length > 2) { failures.push("OFFICE_CREATION_FAILURE"); notes.push(`המתווכים המשויכים מתחלקים ל-${linkByOffice.length} משרדים, אך רק ${officesActiveAcceptable} מוצגים כפעילים — חלק מהמשרדים נוצרו אך אינם פעילים/תקינים.`); }
  if (candidatesTotal > officesTotal * 3 && officesActiveAcceptable <= 3) { failures.push("OFFICE_VERIFICATION_TOO_STRICT"); notes.push(`${candidatesTotal} מועמדים מול ${officesActiveAcceptable} משרדים פעילים — סף האימות מסנן את הרוב.`); }
  if (researchedCount < brokers * 0.5 && candidatesTotal < brokers * 0.3) { failures.push("OFFICE_EXTRACTION_FAILURE"); notes.push("מעט מועמדי משרד נוצרו ביחס למתווכים — חילוץ שמות משרד מהמקור חלש."); }

  if (failures.length === 0) verdict = "UI_SHOWING_INCOMPLETE_DATA";
  else if (failures.length === 1) verdict = failures[0];
  else verdict = "MULTIPLE_PIPELINE_FAILURES";

  return {
    totals: { brokers, researched: researchedCount, candidates: candidatesTotal, linkedBrokers, officesTotal, officesActiveAcceptable },
    stages, weakestStage: weakest?.name ?? "—",
    repositories, linkByOffice: linkByOffice.slice(0, 30), linkedBrokersInOfficeCount,
    cityCoverage, cityNormalizationDuplicates: cityDups.slice(0, 20), officeNameDuplicates: officeDups.slice(0, 20),
    contradictions, verdict, notes,
  };
}

function findDuplicates(values: string[], normalize: (v: string) => string): NormDup[] {
  const groups = new Map<string, { spellings: Set<string>; rows: number }>();
  for (const v of values) {
    const raw = (v ?? "").trim();
    if (!raw) continue;
    const key = normalize(raw);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Set<string>(), rows: 0 };
    g.spellings.add(raw); g.rows++; groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.spellings.size > 1)
    .map(([normalized, g]) => ({ normalized, spellings: [...g.spellings], rows: g.rows }))
    .sort((a, b) => b.rows - a.rows);
}
