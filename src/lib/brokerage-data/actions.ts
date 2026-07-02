"use server";
// ============================================================================
// ZONO Core Data — Brokerage Data server actions. Reads are RLS-scoped; owner-
// only management actions are gated via requireOwner().
// ============================================================================
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { requireOwner } from "./permissions";
import {
  getBrokerageCommandCenter, resolveBrokerageLinksForOrg, reviewIdentityMatch,
  resolveDataConflict, decideListingLink, recordRefreshRequest,
  startBrokerageDataRefresh, getRefreshRunStatus, getOfficeDna, getBrokerDna,
  type BrokerageCommandCenter, type ResolveStats,
} from "./service";
import type { BrokerageDna } from "./dna";
import { reasonBrokerageDna, type DnaReasonResult } from "./dna-reasoning";
import { getBrokerageAccess } from "./permissions";
import { discoverBrokeragePublishers, type DiscoveryResult } from "./discovery";
import { gatherBrokerOfficeEvidence, reasonBrokerOffice, type BrokerOfficeReasonResult } from "./office-reasoning";
import { getProfileExtras, type ProfileExtras } from "./profile-data";
import { getBrokerageOfficesIndex, type OfficesIndex } from "./office-profile";
import { getCityDiscoveryAudit, type CityDiscoveryAudit } from "./brokerage-discovery-audit";
import { auditBrokerageDiscoveryPipeline, type BrokeragePipelineAudit } from "./brokerage-pipeline-audit";
import { discoverBrokerageOfficesForCity, type CityDiscoveryResult, type CityDiscoveryOptions } from "./city-discovery";
import { seedBrokerageOfficeCandidatesWithAI, type AICandidateSeedSummary } from "./ai-candidate-seeding";
import { runBrokerageResearchAgent, type AgentReport, type ResearchDepth } from "./research-agent";
import { crossCheckCityRepositories, type CityRepositoryAudit } from "./city-repository-audit";
import { getPromotionDebug, type PromotionDebugDashboard } from "./promotion-debug";
import { buildOfficeIntelligenceForCandidate, buildOfficeIntelligenceForCity, type EnrichmentResult, type CityEnrichmentResult } from "./office-intelligence";
import { getBrandHierarchy, type BrandHierarchy } from "./brand-identity";
import { getBrokerIntelligenceProfile, getOfficeBrokerRanking, type BrokerIntelligenceProfile, type BrokerRankCard } from "./broker-intelligence";
import { getOfficeInventory, backfillOfficeInventoryFromBrokers, type OfficeInventory, type BackfillResult } from "./office-inventory";
import { getCityTerritoryIntelligence, getOfficeTerritory, type CityTerritoryIntelligence, type OfficeTerritoryIntelligence } from "./territory-intelligence";
import { getCityCompetitiveDashboard, getOfficeCompetitiveProfile, type CityCompetitiveDashboard, type OfficeCompetitiveProfile } from "./competitive-intelligence";
import { getOfficeDecisionPackage, getCityDecisionBriefing, type DecisionPackage, type DailyBriefing } from "@/lib/decision-engine";
import {
  getActionCenter, listEntityMissions, generateMissionsFromOfficeDecisions, updateMissionStatus,
  type ActionCenter, type Mission,
} from "@/lib/mission-engine";
import { getChiefOfStaff, type ChiefOfStaffReport } from "@/lib/chief-of-staff";
import { getOrgTruthReport, type OrgTruthReport } from "@/lib/truth-engine";
import { getOrgMemoryReport, type OrgMemoryReport } from "@/lib/org-memory";
import { getRelationshipReport, type RelationshipReport } from "@/lib/relationship-graph";
import { getBuyerTwins, type BuyerTwinsOverview } from "@/lib/digital-twin/buyers";
import { getSellerTwins, type SellerTwinsOverview } from "@/lib/digital-twin/sellers";
import { getLeadTwins, type LeadTwinsOverview } from "@/lib/digital-twin/leads";
import { getCrmGraph, type CrmGraphResult } from "@/lib/digital-twin/crm-graph";
import { getCustomerJourneys, type CustomerJourneysOverview } from "@/lib/digital-twin/customer";
import { getAgentsDashboard, setAgentEnabled, type AgentsDashboard } from "@/lib/agent-framework";
import {
  createBrokerageResearchJob, runBrokerageResearchJob, resumeBrokerageResearchJob,
  getBrokerageResearchJobStatus, getLatestCityResearchJob, cancelBrokerageResearchJob,
  type JobResult,
} from "./research-jobs";
import type { ResearchDepth as JobDepth } from "./research-jobs";
import {
  getCityLearningProfile, buildSchedulerPlan, runContinuousLearningTick,
  type CityLearningProfile, type SchedulerPlan, type ContinuousTickResult,
} from "./continuous-learning";
import { getBrokerageKnowledgeForCity, getCityBrokerageCensus, getCityKnowledgeStatus, type CityKnowledge, type CityBrokerageCensus, type CityKnowledgeStatus } from "./brokerage-knowledge";
import { ensureCityBrokerageKnowledge, type EnsureCityResult } from "./city-lazy-learning";
import { triggerCityLearning, type CityLearningReason, type CityLearningOutcome } from "./city-learning-trigger";
import { getBrokerageDataOverview, getBrokerDirectory, EMPTY_BROKERAGE_OVERVIEW, type BrokerageDataOverview, type BrokerDirectory } from "./overview";
import { runNationalBrokerageDiscovery, type BrokerageDiscoveryResult } from "./discovery-engine";
import { runNationalOfficeRegistry, getOfficeRegistrySnapshot, type RegistryRunResult, type OfficeRegistrySnapshot } from "./office-registry";
import { getBrokerIdentity, resolveBrokerIdentity, resolveAllBrokerIdentities, type IdentityRunResult } from "./broker-identity/engine";
import type { BrokerIdentityPackage, BrokerResolution } from "./broker-identity/types";
import { researchBroker, researchAllBrokers, getResearchSnapshot, resolveBrokerRef, type ResearchReport, type ResearchSnapshot, type BatchResearchProgress } from "./broker-research/engine";
import type { ResearchRunDiagnostics } from "./broker-research/types";

