// ============================================================================
// ZONO Price Intelligence — service layer (server-only orchestration).
// Creates/updates valuations, runs the engine over REAL evidence, persists the
// comparables / adjustments / market snapshot / broker-sold rows, and builds the
// seller-facing report. All org-scoped via the session profile + RLS.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { gatherEvidence, getBrokerSoldProperties } from "./providers";
import type { ProviderResult } from "./providers";
import { runValuation as runEngine, normalizeInput } from "./valuation-engine";
import type {
  ValuationInput, ValuationRecord, ValuationResult, Comparable, BrokerSoldProperty,
  MarketSnapshot, ValuationAdjustment,
} from "./types";

const TABLE = "property_valuations";
const PROVIDER_LIMIT = 60;

async function ctx() {
  const { profile, user } = await getSessionContext();
  if (!profile?.org_id || !user) throw new Error("אין הרשאה.");
  const db = await createClient();
  return { db, orgId: profile.org_id, userId: user.id };
}

// ── input <-> row mapping ─────────────────────────────────────────────────────
function inputToRow(i: ValuationInput): Record<string, unknown> {
  return {
    city: i.city ?? null, neighborhood: i.neighborhood ?? null, street: i.street ?? null,
    house_number: i.houseNumber ?? null, apartment_number: i.apartmentNumber ?? null,
    latitude: i.latitude ?? null, longitude: i.longitude ?? null,
    property_type: i.propertyType ?? null, rooms: i.rooms ?? null, built_sqm: i.builtSqm ?? null,
    balcony_sqm: i.balconySqm ?? null, garden_sqm: i.gardenSqm ?? null,
    floor: i.floor ?? null, total_floors: i.totalFloors ?? null,
    elevator: i.elevator ?? null, parking_count: i.parkingCount ?? null,
    storage: i.storage ?? null, mamad: i.mamad ?? null, renovated: i.renovated ?? null,
    property_condition: i.propertyCondition ?? null, view_quality: i.viewQuality ?? null,
    noise_level: i.noiseLevel ?? null, building_year: i.buildingYear ?? null, notes: i.notes ?? null,
  };
}

function rowToInput(r: Record<string, unknown>): ValuationInput {
  const n = (x: unknown) => (x == null ? null : Number(x));
  const b = (x: unknown) => (x == null ? null : Boolean(x));
  return {
    city: (r.city as string) ?? null, neighborhood: (r.neighborhood as string) ?? null,
    street: (r.street as string) ?? null, houseNumber: (r.house_number as string) ?? null,
    apartmentNumber: (r.apartment_number as string) ?? null,
    latitude: n(r.latitude), longitude: n(r.longitude),
    propertyType: (r.property_type as string) ?? null, rooms: n(r.rooms), builtSqm: n(r.built_sqm),
    balconySqm: n(r.balcony_sqm), gardenSqm: n(r.garden_sqm), floor: n(r.floor), totalFloors: n(r.total_floors),
    elevator: b(r.elevator), parkingCount: n(r.parking_count), storage: b(r.storage), mamad: b(r.mamad),
    renovated: b(r.renovated), propertyCondition: (r.property_condition as string) ?? null,
    viewQuality: (r.view_quality as string) ?? null, noiseLevel: (r.noise_level as string) ?? null,
    buildingYear: n(r.building_year), notes: (r.notes as string) ?? null,
  };
}

// ── create / update ──────────────────────────────────────────────────────────
export async function createValuationDraft(input?: ValuationInput, propertyId?: string | null): Promise<string> {
  const { db, orgId, userId } = await ctx();
  const row = {
    organization_id: orgId, created_by: userId, status: "draft",
    property_id: propertyId ?? null, ...(input ? inputToRow(normalizeInput(input)) : {}),
  };
  const { data, error } = await db.from(TABLE as never).insert(row as never).select("id").single();
  if (error) throw new Error(error.message);
  return (data as unknown as { id: string }).id;
}

export async function updateValuationInput(id: string, input: ValuationInput): Promise<void> {
  const { db, orgId } = await ctx();
  const { error } = await db.from(TABLE as never)
    .update(inputToRow(normalizeInput(input)) as never)
    .eq("id", id).eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}

// ── run the valuation engine + persist all evidence ──────────────────────────
export interface RunOutput { result: ValuationResult; providers: ProviderResult[]; brokerSold: BrokerSoldProperty[] }

