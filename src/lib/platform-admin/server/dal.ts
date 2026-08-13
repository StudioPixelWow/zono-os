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
import { getOrgBillingState, getOrgBillingQuantity, type OrgBillingState, type OrgBillingQuantity } from "@/lib/commercial/billing";

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

// ============================================================================
// P5.2 — CUSTOMER 360 (per-organization control center). Every read here is
// EXPLICITLY scoped to a single orgId AFTER the platform capability check, uses
// the audited service-role boundary, returns minimal/count-only DTOs, and NEVER
// selects a credential/token/secret column. Org-scoping column differs by table
// (org_id vs organization_id) — encoded per query below. Reads fail SAFE: a
// missing table/column yields "unavailable", never a crash or a fabricated 0.
// ============================================================================

/** Minimal chained query-builder surface for safeCount `build` callbacks. */
type QB = { eq: (c: string, v: unknown) => QB; in: (c: string, v: unknown[]) => QB; gte: (c: string, v: unknown) => QB };

const DAY_MS = 86_400_000;
function sinceIso(days: number): string { return new Date(Date.now() - days * DAY_MS).toISOString(); }

/** Latest timestamp from a column on an org-scoped table, or null. Fail-safe. */
async function latestTimestamp(table: string, orgCol: string, orgId: string, timeCol: string): Promise<string | null> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db.from(table as never)
      .select(timeCol)
      .eq(orgCol as never, orgId as never)
      .order(timeCol, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const row = data as Record<string, string> | null;
    return row?.[timeCol] ?? null;
  } catch {
    return null;
  }
}

export interface OrgHeader {
  id: string;
  name: string;
  plan: string | null;
  city: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  usersActive: PlatformMetric;
  usersTotal: PlatformMetric;
  lastActivityAt: string | null;
}

/**
 * Header/chrome data for the Customer 360 frame. Authorized (customers.read) but
 * intentionally NOT audited — it is repeated shell decoration across every tab;
 * the meaningful per-tab access events are audited by the tab DAL functions.
 * Returns null when the org does not exist (→ safe not-found).
 */
export async function getOrgHeaderForPlatform(orgId: string): Promise<OrgHeader | null> {
  await assertPlatformCapability("platform.customers.read");
  const db = createServiceRoleClient();
  const { data } = await db.from("organizations")
    .select("id,name,plan,city,onboarding_completed,created_at")
    .eq("id", orgId).maybeSingle();
  if (!data) return null;
  const r = data as { id: string; name: string; plan: string | null; city: string | null; onboarding_completed: boolean; created_at: string };
  const [usersActive, usersTotal, lastActivityAt] = await Promise.all([
    safeCount("users", (q) => (q as QB).eq("org_id", orgId).eq("status", "active")),
    safeCount("users", (q) => (q as QB).eq("org_id", orgId)),
    latestTimestamp("domain_events", "organization_id", orgId, "occurred_at"),
  ]);
  return {
    id: r.id, name: r.name, plan: r.plan ?? null, city: r.city ?? null,
    onboardingCompleted: !!r.onboarding_completed, createdAt: r.created_at,
    usersActive: metric(usersActive), usersTotal: metric(usersTotal), lastActivityAt,
  };
}

export interface OrgOverview {
  usersActive: PlatformMetric; usersTotal: PlatformMetric;
  properties: PlatformMetric; leads: PlatformMetric; socialLeads: PlatformMetric;
  campaigns: PlatformMetric; queuedPosts: PlatformMetric; publishedPosts: PlatformMetric; failedPosts: PlatformMetric;
  whatsappMessages: PlatformMetric; facebookPublishes: PlatformMetric;
  failedJobs: PlatformMetric; deadLetters: PlatformMetric;
  recentActivityCount: PlatformMetric; // CRM activity in last 7d (leads created)
}

/**
 * Customer 360 overview — account/CRM/marketing/communication/operations counts
 * for ONE org. Base gate customers.read; usage groups need usage.read; ops groups
 * need ops.read (else `restricted`, never a fake 0). Audited once as customer360.open.
 */