/** Fire-and-forget city-learning trigger for product events (best-effort, throttled). */
export async function triggerCityLearningAction(city: string, reason: CityLearningReason): Promise<CityLearningOutcome> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null }));
  return triggerCityLearning(profile?.org_id ?? null, city, reason);
}

/** READ-ONLY city knowledge status — bootstrap / refresh / reuse recommendation. */
export async function getCityKnowledgeStatusAction(city: string): Promise<CityKnowledgeStatus | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return null;
    return await getCityKnowledgeStatus(profile.org_id, city);
  } catch (e) { console.error("[city-knowledge-status] failed:", e); return null; }
}

/** Lazy city learning — bootstrap/refresh/reuse a city's brokerage knowledge on demand. */
export async function ensureCityBrokerageKnowledgeAction(city: string, reason: string, force?: "bootstrap" | "refresh" | "reuse"): Promise<{ ok: boolean; result?: EnsureCityResult; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    const result = await ensureCityBrokerageKnowledge(profile.org_id, city, reason, force ? { force } : {});
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[ensure-city-knowledge] failed:", e); return { ok: false, error: "למידת העיר נכשלה." }; }
}

/** READ-ONLY National Brokerage Census for a city — coverage metrics (evidence-only). */
export async function getCityBrokerageCensusAction(city: string): Promise<CityBrokerageCensus | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return null;
    return await getCityBrokerageCensus(profile.org_id, city);
  } catch (e) { console.error("[brokerage-census] failed:", e); return null; }
}

/** READ-ONLY persistent knowledge base for a city — what the org already knows. */
export async function getBrokerageKnowledgeForCityAction(city: string): Promise<CityKnowledge | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return null;
    return await getBrokerageKnowledgeForCity(profile.org_id, city);
  } catch (e) { console.error("[brokerage-knowledge] failed:", e); return null; }
}

/** City-first office discovery — discovers offices for a city, then matches brokers. Writes candidates/offices/links. */
export async function discoverBrokerageOfficesForCityAction(city: string, opts?: CityDiscoveryOptions): Promise<{ ok: boolean; result?: CityDiscoveryResult; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    const result = await discoverBrokerageOfficesForCity(profile.org_id, city, opts ?? {});
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[city-discovery] failed:", e); return { ok: false, error: "הגילוי נכשל." }; }
}

/** Phase 26.4.11 — AI proposes candidate office names, then each is verified by
 *  public sources. AI never verifies; unproven candidates stay "researching". */
export async function seedCityAICandidatesAction(city: string): Promise<{ ok: boolean; result?: AICandidateSeedSummary; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    const result = await seedBrokerageOfficeCandidatesWithAI(profile.org_id, city);
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[ai-seeding] failed:", e); return { ok: false, error: "זריעת מועמדי AI נכשלה." }; }
}

// ── Phase 26.4.16 — Continuous Brokerage Intelligence (scheduler + profiles) ──
export async function getCityLearningProfileAction(city: string): Promise<{ ok: boolean; result?: CityLearningProfile; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    return { ok: true, result: await getCityLearningProfile(profile.org_id, city) };
  } catch (e) { console.error("[continuous] profile failed:", e); return { ok: false, error: "טעינת פרופיל נכשלה." }; }
}
export async function getContinuousSchedulerPlanAction(): Promise<{ ok: boolean; result?: SchedulerPlan; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    return { ok: true, result: await buildSchedulerPlan(profile.org_id) };
  } catch (e) { console.error("[continuous] plan failed:", e); return { ok: false, error: "בניית תוכנית נכשלה." }; }
}
/** Run one continuous-learning tick (highest-priority city). Manual or scheduled. */
export async function runContinuousLearningTickAction(): Promise<{ ok: boolean; result?: ContinuousTickResult; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const result = await runContinuousLearningTick(profile.org_id, 20000);
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[continuous] tick failed:", e); return { ok: false, error: "מחזור למידה נכשל." }; }
}

