"use server";
// ============================================================================
// ZONO — Competitor Intelligence server actions (org-scoped). Dashboard fetch,
// snapshot run, alert read. All data derives from PUBLIC market listings.
// ============================================================================
import { revalidatePath } from "next/cache";
import { composeCompetitorDashboard, runCompetitorIntelligenceSnapshotJob, getCompetitorOfficeWidget } from "./engine";
import { getCompetitorAccess } from "./permissions";
import { createCompetitorRepository } from "./repository";
import type { CompetitorDashboard, CompetitorSnapshotResult } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

export async function getCompetitorDashboardAction(): Promise<Result<CompetitorDashboard>> {
  try { return { ok: true, data: await composeCompetitorDashboard() }; } catch (e) { return fail(e); }
}

export async function runCompetitorSnapshotAction(): Promise<Result<CompetitorSnapshotResult>> {
  try { const d = await runCompetitorIntelligenceSnapshotJob(); revalidatePath("/competitor-intelligence"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}

export async function getCompetitorWidgetAction(): Promise<Result<Awaited<ReturnType<typeof getCompetitorOfficeWidget>>>> {
  try { return { ok: true, data: await getCompetitorOfficeWidget() }; } catch (e) { return fail(e); }
}

export async function markCompetitorAlertReadAction(alertId: string): Promise<Result<{ ok: true }>> {
  try {
    const a = await getCompetitorAccess();
    await createCompetitorRepository(a.db).markAlertRead(a.orgId, alertId);
    revalidatePath("/competitor-intelligence");
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}
