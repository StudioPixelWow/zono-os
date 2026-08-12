// ============================================================================
// ZONO — P7.0 Enforcement · server layer (server-only). PREPARATION ONLY.
// Mode is config-driven (enforcement_config) with a SAFE DEFAULT of SHADOW when
// the table/row is absent — so deploying P7.0 enforces nothing. The two seams
// are the ONLY enforcement boundaries; today they allow everything (shadow).
// The mode-change writer is capability-gated + audited but not executed by P7.0.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "@/lib/platform-admin/server/auth";
import { writePlatformAudit } from "@/lib/platform-admin/server/audit";
import { getOrgLimits, type OrgLimits } from "@/lib/limits/server/limits";
import { LIMIT_KEYS, type LimitKey } from "@/lib/limits/model";
import {
  DEFAULT_MODE, decideEnforcement, classifyLimitReadiness,
  type EnforcementMode, type EnforcementDecision, type LimitReadiness,
} from "../model";

// Atomic DB guard (enforce_limit_lock) ships in the P7.0 migration but is NOT
// applied yet → concurrency-sensitive limits remain NEEDS_ATOMIC_GUARD until then.
const ATOMIC_GUARD_AVAILABLE = false;

type CfgRow = { scope: string; organization_id: string | null; mode: string };
async function readConfig(controlType: "feature" | "limit", controlKey: string, orgId: string): Promise<{ mode: EnforcementMode; tableMissing: boolean }> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await (db.from("enforcement_config" as never)
      .select("scope,organization_id,mode")
      .eq("control_type", controlType).eq("control_key", controlKey) as unknown as Promise<{ data: unknown; error: { message?: string } | null }>);
    if (error) {
      const missing = /enforcement_config.* does not exist|could not find the table/i.test(error.message ?? "");
      return { mode: DEFAULT_MODE, tableMissing: missing };
    }
    const rows = (data ?? []) as CfgRow[];
    const orgRow = rows.find((r) => r.scope === "org" && r.organization_id === orgId);
    const globalRow = rows.find((r) => r.scope === "global");
    const mode = (orgRow?.mode ?? globalRow?.mode ?? DEFAULT_MODE) as EnforcementMode;
    return { mode, tableMissing: false };
  } catch { return { mode: DEFAULT_MODE, tableMissing: false }; }
}

/** Is this org a pilot participant for this control? (org-scoped PILOT row). */
async function isPilotOrg(controlType: "feature" | "limit", controlKey: string, orgId: string): Promise<boolean> {
  const { mode } = await readConfig(controlType, controlKey, orgId);
  return mode === "PILOT";
}

// ── Canonical enforcement seams (SHADOW today → always allow) ───────────────
export interface EnforceResult extends EnforcementDecision { orgId: string; controlKey: string; usage?: number | null; configuredLimit?: number | null }

export async function assertWithinLimitEnforced(orgId: string, limitKey: LimitKey): Promise<EnforceResult> {
  const { mode } = await readConfig("limit", limitKey, orgId);
  const org = await getOrgLimits(orgId);
  const res = org.limits.find((l) => l.limitKey === limitKey);
  const available = !!res && res.mode !== "UNAVAILABLE" && res.usage !== null && res.configuredLimit !== null;
  const decision = decideEnforcement({
    mode, wouldBlock: !!res?.exceeded, available, isPilotOrg: mode === "PILOT", code: "LIMIT_REACHED",
  });
  return { ...decision, orgId, controlKey: limitKey, usage: res?.usage ?? null, configuredLimit: res?.configuredLimit ?? null };
}