// ── Phase 26.4.15 — Persistent Background Research Jobs (resumable, no timeout) ──
/** Create a research job and immediately run one budgeted slice (returns fast). */
export async function startCityResearchJobAction(city: string, depth: JobDepth = "standard"): Promise<JobResult> {
  const { profile, user } = await getSessionContext().catch(() => ({ profile: null as { org_id?: string } | null, user: null as { id?: string } | null }));
  if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
  const created = await createBrokerageResearchJob(profile.org_id, city, { depth, createdBy: user?.id ?? null });
  if (!created.ok || !created.job) return created;
  // Run one slice now so the user sees immediate progress; the rest resumes later.
  const ran = await runBrokerageResearchJob(created.job.id, 20000);
  revalidatePath("/brokerage-data");
  return ran.ok ? ran : created;
}
export async function resumeCityResearchJobAction(jobId: string): Promise<JobResult> {
  const r = await resumeBrokerageResearchJob(jobId, 20000);
  revalidatePath("/brokerage-data");
  return r;
}
export async function getCityResearchJobStatusAction(jobId: string): Promise<JobResult> {
  return getBrokerageResearchJobStatus(jobId);
}
export async function getLatestCityResearchJobAction(city: string): Promise<JobResult> {
  const { profile } = await getSessionContext().catch(() => ({ profile: null as { org_id?: string } | null }));
  return getLatestCityResearchJob(profile?.org_id ?? null, city);
}
export async function cancelCityResearchJobAction(jobId: string): Promise<JobResult> {
  const r = await cancelBrokerageResearchJob(jobId);
  revalidatePath("/brokerage-data");
  return r;
}

// ── Phase 27.5 — Universal Mission Engine & Action Center ────────────────────
export async function getActionCenterAction(): Promise<{ ok: boolean; result?: ActionCenter; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getActionCenter(profile.org_id) }; }
  catch (e) { console.error("[missions] action center failed:", e); return { ok: false, error: "מרכז הפעולות נכשל." }; }
}
export async function listOfficeMissionsAction(officeId: string): Promise<{ ok: boolean; result?: Mission[]; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await listEntityMissions("office", officeId, profile.org_id) }; }
  catch (e) { console.error("[missions] list failed:", e); return { ok: false, error: "טעינת משימות נכשלה." }; }
}
export async function generateOfficeMissionsAction(officeId: string): Promise<{ ok: boolean; created?: number; migrationRequired?: boolean; note?: string; error?: string }> {
  try {
    const { profile, user } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const r = await generateMissionsFromOfficeDecisions(profile.org_id, officeId, user?.id ?? null);
    revalidatePath(`/brokerage-data/office/${officeId}`);
    return { ok: r.ok, created: r.created.length, migrationRequired: r.migrationRequired, note: r.note };
  } catch (e) { console.error("[missions] generate failed:", e); return { ok: false, error: "יצירת משימות נכשלה." }; }
}
export async function updateMissionStatusAction(missionId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const r = await updateMissionStatus(missionId, status as never);
    revalidatePath("/brokerage-data");
    return { ok: r.ok, error: r.error };
  } catch (e) { console.error("[missions] status failed:", e); return { ok: false, error: "עדכון סטטוס נכשל." }; }
}

// ── Phase 28.1 — Digital Twin Framework (Buyer = first Twin) ─────────────────
export async function getBuyerTwinsAction(): Promise<{ ok: boolean; result?: BuyerTwinsOverview; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getBuyerTwins(profile.org_id) }; }
  catch (e) { console.error("[digital-twin] buyer twins failed:", e); return { ok: false, error: "בניית ה-Digital Twins נכשלה." }; }
}

// ── Phase 28.2 — Seller Digital Twin (second Twin) ───────────────────────────
export async function getSellerTwinsAction(): Promise<{ ok: boolean; result?: SellerTwinsOverview; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getSellerTwins(profile.org_id) }; }
  catch (e) { console.error("[digital-twin] seller twins failed:", e); return { ok: false, error: "בניית ה-Seller Twins נכשלה." }; }
}

// ── Phase 28.3 — Lead Digital Twin (third Twin) ──────────────────────────────
export async function getLeadTwinsAction(): Promise<{ ok: boolean; result?: LeadTwinsOverview; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getLeadTwins(profile.org_id) }; }
  catch (e) { console.error("[digital-twin] lead twins failed:", e); return { ok: false, error: "בניית ה-Lead Twins נכשלה." }; }
}

// ── Phase 28.4 — CRM Relationship Graph Integration ──────────────────────────
export type CrmDashboardResult = Pick<CrmGraphResult, "version" | "generatedAt" | "dashboard" | "notes">;
export async function getCrmGraphAction(): Promise<{ ok: boolean; result?: CrmDashboardResult; error?: string }> {
  try {
    const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const r = await getCrmGraph(profile.org_id);
    return { ok: true, result: { version: r.version, generatedAt: r.generatedAt, dashboard: r.dashboard, notes: r.notes } };
  } catch (e) { console.error("[crm-graph] report failed:", e); return { ok: false, error: "גרף ה-CRM נכשל." }; }
}

// ── Phase 28.5 — Unified Customer Journey & Lifecycle Intelligence ───────────
export async function getCustomerJourneysAction(): Promise<{ ok: boolean; result?: CustomerJourneysOverview; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getCustomerJourneys(profile.org_id) }; }
  catch (e) { console.error("[customer-journey] report failed:", e); return { ok: false, error: "מסע הלקוח נכשל." }; }
}

