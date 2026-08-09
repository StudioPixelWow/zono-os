// ============================================================================
// ZONO — PLATFORM ADMIN cross-organization Data Access Layer (server-only). P5.0.
// ----------------------------------------------------------------------------
// THE single controlled boundary for cross-org reads. The ONLY place in the
// codebase where a service-role client is used to read ACROSS organizations for
// platform administration. Enforced pattern per function:
//     assertPlatformCapability(cap) → service-role query → audit → minimal DTO.
// Rules:
//   · server-only; no client component may import this.
//   · a browser-supplied orgId is a REQUESTED TARGET only, consulted AFTER the
//     platform capability has been verified server-side — it never grants access.
//   · returns only minimal, public-safe fields; NEVER selects credential /
//     token / secret / integration-secret columns.
// P5.0 ships only enough primitives to PROVE the architecture safely (not the
// full Customer 360).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";

export interface PlatformOrgSummary {
  id: string;
  name: string;
  plan: string | null;
  createdAt: string;
}
export interface PlatformOrgDetail extends PlatformOrgSummary {
  city: string | null;
  onboardingCompleted: boolean;
}
export interface PlatformUserSummary {
  id: string;
  name: string | null;
  status: string | null;
  lastSeenAt: string | null;
}

/** Cross-org organization directory (minimal fields). Cap: platform.customers.read. */
export async function listOrganizationsForPlatform(): Promise<PlatformOrgSummary[]> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const db = createServiceRoleClient();
  const { data } = await db.from("organizations")
    .select("id,name,plan,created_at")
    .order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as { id: string; name: string; plan: string | null; created_at: string }[];
  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customers.list", metadata: { count: rows.length } });
  return rows.map((r) => ({ id: r.id, name: r.name, plan: r.plan ?? null, createdAt: r.created_at }));
}

/** One organization (minimal). `orgId` is a requested target, honored only AFTER
 *  the capability check. Cap: platform.customers.read. */
export async function getOrganizationForPlatform(orgId: string): Promise<PlatformOrgDetail | null> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const db = createServiceRoleClient();
  const { data } = await db.from("organizations")
    .select("id,name,plan,city,onboarding_completed,created_at")
    .eq("id", orgId).maybeSingle();
  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customers.read", targetOrgId: orgId });
  if (!data) return null;
  const r = data as { id: string; name: string; plan: string | null; city: string | null; onboarding_completed: boolean; created_at: string };
  return { id: r.id, name: r.name, plan: r.plan ?? null, city: r.city ?? null, onboardingCompleted: !!r.onboarding_completed, createdAt: r.created_at };
}

/** Users of one org (minimal, NO email/phone/secrets in P5.0). Cap: platform.users.read. */
export async function listOrganizationUsersForPlatform(orgId: string): Promise<PlatformUserSummary[]> {
  const operator = await assertPlatformCapability("platform.users.read");
  const db = createServiceRoleClient();
  const { data } = await db.from("users")
    .select("id,full_name,status,last_seen_at")
    .eq("org_id", orgId).limit(500);
  const rows = (data ?? []) as { id: string; full_name: string | null; status: string | null; last_seen_at: string | null }[];
  await writePlatformAudit({ operator, capability: "platform.users.read", action: "users.list", targetOrgId: orgId, metadata: { count: rows.length } });
  return rows.map((r) => ({ id: r.id, name: r.full_name ?? null, status: r.status ?? null, lastSeenAt: r.last_seen_at ?? null }));
}