export async function runValuationById(id: string): Promise<RunOutput> {
  const { db, orgId } = await ctx();
  const { data: valRow, error } = await db.from(TABLE as never)
    .select("*").eq("id", id).eq("organization_id", orgId).single();
  if (error || !valRow) throw new Error("הערכת השווי לא נמצאה.");
  const input = normalizeInput(rowToInput(valRow as Record<string, unknown>));

  await db.from(TABLE as never).update({ status: "computing" } as never).eq("id", id).eq("organization_id", orgId);

  const providerCtx = { db, orgId, input, limit: PROVIDER_LIMIT };
  const [{ comparables, providers }, brokerSoldRaw] = await Promise.all([
    gatherEvidence(providerCtx),
    getBrokerSoldProperties(db, orgId, input),
  ]);

  const result = runEngine({ input, comparables, brokerSold: brokerSoldRaw });

  // Annotate broker-sold performance vs the REAL market median ppsqm.
  const median = result.market.medianPricePerSqm;
  const brokerSold = brokerSoldRaw.map((b) => ({
    ...b,
    performanceVsMarketPercent: b.pricePerSqm && median
      ? Math.round(((b.pricePerSqm - median) / median) * 1000) / 10
      : null,
  }));

  await persistResult(db, orgId, id, input, result, comparables, brokerSold, result.market, result.adjustments);
  return { result, providers, brokerSold };
}

async function persistResult(
  db: Awaited<ReturnType<typeof createClient>>, orgId: string, id: string,
  input: ValuationInput, result: ValuationResult, comparables: Comparable[],
  brokerSold: BrokerSoldProperty[], market: MarketSnapshot, adjustments: ValuationAdjustment[],
) {
  // Replace prior evidence (idempotent re-run).
  for (const t of ["valuation_comparables", "valuation_broker_sold_properties", "valuation_adjustments", "valuation_market_snapshots"]) {
    await db.from(t as never).delete().eq("valuation_id", id).eq("organization_id", orgId);
  }

  // Keep the most relevant comparables (cap rows persisted).
  const ranked = [...comparables]
    .filter((c) => (c.pricePerSqm ?? 0) > 0)
    .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0))
    .slice(0, 40);

  if (ranked.length) {
    await db.from("valuation_comparables" as never).insert(ranked.map((c) => ({
      organization_id: orgId, valuation_id: id, source: c.source, comparable_type: c.comparableType,
      external_id: c.externalId ?? null, city: c.city ?? null, neighborhood: c.neighborhood ?? null,
      street: c.street ?? null, distance_meters: c.distanceMeters ?? null, property_type: c.propertyType ?? null,
      rooms: c.rooms ?? null, sqm: c.sqm ?? null, floor: c.floor ?? null, building_year: c.buildingYear ?? null,
      price: c.price ?? null, price_per_sqm: c.pricePerSqm ?? null, sale_date: c.saleDate ?? null,
      listing_date: c.listingDate ?? null, similarity_score: c.similarityScore ?? null,
      adjustment_score: c.adjustmentScore ?? null, adjustment_reason: c.adjustmentReason ?? null,
      image_url: c.imageUrl ?? null, is_demo: c.isDemo ?? false,
    })) as never);
  }

  if (brokerSold.length) {
    await db.from("valuation_broker_sold_properties" as never).insert(brokerSold.map((b) => ({
      organization_id: orgId, valuation_id: id, property_id: b.propertyId ?? null, deal_id: b.dealId ?? null,
      address: b.address ?? null, city: b.city ?? null, neighborhood: b.neighborhood ?? null, street: b.street ?? null,
      sale_price: b.salePrice ?? null, price_per_sqm: b.pricePerSqm ?? null, sale_date: b.saleDate ?? null,
      rooms: b.rooms ?? null, sqm: b.sqm ?? null, distance_meters: b.distanceMeters ?? null,
      agent_id: b.agentId ?? null, buyer_type: b.buyerType ?? null, image_url: b.imageUrl ?? null,
      performance_vs_market_percent: b.performanceVsMarketPercent ?? null,
    })) as never);
  }

  if (adjustments.length) {
    await db.from("valuation_adjustments" as never).insert(adjustments.map((a) => ({
      organization_id: orgId, valuation_id: id, label: a.label, direction: a.direction,
      value_impact: a.valueImpact, percentage_impact: a.percentageImpact, reason: a.reason, confidence: a.confidence,
    })) as never);
  }

  await db.from("valuation_market_snapshots" as never).insert({
    organization_id: orgId, valuation_id: id,
    avg_price_per_sqm: market.avgPricePerSqm, median_price_per_sqm: market.medianPricePerSqm,
    transaction_count: market.transactionCount, active_listing_count: market.activeListingCount,
    demand_level: market.demandLevel, supply_level: market.supplyLevel,
    trend_direction: market.trendDirection, trend_percent: market.trendPercent,
    listing_to_sold_gap_percent: market.listingToSoldGapPercent, data_quality_score: market.dataQualityScore,
  } as never);

  void input;
  await db.from(TABLE as never).update({
    status: "completed",
    estimated_value: result.estimatedValue, low_value: result.lowValue, high_value: result.highValue,
    recommended_listing_price: result.recommendedListingPrice, target_closing_price: result.targetClosingPrice,
    minimum_acceptable_price: result.minimumAcceptablePrice, estimated_price_per_sqm: result.estimatedPricePerSqm,
    confidence_score: result.confidenceScore, confidence_level: result.confidenceLevel,
    demand_score: result.demandScore, liquidity_score: result.liquidityScore,
    overpricing_risk_score: result.overpricingRiskScore, days_on_market_estimate: result.daysOnMarketEstimate,
    explanation: result.explanation,
    metadata: {
      strategies: result.strategies, basePricePerSqm: result.basePpsqm, evidenceCount: result.evidenceCount,
      // Phase 2/3 (AVM): persist availability + QA debug so the PDF/report read the
      // exact same computed values (and can honestly show "no data" without ₪0).
      valuationAvailable: result.valuationAvailable ?? true,
      valuationQuality: result.valuationQuality ?? null,
      unavailableReason: result.unavailableReason ?? null,
      missingData: result.missingData ?? [],
      recommendedAction: result.recommendedAction ?? null,
      debug: result.debug ?? null,
    },
  } as never).eq("id", id).eq("organization_id", orgId);
}

