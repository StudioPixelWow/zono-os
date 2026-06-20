"use server";
/**
 * Transactions Intelligence server actions. Thin wrappers over the service.
 * Deterministic, no LLM, no auto-contact. Each revalidates the relevant pages.
 */
import { revalidatePath } from "next/cache";
import {
  createAcquisitionTaskFromAlert as svcAcqTask, detectTransactionOpportunity as svcDetect, ensureCoverageTargetsForAgent as svcEnsure,
  generateBuildingIntelligence as svcBuilding, generateStreetIntelligence as svcStreet, refreshAgentCityRecent as svcRefresh,
  researchPropertyAgainstTransactions as svcResearch, retryFailedTransactionSyncs as svcRetry, setRadarAlertStatus as svcRadarStatus,
  syncCoverageTarget as svcSyncTarget, syncTransactionsForAgent as svcSync, type ResearchSaveInput,
} from "./service";

export async function ensureCoverageTargetsAction() {
  const r = await svcEnsure();
  revalidatePath("/transactions/coverage");
  revalidatePath("/transactions");
  return r;
}

export async function syncTransactionsAction() {
  const r = await svcSync("all");
  revalidatePath("/transactions");
  revalidatePath("/transactions/coverage");
  revalidatePath("/transactions/streets");
  return r;
}

export async function refreshRecentAction() {
  const r = await svcRefresh();
  revalidatePath("/transactions");
  revalidatePath("/transactions/coverage");
  return r;
}

export async function syncCoverageTargetAction(targetId: string) {
  const r = await svcSyncTarget(targetId);
  revalidatePath("/transactions/coverage");
  revalidatePath("/transactions");
  return r;
}

export async function retryFailedSyncsAction() {
  const r = await svcRetry();
  revalidatePath("/transactions/coverage");
  return r;
}

export async function researchPropertyAction(input: ResearchSaveInput, save = true) {
  const r = await svcResearch(input, save);
  if (input.propertyListingId) revalidatePath(`/properties/${input.propertyListingId}`);
  return { result: r.result, reportId: r.reportId };
}

export async function detectOpportunityAction(input: ResearchSaveInput) {
  const r = await svcDetect(input);
  revalidatePath("/transactions/radar");
  return r;
}

export async function generateBuildingIntelAction(cityName: string, normalizedAddress: string) {
  return svcBuilding(cityName, normalizedAddress);
}

export async function generateStreetIntelAction(cityName: string, street: string) {
  const r = await svcStreet(cityName, street);
  revalidatePath("/transactions/streets");
  return r;
}

export async function setRadarAlertStatusAction(alertId: string, status: string) {
  await svcRadarStatus(alertId, status);
  revalidatePath("/transactions/radar");
}

export async function createAcquisitionTaskFromAlertAction(alertId: string) {
  await svcAcqTask(alertId);
  revalidatePath("/transactions/radar");
}

export async function debugTransactionsAction(city: string, neighborhood: string | null) {
  const { debugTransactionsActor } = await import("./providers");
  return debugTransactionsActor(city, neighborhood, 5);
}

export async function syncMadlanAction() {
  const { syncMadlanForAgent } = await import("./service");
  const r = await syncMadlanForAgent();
  revalidatePath("/transactions");
  revalidatePath("/transactions/streets");
  return r;
}

export async function debugMadlanAction(city: string, neighbourhood: string | null) {
  const { debugMadlanDeals } = await import("./madlan");
  return debugMadlanDeals(city, neighbourhood);
}

// ── Non-blocking GovMap sync (PRIMARY, live count) ───────────────────────────
export async function startGovmapSyncAction() {
  const { startGovmapSync } = await import("./service");
  return startGovmapSync("60"); // last 5 years — recent, cost-bounded
}

export async function pollGovmapSyncAction(runId: string) {
  const { pollGovmapSync } = await import("./service");
  return pollGovmapSync(runId);
}

export async function finishGovmapSyncAction(datasetId: string) {
  const { finishGovmapSync } = await import("./service");
  const r = await finishGovmapSync(datasetId);
  revalidatePath("/transactions");
  revalidatePath("/transactions/streets");
  return r;
}

export async function addCoverageNeighborhoodAction(neighborhood: string) {
  const { addCoverageNeighborhood } = await import("./service");
  const r = await addCoverageNeighborhood(neighborhood);
  revalidatePath("/transactions/coverage");
  revalidatePath("/transactions");
  return r;
}

// ── Non-blocking Madlan sync (live progress) ─────────────────────────────────
export async function startMadlanSyncAction() {
  const { startMadlanSync } = await import("./service");
  return startMadlanSync();
}

export async function pollMadlanSyncAction(runId: string) {
  const { pollMadlanSync } = await import("./service");
  return pollMadlanSync(runId);
}

export async function finishMadlanSyncAction(datasetId: string) {
  const { finishMadlanSync } = await import("./service");
  const r = await finishMadlanSync(datasetId);
  revalidatePath("/transactions");
  revalidatePath("/transactions/streets");
  return r;
}
