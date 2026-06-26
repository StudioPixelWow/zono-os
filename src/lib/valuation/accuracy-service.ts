// ============================================================================
// ZONO — Valuation accuracy service (server-only). Records completed-transaction
// outcomes as training data, aggregates real accuracy per area, and provides the
// bounded calibration factor the valuation service applies to future estimates.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  computeError, aggregateAccuracy, calibrationFactor, buildEstimatedAccuracy, negotiationPercent,
  type AccuracyPoint,
} from "./accuracy";
import type { EstimatedAccuracy } from "./types";

const TABLE = "valuation_accuracy";
const VERSION = "avm-v2";

async function ctx() {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");
  const db = await createClient();
  return { db, orgId: profile.org_id };
}

export interface ValuationOutcomeInput {
  valuationId?: string | null;
  propertyId?: string | null;
  dealId?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  propertyType?: string | null;
  predictedValue: number;
  actualValue: number;       // final selling price
  askingPrice?: number | null;
  builtSqm?: number | null;
  daysOnMarket?: number | null;
  showings?: number | null;
  offers?: number | null;
  marketingChannels?: string[];
  propertyFeatures?: Record<string, unknown>;
  marketConditions?: Record<string, unknown>;
  confidenceAtPrediction?: number | null;
}

/**
 * Record a completed transaction as training data: predicted vs actual + the
 * deal context, with the prediction error computed. Idempotent-ish per deal:
 * re-recording the same deal+valuation replaces the prior row.
 */
export async function recordValuationOutcome(input: ValuationOutcomeInput): Promise<{ accuracyPercent: number; percentageError: number } | null> {
  const { db, orgId } = await ctx();
  if (!(input.predictedValue > 0) || !(input.actualValue > 0)) return null;
  const err = computeError(input.predictedValue, input.actualValue);
  const sqm = input.builtSqm && input.builtSqm > 0 ? input.builtSqm : null;

  const row = {
    organization_id: orgId, valuation_id: input.valuationId ?? null, property_id: input.propertyId ?? null,
    deal_id: input.dealId ?? null, city: input.city ?? null, neighborhood: input.neighborhood ?? null,
    property_type: input.propertyType ?? null,
    predicted_value: input.predictedValue, actual_value: input.actualValue,
    difference: err.difference, percentage_error: err.percentageError, accuracy_percent: err.accuracyPercent,
    predicted_ppsqm: sqm ? Math.round(input.predictedValue / sqm) : null,
    actual_ppsqm: sqm ? Math.round(input.actualValue / sqm) : null,
    asking_price: input.askingPrice ?? null, final_price: input.actualValue,
    negotiation_percent: negotiationPercent(input.askingPrice, input.actualValue),
    days_on_market: input.daysOnMarket ?? null, showings: input.showings ?? null, offers: input.offers ?? null,
    marketing_channels: input.marketingChannels ?? [], property_features: input.propertyFeatures ?? {},
    market_conditions: input.marketConditions ?? {}, algorithm_version: VERSION,
    confidence_at_prediction: input.confidenceAtPrediction ?? null,
  };

  // Replace any prior row for the same deal (keeps the loop idempotent).
  if (input.dealId) await db.from(TABLE as never).delete().eq("organization_id", orgId).eq("deal_id", input.dealId);
  const { error } = await db.from(TABLE as never).insert(row as never);
  if (error) throw new Error(error.message);
  return { accuracyPercent: err.accuracyPercent, percentageError: err.percentageError };
}

async function loadPoints(city?: string | null): Promise<{ points: AccuracyPoint[] }> {
  const { db, orgId } = await ctx();
  let req = db.from(TABLE as never).select("predicted_value,actual_value").eq("organization_id", orgId).limit(2000);
  if (city) req = req.eq("city", city);
  const { data } = await req;
  const points: AccuracyPoint[] = ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ predicted: Number(r.predicted_value ?? 0), actual: Number(r.actual_value ?? 0) }))
    .filter((p) => p.predicted > 0 && p.actual > 0);
  return { points };
}

/** Estimated accuracy summary for an area (Hebrew text + % + sample size). */
export async function getCityAccuracy(city?: string | null): Promise<EstimatedAccuracy> {
  const { points } = await loadPoints(city);
  return buildEstimatedAccuracy(city ?? null, aggregateAccuracy(points));
}

/** Bounded calibration factor + the estimated-accuracy summary for a city. */
export async function getCityCalibration(city?: string | null): Promise<{ factor: number; estimatedAccuracy: EstimatedAccuracy }> {
  const { points } = await loadPoints(city);
  const agg = aggregateAccuracy(points);
  return { factor: calibrationFactor(agg), estimatedAccuracy: buildEstimatedAccuracy(city ?? null, agg) };
}
