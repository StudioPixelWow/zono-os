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
import { operatorCan } from "../capabilities";

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
  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customers.list", resourceType: "organization", metadata: { count: rows.length } });
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
  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customers.read", resourceType: "organization", resourceId: orgId, targetOrgId: orgId });
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
  await writePlatformAudit({ operator, capability: "platform.users.read", action: "users.list", resourceType: "user", targetOrgId: orgId, metadata: { count: rows.length } });
  return rows.map((r) => ({ id: r.id, name: r.full_name ?? null, status: r.status ?? null, lastSeenAt: r.last_seen_at ?? null }));
}

// ============================================================================
// P5.1 — Platform Admin Shell reads (organization search, overview metrics,
// recent audit). Same invariant as above: assertPlatformCapability → service-role
// query → audit → minimal, public-safe DTO. Overview metrics are COUNT-ONLY
// aggregates (head:true) so no row / PII ever leaves the boundary.
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Platform-wide organization search (minimal fields). Matches by name (ilike)
 * or, when the query is a UUID, by exact id. Cap: platform.customers.read.
 * The raw query text is NEVER audited (only its length + result count), so a
 * search string can never leak into the audit log.
 */
export async function searchOrganizationsForPlatform(query: string, limit = 20): Promise<PlatformOrgSummary[]> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const q = (query ?? "").trim();
  const capped = Math.min(Math.max(limit, 1), 50);
  const db = createServiceRoleClient();
  let builder = db.from("organizations")
    .select("id,name,plan,created_at")
    .order("created_at", { ascending: false })
    .limit(capped);
  if (q) {
    if (UUID_RE.test(q)) {
      builder = builder.eq("id", q);
    } else {
      // Escape ilike metacharacters so user input can't alter the match pattern.
      const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);
      builder = builder.ilike("name", `%${safe}%`);
    }
  }
  const { data } = await builder;
  const rows = (data ?? []) as { id: string; name: string; plan: string | null; created_at: string }[];
  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customers.search", resourceType: "organization", metadata: { q_len: q.length, count: rows.length } });
  return rows.map((r) => ({ id: r.id, name: r.name, plan: r.plan ?? null, createdAt: r.created_at }));
}

/** A single overview metric. `state` distinguishes a real value from a value the
 *  operator isn't authorized to see (`restricted`) or one the query couldn't
 *  produce (`unavailable`) — the UI must never render a restricted/unavailable
 *  metric as a real `0`. */
export type PlatformMetricState = "ok" | "restricted" | "unavailable";
export interface PlatformMetric { value: number | null; state: PlatformMetricState }
export interface PlatformOverviewMetrics {
  organizations: PlatformMetric;
  usersTotal: PlatformMetric;
  usersActive: PlatformMetric;
  properties: PlatformMetric;
  leads: PlatformMetric;
  campaigns: PlatformMetric;
  facebookPublishes: PlatformMetric;
  whatsappMessages: PlatformMetric;
  deadLetter: PlatformMetric;
  failedPublishJobs: PlatformMetric;
  recentOrganizations: PlatformOrgSummary[];
  generatedAt: string;
}

type CountBuilder = (q: unknown) => unknown;

/** Exact COUNT with no rows returned (head:true). Returns null on any error so a
 *  failed aggregate surfaces as "unavailable", never as a misleading 0. */