// ── Phase 29.1 — Autonomous AI Agent Framework ───────────────────────────────
export async function getAgentsDashboardAction(): Promise<{ ok: boolean; result?: AgentsDashboard; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getAgentsDashboard(profile.org_id) }; }
  catch (e) { console.error("[agents] dashboard failed:", e); return { ok: false, error: "לוח הסוכנים נכשל." }; }
}
export async function setAgentEnabledAction(agentId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; setAgentEnabled(agentId, enabled); return { ok: true }; }
  catch (e) { console.error("[agents] toggle failed:", e); return { ok: false, error: "עדכון הסוכן נכשל." }; }
}

// ── Phase 27.9 — Relationship Intelligence & Universal Entity Graph ──────────
export async function getRelationshipGraphAction(): Promise<{ ok: boolean; result?: RelationshipReport; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getRelationshipReport(profile.org_id) }; }
  catch (e) { console.error("[relationship-graph] report failed:", e); return { ok: false, error: "גרף הקשרים נכשל." }; }
}

// ── Phase 27.8 — Organizational Memory & Learning Brain ──────────────────────
export async function getOrgMemoryAction(): Promise<{ ok: boolean; result?: OrgMemoryReport; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOrgMemoryReport(profile.org_id) }; }
  catch (e) { console.error("[org-memory] report failed:", e); return { ok: false, error: "הזיכרון הארגוני נכשל." }; }
}

// ── Phase 27.7 — Truth Engine & Data Reliability Framework ───────────────────
export async function getTruthReportAction(): Promise<{ ok: boolean; result?: OrgTruthReport; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOrgTruthReport(profile.org_id) }; }
  catch (e) { console.error("[truth-engine] report failed:", e); return { ok: false, error: "מנוע האמון נכשל." }; }
}

// ── Phase 27.6 — AI Chief of Staff (orchestration over every engine) ─────────
export async function getChiefOfStaffAction(): Promise<{ ok: boolean; result?: ChiefOfStaffReport; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getChiefOfStaff(profile.org_id) }; }
  catch (e) { console.error("[chief-of-staff] report failed:", e); return { ok: false, error: "מנוע ה-Chief of Staff נכשל." }; }
}

// ── Phase 27.4 — Decision Engine & Action Planner ────────────────────────────
export async function getOfficeDecisionPackageAction(officeId: string): Promise<{ ok: boolean; result?: DecisionPackage | null; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOfficeDecisionPackage(officeId) }; }
  catch (e) { console.error("[decision] office failed:", e); return { ok: false, error: "מנוע ההחלטות נכשל." }; }
}
export async function getCityDecisionBriefingAction(city: string): Promise<{ ok: boolean; result?: DailyBriefing; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." }; return { ok: true, result: await getCityDecisionBriefing(city) }; }
  catch (e) { console.error("[decision] briefing failed:", e); return { ok: false, error: "התדריך היומי נכשל." }; }
}

// ── Phase 26.7 — Competitive Intelligence ────────────────────────────────────
export async function getCityCompetitiveDashboardAction(city: string): Promise<{ ok: boolean; result?: CityCompetitiveDashboard; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." }; return { ok: true, result: await getCityCompetitiveDashboard(city) }; }
  catch (e) { console.error("[competitive] city failed:", e); return { ok: false, error: "מודיעין תחרותי נכשל." }; }
}
export async function getOfficeCompetitiveProfileAction(officeId: string): Promise<{ ok: boolean; result?: OfficeCompetitiveProfile | null; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOfficeCompetitiveProfile(officeId) }; }
  catch (e) { console.error("[competitive] office failed:", e); return { ok: false, error: "פרופיל תחרותי למשרד נכשל." }; }
}

// ── Phase 26.6 — Territory Intelligence ──────────────────────────────────────
export async function getCityTerritoryIntelligenceAction(city: string): Promise<{ ok: boolean; result?: CityTerritoryIntelligence; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." }; return { ok: true, result: await getCityTerritoryIntelligence(city) }; }
  catch (e) { console.error("[territory] city failed:", e); return { ok: false, error: "מודיעין הטריטוריה נכשל." }; }
}
export async function getOfficeTerritoryAction(officeId: string): Promise<{ ok: boolean; result?: OfficeTerritoryIntelligence | null; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOfficeTerritory(officeId) }; }
  catch (e) { console.error("[territory] office failed:", e); return { ok: false, error: "מודיעין טריטוריה למשרד נכשל." }; }
}

