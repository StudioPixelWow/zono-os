"use server";
// ============================================================================
// ZONO Buyer Demand Intelligence — server actions.
// ============================================================================
import { revalidatePath } from "next/cache";
import { recomputeDemand, dismissAcquisitionSignal, type RecomputeSummary } from "./service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function recomputeDemandAction(): Promise<Result<RecomputeSummary>> {
  try {
    const data = await recomputeDemand();
    revalidatePath("/demand");
    return { ok: true, data };
  } catch (e) { return fail(e); }
}

export async function dismissAcquisitionSignalAction(id: string): Promise<Result<null>> {
  try {
    await dismissAcquisitionSignal(id);
    revalidatePath("/demand");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
