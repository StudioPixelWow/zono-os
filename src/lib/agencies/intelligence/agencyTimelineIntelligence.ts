// ============================================================================
// ZONO — Agency Timeline Intelligence service (Phase 26.6, SERVER-ONLY).
// Builds an agency snapshot from real internal data (territory stats + scores +
// knowledge graph), runs the pure signal detector, persists deduped signals, and
// promotes only the strategically meaningful ones (importance ≥ 60 or
// high/critical severity) to the timeline. Exposes the full signal lifecycle API.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { listByAgency as listTerr } from "../territory/agencyTerritoryRepository";
import { listByAgency as listGraph } from "../graph/agencyGraphRepository";
import { getScore } from "../scoring/agencyScoringRepository";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import { detectAgencySignals as runDetector } from "./agencySignalDetector";
import {
  buildPrevMetrics, upsertDetectedSignals, listActiveSignals, listOrgSignals,
  getSignalById, setSignalStatus, upsertTimelineFromSignal, listTimelineIntelligence,
  type AgencyIntelSignalRow, type OrgSignalFilters, type TimelineIntelItem,
} from "./agencySignalRepository";
import type { AgencySnapshot, TerritorySnapshot, AgencyTerritoryLevel } from "./agencySignalTypes";

export interface AgencySignalDetectionResult {
  agencyId: string;
  detected: boolean;
  signalsCreated: number;
  signalsUpdated: number;
  duplicatesSkipped: number;
  timelineEventsCreated: number;
}

const TIMELINE_IMPORTANCE = 60;

/** Build an agency's current snapshot from the live intelligence layers. */
async function buildSnapshot(agencyId: string, periodDays: number): Promise<AgencySnapshot | null> {
  const [terr, graph, score] = await Promise.all([
    listTerr(agencyId, periodDays),
    listGraph(agencyId, { activeOnly: true }),
    getScore(agencyId),
  ]);
  if (terr.length === 0 && !score && graph.length === 0) return null;

  const territories: TerritorySnapshot[] = terr.map((t) => ({
    territoryType: t.territoryType as AgencyTerritoryLevel,
    city: t.city, neighborhood: t.neighborhood, street: t.street, territoryKey: t.territoryKey,
    dominance: t.dominanceScore, momentum: t.momentumScore, activeListings: t.activeListingsCount,
    opportunityTypes: ((t.metadata?.opportunityTypes as string[]) ?? []),
  }));

  return {
    agencyId,
    overall: score?.overall ?? null,
    growth: score?.growth ?? null,
    momentum: score?.momentum ?? null,
    competitionThreat: score?.competitionThreat ?? null,
    dataConfidence: score?.dataConfidence ?? null,
    agentCount: graph.filter((r) => r.entityType === "agent" && r.relationshipType === "agent_member").length,
    projectCount: graph.filter((r) => r.entityType === "project").length,
    developerCount: graph.filter((r) => r.entityType === "developer").length,
    territories,
  };
}

/** Detect + persist signals for one agency, promoting meaningful ones to the timeline. */
export async function detectAgencySignals(agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<AgencySignalDetectionResult> {
  const out: AgencySignalDetectionResult = { agencyId, detected: false, signalsCreated: 0, signalsUpdated: 0, duplicatesSkipped: 0, timelineEventsCreated: 0 };
  const snapshot = await buildSnapshot(agencyId, periodDays);
  if (!snapshot) return out;

  const prevMetrics = await buildPrevMetrics(agencyId);
  const detected = runDetector({ snapshot, prevMetrics });
  if (detected.length === 0) { out.detected = true; return out; }

  const res = await upsertDetectedSignals(detected);
  out.detected = true;
  out.signalsCreated = res.created;
  out.signalsUpdated = res.updated;
  out.duplicatesSkipped = res.skipped;

  // Promote strategically meaningful signals to the timeline (importance-gated).
  const active = await listActiveSignals(agencyId, 200);
  for (const sig of active) {
    const meaningful = (sig.importance ?? 0) >= TIMELINE_IMPORTANCE || sig.severity === "high" || sig.severity === "critical";
    if (!meaningful) continue;
    const ok = await upsertTimelineFromSignal(sig, `signal_${sig.signalType}`);
    if (ok) out.timelineEventsCreated++;
  }
  return out;
}

/** Detect signals for every active agency in the org. Idempotent. */
export async function detectOrganizationAgencySignals(periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<{ agencies: number; results: AgencySignalDetectionResult[] }> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agencies").select("id").eq("organization_id", org).eq("active", true).limit(2000);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  const results: AgencySignalDetectionResult[] = [];
  for (const id of ids) {
    try { results.push(await detectAgencySignals(id, periodDays)); }
    catch { /* isolate per-agency failure */ }
  }
  return { agencies: ids.length, results };
}

export function getActiveAgencySignals(agencyId: string): Promise<AgencyIntelSignalRow[]> { return listActiveSignals(agencyId); }
export function getOrganizationSignals(filters: OrgSignalFilters = {}): Promise<AgencyIntelSignalRow[]> { return listOrgSignals(filters); }
export function markSignalResolved(signalId: string): Promise<void> { return setSignalStatus(signalId, "resolved"); }
export function ignoreSignal(signalId: string): Promise<void> { return setSignalStatus(signalId, "ignored"); }

/** Force-promote a specific signal to the timeline (manual, regardless of importance). */
export async function createTimelineEventFromSignal(signalId: string): Promise<boolean> {
  const sig = await getSignalById(signalId);
  if (!sig) return false;
  return upsertTimelineFromSignal(sig, `signal_${sig.signalType}`);
}

export function getAgencyTimelineIntelligence(agencyId: string): Promise<TimelineIntelItem[]> { return listTimelineIntelligence(agencyId); }
