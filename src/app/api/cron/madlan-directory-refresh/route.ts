import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshCityDirectory, DIRECTORY_RUN_SOURCE, directoryEnvStatus } from "@/lib/brokerage-data/city-directory";

export const runtime = "nodejs";
export const maxDuration = 300;

const SOFT_BUDGET_MS = 250_000;

/**
 * MADLAN DIRECTORY REFRESH (Vercel Cron — DAILY `30 3 * * *`).
 *
 * CADENCE RATIONALE: office membership changes far more slowly than listing
 * inventory, so the directory refreshes DAILY while the hourly market-watch
 * (`external-listings-sync`, a SEPARATE gate — not touched here) keeps listing
 * activity fresh. Directory = WHO EXISTS · Hourly Watch = WHAT CHANGED. This
 * keeps provider load minimal and avoids re-fetching a slow-moving directory
 * every hour.
 *
 * Refreshes the directory for each city ZONO actively operates in (distinct
 * active external_listings cities), stalest-first, time-boxed, per-city run rows
 * in `zono_orchestrator_runs` (source=madlan-directory-refresh). If no sanctioned
 * directory actor is wired the per-city run finalizes as `blocked` (honest — no
 * fabrication, no writes). Secured by CRON_SECRET.
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
    // Operating territories = distinct cities in ACTIVE external listings.
    const { data } = await db.from("external_listings")
      .select("city,status").eq("status", "active").limit(50000);
    const cities = Array.from(new Set(
      ((data ?? []) as { city: string | null }[]).map((r) => (r.city ?? "").trim()).filter(Boolean),
    ));

    // Stalest-first: order cities by their last directory run (oldest first).
    const ordered = await orderByStalestDirectoryRun(db, cities);

    const results: unknown[] = [];
    let processed = 0;
    for (const city of ordered) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) break; // time-box; rest tomorrow
      const r = await refreshCityDirectory(null, city, "scheduled_cron");
      results.push({ city, status: r.status, offices: r.officesDiscovered, agents: r.agentsDiscovered, persisted: r.officesInserted + r.officesUpdated });
      processed++;
    }

    return NextResponse.json({
      ok: true, source: DIRECTORY_RUN_SOURCE, env: directoryEnvStatus(),
      citiesTotal: ordered.length, processed, skipped: ordered.length - processed,
      durationMs: Date.now() - startedAt, results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}

async function orderByStalestDirectoryRun(db: ReturnType<typeof createServiceRoleClient>, cities: string[]): Promise<string[]> {
  if (cities.length <= 1) return cities;
  try {
    const { data } = await db.from("zono_orchestrator_runs")
      .select("started_at,metadata").eq("source", DIRECTORY_RUN_SOURCE)
      .order("started_at", { ascending: false }).limit(5000);
    const lastByCity = new Map<string, number>();
    for (const r of (data ?? []) as { started_at: string; metadata: Record<string, unknown> | null }[]) {
      const city = String(r.metadata?.locality ?? "").trim();
      if (city && !lastByCity.has(city)) lastByCity.set(city, new Date(r.started_at).getTime());
    }
    return [...cities].sort((a, b) => (lastByCity.get(a) ?? 0) - (lastByCity.get(b) ?? 0));
  } catch {
    return cities;
  }
}
