// ============================================================================
// 🔬 Office Promotion Explainability™ — service (server-only, READ-ONLY). 26.4.17.
// Loads the candidates + offices already produced by the existing engines and
// explains every promotion decision. No writes, no engine/AI/rule changes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb, makeCityMatch } from "../brokerage-knowledge";
import { isAcceptableOfficeName } from "../office-name-guard";
import {
  deriveSignals, buildChecklist, computeScore, decideStatus, buildFailedRules,
  topBlockingReasons, buildSimulations, buildPipeline, officeCreationOutcome, type CandidateFacts,
} from "./rules";
import { PROMOTION_DEBUG_VERSION, type CandidatePromotionDebug, type PromotionDebugDashboard } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);

/** Build the promotion-debug dashboard for a city (read-only). */
export async function getPromotionDebug(city: string): Promise<PromotionDebugDashboard> {
  const db = createServiceRoleClient();
  const cityNorm = normCityKb(city);
  const match = makeCityMatch(city);
  const notes: string[] = [];

  const [candRes, offRes, agentRes, linkRes] = await Promise.all([
    db.from("brokerage_office_candidates" as never).select("id,office_name,normalized_name,normalized_brand,brand_network,city,phone,domain,status,suggested_by,confidence,evidence").limit(20000),
    db.from("brokerage_offices" as never).select("id,normalized_name,city,status,metadata").limit(20000),
    db.from("brokerage_agents" as never).select("office_id,city").limit(20000),
    db.from("brokerage_external_listing_links" as never).select("office_id,city").limit(50000),
  ]);

  const offices = ((offRes.data ?? []) as Row[]).filter((r) => !s(r.city) || match(r.city));
  const officeByNorm = new Map<string, Row>();
  for (const o of offices) if (s(o.status) !== "rejected") officeByNorm.set(s(o.normalized_name), o);
  const officeIdsWithBrokers = new Set(((agentRes.data ?? []) as Row[]).filter((r) => s(r.office_id)).map((r) => s(r.office_id)));
  const officeIdsWithListings = new Set(((linkRes.data ?? []) as Row[]).filter((r) => s(r.office_id)).map((r) => s(r.office_id)));

  const cands = ((candRes.data ?? []) as Row[]).filter((r) => match(r.city));
  // Duplicate-candidate detection (same normalized name in-city, appearing >1).
  const nameCount = new Map<string, number>();
  for (const c of cands) nameCount.set(s(c.normalized_name), (nameCount.get(s(c.normalized_name)) ?? 0) + 1);

  const candidates: CandidatePromotionDebug[] = [];
  for (const c of cands) {
    const ev = (Array.isArray(c.evidence) ? (c.evidence[0] as Row | undefined) : undefined) ?? {};
    const sourcesChecked = arr(ev.public_sources_checked);
    const evidenceFound = arr(ev.evidence_found);
    const publicUrls = arr(ev.public_urls);
    const researched = sourcesChecked.length > 0 || !!ev.verified_at || !!ev.last_researched_at || evidenceFound.length > 0;
    const normName = s(c.normalized_name);
    const office = officeByNorm.get(normName);
    const officeMeta = (office?.metadata ?? {}) as Row;
    const createdByThisPipeline = /ai_candidate_seed|brokerage_research_agent/.test(s(officeMeta.derived_from));

    const facts: CandidateFacts = {
      officeName: s(c.office_name), normalizedName: normName, brandNetwork: s(c.brand_network) || null,
      city: s(c.city), cityMatched: normCityKb(s(c.city)) === cityNorm, cityRawInEvidence: s(c.city) || s(ev.city) || null,
      dbStatus: s(c.status) || "researching", suggestedBy: s(c.suggested_by), systemConfidence: n(c.confidence),
      phone: s(c.phone) || null,
      strongSources: n(ev.strong_sources), independentDomains: n(ev.independent_domains),
      evidenceFound, publicUrls, sourcesChecked, researched, systemVerified: ev.system_verified === true,
      nameValid: isAcceptableOfficeName(s(c.office_name)),
      officeExists: !!office, officeHasBrokers: !!office && officeIdsWithBrokers.has(s(office.id)),
      officeHasListings: !!office && officeIdsWithListings.has(s(office.id)), createdByThisPipeline,
      duplicateOffice: !!office && !createdByThisPipeline, duplicateCandidate: (nameCount.get(normName) ?? 0) > 1,
    };

    const sig = deriveSignals(facts);
    const status = decideStatus(facts, sig);
    candidates.push({
      candidateId: s(c.id), officeName: facts.officeName, normalizedName: normName, brandNetwork: facts.brandNetwork,
      city: facts.city, suggestedBy: facts.suggestedBy, status,
      promotionScore: computeScore(facts, sig), systemConfidence: facts.systemConfidence,
      checklist: buildChecklist(facts, sig), failedRules: buildFailedRules(facts, sig),
      topReasons: topBlockingReasons(facts, sig, status), simulations: buildSimulations(facts, sig, status),
      pipeline: buildPipeline(facts, sig), officeCreation: officeCreationOutcome(facts, sig),
      evidence: { strongSources: facts.strongSources, independentDomains: facts.independentDomains, phone: facts.phone, publicUrls, evidenceFound, sourcesChecked, researched, systemVerified: facts.systemVerified },
      profileCompleteness: ev.profile_completeness != null ? n(ev.profile_completeness) : null,
      lastEnrichedAt: s(ev.last_enriched_at) || null,
    });
  }

  // Rank: READY first, then by promotion score.
  const order = { READY: 0, BLOCKED: 1, WAITING: 2, REJECTED: 3 } as const;
  candidates.sort((a, b) => order[a.status] - order[b.status] || b.promotionScore.total - a.promotionScore.total);

  // Dashboard aggregates.
  const totals = {
    candidates: candidates.length,
    ready: candidates.filter((c) => c.status === "READY").length,
    blocked: candidates.filter((c) => c.status === "BLOCKED").length,
    waiting: candidates.filter((c) => c.status === "WAITING").length,
    rejected: candidates.filter((c) => c.status === "REJECTED").length,
    verified: candidates.filter((c) => c.evidence.systemVerified || c.officeCreation.outcome === "Created" || c.officeCreation.outcome === "AlreadyExists").length,
  };
  const averagePromotionScore = candidates.length ? Math.round(candidates.reduce((n2, c) => n2 + c.promotionScore.total, 0) / candidates.length) : 0;
  const reasonTally = new Map<string, number>();
  for (const c of candidates) if (c.topReasons[0]) reasonTally.set(c.topReasons[0], (reasonTally.get(c.topReasons[0]) ?? 0) + 1);
  const blockingReasonBreakdown = [...reasonTally.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const mostCommonBlockingReason = blockingReasonBreakdown[0]?.reason ?? null;
  const officeCreationLog = candidates.map((c) => ({ candidateId: c.candidateId, officeName: c.officeName, outcome: c.officeCreation.outcome, explanation: c.officeCreation.explanation }));

  if (candidates.length === 0) notes.push("לא נמצאו מועמדים לעיר זו — הפעל תחילה סוכן מחקר/זריעת AI.");

  return {
    city: city.trim(), cityNormalized: cityNorm, totals, averagePromotionScore,
    mostCommonBlockingReason, blockingReasonBreakdown, officeCreationLog, candidates, notes,
    version: PROMOTION_DEBUG_VERSION,
  };
}
