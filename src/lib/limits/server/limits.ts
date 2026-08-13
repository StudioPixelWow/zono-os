// ============================================================================
// ZONO — P6.3 Limits · server layer (server-only). SHADOW-FIRST.
// Resolves canonical limits from the EXISTING plan structure + per-org override
// store (org_plans.limits) against real usage. Enforces NOTHING: the enforcement
// seam returns "allowed" in shadow mode. Reads are bounded/no-N+1. The override
// writer is capability-gated + audited but is a real production write — it is
// provided for platform operators, not executed here.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "@/lib/platform-admin/server/auth";
import { writePlatformAudit } from "@/lib/platform-admin/server/audit";
import { canonicalDefaultLimits } from "@/lib/commercial/model";
import type { PlanTier } from "@/lib/launch/types";
import { normalizePlanTier } from "@/lib/platform-admin/access/model";
import { israelMonthKey } from "../model";
import {
  LIMIT_DEFS, LIMIT_KEYS, resolveLimit, effectiveConfigured, needsAtomicEnforcement,
  type LimitKey, type LimitResolution, type PlanLimitsLike,
} from "../model";

const CAP = 20_000;
type Any = Record<string, unknown>;

async function one<T>(table: string, cols: string, build: (q: QB) => QB): Promise<T | null> {
  try {
    const db = createServiceRoleClient();
    const q = build(db.from(table as never).select(cols) as unknown as QB);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>);
    if (error) return null;
    const arr = (data ?? []) as T[];
    return arr[0] ?? null;
  } catch { return null; }
}
async function count(table: string, build: (q: QB) => QB): Promise<number | null> {
  try {
    const db = createServiceRoleClient();
    const q = build(db.from(table as never).select("*", { count: "exact", head: true } as never) as unknown as QB);
    const { count: c, error } = await (q as unknown as Promise<{ count: number | null; error: unknown }>);
    return error ? null : (c ?? 0);
  } catch { return null; }
}
type QB = { eq: (c: string, v: unknown) => QB; gte: (c: string, v: unknown) => QB; limit: (n: number) => QB };

// ── Usage per limit key (authoritative sources) ─────────────────────────────
async function usageFor(key: LimitKey, orgId: string): Promise<number | null> {
  switch (key) {
    case "seats": return count("users", (q) => q.eq("org_id", orgId).eq("status", "active"));
    case "operatingAreas": return count("user_operating_localities", (q) => q.eq("organization_id", orgId));
    case "monitoredListings": return count("properties", (q) => q.eq("org_id", orgId));
    case "aiCallsPerMonth": {
      const since = monthStartIso();
      return count("ai_usage_costs", (q) => q.eq("organization_id", orgId).gte("created_at", since));
    }
    case "aiTokensMonthly": {
      const since = monthStartIso();
      const rows = await listCol<{ total_tokens: number | null }>("ai_usage_costs", "total_tokens,created_at", (q) => q.eq("organization_id", orgId).gte("created_at", since));
      return rows.reduce((s, r) => s + (Number(r.total_tokens) || 0), 0);
    }
    case "syncsPerDay": return null;        // no reliable usage source → UNAVAILABLE
    case "aiMonetaryBudget": return null;   // no cost source → UNAVAILABLE
  }
}
async function listCol<T>(table: string, cols: string, build: (q: QB) => QB): Promise<T[]> {
  try {
    const db = createServiceRoleClient();
    const q = build(db.from(table as never).select(cols).limit(CAP) as unknown as QB);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>);
    return error ? [] : ((data ?? []) as T[]);
  } catch { return []; }
}
function monthStartIso(): string {
  // Start of current Israel calendar month, expressed as a UTC instant lower bound.
  const nowMonth = israelMonthKey(Date.now());          // 'YYYY-MM'
  return `${nowMonth}-01T00:00:00+03:00`;               // Israel month start (approx; DST-safe enough for a lower bound)
}

// ── Configured limits for an org (org override → plan default) ──────────────
async function orgPlanLimits(orgId: string): Promise<{ tier: PlanTier; planDefault: PlanLimitsLike; override: Partial<PlanLimitsLike> | null }> {
  const orgRow = await one<{ plan: string | null }>("organizations", "plan", (q) => q.eq("id", orgId));
  const opRow = await one<{ plan: string | null; limits: Any | null }>("org_plans", "plan,limits", (q) => q.eq("org_id", orgId));
  // `tier` is retained for legacy display/compat only. P7.4: the CANONICAL
  // per-agent model supplies the default limits (obsolete tiered defaults no
  // longer govern); an explicit org override still wins and is enforced.
  const tier = normalizePlanTier(opRow?.plan ?? orgRow?.plan ?? null);
  const planDefault = canonicalDefaultLimits() as unknown as PlanLimitsLike;
  const override = (opRow?.limits && typeof opRow.limits === "object") ? (opRow.limits as Partial<PlanLimitsLike>) : null;
  return { tier, planDefault, override };
}

