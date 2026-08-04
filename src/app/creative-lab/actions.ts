"use server";
// ============================================================================
// ZONO — /creative-lab server actions (TEST RUNTIME ONLY). Thin wrappers: read
// the deterministic test-session cookie, then delegate to the next-free flow
// logic in lab-flows.ts (which drives the real CreativeContentService against
// the guarded in-memory runtime). No Supabase, no OpenAI.
// ============================================================================
import { cookies } from "next/headers";
import { resolveTestSession } from "@/lib/creative-runtime/fixtures";
import {
  worldFor, listOutputs, doGenerate, doTransition, doPublish, doBulk,
  type LabSession, type LabActionResult, type BulkResult, type LabWorld,
} from "@/lib/creative-runtime/lab-flows";
import { LAB_SESSION_COOKIE } from "./shared";

export async function getLabSession(): Promise<LabSession> {
  const token = (await cookies()).get(LAB_SESSION_COOKIE)?.value ?? "anonymous";
  return resolveTestSession(token);
}

export async function getLabWorld(): Promise<LabWorld> {
  return worldFor(await getLabSession());
}

export async function listOutputsAction(): Promise<LabActionResult> {
  return listOutputs(await getLabSession());
}

export async function generateAction(input: { kind: string; prompt: string; contentItemId?: string | null; idempotencyKey?: string | null }): Promise<LabActionResult> {
  return doGenerate(await getLabSession(), input);
}

export async function approveAction(outputId: string): Promise<LabActionResult> { return doTransition(await getLabSession(), outputId, "approve"); }
export async function rejectAction(outputId: string): Promise<LabActionResult> { return doTransition(await getLabSession(), outputId, "reject"); }
export async function scheduleAction(outputId: string): Promise<LabActionResult> { return doTransition(await getLabSession(), outputId, "schedule"); }

export async function publishAction(input: { outputId: string; platform: string; variantKey: string }): Promise<LabActionResult> {
  return doPublish(await getLabSession(), input);
}

export async function bulkGenerateAction(input: { propertyIds: string[]; kind: string; concurrency?: number }): Promise<BulkResult> {
  return doBulk(await getLabSession(), input);
}
