"use server";
/**
 * Deal Execution server actions. Thin wrappers over the service; deterministic,
 * no LLM, no auto-contact. Each revalidates /deals.
 */
import { revalidatePath } from "next/cache";
import {
  addObjection as svcAddObjection, advanceDealStage as svcAdvance, logNegotiation as svcLogNeg,
  recomputeDeals as svcRecompute, resolveObjection as svcResolveObjection, setDealTaskStatus as svcSetTask,
  type DealCloseOutcome,
} from "./service";
import type { DealStage } from "./engine";

export async function recomputeDealsAction() {
  const r = await svcRecompute();
  revalidatePath("/deals");
  return r;
}

export async function advanceDealStageAction(dealId: string, stage: DealStage, outcome?: DealCloseOutcome) {
  await svcAdvance(dealId, stage, outcome);
  revalidatePath("/deals");
  revalidatePath("/revenue");
}

export async function logNegotiationAction(dealId: string, input: { asking: number | null; buyerOffer: number | null; sellerCounter: number | null; note?: string }) {
  await svcLogNeg(dealId, input);
  revalidatePath("/deals");
}

export async function addObjectionAction(dealId: string, type: string, severity: string, description?: string) {
  await svcAddObjection(dealId, type, severity, description);
  revalidatePath("/deals");
}

export async function resolveObjectionAction(objectionId: string) {
  await svcResolveObjection(objectionId);
  revalidatePath("/deals");
}

export async function setDealTaskStatusAction(taskId: string, status: string) {
  await svcSetTask(taskId, status);
  revalidatePath("/deals");
}