export async function getOrgOverviewForPlatform(orgId: string): Promise<OrgOverview> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const canUsage = operatorCan(operator, "platform.usage.read");
  const canOps = operatorCan(operator, "platform.ops.read");

  const [usersActive, usersTotal] = await Promise.all([
    safeCount("users", (q) => (q as QB).eq("org_id", orgId).eq("status", "active")),
    safeCount("users", (q) => (q as QB).eq("org_id", orgId)),
  ]);

  const usage = canUsage ? await Promise.all([
    safeCount("properties", (q) => (q as QB).eq("org_id", orgId)),
    safeCount("leads", (q) => (q as QB).eq("org_id", orgId)),
    safeCount("social_leads", (q) => (q as QB).eq("organization_id", orgId)),
    safeCount("distribution_campaigns", (q) => (q as QB).eq("org_id", orgId)),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).in("status", ["pending", "scheduled", "in_progress"])),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).eq("status", "published")),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).eq("status", "failed")),
    safeCount("whatsapp_messages", (q) => (q as QB).eq("organization_id", orgId)),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).eq("platform", "facebook")),
    safeCount("leads", (q) => (q as QB).eq("org_id", orgId).gte("created_at", sinceIso(7))),
  ]) : null;

  const ops = canOps ? await Promise.all([
    safeCount("distribution_publish_jobs", (q) => (q as QB).eq("org_id", orgId).in("status", ["failed", "dead"])),
    safeCount("meta_publish_dead_letter", (q) => (q as QB).eq("org_id", orgId)),
  ]) : null;

  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customer360.open", resourceType: "organization", resourceId: orgId, targetOrgId: orgId, metadata: { usage: canUsage, ops: canOps } });

  const um = (i: number): PlatformMetric => (canUsage && usage ? metric(usage[i]) : RESTRICTED);
  const om = (i: number): PlatformMetric => (canOps && ops ? metric(ops[i]) : RESTRICTED);
  return {
    usersActive: metric(usersActive), usersTotal: metric(usersTotal),
    properties: um(0), leads: um(1), socialLeads: um(2),
    campaigns: um(3), queuedPosts: um(4), publishedPosts: um(5), failedPosts: um(6),
    whatsappMessages: um(7), facebookPublishes: um(8), recentActivityCount: um(9),
    failedJobs: om(0), deadLetters: om(1),
  };
}

export interface OrgUserRow {
  id: string; name: string | null; roleKey: string | null; roleName: string | null;
  status: string | null; lastSeenAt: string | null; createdAt: string | null;
}
export interface OrgUsersResult { users: OrgUserRow[]; roleDistribution: { role: string; count: number }[]; activeCount: number; }

/**
 * Read-only user directory for ONE org (minimal fields + role; NO email/phone).
 * Cap: platform.users.read. Audited once as customer360.users. Role distribution
 * + active count are derived in-process (no extra query).
 */
export async function getOrgUsersForPlatform(orgId: string): Promise<OrgUsersResult> {
  const operator = await assertPlatformCapability("platform.users.read");
  const db = createServiceRoleClient();
  // `as never` bypasses typed-select validation for the embedded roles relation.
  const { data } = await db.from("users" as never)
    .select("id,full_name,status,last_seen_at,created_at,roles:role_id(key,name)")
    .eq("org_id" as never, orgId as never).limit(1000);
  const rows = (data ?? []) as { id: string; full_name: string | null; status: string | null; last_seen_at: string | null; created_at: string | null; roles: { key: string | null; name: string | null } | null }[];
  const users: OrgUserRow[] = rows.map((r) => ({
    id: r.id, name: r.full_name ?? null,
    roleKey: r.roles?.key ?? null, roleName: r.roles?.name ?? null,
    status: r.status ?? null, lastSeenAt: r.last_seen_at ?? null, createdAt: r.created_at ?? null,
  }));
  const distMap = new Map<string, number>();
  for (const u of users) { const k = u.roleName || u.roleKey || "—"; distMap.set(k, (distMap.get(k) ?? 0) + 1); }
  const roleDistribution = [...distMap.entries()].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count);
  const activeCount = users.filter((u) => u.status === "active").length;
  await writePlatformAudit({ operator, capability: "platform.users.read", action: "customer360.users", resourceType: "user", targetOrgId: orgId, metadata: { count: users.length } });
  return { users, roleDistribution, activeCount };
}

