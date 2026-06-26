// ============================================================================
// ZI Expert™ Diagnostics — repository (Phase 24, SERVER-ONLY).
// Collects a BOUNDED, NON-SENSITIVE signal snapshot (all org-scoped via RLS) and
// persists diagnostic runs. Env values are reduced to presence booleans only —
// never the secret value. ZI never reads another org's data, secrets, or raw
// provider payloads. Every query is defensive: failures degrade to safe defaults.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/dashboard/context";
import type { DiagnosticInput, DiagnosticResult, DiagnosticSignals, RoleKey } from "./diagnostic-types";

type Db = Awaited<ReturnType<typeof createClient>>;
const ROLE_KEYS: RoleKey[] = ["viewer", "agent", "manager", "admin", "owner"];
const asRoleKey = (k: string | null): RoleKey | null => (k && (ROLE_KEYS as string[]).includes(k) ? (k as RoleKey) : null);
const has = (v: string | undefined | null): boolean => typeof v === "string" && v.trim().length > 0;

/** Count rows for a built query, tolerating any error (→ 0). */
async function safeCount(run: () => PromiseLike<{ count: number | null }>): Promise<number> {
  try { const { count } = await run(); return count ?? 0; } catch { return 0; }
}

/** Env presence only — never the value. */
function envSignals() {
  return {
    hasAiProvider: has(process.env.OPENAI_API_KEY) || has(process.env.ANTHROPIC_API_KEY),
    aiDisabled: has(process.env.ZONO_AI_DISABLED) && process.env.ZONO_AI_DISABLED !== "false" && process.env.ZONO_AI_DISABLED !== "0",
    hasMapsBrowserKey: has(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    hasGeocodeKey: has(process.env.GOOGLE_MAPS_GEOCODE_API_KEY) || has(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    hasApifyToken: has(process.env.APIFY_TOKEN) || has(process.env.APIFY_API_TOKEN),
    hasCronSecret: has(process.env.CRON_SECRET),
  };
}

/** The latest sync job for the org, reduced to a safe summary (error trimmed). */
async function lastSyncSignal(db: Db, orgId: string): Promise<DiagnosticSignals["lastSync"]> {
  try {
    const { data } = await db
      .from("import_jobs")
      .select("status,finished_at,started_at,total_found,error")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const r = data as { status: string; finished_at: string | null; started_at: string | null; total_found: number | null; error: string | null };
    return {
      status: r.status,
      finishedAt: r.finished_at,
      startedAt: r.started_at,
      found: r.total_found ?? 0,
      error: r.error ? r.error.slice(0, 200) : null, // trimmed, never a raw payload
    };
  } catch { return null; }
}

/**
 * Collect the safe signal snapshot for the current org. All counts are
 * org-scoped by RLS; we additionally filter by org_id for clarity/perf.
 */
export async function collectDiagnosticSignals(): Promise<{ signals: DiagnosticSignals; orgId: string; userId: string | null; role: RoleKey | null }> {
  const [session, dash] = await Promise.all([getSessionContext(), getDashboardContext()]);
  if (session.state !== "ready" || !session.profile?.org_id) throw new Error("unauthorized");
  const orgId = session.profile.org_id;
  const userId = session.user?.id ?? null;
  const role = asRoleKey(dash.user?.roleKey ?? null);
  const db = await createClient();

  const [
    operatingAreaCount, lastSync,
    externalActiveCount, externalWithCoords,
    internalPropertyCount, internalWithCoords,
    activeBuyerCount, buyersWithBudget,
    recentNotificationCount,
  ] = await Promise.all([
    userId ? safeCount(() => db.from("user_operating_localities").select("*", { count: "exact", head: true }).eq("user_id", userId)) : Promise.resolve(0),
    lastSyncSignal(db, orgId),
    safeCount(() => db.from("external_listings").select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active")),
    safeCount(() => db.from("external_listings").select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active").not("lat", "is", null)),
    safeCount(() => db.from("properties").select("*", { count: "exact", head: true }).eq("org_id", orgId)),
    safeCount(() => db.from("properties").select("*", { count: "exact", head: true }).eq("org_id", orgId).not("latitude", "is", null)),
    safeCount(() => db.from("buyers").select("*", { count: "exact", head: true }).eq("org_id", orgId)),
    safeCount(() => db.from("buyers").select("*", { count: "exact", head: true }).eq("org_id", orgId).not("budget_max", "is", null)),
    safeCount(() => db.from("notifications").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())),
  ]);

  const signals: DiagnosticSignals = {
    role,
    operatingAreaCount,
    ...envSignals(),
    lastSync,
    externalActiveCount,
    externalWithCoords,
    internalPropertyCount,
    internalWithCoords,
    activeBuyerCount,
    buyersWithBudget,
    recentNotificationCount,
  };
  return { signals, orgId, userId, role };
}

/**
 * Persist a diagnostic run for audit/admin. Best-effort: a logging failure must
 * never break the user's diagnosis. Stores only the redacted support payload +
 * summary fields (no secrets, no raw provider data, no cross-org data).
 */
export async function persistDiagnosticRun(input: DiagnosticInput, result: DiagnosticResult): Promise<void> {
  try {
    const { user, profile, state } = await getSessionContext();
    if (state !== "ready" || !profile?.org_id) return;
    const db = await createClient();
    await db.from("zi_diagnostic_runs").insert({
      organization_id: profile.org_id,
      user_id: user?.id ?? null,
      correlation_id: result.supportPayload.correlationId,
      issue_type: result.issueType,
      status: result.status,
      current_route: input.currentRoute,
      module: input.module,
      summary: result.summary.slice(0, 1000),
      likely_cause: result.likelyCause?.slice(0, 500) ?? null,
      findings: result.findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
      support_payload: result.supportPayload,
      role: result.supportPayload.role,
    });
  } catch { /* logging is best-effort; never block the user */ }
}

export interface DiagnosticRunRow {
  id: string;
  issueType: string;
  status: string;
  summary: string;
  currentRoute: string | null;
  createdAt: string;
}

/** Recent diagnostic runs for the admin page (manager+ via RLS). */
export async function listDiagnosticRuns(limit = 50): Promise<DiagnosticRunRow[]> {
  try {
    const db = await createClient();
    const { data } = await db
      .from("zi_diagnostic_runs")
      .select("id,issue_type,status,summary,current_route,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return ((data as { id: string; issue_type: string; status: string; summary: string; current_route: string | null; created_at: string }[] | null) ?? [])
      .map((r) => ({ id: r.id, issueType: r.issue_type, status: r.status, summary: r.summary, currentRoute: r.current_route, createdAt: r.created_at }));
  } catch { return []; }
}
