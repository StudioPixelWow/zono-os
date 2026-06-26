// ============================================================================
// ZONO — PHASE 26.14: Policy repository (SERVER-ONLY). Org-scoped. Reads stored
// policy overrides and merges them onto the compliant defaults; writes upsert.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { govContext } from "./_ctx";
import { mergePolicies } from "./agencyVisibilityGuard";
import type { GovernancePolicies, PolicyKey } from "./agencyGovernanceTypes";

type Obj = Record<string, unknown>;

/** The org's effective governance policies (defaults overlaid with active overrides). */
export async function getEffectivePolicies(): Promise<GovernancePolicies> {
  const { orgId } = await govContext();
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_policies").select("policy_key,policy_value,active").eq("organization_id", orgId).eq("active", true);
  const stored: Obj = {};
  for (const r of (data as Obj[] | null) ?? []) {
    const v = (r.policy_value as Obj | null) ?? {};
    stored[r.policy_key as string] = "value" in v ? (v as { value: unknown }).value : v;
  }
  return mergePolicies(stored);
}

export async function setPolicy(key: PolicyKey, value: boolean | number, active = true): Promise<void> {
  const { orgId } = await govContext();
  const db = await createClient();
  await db.from("agency_intelligence_policies").upsert({
    organization_id: orgId, policy_key: key, policy_value: { value } as never, active,
  } as never, { onConflict: "organization_id,policy_key" });
}