// ── Phase 26.5 — Broker Intelligence + Office Inventory Attribution ───────────
export async function getOfficeInventoryAction(officeId: string): Promise<{ ok: boolean; result?: OfficeInventory | null; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOfficeInventory(officeId) }; }
  catch (e) { console.error("[office-inventory] failed:", e); return { ok: false, error: "טעינת מלאי המשרד נכשלה." }; }
}
export async function getOfficeBrokerRankingAction(officeId: string): Promise<{ ok: boolean; result?: BrokerRankCard[]; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getOfficeBrokerRanking(officeId) }; }
  catch (e) { console.error("[broker-ranking] failed:", e); return { ok: false, error: "דירוג המתווכים נכשל." }; }
}
export async function getBrokerIntelligenceProfileAction(brokerId: string): Promise<{ ok: boolean; result?: BrokerIntelligenceProfile | null; error?: string }> {
  try { const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." }; return { ok: true, result: await getBrokerIntelligenceProfile(brokerId) }; }
  catch (e) { console.error("[broker-intel] failed:", e); return { ok: false, error: "טעינת פרופיל המתווך נכשלה." }; }
}
/** Manual: attribute broker listings to their office (safe backfill). */
export async function backfillOfficeInventoryAction(): Promise<{ ok: boolean; result?: BackfillResult; error?: string }> {
  try {
    const { profile } = await getSessionContext(); if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const result = await backfillOfficeInventoryFromBrokers(profile.org_id);
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[office-inventory backfill] failed:", e); return { ok: false, error: "שיוך נכסי הסוכנים נכשל." }; }
}

/** Phase 26.4.19 — READ-ONLY brand→branch→broker hierarchy. */
export async function getBrandHierarchyAction(city?: string): Promise<{ ok: boolean; result?: BrandHierarchy; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    return { ok: true, result: await getBrandHierarchy(city || null) };
  } catch (e) { console.error("[brand-identity] failed:", e); return { ok: false, error: "בניית ההיררכיה נכשלה." }; }
}

// ── Phase 26.4.18 — Office Intelligence Builder (candidate enrichment) ────────
export async function buildOfficeIntelligenceForCandidateAction(candidateId: string): Promise<{ ok: boolean; result?: EnrichmentResult; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !candidateId) return { ok: false, error: "יש להתחבר." };
    const result = await buildOfficeIntelligenceForCandidate(profile.org_id, candidateId);
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[office-intelligence] candidate failed:", e); return { ok: false, error: "העשרת המועמד נכשלה." }; }
}
export async function buildOfficeIntelligenceForCityAction(city: string): Promise<{ ok: boolean; result?: CityEnrichmentResult; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    const result = await buildOfficeIntelligenceForCity(profile.org_id, city);
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[office-intelligence] city failed:", e); return { ok: false, error: "העשרת העיר נכשלה." }; }
}

/** Phase 26.4.17 — READ-ONLY promotion debugger: why candidates (don't) promote. */
export async function getPromotionDebugAction(city: string): Promise<{ ok: boolean; result?: PromotionDebugDashboard; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    return { ok: true, result: await getPromotionDebug(city) };
  } catch (e) { console.error("[promotion-debug] failed:", e); return { ok: false, error: "ניתוח הקידום נכשל." }; }
}

/** Phase 26.4.14 — READ-ONLY repository cross-check: why City panels read 0. */
export async function crossCheckCityRepositoriesAction(city: string): Promise<{ ok: boolean; result?: CityRepositoryAudit; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    const result = await crossCheckCityRepositories(city);
    return { ok: true, result };
  } catch (e) { console.error("[city-repo-audit] failed:", e); return { ok: false, error: "בדיקת המאגרים נכשלה." }; }
}

/** Phase 26.4.13 — multi-step Brokerage Research Agent for a city (save-first,
 *  verify with public evidence, resumable). */
export async function runBrokerageResearchAgentAction(city: string, depth: ResearchDepth = "standard"): Promise<{ ok: boolean; result?: AgentReport; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return { ok: false, error: "יש להזין עיר ולהתחבר." };
    const result = await runBrokerageResearchAgent(profile.org_id, city, { depth });
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[research-agent] failed:", e); return { ok: false, error: "סוכן המחקר נכשל." }; }
}

/** READ-ONLY forensic pipeline audit — measures every discovery stage + cross-checks repos. */
export async function auditBrokerageDiscoveryPipelineAction(): Promise<BrokeragePipelineAudit | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await auditBrokerageDiscoveryPipeline();
  } catch (e) { console.error("[pipeline-audit] failed:", e); return null; }
}

/** READ-ONLY city discovery audit — explains why a city has few offices. */
export async function getCityDiscoveryAuditAction(city: string): Promise<CityDiscoveryAudit | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id || !city.trim()) return null;
    return await getCityDiscoveryAudit(city);
  } catch (e) { console.error("[city-discovery-audit] failed:", e); return null; }
}

/** Office directory (active, evidence-backed offices + agent/listing counts). Read-only. */
export async function getBrokerageOfficesIndexAction(): Promise<OfficesIndex | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getBrokerageOfficesIndex();
  } catch (e) { console.error("[offices-index] failed:", e); return null; }
}

/** National Research snapshot for the UI (provider status, queue, recent). */
export async function getResearchSnapshotAction(): Promise<ResearchSnapshot | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getResearchSnapshot();
  } catch (e) { console.error("[research] snapshot failed:", e); return null; }
}

/** PART 8 — single-broker research by id or name. apply=false → preview only. */
export async function researchSingleBrokerAction(idOrName: string, apply = false): Promise<{ ok: boolean; report?: ResearchReport; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const agentId = await resolveBrokerRef(idOrName);
    if (!agentId) return { ok: false, error: `מתווך לא נמצא: ${idOrName}` };
    const report = await researchBroker(agentId, { apply });
    if (apply) revalidatePath("/brokerage-data");
    return report ? { ok: true, report } : { ok: false, error: "מתווך לא נמצא." };
  } catch (e) { console.error("[research] single failed:", e); return { ok: false, error: "המחקר נכשל." }; }
}

