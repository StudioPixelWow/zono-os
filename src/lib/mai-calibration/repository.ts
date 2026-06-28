// ============================================================================
// Self-Learning & Model Calibration™ — MAI-13 repository (server-only).
//
// Pure data access: reads each MAI model's historical predictions + the later
// observed evidence and assembles the engine's ModelEvalInput per model. No
// metric logic here — that lives in engine.ts (pure). Honest by construction:
// a model with no resolvable evidence yields an empty input (the engine reports
// "not enough evidence"); nothing is fabricated. Also upserts computed rows.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ModelEvalInput, PredictionSample, MAIModelName } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const DAY_MS = 86_400_000;

/** A prediction's positive belief = "this listing will leave the market / be accepted". */
const POSITIVE_PREDICTION = new Set(["LIKELY_ACCEPTED", "LIKELY_MARKET_EXIT", "OFFICIAL_TRANSACTION_FOUND"]);
/** Observed positive = the listing actually left the market later. */
const POSITIVE_OBSERVED = new Set(["LIKELY_SOLD", "LIKELY_REMOVED", "DISAPPEARED"]);

interface ScoreRow {
  provider: string; external_id: string; model_version: string | null;
  classification: string; calculated_at: string;
  market_exit_confidence: number | null; market_acceptance_confidence: number | null; market_rejection_confidence: number | null;
}
interface LifecycleRow { provider: string; external_id: string; current_state: string }

/**
 * Assemble per-model evaluation inputs for one org over an observation window.
 * `windowDays` = how long ago a prediction must be to count as observable.
 */
export async function gatherCalibrationInputs(organizationId: string, windowDays: number): Promise<ModelEvalInput[]> {
  const db = createServiceRoleClient() as Db;
  const cutoff = new Date(Date.now() - windowDays * DAY_MS).toISOString();

  // ── MARKET_ACCEPTANCE — real binary classifier ────────────────────────────
  const { data: scoreData } = await db
    .from("market_acceptance_scores" as never)
    .select("provider,external_id,model_version,classification,calculated_at,market_exit_confidence,market_acceptance_confidence,market_rejection_confidence")
    .eq("organization_id", organizationId)
    .lte("calculated_at", cutoff)   // only predictions old enough to have an outcome
    .limit(100000);
  const scores = (scoreData ?? []) as unknown as ScoreRow[];

  const { data: lifeData } = await db
    .from("market_listing_lifecycle" as never)
    .select("provider,external_id,current_state")
    .eq("organization_id", organizationId)
    .limit(100000);
  const lifecycle = new Map<string, string>();
  for (const r of (lifeData ?? []) as unknown as LifecycleRow[]) lifecycle.set(`${r.provider}::${r.external_id}`, r.current_state);

  const acceptanceSamples: PredictionSample[] = [];
  let acceptanceModelVersion = "unknown";
  for (const s of scores) {
    const observed = lifecycle.get(`${s.provider}::${s.external_id}`);
    if (!observed) continue;                       // no later evidence to validate against
    if (s.classification === "UNCERTAIN") continue; // model abstained → not a prediction
    if (s.model_version) acceptanceModelVersion = s.model_version;
    const predictedPositive = POSITIVE_PREDICTION.has(s.classification);
    const observedPositive = POSITIVE_OBSERVED.has(observed);
    const conf = predictedPositive
      ? (s.market_acceptance_confidence ?? s.market_exit_confidence ?? 50)
      : (s.market_rejection_confidence ?? 50);
    acceptanceSamples.push({ predictedPositive, observedPositive, confidence: Number(conf) || 50 });
  }

  // ── Stability series for snapshot models (honest: usually short → empty) ───
  const zoneSeries = await snapshotSeries(db, organizationId, "broker_gap_analysis", "broker_id", "generated_at", "zone_dominance_score");
  const gapStrength = await snapshotSeries(db, organizationId, "broker_gap_analysis", "broker_id", "generated_at", "confidence");
  const dnaSeries = await snapshotSeries(db, organizationId, "broker_winning_dna", "broker_id", "generated_at", "confidence");
  const coachSeries = await snapshotSeries(db, organizationId, "broker_ai_coaching", "broker_id", "generated_at", "overall_confidence");
  const valuationSeries = await snapshotSeries(db, organizationId, "valuation_weight_results", "segment_key", "calculated_at", "confidence");

  // ── GROWTH_STRATEGY — observational improvement (no causation claim) ───────
  const { data: stratData } = await db
    .from("broker_growth_strategy" as never)
    .select("broker_id,expected_improvement,generated_at")
    .eq("organization_id", organizationId)
    .limit(60000);
  const strategyObservations = ((stratData ?? []) as unknown as { broker_id: string; expected_improvement: number | null }[])
    .filter((r) => r.expected_improvement != null)
    .map((r) => ({ metric: "zone_dominance" as const, delta: Number(r.expected_improvement), improved: Number(r.expected_improvement) > 0 }));

  const mk = (modelName: MAIModelName, modelVersion: string, samples: PredictionSample[], series: number[][], extra?: Partial<ModelEvalInput>): ModelEvalInput =>
    ({ modelName, modelVersion, evaluationWindowDays: windowDays, samples, stabilitySeries: series, ...extra });

  return [
    mk("MARKET_ACCEPTANCE", acceptanceModelVersion, acceptanceSamples, []),
    mk("GAP_ANALYSIS", "mai-10.0", [], gapStrength),
    mk("WINNING_DNA", "mai-9.0", [], dnaSeries),
    mk("BROKER_COACH", "mai-11.0", [], coachSeries),
    mk("GROWTH_STRATEGY", "mai-12.0", [], [], { strategyObservations }),
    mk("ZONE_DOMINANCE", "mai-10.0", [], zoneSeries),
    mk("VALUATION_WEIGHT", "mai-5.0", [], valuationSeries),
  ];
}

/**
 * Build per-entity numeric series ordered by time, for stability/drift. Returns
 * only series with ≥2 points (single snapshots can't measure drift). Best-effort
 * — a missing column simply yields no series (honest "not enough evidence").
 */
async function snapshotSeries(
  db: Db, organizationId: string, table: string, entityCol: string, orderCol: string, valueCol: string,
): Promise<number[][]> {
  try {
    const { data } = await db
      .from(table as never)
      .select(`${entityCol},${orderCol},${valueCol}`)
      .eq("organization_id", organizationId)
      .limit(100000);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const byEntity = new Map<string, { order: string; value: number }[]>();
    for (const r of rows) {
      const entity = r[entityCol] == null ? null : String(r[entityCol]);
      const value = typeof r[valueCol] === "number" ? (r[valueCol] as number) : null;
      const order = r[orderCol] == null ? "" : String(r[orderCol]);
      if (!entity || value == null) continue;
      const arr = byEntity.get(entity) ?? [];
      arr.push({ order, value });
      byEntity.set(entity, arr);
    }
    const out: number[][] = [];
    for (const arr of byEntity.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.order.localeCompare(b.order));
      out.push(arr.map((x) => x.value));
    }
    return out;
  } catch {
    return []; // unknown column/table → no series (honest)
  }
}

/** Upsert computed calibration rows (conflict-keyed by model + version + window). */
export async function upsertCalibrationRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = createServiceRoleClient() as Db;
  for (let i = 0; i < rows.length; i += 500) {
    try {
      await db
        .from("mai_model_calibration" as never)
        .upsert(rows.slice(i, i + 500) as never, { onConflict: "organization_id,model_name,model_version,evaluation_window_days" });
    } catch { /* best-effort — retried on the next evaluation */ }
  }
}