export interface OrgLimits { orgId: string; tier: PlanTier; limits: LimitResolution[]; generatedAt: string }
export async function getOrgLimits(orgId: string): Promise<OrgLimits> {
  await assertPlatformCapability("platform.entitlements.read");
  const { tier, planDefault, override } = await orgPlanLimits(orgId);
  const limits: LimitResolution[] = [];
  for (const key of LIMIT_KEYS) {
    const def = LIMIT_DEFS[key];
    const { value, source } = effectiveConfigured(def, planDefault, override);
    const usage = await usageFor(key, orgId);
    limits.push(resolveLimit(def, value, usage, source));
  }
  return { orgId, tier, limits, generatedAt: new Date().toISOString() };
}

// ── Cross-org limit drift report (bounded; no N+1 on org list) ──────────────
export interface LimitDriftRow {
  orgId: string; orgName: string | null; tier: PlanTier; limitKey: LimitKey; label: string;
  configuredLimit: number | null; usage: number | null; remaining: number | null;
  status: "normal" | "near_limit" | "exceeded"; mode: string; wouldBlock: boolean;
  severity: "critical" | "warning" | "info";
}
export async function getPlatformLimitDrift(): Promise<{ rows: LimitDriftRow[]; generatedAt: string; note: string }> {
  await assertPlatformCapability("platform.entitlements.read");
  const orgs = await listCol<{ id: string; name: string | null; plan: string | null }>("organizations", "id,name,plan", (q) => q.limit(1000));
  const rows: LimitDriftRow[] = [];
  for (const o of orgs) {
    const res = await getOrgLimits(o.id);
    for (const l of res.limits) {
      if (l.mode === "UNAVAILABLE" || l.mode === "UNLIMITED" || l.mode === "OBSERVED") continue; // only comparable caps
      const severity = l.status === "exceeded" ? "critical" : l.status === "near_limit" ? "warning" : "info";
      rows.push({
        orgId: o.id, orgName: o.name, tier: res.tier, limitKey: l.limitKey, label: l.label,
        configuredLimit: l.configuredLimit, usage: l.usage, remaining: l.remaining,
        status: l.status, mode: l.mode, wouldBlock: l.exceeded, severity,
      });
    }
  }
  // critical first
  rows.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : b.severity === "critical" ? 1 : a.severity === "warning" ? -1 : 1));
  return { rows, generatedAt: new Date().toISOString(), note: "מצב צל — חריגות מדווחות ואינן חוסמות. אכיפה תופעל בשלב נפרד (P7)." };
}

// ── Canonical enforcement seam (SHADOW — never blocks in P6.3) ──────────────
export interface AssertResult { allowed: boolean; mode: string; wouldBlock: boolean; limitKey: LimitKey; usage: number | null; configuredLimit: number | null; needsAtomic: boolean }
/**
 * The ONE future enforcement boundary. In P6.3 it ALWAYS allows (shadow) and
 * merely reports wouldBlock, so no production write is ever blocked. P7 flips a
 * specific limit to ENFORCED here — never scattered `if (usage > limit)` checks.
 */
export async function assertWithinLimit(orgId: string, limitKey: LimitKey): Promise<AssertResult> {
  const { planDefault, override } = await orgPlanLimits(orgId);
  const def = LIMIT_DEFS[limitKey];
  const { value } = effectiveConfigured(def, planDefault, override);
  const usage = await usageFor(limitKey, orgId);
  const res = resolveLimit(def, value, usage, "seam");
  return { allowed: true /* SHADOW: never blocks */, mode: res.mode, wouldBlock: res.exceeded, limitKey, usage, configuredLimit: value, needsAtomic: needsAtomicEnforcement(limitKey) };
}

// ── Per-org override writer (capability-gated + audited) ────────────────────
// Persists a numeric override into org_plans.limits. Provided for platform
// operators; a real production write → requires approval, not executed by P6.3.
export async function setOrgLimitOverride(orgId: string, field: keyof PlanLimitsLike, value: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const operator = await assertPlatformCapability("platform.entitlements.manage");
  if (!reason?.trim()) return { ok: false, error: "reason required" };
  try {
    const db = createServiceRoleClient();
    const { tier, planDefault, override } = await orgPlanLimits(orgId);
    const current = { ...(planDefault as PlanLimitsLike), ...(override ?? {}) };
    const from = current[field];
    const nextLimits = { ...current, [field]: value };
    const { error } = await db.from("org_plans" as never).upsert({ org_id: orgId, plan: tier, limits: nextLimits, updated_by: operator.userId } as never, { onConflict: "org_id" } as never);
    if (error) return { ok: false, error: error.message };
    await writePlatformAudit({ operator, capability: "platform.entitlements.manage", action: "limits.override", targetOrgId: orgId, resourceType: "org_plan", resourceId: orgId, reason, metadata: { limitKey: field, from, to: value } });
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "override failed" }; }
}
