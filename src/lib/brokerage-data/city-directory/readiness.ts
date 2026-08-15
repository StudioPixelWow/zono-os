// ============================================================================
// 🗺️ City Intelligence Readiness — the ONE canonical resolver for on-demand
// city bootstrap (server-only, read-only). Deterministic states, computed from
// EXISTING infra only (zono_orchestrator_runs directory ledger + System-B
// counts). NO migration. READY means real reconciled coverage — never a first
// WebFetch sample.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sameCity } from "../normalize";
import { DIRECTORY_RUN_SOURCE } from "./observability";

export type CityReadinessState =
  | "MISSING"                     // no useful city intelligence exists
  | "BUILDING"                    // a bootstrap is actively progressing (fresh heartbeat)
  | "PARTIAL"                     // real usable data, coverage known-incomplete
  | "READY"                       // coverage reconciled to source + baseline exists
  | "STALE"                       // prior data exists, refresh overdue
  | "FAILED_RETRYABLE"            // temporary source/network failure
  | "PROVIDER_CAPABILITY_REQUIRED"; // current mechanism cannot finish full coverage

export type ProviderCapability = "OK" | "FULL_CRAWLER_REQUIRED";

export interface CityReadiness {
  locality: string;
  state: CityReadinessState;
  providerCapability: ProviderCapability;
  sourceReportedOffices: number | null;
  officesPersisted: number;
  agentsPersisted: number;
  relationshipsPersisted: number;
  agentsUnresolved: number;
  coveragePercent: number | null;   // null when source total unknown
  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastHeartbeatFresh: boolean;
  isStale: boolean;
  reason: string;
}

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const BUILDING_HEARTBEAT_MS = 20 * 60 * 1000;   // a running run seen within this = BUILDING
const STALE_TTL_MS = 7 * 24 * 3_600_000;        // directory refresh overdue after a week
const cityStem = (c: string) => c.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? c.trim();

/** THE canonical readiness resolver. Deterministic; reads existing infra only. */
export async function getCityIntelligenceReadiness(localityRaw: string): Promise<CityReadiness> {
  const locality = localityRaw.trim();
  const db = createServiceRoleClient();
  const stem = cityStem(locality);

  // Latest directory run for this city (single source of job truth).
  let latest: Row | null = null;
  try {
    const { data } = await db.from("zono_orchestrator_runs")
      .select("status,started_at,finished_at,metadata")
      .eq("source", DIRECTORY_RUN_SOURCE).order("started_at", { ascending: false }).limit(200);
    latest = ((data ?? []) as Row[]).find((r) => s((r.metadata as Row | null)?.locality) === locality) ?? null;
  } catch { /* best-effort */ }

  // Persisted directory counts for this city (System-B).
  const [offRes, agRes] = await Promise.all([
    db.from("brokerage_offices" as never).select("id,city,metadata").ilike("city", `%${stem}%`).limit(20000),
    db.from("brokerage_agents" as never).select("id,city,office_id,metadata").ilike("city", `%${stem}%`).limit(20000),
  ]);
  const isDir = (r: Row) => s((r.metadata as Row | null)?.source) === "madlan_directory";
  const offices = ((offRes.data ?? []) as Row[]).filter((r) => isDir(r) && sameCity(s(r.city), locality));
  const agents = ((agRes.data ?? []) as Row[]).filter((r) => isDir(r) && sameCity(s(r.city), locality));
  const officesPersisted = offices.length;
  const agentsPersisted = agents.length;
  const agentsUnresolved = agents.filter((a) => !s(a.office_id)).length;
  const relationshipsPersisted = agents.filter((a) => !!s(a.office_id)).length;

  const md = (latest?.metadata as Row | null) ?? {};
  const sourceReportedOffices = num(md.source_total_offices);
  const sourceExhausted = md.source_exhausted === true;
  const lastRunStatus = latest ? s(latest.status) : null;
  const lastRunAt = latest ? s(latest.started_at) : null;
  const heartbeatMs = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : Infinity;
  const lastHeartbeatFresh = heartbeatMs < BUILDING_HEARTBEAT_MS;
  const isStale = officesPersisted > 0 && heartbeatMs > STALE_TTL_MS;
  const coveragePercent = sourceReportedOffices ? Math.min(100, Math.round((officesPersisted / sourceReportedOffices) * 100)) : null;

  const reconciled = sourceExhausted || (sourceReportedOffices != null && officesPersisted >= sourceReportedOffices);
  // WebFetch (limited discovery) can't finish large cities; if coverage is
  // known-incomplete we require the full crawler to reach READY.
  const providerCapability: ProviderCapability =
    officesPersisted > 0 && !reconciled ? "FULL_CRAWLER_REQUIRED" : "OK";

  let state: CityReadinessState;
  let reason: string;
  if (lastRunStatus === "running" && lastHeartbeatFresh) {
    state = "BUILDING"; reason = "בוטסטראפ פעיל מתקדם ברקע";
  } else if (officesPersisted === 0) {
    if (lastRunStatus === "failed" || lastRunStatus === "timed_out") { state = "FAILED_RETRYABLE"; reason = "כשל זמני במקור — יתבצע ניסיון חוזר"; }
    else if (lastRunStatus === "blocked") { state = "PROVIDER_CAPABILITY_REQUIRED"; reason = "נדרש קראולר מלא לאיסוף המדריך (מנגנון נוכחי אינו משלים כיסוי)"; }
    else { state = "MISSING"; reason = "אין עדיין מודיעין עיר — יש להתחיל בוטסטראפ"; }
  } else if (reconciled) {
    state = "READY"; reason = "כיסוי המדריך הושלם ואומת מול המקור";
  } else if (isStale) {
    state = "STALE"; reason = "קיים מידע חלקי — נדרש רענון";
  } else {
    state = "PARTIAL";
    reason = sourceReportedOffices
      ? `זוהו ${officesPersisted} מתוך ${sourceReportedOffices} משרדים — המידע ממשיך להיבנות`
      : `זוהו ${officesPersisted} משרדים — המידע ממשיך להיבנות`;
  }

  return {
    locality, state, providerCapability, sourceReportedOffices, officesPersisted, agentsPersisted,
    relationshipsPersisted, agentsUnresolved, coveragePercent, lastRunStatus, lastRunAt, lastHeartbeatFresh, isStale, reason,
  };
}

/** Platform-Admin national rollup: readiness for every city with a directory run. */
export async function getNationalDirectoryStatus(): Promise<CityReadiness[]> {
  const db = createServiceRoleClient();
  const cities = new Set<string>();
  try {
    const { data } = await db.from("zono_orchestrator_runs").select("metadata")
      .eq("source", DIRECTORY_RUN_SOURCE).order("started_at", { ascending: false }).limit(20000);
    for (const r of (data ?? []) as Row[]) { const c = s((r.metadata as Row | null)?.locality).trim(); if (c) cities.add(c); }
  } catch { /* best-effort */ }
  const out: CityReadiness[] = [];
  for (const c of cities) out.push(await getCityIntelligenceReadiness(c));
  return out.sort((a, b) => (b.sourceReportedOffices ?? 0) - (a.sourceReportedOffices ?? 0));
}

/** Is a bootstrap already in flight for this city? (single-flight guard) */
export async function isCityBootstrapInFlight(locality: string): Promise<boolean> {
  const r = await getCityIntelligenceReadiness(locality);
  return r.state === "BUILDING";
}