// ── read ──────────────────────────────────────────────────────────────────────
export async function getValuation(id: string): Promise<ValuationRecord | null> {
  const { db, orgId } = await ctx();
  const { data: row } = await db.from(TABLE as never).select("*").eq("id", id).eq("organization_id", orgId).single();
  if (!row) return null;
  const r = row as Record<string, unknown>;

  const [{ data: comps }, { data: broker }, { data: adj }, { data: snap }] = await Promise.all([
    db.from("valuation_comparables" as never).select("*").eq("valuation_id", id).order("similarity_score", { ascending: false }),
    db.from("valuation_broker_sold_properties" as never).select("*").eq("valuation_id", id).order("sale_date", { ascending: false }),
    db.from("valuation_adjustments" as never).select("*").eq("valuation_id", id),
    db.from("valuation_market_snapshots" as never).select("*").eq("valuation_id", id).order("created_at", { ascending: false }).limit(1),
  ]);

  const num = (x: unknown) => (x == null ? null : Number(x));
  const comparables: Comparable[] = ((comps ?? []) as Record<string, unknown>[]).map((c) => ({
    source: c.source as Comparable["source"], comparableType: c.comparable_type as Comparable["comparableType"],
    externalId: c.external_id as string, city: c.city as string, neighborhood: c.neighborhood as string,
    street: c.street as string, distanceMeters: num(c.distance_meters), propertyType: c.property_type as string,
    rooms: num(c.rooms), sqm: num(c.sqm), floor: num(c.floor), buildingYear: num(c.building_year) ?? undefined,
    price: num(c.price), pricePerSqm: num(c.price_per_sqm), saleDate: c.sale_date as string,
    listingDate: c.listing_date as string, similarityScore: num(c.similarity_score) ?? 0,
    adjustmentReason: c.adjustment_reason as string, imageUrl: c.image_url as string, isDemo: Boolean(c.is_demo),
  }));
  const brokerSold: BrokerSoldProperty[] = ((broker ?? []) as Record<string, unknown>[]).map((b) => ({
    propertyId: b.property_id as string, dealId: b.deal_id as string, address: b.address as string,
    city: b.city as string, neighborhood: b.neighborhood as string, street: b.street as string,
    salePrice: num(b.sale_price), pricePerSqm: num(b.price_per_sqm), saleDate: b.sale_date as string,
    rooms: num(b.rooms), sqm: num(b.sqm), distanceMeters: num(b.distance_meters), agentId: b.agent_id as string,
    buyerType: b.buyer_type as string, imageUrl: b.image_url as string,
    performanceVsMarketPercent: num(b.performance_vs_market_percent),
  }));
  const adjustments: ValuationAdjustment[] = ((adj ?? []) as Record<string, unknown>[]).map((a) => ({
    label: a.label as string, direction: a.direction as ValuationAdjustment["direction"],
    valueImpact: num(a.value_impact) ?? 0, percentageImpact: num(a.percentage_impact) ?? 0,
    reason: a.reason as string, confidence: num(a.confidence) ?? 0.5,
  }));
  const s = (snap ?? [])[0] as Record<string, unknown> | undefined;
  const market: MarketSnapshot | null = s ? {
    avgPricePerSqm: num(s.avg_price_per_sqm), medianPricePerSqm: num(s.median_price_per_sqm),
    transactionCount: Number(s.transaction_count ?? 0), activeListingCount: Number(s.active_listing_count ?? 0),
    demandLevel: (s.demand_level as MarketSnapshot["demandLevel"]) ?? "low",
    supplyLevel: (s.supply_level as MarketSnapshot["supplyLevel"]) ?? "low",
    trendDirection: (s.trend_direction as MarketSnapshot["trendDirection"]) ?? "flat",
    trendPercent: num(s.trend_percent) ?? 0, listingToSoldGapPercent: num(s.listing_to_sold_gap_percent),
    dataQualityScore: num(s.data_quality_score) ?? 0,
  } : null;

  const meta = (r.metadata as Record<string, unknown>) ?? {};
  const result: Partial<ValuationResult> | null = r.status === "completed" ? {
    estimatedValue: num(r.estimated_value) ?? 0, lowValue: num(r.low_value) ?? 0, highValue: num(r.high_value) ?? 0,
    recommendedListingPrice: num(r.recommended_listing_price) ?? 0, targetClosingPrice: num(r.target_closing_price) ?? 0,
    minimumAcceptablePrice: num(r.minimum_acceptable_price) ?? 0, estimatedPricePerSqm: num(r.estimated_price_per_sqm) ?? 0,
    confidenceScore: num(r.confidence_score) ?? 0, confidenceLevel: (r.confidence_level as ValuationResult["confidenceLevel"]) ?? "low",
    demandScore: num(r.demand_score) ?? 0, liquidityScore: num(r.liquidity_score) ?? 0,
    overpricingRiskScore: num(r.overpricing_risk_score) ?? 0, daysOnMarketEstimate: num(r.days_on_market_estimate) ?? 0,
    explanation: (r.explanation as string) ?? "", adjustments, strategies: (meta.strategies as ValuationResult["strategies"]) ?? [],
    market: market ?? undefined as never, basePpsqm: num(meta.basePricePerSqm) ?? 0, evidenceCount: num(meta.evidenceCount) ?? 0,
    // AVM availability + QA metadata (Phase 2/3).
    valuationAvailable: meta.valuationAvailable as boolean | undefined,
    valuationQuality: (meta.valuationQuality as ValuationResult["valuationQuality"]) ?? undefined,
    unavailableReason: (meta.unavailableReason as string | null) ?? null,
    missingData: (meta.missingData as string[]) ?? [],
    recommendedAction: (meta.recommendedAction as string | null) ?? null,
    debug: (meta.debug as ValuationResult["debug"]) ?? undefined,
  } : null;

  return {
    id: r.id as string, organizationId: r.organization_id as string, propertyId: (r.property_id as string) ?? null,
    status: (r.status as ValuationRecord["status"]) ?? "draft", input: rowToInput(r), result,
    comparables, brokerSold, adjustments, market, createdAt: r.created_at as string,
  };
}