/** RESUMABLE batch research — processes ONE small chunk and reports progress so
 *  the UI can auto-continue until done. Writes dossiers + candidates + auto-links. */
export async function runBrokerResearchAction(cap?: number): Promise<{ ok: boolean; diagnostics?: ResearchRunDiagnostics; progress?: BatchResearchProgress; note?: string | null; searchConfigured?: boolean; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const r = await researchAllBrokers(profile.org_id, typeof cap === "number" ? { cap } : {});
    revalidatePath("/brokerage-data");
    return { ok: true, diagnostics: r.diagnostics, progress: r.progress, note: r.note, searchConfigured: r.searchConfigured };
  } catch (e) { console.error("[research] batch failed:", e); return { ok: false, error: "ההרצה נכשלה." }; }
}

export interface BrokerIdentityView { pkg: BrokerIdentityPackage | null; stored: BrokerResolution | null }

/** Broker Identity profile read (package + last resolution). RLS-scoped via session. */
export async function getBrokerIdentityAction(agentId: string): Promise<BrokerIdentityView | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getBrokerIdentity(agentId);
  } catch (e) { console.error("[broker-identity] view failed:", e); return null; }
}

/** Resolve one broker on demand (rebuilds evidence + persists). Auth-only (dev/QA). */
export async function resolveBrokerIdentityAction(agentId: string): Promise<{ ok: boolean; resolution?: BrokerResolution; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const r = await resolveBrokerIdentity(agentId);
    revalidatePath("/brokerage-data");
    return r ? { ok: true, resolution: r } : { ok: false, error: "מתווך לא נמצא." };
  } catch (e) { console.error("[broker-identity] resolve failed:", e); return { ok: false, error: "השיוך נכשל." }; }
}

/** Batch Broker Identity Resolution. Auth-only (dev/QA; TODO restrict before launch). */
export async function runBrokerIdentityResolutionAction(): Promise<{ ok: boolean; result?: IdentityRunResult; error?: string }> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר." };
    const result = await resolveAllBrokerIdentities(profile.org_id, {});
    revalidatePath("/brokerage-data");
    return { ok: true, result };
  } catch (e) { console.error("[broker-identity] batch failed:", e); return { ok: false, error: "ההרצה נכשלה." }; }
}

export interface RegistryRunActionState { ok: boolean; result?: RegistryRunResult; error?: string }

/**
 * Run the National Brokerage Registry™ (Phase 26.11): candidate discovery →
 * evidence verification → office creation → merge suggestions → broker resolution
 * → knowledge edges. Owner-only (writes national data). AI suggests candidates
 * only; verification is evidence-based; no fabricated offices.
 */
export async function runNationalOfficeRegistryAction(): Promise<RegistryRunActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר כדי להפעיל את המרשם." };
    // TODO before launch: restrict to owner/admin. During dev/QA the registry is
    // intentionally open to any authenticated org user.
    const p = profile as { id?: string | null };
    console.info(`[brokerage-data] national registry by user=${p.id ?? "?"} org=${profile.org_id}`);
    const result = await runNationalOfficeRegistry(profile.org_id, p.id ?? null, {});
    revalidatePath("/brokerage-data");
    return result.ok ? { ok: true, result } : { ok: false, error: result.message };
  } catch (e) {
    console.error("[brokerage-data] registry run failed:", e);
    return { ok: false, error: "המרשם לא התחיל. נסה שוב בעוד רגע." };
  }
}

/** Owner-gated read of the registry snapshot (candidates/verified/merges/etc). */
export async function getOfficeRegistrySnapshotAction(): Promise<OfficeRegistrySnapshot | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    // Open to any authenticated org user during dev/QA (see registry action TODO).
    return await getOfficeRegistrySnapshot();
  } catch (e) { console.error("[brokerage-data] registry snapshot failed:", e); return null; }
}

export interface NationalDiscoveryActionState { ok: boolean; result?: BrokerageDiscoveryResult; error?: string }

/**
 * Run the National Brokerage Discovery Engine™ (Phase 26.10). Builds the office
 * graph from evidence (observed listings, shared contact, gated AI). Owner-only
 * (writes national office data). Never fabricates an office. Returns the full
 * breakdown for the UI.
 */
export async function runNationalBrokerageDiscoveryAction(): Promise<NationalDiscoveryActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר כדי להפעיל גילוי." };
    const access = await getBrokerageAccess();
    if (!access?.isOwner) return { ok: false, error: "גילוי משרדים לאומי זמין למנהל הסוכנות בלבד." };
    const p = profile as { id?: string | null };
    console.info(`[brokerage-data] national office discovery by user=${p.id ?? "?"} org=${profile.org_id}`);
    const result = await runNationalBrokerageDiscovery(profile.org_id, p.id ?? null, {});
    revalidatePath("/brokerage-data");
    return result.ok ? { ok: true, result } : { ok: false, error: result.skippedReason ?? result.message };
  } catch (e) {
    console.error("[brokerage-data] national discovery failed:", e);
    return { ok: false, error: "הגילוי לא התחיל. נסה שוב בעוד רגע." };
  }
}