export type ModuleUsageState = "active_recent" | "used" | "none" | "unavailable";
export interface ModuleUsage { key: string; label: string; total: number | null; state: ModuleUsageState }

function moduleState(total: number | null, recent: number | null): ModuleUsageState {
  if (total === null) return "unavailable";
  if ((recent ?? 0) > 0) return "active_recent";
  if (total > 0) return "used";
  return "none";
}

/**
 * Per-module product-usage signals for ONE org. Cap: platform.usage.read. Each
 * module = total count + a 7-day "recent" count → an explainable state
 * (active_recent / used / none / unavailable). NO proprietary adoption score.
 * Audited once as customer360.usage.
 */
export async function getOrgProductUsageForPlatform(orgId: string): Promise<ModuleUsage[]> {
  const operator = await assertPlatformCapability("platform.usage.read");
  const since = sinceIso(7);
  const mods: { key: string; label: string; table: string; orgCol: string; timeCol: string }[] = [
    { key: "properties", label: "נכסים", table: "properties", orgCol: "org_id", timeCol: "created_at" },
    { key: "leads", label: "לידים", table: "leads", orgCol: "org_id", timeCol: "created_at" },
    { key: "matching", label: "התאמות", table: "matching_results", orgCol: "org_id", timeCol: "created_at" },
    { key: "journeys", label: "מסעות", table: "journeys", orgCol: "org_id", timeCol: "created_at" },
    { key: "automations", label: "אוטומציות", table: "automations", orgCol: "org_id", timeCol: "created_at" },
    { key: "recommendations", label: "המלצות", table: "recommendations", orgCol: "organization_id", timeCol: "created_at" },
    { key: "distribution", label: "הפצה", table: "distribution_posts", orgCol: "org_id", timeCol: "created_at" },
    { key: "whatsapp", label: "וואטסאפ", table: "whatsapp_messages", orgCol: "organization_id", timeCol: "created_at" },
  ];
  const results = await Promise.all(mods.map(async (m) => {
    const [total, recent] = await Promise.all([
      safeCount(m.table, (q) => (q as QB).eq(m.orgCol, orgId)),
      safeCount(m.table, (q) => (q as QB).eq(m.orgCol, orgId).gte(m.timeCol, since)),
    ]);
    return { key: m.key, label: m.label, total, state: moduleState(total, recent) } as ModuleUsage;
  }));
  await writePlatformAudit({ operator, capability: "platform.usage.read", action: "customer360.usage", resourceType: "organization", targetOrgId: orgId });
  return results;
}

export interface OrgDistribution {
  campaigns: PlatformMetric; queuedPosts: PlatformMetric; publishedPosts: PlatformMetric; failedPosts: PlatformMetric;
  groupPosts: PlatformMetric; socialLeads: PlatformMetric; whatsappCampaigns: PlatformMetric;
  lastPublishedAt: string | null;
}

/** Marketing & distribution summary for ONE org (counts). Cap: platform.usage.read.
 *  Audited once as customer360.distribution. */
export async function getOrgDistributionForPlatform(orgId: string): Promise<OrgDistribution> {
  const operator = await assertPlatformCapability("platform.usage.read");
  const [campaigns, queued, published, failed, groupPosts, socialLeads, waCampaigns, lastPublishedAt] = await Promise.all([
    safeCount("distribution_campaigns", (q) => (q as QB).eq("org_id", orgId)),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).in("status", ["pending", "scheduled", "in_progress"])),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).eq("status", "published")),
    safeCount("distribution_posts", (q) => (q as QB).eq("org_id", orgId).eq("status", "failed")),
    safeCount("distribution_group_posts", (q) => (q as QB).eq("org_id", orgId).eq("status", "posted")),
    safeCount("social_leads", (q) => (q as QB).eq("organization_id", orgId)),
    safeCount("whatsapp_campaigns", (q) => (q as QB).eq("organization_id", orgId)),
    latestTimestamp("distribution_posts", "org_id", orgId, "published_at"),
  ]);
  await writePlatformAudit({ operator, capability: "platform.usage.read", action: "customer360.distribution", resourceType: "organization", targetOrgId: orgId });
  return {
    campaigns: metric(campaigns), queuedPosts: metric(queued), publishedPosts: metric(published), failedPosts: metric(failed),
    groupPosts: metric(groupPosts), socialLeads: metric(socialLeads), whatsappCampaigns: metric(waCampaigns), lastPublishedAt,
  };
}

