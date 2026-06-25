// ============================================================================
// ZONO — Health Center service (server-only). Probes each platform component
// and feeds the PURE health module (statusFromLatency / buildHealthReport).
// Probes are lightweight + non-invasive: a DB latency ping and configuration
// presence checks. Components we can't cheaply determine report "unknown" with
// an explanatory detail — never a false "healthy".
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildHealthReport, statusFromLatency } from "../health/health";
import { buildPlatformAlerts } from "../alerts/alerts";
import { createLogger } from "../logging/logger";
import type { HealthComponent, HealthReport, PlatformAlert, CircuitSnapshot } from "../types";

const log = createLogger({ module: "health" });

function envSet(...keys: string[]): boolean { return keys.every((k) => !!process.env[k]); }

/** Ping the database and measure round-trip latency. */
async function probeDatabase(): Promise<HealthComponent> {
  const t0 = Date.now();
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from("organizations").select("id", { count: "exact", head: true }).limit(1);
    const latencyMs = Date.now() - t0;
    if (error) return { key: "database", label: "Supabase Database", status: "critical", detail: error.message, latencyMs };
    return { key: "database", label: "Supabase Database", status: statusFromLatency(latencyMs), latencyMs };
  } catch (e) {
    log.error("db_probe_failed", { error: e instanceof Error ? e.message : String(e) });
    return { key: "database", label: "Supabase Database", status: "critical", detail: "החיבור נכשל", latencyMs: null };
  }
}

/** Configuration-presence probe → healthy when configured, otherwise unknown. */
function configProbe(key: string, label: string, configured: boolean, missingDetail: string): HealthComponent {
  return configured
    ? { key, label, status: "healthy", latencyMs: null }
    : { key, label, status: "unknown", detail: missingDetail, latencyMs: null };
}

/**
 * Build the full Health Center report. Optionally include circuit snapshots and
 * operational signals so the page can render alerts in one pass.
 */
export async function buildSystemHealth(signals?: {
  circuits?: CircuitSnapshot[];
  deadLetterCount?: number;
  queueDepth?: number;
  errorRatePct?: number;
}): Promise<{ report: HealthReport; alerts: PlatformAlert[]; circuits: CircuitSnapshot[] }> {
  const database = await probeDatabase();

  const components: HealthComponent[] = [
    database,
    { key: "realtime", label: "Realtime", status: envSet("NEXT_PUBLIC_SUPABASE_URL") ? "healthy" : "unknown", detail: envSet("NEXT_PUBLIC_SUPABASE_URL") ? undefined : "לא מוגדר", latencyMs: null },
    configProbe("cron", "Cron", envSet("CRON_SECRET"), "CRON_SECRET לא מוגדר"),
    configProbe("providers", "Provider Status (Apify)", envSet("APIFY_TOKEN"), "APIFY_TOKEN לא מוגדר — מצב mock"),
    { key: "queues", label: "Queues", status: database.status === "critical" ? "warning" : "healthy", detail: database.status === "critical" ? "תלוי במסד הנתונים" : undefined, latencyMs: null },
    configProbe("ai", "AI Providers", envSet("OPENAI_API_KEY") || envSet("ANTHROPIC_API_KEY") || envSet("GEMINI_API_KEY"), "מפתח AI לא מוגדר — סיכומים מושבתים"),
    { key: "journey", label: "Journey Engine", status: database.status === "critical" ? "warning" : "healthy", detail: "מנוע דטרמיניסטי", latencyMs: null },
    { key: "property_radar", label: "Property Radar", status: database.status === "critical" ? "warning" : "healthy", latencyMs: null },
    { key: "shared_cache", label: "Shared Market Cache", status: database.status === "critical" ? "warning" : "healthy", latencyMs: null },
    { key: "office_intelligence", label: "Office Intelligence", status: database.status === "critical" ? "warning" : "healthy", latencyMs: null },
    { key: "storage", label: "Storage", status: envSet("NEXT_PUBLIC_SUPABASE_URL") ? "healthy" : "unknown", detail: envSet("NEXT_PUBLIC_SUPABASE_URL") ? undefined : "לא מוגדר", latencyMs: null },
  ];

  const report = buildHealthReport(components);
  const circuits = signals?.circuits ?? [];
  const alerts = buildPlatformAlerts({
    components,
    circuits,
    deadLetterCount: signals?.deadLetterCount ?? 0,
    queueDepth: signals?.queueDepth ?? 0,
    errorRatePct: signals?.errorRatePct ?? 0,
  });
  return { report, alerts, circuits };
}
