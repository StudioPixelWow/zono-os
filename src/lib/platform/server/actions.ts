"use server";
// ============================================================================
// ZONO — platform admin server actions (admin/owner only, org-scoped).
// Health Center fetch, feature-flag read/write, and audit-trail read. Every
// flag mutation is itself recorded to the central audit log.
// ============================================================================
import { revalidatePath } from "next/cache";
import { assertPlatformAdminAccess } from "./permissions";
import { createPlatformRepository, flagRowToFeatureFlag, type FlagRow, type AuditRow } from "./repository";
import { buildSystemHealth } from "./health-service";
import { recordAudit } from "./audit";
import { evaluateFlag } from "../feature-flags/flags";
import type { HealthReport, PlatformAlert } from "../types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

/** Health Center snapshot (admin only). */
export async function getSystemHealthAction(): Promise<Result<{ report: HealthReport; alerts: PlatformAlert[] }>> {
  try {
    await assertPlatformAdminAccess();
    const { report, alerts } = await buildSystemHealth();
    return { ok: true, data: { report, alerts } };
  } catch (e) { return fail(e); }
}

/** List feature flags for the org (with global defaults), plus current evaluation. */
export async function listFeatureFlagsAction(): Promise<Result<{ flags: FlagRow[]; evaluated: Record<string, boolean> }>> {
  try {
    const a = await assertPlatformAdminAccess();
    const rows = await createPlatformRepository(a.db).listFlags(a.orgId);
    const evaluated: Record<string, boolean> = {};
    for (const r of rows) {
      if ((r.deny_users ?? []).includes(a.userId)) { evaluated[r.flag_key] = false; continue; }
      evaluated[r.flag_key] = evaluateFlag(flagRowToFeatureFlag(r), { environment: ENV, orgId: a.orgId, roleKey: a.roleKey, userId: a.userId });
    }
    return { ok: true, data: { flags: rows, evaluated } };
  } catch (e) { return fail(e); }
}

export async function upsertFeatureFlagAction(input: {
  flagKey: string; enabled: boolean; description?: string | null; rolloutPct?: number;
  minRole?: string | null; allowUsers?: string[]; denyUsers?: string[]; environments?: string[];
}): Promise<Result<{ flag: FlagRow | null }>> {
  try {
    const a = await assertPlatformAdminAccess();
    const repo = createPlatformRepository(a.db);
    const existing = (await repo.listFlags(a.orgId)).find((f) => f.flag_key === input.flagKey && f.org_id === a.orgId) ?? null;
    const flag = await repo.upsertFlag(a.orgId, { ...input, updatedBy: a.userId });
    await recordAudit({
      orgId: a.orgId, actorUserId: a.userId, actorLabel: a.actorLabel,
      action: "flag.update", entityType: "feature_flag", entityId: input.flagKey,
      before: existing ? { enabled: existing.enabled, rollout_pct: existing.rollout_pct, min_role: existing.min_role } : null,
      after: { enabled: input.enabled, rollout_pct: input.rolloutPct ?? 0, min_role: input.minRole ?? null },
      source: "app",
    });
    revalidatePath("/platform-admin");
    return { ok: true, data: { flag } };
  } catch (e) { return fail(e); }
}

/** Read the org's audit trail (admin only). */
export async function listAuditLogAction(opts: { limit?: number; action?: string; resourceType?: string } = {}): Promise<Result<{ entries: AuditRow[] }>> {
  try {
    const a = await assertPlatformAdminAccess();
    const entries = await createPlatformRepository(a.db).listAudit(a.orgId, opts);
    return { ok: true, data: { entries } };
  } catch (e) { return fail(e); }
}