export async function getBrokerageCommandCenterAction(opts: { city?: string | null; search?: string | null } = {}): Promise<BrokerageCommandCenter | null> {
  try { return await getBrokerageCommandCenter(opts); }
  catch (e) { console.error("[brokerage-data] command center failed:", e); return null; }
}

/** CANONICAL brokerage counters — the single source of truth (RLS-independent,
 *  matches the manual verification SQL). Gated by an authenticated org user with
 *  brokerage access. Returns an empty (all-zero) overview when not visible. */
export async function getBrokerageDataOverviewAction(): Promise<BrokerageDataOverview> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return EMPTY_BROKERAGE_OVERVIEW;
    const access = await getBrokerageAccess();
    if (!access) return EMPTY_BROKERAGE_OVERVIEW;
    return await getBrokerageDataOverview(profile.org_id);
  } catch (e) { console.error("[brokerage-data] overview failed:", e); return EMPTY_BROKERAGE_OVERVIEW; }
}

/** Real Broker Directory rows (canonical: brokerage_agents + links). Gated by an
 *  authenticated org user with brokerage access. Null when not visible. */
export async function getBrokerDirectoryAction(): Promise<BrokerDirectory | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    const access = await getBrokerageAccess();
    if (!access) return null;
    return await getBrokerDirectory();
  } catch (e) { console.error("[brokerage-data] directory failed:", e); return null; }
}

/** Deterministic DNA profile for an office (RLS-scoped; null if not visible). */
export async function getOfficeDnaAction(officeId: string): Promise<BrokerageDna | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getOfficeDna(officeId);
  } catch (e) { console.error("[brokerage-data] office DNA failed:", e); return null; }
}

/** Deterministic DNA profile for a broker (RLS-scoped; null if not visible). */
export async function getBrokerDnaAction(agentId: string): Promise<BrokerageDna | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getBrokerDna(agentId);
  } catch (e) { console.error("[brokerage-data] broker DNA failed:", e); return null; }
}

/**
 * AI reasoning over an office/broker DNA. OpenAI reasons over the deterministic
 * DNA evidence only (never the source of truth) via the official gateway, and
 * gracefully returns a config message when no OpenAI key is configured. Nothing
 * is persisted. RLS-scoped (null DNA when the entity isn't visible).
 */
export async function reasonBrokerageDnaAction(target: { type: "office" | "broker"; id: string }): Promise<DnaReasonResult> {
  try {
    const { profile, organization } = await getSessionContext();
    if (!profile?.org_id) return { dna: null, answer: null };
    const access = await getBrokerageAccess();
    const p = profile as { id?: string | null; full_name?: string | null };
    return await reasonBrokerageDna({
      type: target.type, id: target.id,
      orgId: profile.org_id, userId: p.id ?? null,
      orgName: organization?.name ?? null, userName: p.full_name ?? null,
      isManager: access?.isOwner ?? false,
    });
  } catch (e) {
    console.error("[brokerage-data] DNA reasoning failed:", e);
    return { dna: null, answer: null };
  }
}

export interface BrokerageActionState { error?: string; message?: string; stats?: ResolveStats }

/** Run Broker Identity Resolution across the org's external listings now.
 *  TODO before launch: restrict this action to owner/admin only. During QA /
 *  pre-launch testing it is intentionally open to any authenticated org user. */
export async function resolveBrokerageNowAction(): Promise<BrokerageActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { error: "יש להתחבר כדי להפעיל סריקה." };
    // Audit: record who started the scan (no service-role on the client).
    console.info(`[brokerage-data] identity scan started by user=${profile.id ?? "?"} org=${profile.org_id}`);
    const stats = await resolveBrokerageLinksForOrg(profile.org_id);
    revalidatePath("/brokerage-data");
    return {
      stats,
      message: `זוהו ${stats.linked} קישורים אוטומטיים · ${stats.review} לבדיקה · ${stats.candidates} מועמדים (מתוך ${stats.scanned} מודעות).`,
    };
  } catch (e) {
    console.error("[brokerage-data] resolve scan failed:", e);
    return { error: "הסריקה לא התחילה. נסה שוב בעוד רגע." };
  }
}

/** Queue a brokerage intelligence refresh / initial scan.
 *  TODO before launch: restrict this action to owner/admin only. During QA /
 *  pre-launch testing it is intentionally open to any authenticated org user. */
export async function requestBrokerageRefreshAction(params: Record<string, unknown>): Promise<BrokerageActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { error: "יש להתחבר כדי להפעיל סריקה." };
    // Audit: recordRefreshRequest persists the request row (who/when) already.
    console.info(`[brokerage-data] refresh requested by user=${profile.id ?? "?"} org=${profile.org_id}`);
    await recordRefreshRequest(params);
    revalidatePath("/brokerage-data");
    return { message: "בקשת הסריקה נרשמה ✓ — המודיעין יתעדכן ברקע." };
  } catch (e) {
    console.error("[brokerage-data] refresh request failed:", e);
    return { error: "הסריקה לא התחילה. נסה שוב בעוד רגע." };
  }
}

export interface StartRefreshActionState { ok: boolean; runId: string | null; status: string; message?: string; error?: string }

