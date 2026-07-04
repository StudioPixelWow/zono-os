"use server";
// ============================================================================
// 🎁 ZONO — Autonomous Office™ · Approval Bundle actions. PHASE 44.0.
// READ (build) + APPROVE (routes to existing approval-gated creators) + REJECT.
// No auto-send, no auto-publish, no auto-book.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  getEntityBundles, getInboxBundles, buildBundleForEvent, approveBundle, rejectBundle,
  answerBundleWhy, answerBundleWhatIf, answerMostUrgent, type ApproveResult, type BundleAsk,
} from "./service";
import type { ApprovalBundle, BundleEntityType, BundleEventType, ActionType } from "./types";

export async function getEntityBundlesAction(input: { entityType: BundleEntityType; entityId: string }): Promise<{ bundles: ApprovalBundle[] }> {
  return { bundles: await getEntityBundles(input.entityType, input.entityId) };
}
export async function getInboxBundlesAction(): Promise<{ bundles: ApprovalBundle[] }> {
  return { bundles: await getInboxBundles() };
}
export async function buildBundleForEventAction(input: { eventType: BundleEventType; entityType: BundleEntityType; entityId: string }): Promise<{ bundle: ApprovalBundle }> {
  return { bundle: await buildBundleForEvent(input.eventType, input.entityType, input.entityId) };
}
/** APPROVAL-GATED — creates only approval-gated artifacts (missions/workflows/drafts/notification). */
export async function approveBundleAction(input: { bundleId: string; which: ActionType | "all" }): Promise<ApproveResult> {
  const r = await approveBundle(input.bundleId, input.which);
  if (r.ok) { revalidatePath("/today"); revalidatePath("/my"); }
  return r;
}
export async function rejectBundleAction(input: { bundleId: string }): Promise<{ ok: boolean }> {
  const r = await rejectBundle(input.bundleId);
  revalidatePath("/today");
  return r;
}
export async function askBundleWhyAction(input: { bundleId: string }): Promise<BundleAsk> { return answerBundleWhy(input.bundleId); }
export async function askBundleWhatIfAction(input: { bundleId: string }): Promise<BundleAsk> { return answerBundleWhatIf(input.bundleId); }
export async function askMostUrgentAction(): Promise<BundleAsk> { return answerMostUrgent(); }