export type IntegrationState = "connected" | "warning" | "disconnected" | "not_configured" | "unavailable";
export interface IntegrationHealth { key: string; label: string; state: IntegrationState; detail: string | null; lastActivityAt: string | null }

async function readOne(table: string, orgCol: string, orgId: string, cols: string, order?: string): Promise<Record<string, unknown> | null | undefined> {
  // returns undefined on error (→ unavailable), null when simply no row (→ not_configured)
  try {
    const db = createServiceRoleClient();
    let b = db.from(table as never).select(cols).eq(orgCol as never, orgId as never);
    if (order) b = b.order(order, { ascending: false });
    const { data, error } = await b.limit(1).maybeSingle();
    if (error) return undefined;
    return (data as Record<string, unknown> | null) ?? null;
  } catch {
    return undefined;
  }
}

/**
 * Integration health for ONE org. Cap: platform.integrations.read. Reads ONLY
 * safe status/health/timestamp columns from each provider table — NEVER a token,
 * refresh token, session ref, or secret hash. Undetermined health → "unavailable"
 * (never guessed). Audited once as customer360.integrations.
 */
export async function getOrgIntegrationsForPlatform(orgId: string): Promise<IntegrationHealth[]> {
  const operator = await assertPlatformCapability("platform.integrations.read");
  const items: IntegrationHealth[] = [];

  const meta = await readOne("meta_connection", "org_id", orgId, "status,health,last_verified_at");
  items.push(mapMeta(meta));

  const wa = await readOne("whatsapp_accounts", "organization_id", orgId, "connection_status,last_connected_at,last_checked_at");
  items.push(mapWhatsapp(wa));

  const gcal = await readOne("google_connections", "org_id", orgId, "status,last_sync_at", "last_sync_at");
  items.push(mapGoogle(gcal));

  const ext = await readOne("facebook_extension_instances", "org_id", orgId, "status,last_seen_at", "last_seen_at");
  items.push(mapExtension(ext));

  await writePlatformAudit({ operator, capability: "platform.integrations.read", action: "customer360.integrations", resourceType: "organization", targetOrgId: orgId });
  return items;
}