/** Feature-access seam (fail-CLOSED when ENFORCED). `denied` from the P5.4 resolver. */
export async function assertFeatureAccessEnforced(orgId: string, featureKey: string, denied: boolean, available: boolean): Promise<EnforceResult> {
  const { mode } = await readConfig("feature", featureKey, orgId);
  // feature access fails CLOSED: if the check is unavailable under ENFORCED, deny.
  const applies = mode === "ENFORCED" || (mode === "PILOT" && await isPilotOrg("feature", featureKey, orgId));
  if (applies && !available) {
    return { orgId, controlKey: featureKey, decision: "deny", enforced: true, mode, wouldBlock: true, code: "ACCESS_ENFORCEMENT_ERROR", reason: "בדיקת גישה נכשלה — fail-closed" };
  }
  const decision = decideEnforcement({ mode, wouldBlock: denied, available, isPilotOrg: mode === "PILOT", code: "FEATURE_NOT_AVAILABLE" });
  return { ...decision, orgId, controlKey: featureKey };
}

// ── Enforcement readiness report (platform view) ────────────────────────────
export interface EnforcementReadinessReport {
  atomicGuardAvailable: boolean;
  limits: (LimitReadiness & { globalMode: EnforcementMode })[];
  generatedAt: string;
  note: string;
}
export async function getEnforcementReadiness(): Promise<EnforcementReadinessReport> {
  await assertPlatformCapability("platform.entitlements.read");
  // Use one representative org to determine availability/config presence per limit.
  const orgs = await createServiceRoleClient().from("organizations" as never).select("id").limit(1) as unknown as { data: { id: string }[] | null };
  const sampleOrg = ((await (orgs as unknown as Promise<{ data: { id: string }[] | null }>)).data ?? [])[0]?.id;
  let sample: OrgLimits | null = null;
  if (sampleOrg) sample = await getOrgLimits(sampleOrg);

  const limits: (LimitReadiness & { globalMode: EnforcementMode })[] = [];
  for (const key of LIMIT_KEYS) {
    const res = sample?.limits.find((l) => l.limitKey === key);
    const usageAvailable = !!res && res.mode !== "UNAVAILABLE";
    const hasCap = !!res && res.configuredLimit !== null && res.configuredLimit >= 0;
    const r = classifyLimitReadiness(key, usageAvailable, hasCap, ATOMIC_GUARD_AVAILABLE);
    const { mode } = await readConfig("limit", key, sampleOrg ?? "");
    limits.push({ ...r, globalMode: mode });
  }
  return {
    atomicGuardAvailable: ATOMIC_GUARD_AVAILABLE,
    limits,
    generatedAt: new Date().toISOString(),
    note: "מצב צל בכל השליטות. אכיפה תופעל רק לפי קונפיגורציה מפורשת (enforcement_config) — לא ע״י פריסת קוד.",
  };
}

// ── Mode-change writer (capability-gated + audited; NOT executed by P7.0) ────
export async function setEnforcementMode(
  controlType: "feature" | "limit", controlKey: string, mode: EnforcementMode,
  scope: "global" | "org", orgId: string | null, reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await assertPlatformCapability("platform.entitlements.manage");
  if (!reason?.trim()) return { ok: false, error: "reason required" };
  if (scope === "org" && !orgId) return { ok: false, error: "org scope requires orgId" };
  try {
    const db = createServiceRoleClient();
    const prev = await readConfig(controlType, controlKey, orgId ?? "");
    const { error } = await db.from("enforcement_config" as never).upsert(
      { scope, organization_id: scope === "org" ? orgId : null, control_type: controlType, control_key: controlKey, mode, reason, updated_by: operator.userId } as never,
      { onConflict: "scope,organization_id,control_type,control_key" } as never,
    );
    if (error) return { ok: false, error: error.message };
    await writePlatformAudit({
      operator, capability: "platform.entitlements.manage",
      action: controlType === "feature" ? "access.enforcement.mode.change" : "limit.enforcement.mode.change",
      targetOrgId: orgId, resourceType: "enforcement_config", resourceId: controlKey, reason,
      metadata: { controlType, controlKey, scope, from: prev.mode, to: mode },
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "mode change failed" }; }
}