export interface ValuationListItem {
  id: string; city: string | null; neighborhood: string | null; street: string | null;
  estimatedValue: number | null; confidenceLevel: string | null; status: string; createdAt: string;
}
export async function listValuations(limit = 50): Promise<ValuationListItem[]> {
  const { db, orgId } = await ctx();
  const { data } = await db.from(TABLE as never)
    .select("id,city,neighborhood,street,estimated_value,confidence_level,status,created_at")
    .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, city: (r.city as string) ?? null, neighborhood: (r.neighborhood as string) ?? null,
    street: (r.street as string) ?? null, estimatedValue: r.estimated_value == null ? null : Number(r.estimated_value),
    confidenceLevel: (r.confidence_level as string) ?? null, status: (r.status as string) ?? "draft",
    createdAt: r.created_at as string,
  }));
}

// ── save to property / seller follow-up ───────────────────────────────────────
export async function saveValuationToProperty(id: string, propertyId: string): Promise<void> {
  const { db, orgId } = await ctx();
  const { error } = await db.from(TABLE as never).update({ property_id: propertyId } as never)
    .eq("id", id).eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}

export async function createSellerFollowupFromValuation(id: string): Promise<{ taskId: string | null }> {
  const { db, orgId, userId } = await ctx();
  const v = await getValuation(id);
  if (!v) throw new Error("הערכת השווי לא נמצאה.");
  const loc = [v.input.street, v.input.neighborhood, v.input.city].filter(Boolean).join(", ");
  const due = new Date(); due.setDate(due.getDate() + 2);
  const { data, error } = await db.from("tasks" as never).insert({
    org_id: orgId, created_by: userId, title: `מעקב גיוס מוכר — ${loc || "נכס"}`,
    description: `ליצור קשר עם בעל הנכס בעקבות דוח הערכת שווי (שווי מוערך: ₪${(v.result?.estimatedValue ?? 0).toLocaleString("he-IL")}).`,
    status: "todo", priority: "high", due_at: due.toISOString(),
    property_id: v.propertyId ?? null,
  } as never).select("id").single();
  if (error) return { taskId: null };
  return { taskId: (data as unknown as { id: string }).id };
}
