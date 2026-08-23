import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshCityDirectory, DIRECTORY_RUN_SOURCE, directoryEnvStatus } from "@/lib/brokerage-data/city-directory";
import { canonicalLocality } from "@/lib/geo/locality";

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
    const { cities: candidates, coverage } = await selectNationalCities(db);

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
      // Territory coverage observability — is every org's operating territory covered,
      // and is the remaining gap bounded (never-covered territory cities lead the queue)?
      territoryCoverage: coverage,
      deferredDueToBudget: deferred, remainingBudgetMs: Math.max(0, SOFT_STOP_MS - (Date.now() - startedAt)),
      durationMs: Date.now() - startedAt, results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}

interface TerritoryCoverage {
  territoryCities: number;   // distinct canonical localities across ALL orgs' territories
  covered: number;           // territory localities with ≥1 prior directory run
  pending: number;           // territory localities never covered (lead the queue)
  pendingSample: string[];   // up to 10 pending territory cities (observability)
}

/**
 * Prioritized, deduped, stalest-first candidate cities. Generic — derived from
 * data (territories, activity, localities), never a hardcoded list. Coverage is
 * NOT left to crawl order: every org's operating localities are Tier 0, canonically
 * deduped (so a locality in any script/spelling is ONE crawl target and its prior
 * runs are attributed correctly), and NEVER-covered territory cities always lead
 * the queue — so a new org's territory is fully covered within a bounded window
 * regardless of the national backlog. Returns a coverage summary for observability.
 */
async function selectNationalCities(db: DB): Promise<{ cities: string[]; coverage: TerritoryCoverage }> {
  // Last directory-run + emptiness per CANONICAL locality (so קרית ביאליק /
  // "Kiryat Bialik" / קריית ביאליק share one coverage record — no double-crawl,
  // no coverage gap hidden by a spelling variant).
  const lastRunByKey = new Map<string, number>();
  const emptyRecently = new Set<string>();
  try {
    const { data } = await db.from("zono_orchestrator_runs")
      .select("started_at,metadata").eq("source", DIRECTORY_RUN_SOURCE)
      .order("started_at", { ascending: false }).limit(20000);
    for (const r of (data ?? []) as { started_at: string; metadata: Record<string, unknown> | null }[]) {
      const key = canonicalLocality(s(r.metadata?.locality).trim());
      if (!key) continue;
      const t = new Date(r.started_at).getTime();
      if (!lastRunByKey.has(key)) {
        lastRunByKey.set(key, t);
        const offices = Number(r.metadata?.offices_discovered ?? 0);
        if (offices === 0 && Date.now() - t < NO_DIRECTORY_TTL_MS) emptyRecently.add(key);
      }
    }
  } catch { /* best-effort */ }

  // For each canonical key we keep the best DISPLAY name to actually crawl
  // (territory Hebrew name preferred), its tier, and whether it is a territory city.
  const byKey = new Map<string, { display: string; tier: number }>();
  const territoryKeys = new Set<string>();
  const consider = (raw: string | null | undefined, tier: number) => {
    const display = (raw ?? "").trim();
    if (!display) return;
    const key = canonicalLocality(display);
    if (!key) return;
    if (tier === 0) territoryKeys.add(key);
    const prev = byKey.get(key);
    // Lower tier wins the slot; within a tier the first (territory Hebrew) display sticks.
    if (!prev || tier < prev.tier) byKey.set(key, { display, tier });
  };

  // Tier 0 — ZONO operating territories (always refresh; never skipped as empty).
  try {
    const { data: ool } = await db.from("organization_operating_localities").select("locality_id").limit(5000);
    const ids = ((ool ?? []) as { locality_id: string }[]).map((r) => r.locality_id).filter(Boolean);
    if (ids.length) {
      const { data: locs } = await db.from("israel_localities").select("name_he").in("id", ids);
      for (const l of (locs ?? []) as { name_he: string }[]) consider(l.name_he, 0);
    }
  } catch { /* best-effort */ }

  // Tier 1 — cities with active listing activity.
  try {
    const { data } = await db.from("external_listings").select("city,status").eq("status", "active").limit(50000);
    for (const r of (data ?? []) as { city: string | null }[]) consider(r.city, 1);
  } catch { /* best-effort */ }

  // Tier 2 — all active localities (rolling national coverage).
  try {
    const { data } = await db.from("israel_localities").select("name_he,is_active").eq("is_active", true).limit(5000);
    for (const r of (data ?? []) as { name_he: string | null }[]) consider(r.name_he, 2);
  } catch { /* best-effort */ }

  const candidates: { key: string; display: string; tier: number }[] = [];
  for (const [key, { display, tier }] of byKey) {
    // Skip localities recently found to have no directory — EXCEPT territories.
    if (tier !== 0 && emptyRecently.has(key)) continue;
    candidates.push({ key, display, tier });
  }

  candidates.sort((a, b) =>
    (a.tier - b.tier) ||
    ((lastRunByKey.get(a.key) ?? 0) - (lastRunByKey.get(b.key) ?? 0)) || // never-run / stalest first
    a.display.localeCompare(b.display),
  );

  // Coverage summary: how many territory localities are covered vs pending.
  let covered = 0;
  const pendingSample: string[] = [];
  for (const key of territoryKeys) {
    if ((lastRunByKey.get(key) ?? 0) > 0) covered++;
    else if (pendingSample.length < 10) pendingSample.push(byKey.get(key)?.display ?? key);
  }
  const coverage: TerritoryCoverage = {
    territoryCities: territoryKeys.size, covered,
    pending: territoryKeys.size - covered, pendingSample,
  };

  return { cities: candidates.map((c) => c.display), coverage };
}