function base(key: string, label: string, row: Record<string, unknown> | null | undefined): IntegrationHealth | null {
  if (row === undefined) return { key, label, state: "unavailable", detail: "לא ניתן לקבוע", lastActivityAt: null };
  if (row === null) return { key, label, state: "not_configured", detail: "לא מוגדר", lastActivityAt: null };
  return null;
}
function mapMeta(row: Record<string, unknown> | null | undefined): IntegrationHealth {
  const b = base("meta", "Facebook / Meta", row); if (b) return b;
  const status = String((row as Record<string, unknown>).status ?? "");
  const health = String((row as Record<string, unknown>).health ?? "");
  const last = ((row as Record<string, unknown>).last_verified_at as string) ?? null;
  let state: IntegrationState = "warning";
  if (status === "connected") state = (health === "healthy" || health === "" || health === "unknown") ? "connected" : "warning";
  else if (status === "not_connected") state = "not_configured";
  else if (status === "revoked" || status === "disabled") state = "disconnected";
  else state = "warning";
  return { key: "meta", label: "Facebook / Meta", state, detail: status || null, lastActivityAt: last };
}
function mapWhatsapp(row: Record<string, unknown> | null | undefined): IntegrationHealth {
  const b = base("whatsapp", "WhatsApp", row); if (b) return b;
  const status = String((row as Record<string, unknown>).connection_status ?? "");
  const last = ((row as Record<string, unknown>).last_connected_at as string) ?? ((row as Record<string, unknown>).last_checked_at as string) ?? null;
  let state: IntegrationState = "warning";
  if (status === "connected") state = "connected";
  else if (status === "not_configured") state = "not_configured";
  else if (status === "sandbox" || status === "expired" || status === "missing_permissions") state = "warning";
  else state = "warning";
  return { key: "whatsapp", label: "WhatsApp", state, detail: status || null, lastActivityAt: last };
}
function mapGoogle(row: Record<string, unknown> | null | undefined): IntegrationHealth {
  const b = base("google", "Google Calendar", row); if (b) return b;
  const status = String((row as Record<string, unknown>).status ?? "");
  const last = ((row as Record<string, unknown>).last_sync_at as string) ?? null;
  let state: IntegrationState = "warning";
  if (status === "connected" || status === "syncing") state = "connected";
  else if (status === "disconnected") state = "disconnected";
  else state = "warning";
  return { key: "google", label: "Google Calendar", state, detail: status || null, lastActivityAt: last };
}
function mapExtension(row: Record<string, unknown> | null | undefined): IntegrationHealth {
  const b = base("extension", "תוסף Facebook", row); if (b) return b;
  const status = String((row as Record<string, unknown>).status ?? "");
  const last = ((row as Record<string, unknown>).last_seen_at as string) ?? null;
  let state: IntegrationState = "warning";
  if (status === "ready") state = "connected";
  else if (status === "revoked") state = "disconnected";
  else state = "warning";
  return { key: "extension", label: "תוסף Facebook", state, detail: status || null, lastActivityAt: last };
}

export interface OrgActivityEntry { id: string; action: string; category: string | null; entityType: string | null; summary: string | null; actorName: string | null; createdAt: string }

/**
 * Human-readable org activity timeline from `audit_log` (org-scoped). Cap:
 * platform.audit.read. Safe columns only — NO metadata jsonb, NO raw payloads.
 * Audited once as customer360.activity.
 */
export async function getOrgActivityForPlatform(orgId: string, limit = 20): Promise<OrgActivityEntry[]> {
  const operator = await assertPlatformCapability("platform.audit.read");
  const capped = Math.min(Math.max(limit, 1), 50);
  const db = createServiceRoleClient();
  const { data } = await db.from("audit_log" as never)
    .select("id,action,category,entity_type,summary,actor_name,created_at")
    .eq("organization_id" as never, orgId as never)
    .order("created_at", { ascending: false })
    .limit(capped);
  const rows = (data ?? []) as { id: string; action: string; category: string | null; entity_type: string | null; summary: string | null; actor_name: string | null; created_at: string }[];
  await writePlatformAudit({ operator, capability: "platform.audit.read", action: "customer360.activity", resourceType: "organization", targetOrgId: orgId, metadata: { count: rows.length } });
  return rows.map((r) => ({ id: r.id, action: r.action, category: r.category ?? null, entityType: r.entity_type ?? null, summary: r.summary ?? null, actorName: r.actor_name ?? null, createdAt: r.created_at }));
}

export interface OrgFeatureFlag { flagKey: string; enabled: boolean; rolloutPct: number | null; minRole: string | null }
export interface OrgAccessSnapshot {
  planTier: string | null; // organizations.plan (always, customers.read)
  entitlements: { available: boolean; state: PlatformMetricState; plan: string | null; status: string | null; trialEndsAt: string | null; limits: Record<string, unknown> | null };
  flags: { available: boolean; state: PlatformMetricState; items: OrgFeatureFlag[] };
}

/**
 * Read-only access/plan snapshot for ONE org. Plan TIER (organizations.plan) is
 * shown to any customers.read operator. Entitlements (org_plans limits/status)
 * require platform.entitlements.read; org-targeted feature flags require
 * platform.flags.read — each gated INDEPENDENTLY (restricted, not fabricated).
 * READ ONLY. Audited once as customer360.access.
 */
