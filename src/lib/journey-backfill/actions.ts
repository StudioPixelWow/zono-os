"use server";
// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.3 · Journey backfill server actions.
//
// A "use server" module may export ONLY async functions. Types live in ./plan.
// Both actions are READ-SAFE by default: the diagnostic writes nothing, and the
// backfill is org-scoped through RLS and idempotent.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  backfillMyOrgJourneys, getJourneyBackfillDiagnostics,
} from "./service";

export async function journeyBackfillDiagnosticsAction() {
  try {
    const d = await getJourneyBackfillDiagnostics();
    return { ok: true as const, diagnostics: d };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "diagnostics failed" };
  }
}

export async function runJourneyBackfillAction(dryRun = true) {
  try {
    const r = await backfillMyOrgJourneys(dryRun);
    if (!dryRun) revalidatePath("/journeys");
    return { ok: true as const, dryRun, ...r };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "backfill failed" };
  }
}
