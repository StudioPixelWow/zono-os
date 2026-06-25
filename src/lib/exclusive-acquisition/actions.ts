"use server";
// ============================================================================
// ZONO — Exclusive Acquisition server actions (org-scoped via session).
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  getExclusiveDashboard, getTopSellersToday, recomputeExclusiveAcquisitionForOrg,
  recordSellerOutcome, recordSellerTouchpoint,
} from "./engine";
import type { ContactPriorityItem, ExclusiveDashboard, SellerLifecycleStage, SellerOutcome, TouchpointChannel } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

export async function getExclusiveDashboardAction(): Promise<Result<ExclusiveDashboard>> {
  try { return { ok: true, data: await getExclusiveDashboard() }; } catch (e) { return fail(e); }
}

export async function recomputeExclusiveAcquisitionAction(): Promise<Result<{ evaluated: number; created: number; updated: number; followupsCreated: number }>> {
  try {
    const data = await recomputeExclusiveAcquisitionForOrg();
    revalidatePath("/exclusive-opportunities");
    return { ok: true, data };
  } catch (e) { return fail(e); }
}

export async function getTopSellersTodayAction(): Promise<Result<ContactPriorityItem[]>> {
  try { return { ok: true, data: await getTopSellersToday() }; } catch (e) { return fail(e); }
}

export async function recordSellerTouchpointAction(profileId: string, channel: TouchpointChannel, outcome: string | null, notes: string | null): Promise<Result<{ ok: true }>> {
  try {
    await recordSellerTouchpoint(profileId, channel, outcome, notes);
    revalidatePath("/exclusive-opportunities");
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}

export async function recordSellerOutcomeAction(profileId: string, outcome: SellerOutcome, notes: string | null): Promise<Result<{ stage: SellerLifecycleStage }>> {
  try {
    const stage = await recordSellerOutcome(profileId, outcome, notes);
    revalidatePath("/exclusive-opportunities");
    return { ok: true, data: { stage } };
  } catch (e) { return fail(e); }
}