export async function getOrgAccessForPlatform(orgId: string): Promise<OrgAccessSnapshot> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const canEnt = operatorCan(operator, "platform.entitlements.read");
  const canFlags = operatorCan(operator, "platform.flags.read");
  const db0 = createServiceRoleClient();
  const { data: orgRow } = await db0.from("organizations").select("plan").eq("id", orgId).maybeSingle();
  const planTier = ((orgRow as { plan: string | null } | null)?.plan) ?? null;

  let entitlements: OrgAccessSnapshot["entitlements"] = { available: false, state: "restricted", plan: null, status: null, trialEndsAt: null, limits: null };
  if (canEnt) {
    const row = await readOne("org_plans", "org_id", orgId, "plan,status,trial_ends_at,limits");
    if (row === undefined) entitlements = { available: false, state: "unavailable", plan: null, status: null, trialEndsAt: null, limits: null };
    else if (row === null) entitlements = { available: true, state: "ok", plan: null, status: null, trialEndsAt: null, limits: null };
    else entitlements = { available: true, state: "ok", plan: (row.plan as string) ?? null, status: (row.status as string) ?? null, trialEndsAt: (row.trial_ends_at as string) ?? null, limits: (row.limits as Record<string, unknown>) ?? null };
  }

  let flags: OrgAccessSnapshot["flags"] = { available: false, state: "restricted", items: [] };
  if (canFlags) {
    try {
      const db = createServiceRoleClient();
      const { data, error } = await db.from("feature_flags" as never)
        .select("flag_key,enabled,rollout_pct,min_role")
        .eq("org_id" as never, orgId as never)
        .limit(200);
      if (error) flags = { available: false, state: "unavailable", items: [] };
      else {
        const rows = (data ?? []) as { flag_key: string; enabled: boolean; rollout_pct: number | null; min_role: string | null }[];
        flags = { available: true, state: "ok", items: rows.map((r) => ({ flagKey: r.flag_key, enabled: !!r.enabled, rolloutPct: r.rollout_pct ?? null, minRole: r.min_role ?? null })) };
      }
    } catch { flags = { available: false, state: "unavailable", items: [] }; }
  }

  await writePlatformAudit({ operator, capability: "platform.customers.read", action: "customer360.access", resourceType: "organization", targetOrgId: orgId, metadata: { entitlements: canEnt, flags: canFlags } });
  return { planTier, entitlements, flags };
}

export interface OrgBilling {
  available: boolean;
  subscription: { plan: string | null; status: string | null; periodEnd: string | null; trialEndsAt: string | null; cancelAtPeriodEnd: boolean | null } | null;
  plan: { plan: string | null; status: string | null } | null;
  payments: { paid: PlatformMetric; failed: PlatformMetric; latest: { status: string | null; amountIls: number | null; provider: string | null; createdAt: string | null } | null };
  // P8.1 — THE canonical org billing state (single source of truth). The Platform
  // Admin billing tab (billing.getOrgBillingDetail) attaches the identical object
  // from the SAME resolver → the two surfaces are provably consistent.
  canonical: OrgBillingState;
  // P8.2 — THE canonical agent-quantity + provider-quantity model, from the SAME
  // getOrgBillingQuantity resolver Platform Admin uses → provably consistent.
  quantity: OrgBillingQuantity;
}

/**
 * Commercial/billing snapshot for ONE org. Cap: platform.billing.read. Reads
 * subscriptions + org_plans lifecycle + a payments SUMMARY — NEVER payment
 * signatures, raw payloads, or provider txn ids. If no commercial rows exist,
 * `available:false` → the UI shows "אין נתונים" (not fabricated revenue).
 * Audited once as customer360.billing.
 */
