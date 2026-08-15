import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshCityDirectory, DIRECTORY_RUN_SOURCE, directoryEnvStatus } from "@/lib/brokerage-data/city-directory";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Hard time-budget (never rely on SIGKILL + next-run recovery as normal) ────
const HARD_LIMIT_MS = 300_000;         // Vercel serverless kill
const SAFETY_MARGIN_MS = 45_000;       // finalize + response headroom
const SOFT_STOP_MS = HARD_LIMIT_MS - SAFETY_MARGIN_MS; // 255s: stop starting cities
const MIN_CITY_BUDGET_MS = 60_000;     // don't START a city we may not finish
const CITIES_PER_RUN = 30;             // per-invocation cap (rolling national coverage)
const NO_DIRECTORY_TTL_MS = 30 * 24 * 3_600_000; // re-attempt empty localities monthly

type DB = ReturnType<typeof createServiceRoleClient>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * NATIONAL MADLAN DIRECTORY REFRESH (Vercel Cron — DAILY `30 3 * * *`).
 *
 * Builds the national office/agent directory city-by-city with SAFE CHUNKING —
 * no single invocation can exceed the serverless limit:
 *   • priority (generic, no hardcoded city list): ZONO operating territories →
 *     cities with active listings → all active israel_localities.
 *   • stalest-first within priority, so nothing starves.
 *   • learns + skips: a locality that returned 0 offices is deprioritized for
 *     NO_DIRECTORY_TTL (avoids re-hitting villages with no Madlan directory).
 *   • hard per-city budget gate: a city is only STARTED when enough budget
 *     remains to finish it; otherwise it is left for the next run (still stalest)
 *     — deferred, NOT failed. Every invocation exits cleanly by application logic.
 *
 * Directory = WHO EXISTS (daily). Hourly market-watch = WHAT CHANGED (separate,
 * untouched). Per-city run rows land in `zono_orchestrator_runs`
 * (source=madlan-directory-refresh). If no sanctioned directory actor is wired,
 * each city finalizes `blocked` (honest — no fabrication, no writes). CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createServiceRoleClient();

  try {
    const candidates = await selectNationalCities(db);

    const results: { city: string; status: string; offices: number; agents: number }[] = [];
    let processed = 0, deferred = 0;
    for (const city of candidates) {
      if (processed >= CITIES_PER_RUN) { deferred = candidates.length - candidates.indexOf(city); break; }
      const remaining = SOFT_STOP_MS - (Date.now() - startedAt);
      if (remaining < MIN_CITY_BUDGET_MS) { deferred = candidates.length - candidates.indexOf(city); break; } // budget-defer the rest
      const r = await refreshCityDirectory(null, city, "scheduled_cron");
      results.push({ city, status: r.status, offices: r.officesDiscovered, agents: r.agentsDiscovered });
      processed++;
    }

    return NextResponse.json({
      ok: true, source: DIRECTORY_RUN_SOURCE, env: directoryEnvStatus(),
      candidatesTotal: candidates.length, processed,
      deferredDueToBudget: deferred, remainingBudgetMs: Math.max(0, SOFT_STOP_MS - (Date.now() - startedAt)),
      durationMs: Date.now() - startedAt, results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}

/**
 * Prioritized, deduped, stalest-first candidate cities. Generic — derived from
 * data (territories, activity, localities), never a hardcoded list.
 */
async function selectNationalCities(db: DB): Promise<string[]> {
  // Last directory-run + emptiness per city (learn which localities have data).
  const lastRunByCity = new Map<string, number>();
  const emptyRecently = new Set<string>();
  try {
    const { data } = await db.from("zono_orchestrator_runs")
      .select("started_at,metadata").eq("source", DIRECTORY_RUN_SOURCE)
      .order("started_at", { ascending: false }).limit(20000);
    for (const r of (data ?? []) as { started_at: string; metadata: Record<string, unknown> | null }[]) {
      const city = s(r.metadata?.locality).trim();
      if (!city) continue;
      const t = new Date(r.started_at).getTime();
      if (!lastRunByCity.has(city)) {
        lastRunByCity.set(city, t);
        const offices = Number(r.metadata?.offices_discovered ?? 0);
        if (offices === 0 && Date.now() - t < NO_DIRECTORY_TTL_MS) emptyRecently.add(city);
      }
    }
  } catch { /* best-effort */ }

  // Tier 1 — ZONO operating territories (always refresh; never skipped as empty).
  const territory = new Set<string>();
  try {
    const { data: ool } = await db.from("organization_operating_localities").select("locality_id").limit(5000);
    const ids = ((ool ?? []) as { locality_id: string }[]).map((r) => r.locality_id).filter(Boolean);
    if (ids.length) {
      const { data: locs } = await db.from("israel_localities").select("name_he").in("id", ids);
      for (const l of (locs ?? []) as { name_he: string }[]) if (l.name_he) territory.add(l.name_he.trim());
    }
  } catch { /* best-effort */ }

  // Tier 2 — cities with active listing activity.
  const activity = new Set<string>();
  try {
    const { data } = await db.from("external_listings").select("city,status").eq("status", "active").limit(50000);
    for (const r of (data ?? []) as { city: string | null }[]) { const c = (r.city ?? "").trim(); if (c) activity.add(c); }
  } catch { /* best-effort */ }

  // Tier 3 — all active localities (rolling national coverage).
  const localities: string[] = [];
  try {
    const { data } = await db.from("israel_localities").select("name_he,is_active").eq("is_active", true).limit(5000);
    for (const r of (data ?? []) as { name_he: string | null }[]) { const c = (r.name_he ?? "").trim(); if (c) localities.push(c); }
  } catch { /* best-effort */ }

  const tierOf = (c: string): number => (territory.has(c) ? 0 : activity.has(c) ? 1 : 2);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of [...territory, ...activity, ...localities]) {
    if (seen.has(c)) continue;
    seen.add(c);
    // Skip localities recently found to have no directory — EXCEPT territories.
    if (tierOf(c) !== 0 && emptyRecently.has(c)) continue;
    candidates.push(c);
  }

  candidates.sort((a, b) =>
    (tierOf(a) - tierOf(b)) ||
    ((lastRunByCity.get(a) ?? 0) - (lastRunByCity.get(b) ?? 0)) || // stalest / never-run first
    a.localeCompare(b),
  );
  return candidates;
}
