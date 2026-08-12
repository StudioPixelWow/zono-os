// ============================================================================
// ZONO — PLATFORM ACCESS server layer (server-only). P5.4 · SHADOW MODE.
// ----------------------------------------------------------------------------
// The ONLY server entry point that resolves an org's EFFECTIVE ACCESS. It does
// NOT decide anything itself — it fetches the org's plan tier + resolved
// feature-flag overrides (org-scoped preferred over global) via the service
// role, then delegates EVERY decision to the pure resolver in ../access/model.
// SHADOW MODE: nothing here enforces or blocks; we compute + explain + report
// drift while the app keeps its current always-on behavior. Pattern (P5.0):
//     assertPlatformCapability(cap) → service-role read → audit → minimal DTO.
// Rules: server-only; browser-supplied orgId is a REQUESTED TARGET consulted
// only AFTER the capability is verified; never selects secret columns.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";
import { operatorCan } from "../capabilities";
import {
  FEATURE_CATALOG,
  normalizePlanTier,
  resolveFeatureAccess,
  classifyDrift,
  summarizeDrift,
  type EffectiveAccess,
  type DriftEntry,
  type DriftSummary,
  type FeatureOverride,
} from "../access/model";
import type { PlanTier } from "@/lib/launch/types";

/** Raw feature_flags row shape (org or global). Only safe columns selected. */
interface RawFlagRow { flag_key: string; enabled: boolean; rollout_pct: number | null; org_id: string | null }

export interface OrgEffectiveAccess {
  orgId: string;
  planTier: PlanTier;
  planRaw: string | null;             // the untranslated organizations.plan value
  overridesApplied: boolean;          // whether flag overrides could be read (flags.read held)
  access: EffectiveAccess[];          // one row per catalog feature, resolver-decided
  drift: DriftEntry[];                // shadow-mode drift vs current always-on behavior
  driftSummary: DriftSummary;
}

/**
 * Resolve ONE org's canonical effective access (SHADOW MODE). Requires
 * platform.customers.read for the plan tier; org/global feature-flag overrides
 * are only read when the caller also holds platform.flags.read (otherwise the
 * result is plan-alone, `overridesApplied:false`). Every decision comes from the
 * pure resolver. READ ONLY. Audited once as customer360.effective_access.
 */
export async function getOrgEffectiveAccess(orgId: string): Promise<OrgEffectiveAccess> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const canFlags = operatorCan(operator, "platform.flags.read");

  const db = createServiceRoleClient();
  const { data: orgRow } = await db.from("organizations").select("plan").eq("id", orgId).maybeSingle();
  const planRaw = ((orgRow as { plan: string | null } | null)?.plan) ?? null;
  const planTier = normalizePlanTier(planRaw);

  // Resolve overrides: org-scoped flag preferred over a matching global flag.
  // Keyed by flag_key; we consult it per-feature by feature.key convention.
  const overrideByKey = new Map<string, FeatureOverride>();
  if (canFlags) {
    try {
      const { data } = await db.from("feature_flags" as never)
        .select("flag_key,enabled,rollout_pct,org_id")
        .or(`org_id.eq.${orgId},org_id.is.null` as never)
        .limit(500);
      const rows = ((data ?? []) as RawFlagRow[]);
      // Two passes so an org-scoped row always wins over a global one.
      for (const r of rows) {
        if (r.org_id === null && !overrideByKey.has(r.flag_key)) {
          overrideByKey.set(r.flag_key, { enabled: !!r.enabled, scope: "global", rolloutPct: r.rollout_pct ?? null });
        }
      }
      for (const r of rows) {
        if (r.org_id === orgId) {
          overrideByKey.set(r.flag_key, { enabled: !!r.enabled, scope: "org", rolloutPct: r.rollout_pct ?? null });
        }
      }
    } catch {
      // flags table unavailable — degrade to plan-alone (already the default).
    }
  }

  const access = FEATURE_CATALOG.map((f) =>
    resolveFeatureAccess(planTier, f, overrideByKey.get(f.key) ?? null),
  );
  const drift = access.map((e) => classifyDrift(e));

  await writePlatformAudit({
    operator,
    capability: "platform.customers.read",
    action: "customer360.effective_access",
    resourceType: "organization",
    targetOrgId: orgId,
    metadata: { plan: planTier, flags: canFlags, critical: summarizeDrift(drift).critical },
  });

  return { orgId, planTier, planRaw, overridesApplied: canFlags, access, drift, driftSummary: summarizeDrift(drift) };
}

export interface PlatformFlagRow { flagKey: string; enabled: boolean; rolloutPct: number | null; scope: "org" | "global"; orgId: string | null; minRole: string | null }
export interface PlatformFlagsView {
  available: boolean;
  globals: PlatformFlagRow[];
  orgScoped: PlatformFlagRow[];
}