export async function getOrgBillingForPlatform(orgId: string): Promise<OrgBilling> {
  const operator = await assertPlatformCapability("platform.billing.read");
  const [sub, plan, paid, failed, latestRow, canonical, quantity] = await Promise.all([
    readOne("subscriptions", "org_id", orgId, "plan_tier,status,period_end,trial_ends_at,cancel_at_period_end"),
    readOne("org_plans", "org_id", orgId, "plan,status"),
    safeCount("payments", (q) => (q as QB).eq("org_id", orgId).eq("status", "paid")),
    safeCount("payments", (q) => (q as QB).eq("org_id", orgId).eq("status", "failed")),
    readOne("payments", "org_id", orgId, "status,amount_ils,provider,created_at", "created_at"),
    getOrgBillingState(orgId),   // P8.1 — canonical single-source-of-truth resolver
    getOrgBillingQuantity(orgId), // P8.2 — canonical agent-quantity resolver
  ]);
  await writePlatformAudit({ operator, capability: "platform.billing.read", action: "customer360.billing", resourceType: "organization", targetOrgId: orgId });

  const subscription = (sub && sub !== undefined) ? {
    plan: (sub.plan_tier as string) ?? null, status: (sub.status as string) ?? null,
    periodEnd: (sub.period_end as string) ?? null, trialEndsAt: (sub.trial_ends_at as string) ?? null,
    cancelAtPeriodEnd: (sub.cancel_at_period_end as boolean) ?? null,
  } : null;
  const planRow = (plan && plan !== undefined) ? { plan: (plan.plan as string) ?? null, status: (plan.status as string) ?? null } : null;
  const latest = (latestRow && latestRow !== undefined) ? {
    status: (latestRow.status as string) ?? null, amountIls: (latestRow.amount_ils as number) ?? null,
    provider: (latestRow.provider as string) ?? null, createdAt: (latestRow.created_at as string) ?? null,
  } : null;
  const available = !!(subscription || planRow || latest);
  return { available, subscription, plan: planRow, payments: { paid: metric(paid), failed: metric(failed), latest }, canonical, quantity };
}

export interface OrgOpsSignal { key: string; label: string; count: PlatformMetric; latestAt: string | null; note: string | null }
export interface OrgOperations { signals: OrgOpsSignal[]; latestDeadLetterReason: string | null }

/**
 * Customer-scoped operations view for ONE org. Cap: platform.ops.read. Failure
 * counts + latest occurrence + a SAFE error summary (dead-letter `reason` enum,
 * `safe_last_error`) — never raw stack traces, credentials, or lease tokens.
 * Audited once as customer360.operations.
 */
export async function getOrgOperationsForPlatform(orgId: string): Promise<OrgOperations> {
  const operator = await assertPlatformCapability("platform.ops.read");
  const [failedJobs, metaFailed, deadLetters, latestJobAt, latestDlAt, dlRow] = await Promise.all([
    safeCount("distribution_publish_jobs", (q) => (q as QB).eq("org_id", orgId).in("status", ["failed", "dead"])),
    safeCount("meta_publish_job", (q) => (q as QB).eq("org_id", orgId).in("status", ["failed", "dead_letter"])),
    safeCount("meta_publish_dead_letter", (q) => (q as QB).eq("org_id", orgId)),
    latestTimestamp("distribution_publish_jobs", "org_id", orgId, "created_at"),
    latestTimestamp("meta_publish_dead_letter", "org_id", orgId, "created_at"),
    readOne("meta_publish_dead_letter", "org_id", orgId, "reason,created_at", "created_at"),
  ]);
  await writePlatformAudit({ operator, capability: "platform.ops.read", action: "customer360.operations", resourceType: "organization", targetOrgId: orgId });
  const latestDeadLetterReason = (dlRow && dlRow !== undefined) ? ((dlRow.reason as string) ?? null) : null;
  return {
    signals: [
      { key: "publish_jobs", label: "עבודות הפצה שנכשלו", count: metric(failedJobs), latestAt: latestJobAt, note: null },
      { key: "meta_jobs", label: "עבודות Meta שנכשלו", count: metric(metaFailed), latestAt: null, note: null },
      { key: "dead_letter", label: "Dead-letter", count: metric(deadLetters), latestAt: latestDlAt, note: latestDeadLetterReason },
    ],
    latestDeadLetterReason,
  };
}
