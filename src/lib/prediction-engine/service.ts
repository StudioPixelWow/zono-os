// ============================================================================
// 🔮 ZONO — Prediction Engine — service (server-only). PHASE 52.0.
// Gathers signals from EXISTING engines (Daily OS, Chief-of-Staff, Territory OS)
// WITHOUT recomputing any score, normalizes them, runs the pure forecaster, and
// stamps each prediction's expiration. Read-only; compute-cache for the report.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getDailyOS } from "@/lib/daily-os/service";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getTerritoryOS } from "@/lib/territory-os/service";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import type { Json } from "@/lib/supabase/types";
import { forecast, summarizePredictions } from "./forecast";
import { PREDICTION_ENGINE_VERSION, NO_CERTAINTY_NOTE } from "./types";
import type { PredictionReport, PredictionSignals, SignalEntity } from "./types";

type ScoredLike = { kind?: string; id?: string; name?: string; score?: number | null; healthScore?: number | null; reason?: string | null; riskLabel?: string | null; href?: string; lastActivityAt?: string | null };
function mapEntities(list: unknown, fallbackKind: string): SignalEntity[] {
  if (!Array.isArray(list)) return [];
  return (list as ScoredLike[]).map((e) => ({
    kind: e.kind ?? fallbackKind, id: String(e.id ?? ""), name: e.name ?? "—",
    score: e.score ?? e.healthScore ?? null, reason: e.reason ?? null, riskLabel: e.riskLabel ?? null,
    href: e.href ?? "#", lastActivityAt: e.lastActivityAt ?? null,
  }));
}

async function buildSignals(): Promise<PredictionSignals> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;

  const [daily, chief, territory] = await Promise.all([
    getDailyOS().catch(() => null),
    getChiefOfStaff(orgId).catch(() => null),
    getTerritoryOS().catch(() => null),
  ]);

  return {
    sellersAtRisk: mapEntities(daily?.deals?.sellersAtRisk, "seller"),
    hotBuyers: mapEntities(daily?.deals?.hotBuyers, "buyer"),
    staleListings: mapEntities(daily?.deals?.criticalListings, "property"),
    leadFollowUps: mapEntities(daily?.deals?.leadFollowUps, "lead"),
    performance: daily?.performance
      ? { daily: daily.performance.daily, weekly: daily.performance.weekly, followUpRatePct: daily.performance.followUpRatePct, conversionOpportunities: daily.performance.conversionOpportunities, weakSpots: daily.performance.weakSpots ?? [] }
      : null,
    conversation: daily?.conversation
      ? { whatsappUnread: daily.conversation.whatsappUnread, whatsappWaiting: daily.conversation.whatsappWaiting, facebookComments: daily.conversation.facebookComments, facebookLeads: daily.conversation.facebookLeads }
      : null,
    marketing: daily?.marketing
      ? { scheduledToday: daily.marketing.scheduledToday, commentsWaiting: daily.marketing.commentsWaiting, leadApprovals: daily.marketing.leadApprovals, groupsToPublish: daily.marketing.groupsToPublish }
      : null,
    territory: territory ? { score: territory.score?.overall ?? null, growth: territory.score?.growth ?? null, band: territory.score?.band ?? null } : null,
    orgScore: chief?.organizationScore?.overall ?? null,
    orgRiskCount: chief?.recommendations?.topRisks?.length ?? 0,
  };
}

/** The org's forecast report (cached). Every prediction carries an expiration. */
export async function getPredictions(): Promise<PredictionReport> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;
  if (orgId) {
    const hit = await getCache<PredictionReport>(orgId, "prediction_report", []).catch(() => null);
    if (hit) return hit.value;
  }

  const signals = await buildSignals();
  const now = Date.now();
  const predictions = forecast(signals, now).map((p) => ({ ...p, expiresAt: new Date(now + p.horizonDays * 86400000).toISOString() }));

  const report: PredictionReport = {
    version: PREDICTION_ENGINE_VERSION,
    generatedAt: new Date(now).toISOString(),
    predictions,
    counts: summarizePredictions(predictions),
    notes: [NO_CERTAINTY_NOTE],
  };

  if (orgId) await setCache(orgId, "prediction_report", [], report as unknown as Json, { ttlSeconds: 300, version: PREDICTION_ENGINE_VERSION }).catch(() => {});
  return report;
}