/**
 * Read-only inventory of ALL feature flags (global + org-scoped). Requires
 * platform.flags.read. These are the OVERRIDE inputs the resolver consults
 * (org-scoped wins over global). READ ONLY. Audited once as flags.list.
 */
export async function listPlatformFeatureFlags(): Promise<PlatformFlagsView> {
  const operator = await assertPlatformCapability("platform.flags.read");
  const db = createServiceRoleClient();
  let rows: (RawFlagRow & { min_role: string | null })[] = [];
  let available = true;
  try {
    const { data, error } = await db.from("feature_flags" as never)
      .select("flag_key,enabled,rollout_pct,org_id,min_role")
      .limit(2000);
    if (error) available = false;
    else rows = ((data ?? []) as (RawFlagRow & { min_role: string | null })[]);
  } catch {
    available = false;
  }
  const map = (r: RawFlagRow & { min_role: string | null }): PlatformFlagRow => ({
    flagKey: r.flag_key, enabled: !!r.enabled, rolloutPct: r.rollout_pct ?? null,
    scope: r.org_id === null ? "global" : "org", orgId: r.org_id, minRole: r.min_role ?? null,
  });
  await writePlatformAudit({ operator, capability: "platform.flags.read", action: "flags.list", resourceType: "platform", metadata: { count: rows.length } });
  return {
    available,
    globals: rows.filter((r) => r.org_id === null).map(map),
    orgScoped: rows.filter((r) => r.org_id !== null).map(map),
  };
}

export interface OrgDriftRow {
  orgId: string;
  orgName: string | null;
  planTier: PlanTier;
  summary: DriftSummary;
  criticalFeatures: { feature: string; label: string; reason: string }[];
}
export interface PlatformDriftReport {
  generatedForOrgs: number;
  totals: DriftSummary;
  orgs: OrgDriftRow[];
}

/**
 * Platform-wide SHADOW-MODE drift report: for every org, what the new resolver
 * would change vs today's always-on behavior. CRITICAL rows = access the
 * resolver would REMOVE (must be resolved before any enforcement). Requires
 * platform.customers.read (+ flags.read to factor overrides). READ ONLY.
 * Audited once as access.drift_report.
 */
export async function getPlatformAccessDrift(): Promise<PlatformDriftReport> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const canFlags = operatorCan(operator, "platform.flags.read");
  const db = createServiceRoleClient();

  const { data: orgRows } = await db.from("organizations").select("id,name,plan").limit(500);
  const orgs = ((orgRows ?? []) as { id: string; name: string | null; plan: string | null }[]);

  // Preload every flag once (small table), then resolve per-org in memory.
  const flagRows: RawFlagRow[] = [];
  if (canFlags) {
    try {
      const { data } = await db.from("feature_flags" as never)
        .select("flag_key,enabled,rollout_pct,org_id")
        .limit(2000);
      flagRows.push(...((data ?? []) as RawFlagRow[]));
    } catch {
      // no flags table — plan-alone drift.
    }
  }
  const globalByKey = new Map<string, FeatureOverride>();
  for (const r of flagRows) {
    if (r.org_id === null && !globalByKey.has(r.flag_key)) {
      globalByKey.set(r.flag_key, { enabled: !!r.enabled, scope: "global", rolloutPct: r.rollout_pct ?? null });
    }
  }

  const totals: DriftSummary = { critical: 0, warning: 0, info: 0, none: 0, total: 0 };
  const outRows: OrgDriftRow[] = orgs.map((o) => {
    const tier = normalizePlanTier(o.plan);
    const overrideByKey = new Map(globalByKey);
    for (const r of flagRows) {
      if (r.org_id === o.id) overrideByKey.set(r.flag_key, { enabled: !!r.enabled, scope: "org", rolloutPct: r.rollout_pct ?? null });
    }
    const drift = FEATURE_CATALOG.map((f) => classifyDrift(resolveFeatureAccess(tier, f, overrideByKey.get(f.key) ?? null)));
    const summary = summarizeDrift(drift);
    totals.critical += summary.critical; totals.warning += summary.warning;
    totals.info += summary.info; totals.none += summary.none; totals.total += summary.total;
    return {
      orgId: o.id,
      orgName: o.name ?? null,
      planTier: tier,
      summary,
      criticalFeatures: drift.filter((d) => d.severity === "critical").map((d) => ({ feature: d.feature, label: d.label, reason: d.reason })),
    };
  });

  await writePlatformAudit({
    operator,
    capability: "platform.customers.read",
    action: "access.drift_report",
    resourceType: "platform",
    metadata: { orgs: orgs.length, critical: totals.critical, flags: canFlags },
  });

  return { generatedForOrgs: orgs.length, totals, orgs: outRows };
}