/**
 * Start the brokerage data scan / initial intelligence scan. Wires the button to
 * the REAL synchronous identity-resolution flow (no new engine), persists a
 * brokerage_refresh_runs row (running → completed/failed) and returns a typed
 * result the UI can render. Idempotent per org (a running scan is reused).
 *
 * TODO before launch: restrict this action to owner/admin only. During QA /
 * pre-launch testing it is intentionally open to any authenticated org user.
 */
export async function startBrokerageDataRefreshAction(params: Record<string, unknown> = {}): Promise<StartRefreshActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, runId: null, status: "failed", error: "יש להתחבר כדי להפעיל סריקה." };
    console.info(`[brokerage-data] scan button pressed user=${profile.id ?? "?"} org=${profile.org_id}`);
    const r = await startBrokerageDataRefresh(profile.org_id, profile.id ?? null, params);
    revalidatePath("/brokerage-data");
    // Surface the REAL reason (e.g. a stalled/partial pipeline) instead of a generic error.
    if (!r.ok) return { ok: false, runId: r.runId, status: r.status, error: r.message ?? "הסריקה לא התחילה. בדוק חיבור או נסה שוב." };
    return { ok: true, runId: r.runId, status: r.status, message: r.message };
  } catch (e) {
    console.error("[brokerage-data] start refresh failed:", e);
    return { ok: false, runId: null, status: "failed", error: "הסריקה לא התחילה. בדוק חיבור או נסה שוב." };
  }
}

export interface DiscoveryActionState { ok: boolean; result?: DiscoveryResult; error?: string }

/**
 * Discover broker/agent publishers from the org's already-ingested external
 * listings (lawful `listing_publishers` provider — no web scraping). New brokers
 * are persisted as candidates and deduped. Owner/admin only (writes national
 * candidate data). Friendly Hebrew errors.
 */
export async function discoverBrokeragePublishersAction(): Promise<DiscoveryActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר כדי להפעיל גילוי." };
    const access = await getBrokerageAccess();
    if (!access?.isOwner) return { ok: false, error: "גילוי מפרסמים זמין למנהל הסוכנות בלבד." };
    const p = profile as { id?: string | null };
    console.info(`[brokerage-data] publisher discovery by user=${p.id ?? "?"} org=${profile.org_id}`);
    const result = await discoverBrokeragePublishers(profile.org_id, p.id ?? null);
    revalidatePath("/brokerage-data");
    return result.ran ? { ok: true, result } : { ok: false, error: result.message };
  } catch (e) {
    console.error("[brokerage-data] discovery action failed:", e);
    return { ok: false, error: "הגילוי לא התחיל. נסה שוב בעוד רגע." };
  }
}

/**
 * On-demand Broker→Office evidence + (optional) evidence-only OpenAI reasoning.
 * Deterministic evidence always returned; AI reasons over it only when usable
 * evidence exists and a key is configured (graceful otherwise). RLS-scoped.
 */
export async function reasonBrokerOfficeAction(agentId: string): Promise<BrokerOfficeReasonResult | null> {
  try {
    const { profile, organization } = await getSessionContext();
    if (!profile?.org_id) return null;
    const access = await getBrokerageAccess();
    const p = profile as { id?: string | null; full_name?: string | null };
    return await reasonBrokerOffice(agentId, {
      orgId: profile.org_id, userId: p.id ?? null, orgName: organization?.name ?? null,
      userName: p.full_name ?? null, isManager: access?.isOwner ?? false,
    });
  } catch (e) { console.error("[brokerage-data] office reasoning failed:", e); return null; }
}

/** Profile extras for the broker/office drawer (linked listings, office brokers). */
export async function getProfileExtrasAction(kind: "broker" | "office", id: string): Promise<ProfileExtras | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getProfileExtras(kind, id);
  } catch (e) { console.error("[brokerage-data] profile extras failed:", e); return null; }
}

/** Deterministic office evidence only (no AI) — RLS-scoped. */
export async function getBrokerOfficeEvidenceAction(agentId: string) {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await gatherBrokerOfficeEvidence(agentId);
  } catch (e) { console.error("[brokerage-data] office evidence failed:", e); return null; }
}

/** Poll a refresh run's status (client never sees service-role). */
export async function getBrokerageRefreshStatusAction(runId: string): Promise<{ status: string; updatedRecords: number } | null> {
  try { return await getRefreshRunStatus(runId); }
  catch (e) { console.error("[brokerage-data] refresh status failed:", e); return null; }
}

export async function reviewMatchAction(matchId: string, decision: "approve" | "reject"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await reviewIdentityMatch(matchId, decision);
    revalidatePath("/brokerage-data");
    return { message: decision === "approve" ? "ההתאמה אושרה ✓" : "ההתאמה נדחתה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function resolveConflictAction(conflictId: string, resolution: "resolved" | "ignored"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await resolveDataConflict(conflictId, resolution);
    revalidatePath("/brokerage-data");
    return { message: resolution === "resolved" ? "הקונפליקט נפתר ✓" : "הקונפליקט הוסתר" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function decideLinkAction(linkId: string, decision: "confirmed" | "rejected"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await decideListingLink(linkId, decision);
    revalidatePath("/brokerage-data");
    return { message: decision === "confirmed" ? "הקישור אושר ✓" : "הקישור נדחה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}