async function safeCount(table: string, build?: CountBuilder): Promise<number | null> {
  try {
    const db = createServiceRoleClient();
    // Untyped-table access uses the repo's `as never` cast convention.
    let q: unknown = db.from(table as never).select("*", { count: "exact", head: true });
    if (build) q = build(q);
    const { count, error } = (await (q as Promise<{ count: number | null; error: unknown }>));
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

function metric(value: number | null): PlatformMetric {
  return value === null ? { value: null, state: "unavailable" } : { value, state: "ok" };
}
const RESTRICTED: PlatformMetric = { value: null, state: "restricted" };

/**
 * Safe cross-org overview aggregates for the platform owner dashboard. Every
 * figure is an exact COUNT (no rows, no PII). Base gate: platform.customers.read
 * (every platform role holds it). Usage figures additionally require
 * platform.usage.read; operational health additionally requires platform.ops.read
 * — an operator lacking those sees `restricted`, not a fabricated number. Audited
 * once as `overview.read` (no per-metric audit spam).
 */
export async function getPlatformOverviewMetrics(): Promise<PlatformOverviewMetrics> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const canUsage = operatorCan(operator, "platform.usage.read");
  const canOps = operatorCan(operator, "platform.ops.read");
  const db = createServiceRoleClient();

  const [organizations, usersTotal, usersActive, recentRes] = await Promise.all([
    safeCount("organizations"),
    safeCount("users"),
    safeCount("users", (q) => (q as { eq: (c: string, v: string) => unknown }).eq("status", "active")),
    db.from("organizations").select("id,name,plan,created_at").order("created_at", { ascending: false }).limit(6),
  ]);

  // Usage aggregates — gated behind platform.usage.read.
  const [properties, leads, campaigns, facebookPublishes, whatsappMessages] = canUsage
    ? await Promise.all([
        safeCount("properties"),
        safeCount("leads"),
        safeCount("distribution_campaigns"),
        safeCount("distribution_posts", (q) => (q as { eq: (c: string, v: string) => unknown }).eq("platform", "facebook")),
        safeCount("whatsapp_messages"),
      ])
    : [null, null, null, null, null];

  // Operational health — gated behind platform.ops.read.
  const [deadLetter, failedPublishJobs] = canOps
    ? await Promise.all([
        safeCount("meta_publish_dead_letter"),
        safeCount("distribution_publish_jobs", (q) => (q as { in: (c: string, v: string[]) => unknown }).in("status", ["failed", "dead"])),
      ])
    : [null, null];

  const recentRows = (recentRes.data ?? []) as { id: string; name: string; plan: string | null; created_at: string }[];
  const recentOrganizations: PlatformOrgSummary[] = recentRows.map((r) => ({ id: r.id, name: r.name, plan: r.plan ?? null, createdAt: r.created_at }));

  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "overview.read", resourceType: "platform", metadata: { orgs: organizations ?? -1, usage: canUsage, ops: canOps } });

  return {
    organizations: metric(organizations),
    usersTotal: metric(usersTotal),
    usersActive: metric(usersActive),
    properties: canUsage ? metric(properties) : RESTRICTED,
    leads: canUsage ? metric(leads) : RESTRICTED,
    campaigns: canUsage ? metric(campaigns) : RESTRICTED,
    facebookPublishes: canUsage ? metric(facebookPublishes) : RESTRICTED,
    whatsappMessages: canUsage ? metric(whatsappMessages) : RESTRICTED,
    deadLetter: canOps ? metric(deadLetter) : RESTRICTED,
    failedPublishJobs: canOps ? metric(failedPublishJobs) : RESTRICTED,
    recentOrganizations,
    generatedAt: new Date().toISOString(),
  };
}

export interface PlatformAuditEntry {
  id: string;
  actorLabel: string | null;
  action: string;
  resourceType: string | null;
  orgId: string | null;
  createdAt: string;
}

/**
 * Most-recent platform audit events (safe columns only — NO ip / user_agent /
 * old_values / new_values). Cap: platform.audit.read. Intentionally does NOT
 * write its own audit event: auditing an audit read would create a self-
 * referential feedback loop that fills the log on every view.
 */
export async function listRecentPlatformAudit(limit = 12): Promise<PlatformAuditEntry[]> {
  await assertPlatformCapability("platform.audit.read");
  const capped = Math.min(Math.max(limit, 1), 100);
  const db = createServiceRoleClient();
  const { data } = await db.from("platform_audit_log" as never)
    .select("id,actor_label,action,resource_type,org_id,created_at")
    .order("created_at", { ascending: false })
    .limit(capped);
  const rows = (data ?? []) as { id: string; actor_label: string | null; action: string; resource_type: string | null; org_id: string | null; created_at: string }[];
  return rows.map((r) => ({ id: r.id, actorLabel: r.actor_label ?? null, action: r.action, resourceType: r.resource_type ?? null, orgId: r.org_id ?? null, createdAt: r.created_at }));
}
