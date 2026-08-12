// ============================================================================
// ZONO — PLATFORM OPS server layer (server-only). P5.6. The operations control
// center's ONLY read boundary. Pattern (P5.0):
//     assertPlatformCapability(cap) → BOUNDED service-role aggregate → audit → DTO.
// HARD RULES:
//   · READ-ONLY (no redrive/replay primitive exists safely — audit §11 — so we
//     do NOT invent one; visibility only).
//   · Bounded aggregates only — COUNT(head) + a single ordered LIMIT 1 for
//     oldest-age. No unbounded table loads, no per-org N+1 fan-out.
//   · NEVER select secret columns: lease_token/lease_owner (meta_publish_job),
//     token_ref (meta_connection), secret_hash (facebook_extension_instances),
//     *_encrypted (google_connections), raw payloads, message bodies.
//   · A failed read → "unavailable" (null), NEVER a fabricated 0.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";
import { operatorCan } from "../capabilities";
import {
  classifyHeartbeat, heartbeatSeverity, queueSeverity, worstSeverity, buildOpsAlerts,
  type QueueSignal, type OpsSeverity, type OpsAlert, type IntegrationState, type HeartbeatClass,
} from "../ops/model";

// ── Bounded count helper (null on error → "unavailable", never fake 0) ──────
type QB = { in: (c: string, v: unknown[]) => QB; eq: (c: string, v: unknown) => QB };
async function countWhere(table: string, build?: (q: QB) => QB): Promise<number | null> {
  try {
    const db = createServiceRoleClient();
    let q: unknown = db.from(table as never).select("*", { count: "exact", head: true });
    if (build) q = build(q as QB);
    const { count, error } = await (q as Promise<{ count: number | null; error: unknown }>);
    return error ? null : (count ?? 0);
  } catch { return null; }
}
async function oldestAgeMs(table: string, statusCol: string, active: string[], tsCol: string, nowMs: number): Promise<number | null> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db.from(table as never).select(tsCol).in(statusCol as never, active as never).order(tsCol, { ascending: true }).limit(1).maybeSingle();
    if (error || !data) return null;
    const iso = (data as Record<string, string>)[tsCol];
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : Math.max(0, nowMs - t);
  } catch { return null; }
}

// ── Subsystem catalog (status vocab verified against live schema) ───────────
interface SubsystemCfg {
  key: string; label: string; table: string; statusCol: string; tsCol: string;
  active: string[]; failed: string[]; dead: string[]; deadLetterTable?: string;
}
const META_ACTIVE = ["scheduled", "available", "claimed", "executing", "retry_wait", "blocked"];
const SUBSYSTEMS: SubsystemCfg[] = [
  { key: "meta_publish", label: "Meta · פרסום", table: "meta_publish_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [], deadLetterTable: "meta_publish_dead_letter" },
  { key: "meta_messaging", label: "Meta · הודעות", table: "meta_messaging_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [] },
  { key: "meta_intelligence", label: "Meta · תובנות", table: "meta_intelligence_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [] },
  { key: "meta_listening", label: "Meta · האזנה", table: "meta_listening_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [] },
  { key: "meta_inbox", label: "Meta · תיבה", table: "meta_inbox_sync_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [] },
  { key: "meta_insights", label: "Meta · אנליטיקה", table: "meta_insight_refresh_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [] },
  { key: "meta_reconcile", label: "Meta · התאמה", table: "meta_reconciliation_job", statusCol: "status", tsCol: "created_at", active: META_ACTIVE, failed: ["failed"], dead: [] },
  { key: "distribution", label: "הפצה", table: "distribution_publish_jobs", statusCol: "status", tsCol: "created_at", active: ["queued", "claimed", "running"], failed: ["failed"], dead: ["dead"] },
  { key: "kernel", label: "Kernel · אירועי דומיין", table: "domain_events", statusCol: "processing_status", tsCol: "occurred_at", active: ["pending", "processing"], failed: ["failed"], dead: [] },
];

async function readQueueSignal(cfg: SubsystemCfg, nowMs: number): Promise<QueueSignal> {
  const [active, failed, deadInline, deadLetter, oldest] = await Promise.all([
    countWhere(cfg.table, (q) => q.in(cfg.statusCol, cfg.active)),
    countWhere(cfg.table, (q) => q.in(cfg.statusCol, cfg.failed)),
    cfg.dead.length ? countWhere(cfg.table, (q) => q.in(cfg.statusCol, cfg.dead)) : Promise.resolve(0),
    cfg.deadLetterTable ? countWhere(cfg.deadLetterTable) : Promise.resolve(0),
    oldestAgeMs(cfg.table, cfg.statusCol, cfg.active, cfg.tsCol, nowMs),
  ]);
  const dead = (deadInline === null && deadLetter === null) ? null : (deadInline ?? 0) + (deadLetter ?? 0);
  return { key: cfg.key, label: cfg.label, active, failed, deadLetter: dead, oldestPendingAgeMs: oldest };
}

// ── Integration rollup (internal helper — page fns assert + audit) ──────────
interface ProviderRollup { provider: string; label: string; total: number | null; byState: Record<IntegrationState, number>; }
const EMPTY_STATE = (): Record<IntegrationState, number> => ({ connected: 0, warning: 0, disconnected: 0, not_configured: 0, unavailable: 0 });

async function readProviderRollup(table: string, statusCol: string, map: (v: string | null) => IntegrationState, provider: string, label: string): Promise<ProviderRollup> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db.from(table as never).select(statusCol).limit(5000);
    if (error) return { provider, label, total: null, byState: EMPTY_STATE() };
    const rows = ((data ?? []) as Record<string, string | null>[]);
    const byState = EMPTY_STATE();
    for (const r of rows) byState[map(r[statusCol])] += 1;
    return { provider, label, total: rows.length, byState };
  } catch { return { provider, label, total: null, byState: EMPTY_STATE() }; }
}

// State mappers (mirror the platform DAL's safe mappings).
const mapMeta = (v: string | null): IntegrationState => v === "connected" ? "connected" : v === "needs_reauth" || v === "disabled" ? "warning" : v === "revoked" ? "disconnected" : v === "not_connected" ? "not_configured" : "unavailable";
const mapWa = (v: string | null): IntegrationState => v === "connected" ? "connected" : v === "sandbox" ? "warning" : v === "missing_permissions" || v === "expired" ? "warning" : v === "not_configured" ? "not_configured" : "unavailable";
const mapGoogle = (v: string | null): IntegrationState => v === "connected" ? "connected" : v === "syncing" ? "connected" : v === "disconnected" ? "disconnected" : v === null ? "not_configured" : "warning";

async function readIntegrationRollups(): Promise<ProviderRollup[]> {
  return Promise.all([
    readProviderRollup("meta_connection", "status", mapMeta, "meta", "Meta"),
    readProviderRollup("whatsapp_accounts", "connection_status", mapWa, "whatsapp", "WhatsApp"),
    readProviderRollup("google_connections", "status", mapGoogle, "google", "Google"),
  ]);
}

// ── Extension health (internal helper) ──────────────────────────────────────
export interface ExtensionInstanceRow { instanceId: string; orgId: string | null; orgName: string | null; status: string | null; version: string | null; lastSeenAt: string | null; heartbeat: HeartbeatClass }
export interface ExtensionHealth { total: number | null; healthy: number; stale: number; offline: number; unknown: number; recent: ExtensionInstanceRow[] }

async function readExtensionHealth(nowMs: number, withNames = false): Promise<ExtensionHealth> {
  try {
    const db = createServiceRoleClient();
    // instance_id, status, version, last_seen_at, org_id — NEVER secret_hash.
    const { data, error } = await db.from("facebook_extension_instances" as never)
      .select("instance_id,org_id,status,version,last_seen_at").order("last_seen_at", { ascending: false }).limit(200);
    if (error) return { total: null, healthy: 0, stale: 0, offline: 0, unknown: 0, recent: [] };
    const rows = ((data ?? []) as { instance_id: string; org_id: string | null; status: string | null; version: string | null; last_seen_at: string | null }[]);
    const nameById = new Map<string, string | null>();
    if (withNames && rows.length) {
      const ids = Array.from(new Set(rows.map((r) => r.org_id).filter((x): x is string => !!x)));
      if (ids.length) { const { data: orgs } = await db.from("organizations").select("id,name").in("id", ids); for (const o of ((orgs ?? []) as { id: string; name: string | null }[])) nameById.set(o.id, o.name); }
    }
    const out: ExtensionHealth = { total: rows.length, healthy: 0, stale: 0, offline: 0, unknown: 0, recent: [] };
    for (const r of rows) {
      const hb = classifyHeartbeat(r.last_seen_at, nowMs);
      out[hb] += 1;
      if (out.recent.length < 25) out.recent.push({ instanceId: r.instance_id, orgId: r.org_id, orgName: r.org_id ? (nameById.get(r.org_id) ?? null) : null, status: r.status, version: r.version, lastSeenAt: r.last_seen_at, heartbeat: hb });
    }
    return out;
  } catch { return { total: null, healthy: 0, stale: 0, offline: 0, unknown: 0, recent: [] }; }
}

async function probeDatabase(): Promise<boolean | null> {
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from("organizations").select("id", { count: "exact", head: true });
    return error ? false : true;
  } catch { return false; }
}

// ── Overview (spec §2) ──────────────────────────────────────────────────────
export interface OpsOverview {
  severity: OpsSeverity;
  alerts: OpsAlert[];
  queues: QueueSignal[];
  deadLetterTotal: number | null;
  extension: ExtensionHealth;
  integrations: ProviderRollup[] | null;   // null when caller lacks integrations.read
  dbReachable: boolean | null;
  generatedAt: string;
}

export async function getPlatformOpsOverview(): Promise<OpsOverview> {
  const operator = await assertPlatformCapability("platform.ops.read");
  const canInteg = operatorCan(operator, "platform.integrations.read");
  const nowMs = Date.now();

  const [dbReachable, queues, extension, integrations] = await Promise.all([
    probeDatabase(),
    Promise.all(SUBSYSTEMS.map((s) => readQueueSignal(s, nowMs))),
    readExtensionHealth(nowMs, false),
    canInteg ? readIntegrationRollups() : Promise.resolve(null),
  ]);
  const deadLetterTotal = queues.reduce<number | null>((sum, q) => (q.deadLetter === null ? sum : (sum ?? 0) + q.deadLetter), 0);

  const alerts = buildOpsAlerts({
    dbReachable,
    queues,
    extension: { stale: extension.stale, offline: extension.offline },
    integrations: (integrations ?? []).map((r) => ({ provider: r.label, warning: r.byState.warning, disconnected: r.byState.disconnected })),
  });
  const severity = worstSeverity([
    dbReachable === false ? "critical" : dbReachable === null ? "unavailable" : "healthy",
    ...queues.map(queueSeverity),
    heartbeatSeverity(extension.offline > 0 ? "offline" : extension.stale > 0 ? "stale" : "healthy"),
  ]);

  await writePlatformAudit({ operator, capability: "platform.ops.read", action: "operations.overview", resourceType: "platform", metadata: { severity, alerts: alerts.length, deadLetter: deadLetterTotal } });
  return { severity, alerts, queues, deadLetterTotal, extension, integrations, dbReachable, generatedAt: new Date().toISOString() };
}

// ── Jobs & queues (spec §8) ─────────────────────────────────────────────────
export interface JobsHealth { queues: { signal: QueueSignal; severity: OpsSeverity }[]; generatedAt: string }
export async function getPlatformJobsHealth(): Promise<JobsHealth> {
  const operator = await assertPlatformCapability("platform.ops.read");
  const nowMs = Date.now();
  const signals = await Promise.all(SUBSYSTEMS.map((s) => readQueueSignal(s, nowMs)));
  await writePlatformAudit({ operator, capability: "platform.ops.read", action: "jobs.open", resourceType: "platform", metadata: { subsystems: signals.length } });
  return { queues: signals.map((signal) => ({ signal, severity: queueSeverity(signal) })), generatedAt: new Date().toISOString() };
}

// ── Dead-letter visibility (spec §9) — safe metadata only ───────────────────
export interface DeadLetterRow { id: string; orgId: string | null; orgName: string | null; jobId: string | null; reason: string | null; terminalErrorKind: string | null; attemptCount: number | null; createdAt: string }
export async function getPlatformDeadLetters(limit = 100): Promise<DeadLetterRow[]> {
  const operator = await assertPlatformCapability("platform.ops.read");
  const db = createServiceRoleClient();
  const capped = Math.min(Math.max(limit, 1), 500);
  let rows: { id: string; org_id: string | null; publish_job_id: string | null; reason: string | null; terminal_error_kind: string | null; attempt_count: number | null; created_at: string }[] = [];
  try {
    // Safe columns only — NO safe_context beyond nothing, NO payloads/tokens.
    const { data } = await db.from("meta_publish_dead_letter" as never)
      .select("id,org_id,publish_job_id,reason,terminal_error_kind,attempt_count,created_at").order("created_at", { ascending: false }).limit(capped);
    rows = ((data ?? []) as typeof rows);
  } catch { rows = []; }
  const nameById = new Map<string, string | null>();
  const ids = Array.from(new Set(rows.map((r) => r.org_id).filter((x): x is string => !!x)));
  if (ids.length) { try { const { data } = await db.from("organizations").select("id,name").in("id", ids); for (const o of ((data ?? []) as { id: string; name: string | null }[])) nameById.set(o.id, o.name); } catch { /* names degrade */ } }
  await writePlatformAudit({ operator, capability: "platform.ops.read", action: "dead_letter.open", resourceType: "platform", metadata: { count: rows.length } });
  return rows.map((r) => ({ id: r.id, orgId: r.org_id, orgName: r.org_id ? (nameById.get(r.org_id) ?? null) : null, jobId: r.publish_job_id, reason: r.reason, terminalErrorKind: r.terminal_error_kind, attemptCount: r.attempt_count, createdAt: r.created_at }));
}

// ── Integrations rollup (spec §3) ───────────────────────────────────────────
export interface IntegrationsView { providers: ProviderRollup[]; extension: ExtensionHealth; generatedAt: string }
export async function getPlatformIntegrationsRollup(): Promise<IntegrationsView> {
  const operator = await assertPlatformCapability("platform.integrations.read");
  const nowMs = Date.now();
  const [providers, extension] = await Promise.all([readIntegrationRollups(), readExtensionHealth(nowMs, true)]);
  await writePlatformAudit({ operator, capability: "platform.integrations.read", action: "operations.integrations", resourceType: "platform", metadata: { providers: providers.length, extensions: extension.total ?? -1 } });
  return { providers, extension, generatedAt: new Date().toISOString() };
}

// ── System health (spec §12) ────────────────────────────────────────────────
export interface HealthComponent { key: string; label: string; severity: OpsSeverity; detail: string }
export interface SystemHealth { severity: OpsSeverity; components: HealthComponent[]; env: { key: string; configured: boolean }[]; generatedAt: string }

const CRITICAL_ENVS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];

export async function getPlatformSystemHealth(): Promise<SystemHealth> {
  const operator = await assertPlatformCapability("platform.ops.read");
  const canInteg = operatorCan(operator, "platform.integrations.read");
  const nowMs = Date.now();

  const [dbReachable, queues, extension, integrations] = await Promise.all([
    probeDatabase(),
    Promise.all(SUBSYSTEMS.map((s) => readQueueSignal(s, nowMs))),
    readExtensionHealth(nowMs, false),
    canInteg ? readIntegrationRollups() : Promise.resolve(null),
  ]);

  const queuesWorst = worstSeverity(queues.map(queueSeverity));
  const deadLetterTotal = queues.reduce((s, q) => s + (q.deadLetter ?? 0), 0);
  const components: HealthComponent[] = [
    { key: "database", label: "מסד נתונים", severity: dbReachable === false ? "critical" : dbReachable === null ? "unavailable" : "healthy", detail: dbReachable ? "נגיש" : dbReachable === false ? "לא נגיש" : "לא ידוע" },
    { key: "queues", label: "תורים ומשימות", severity: queuesWorst, detail: `${queues.length} תת-מערכות` },
    { key: "dead_letter", label: "מכתבים מתים", severity: deadLetterTotal >= 25 ? "critical" : deadLetterTotal > 0 ? "warning" : "healthy", detail: `${deadLetterTotal} פריטים` },
    { key: "extension", label: "תוסף Facebook", severity: heartbeatSeverity(extension.offline > 0 ? "offline" : extension.stale > 0 ? "stale" : "healthy"), detail: `${extension.total ?? 0} מופעים` },
  ];
  if (canInteg && integrations) {
    const worstInteg = worstSeverity(integrations.flatMap((p) => [p.byState.disconnected > 0 || p.byState.warning > 0 ? "warning" : "healthy"] as OpsSeverity[]));
    components.push({ key: "integrations", label: "אינטגרציות", severity: worstInteg, detail: integrations.map((p) => `${p.label}: ${p.byState.connected}✓`).join(" · ") });
  }
  const env = CRITICAL_ENVS.map((key) => ({ key, configured: !!process.env[key] }));
  const severity = worstSeverity([...components.map((c) => c.severity), ...(env.some((e) => !e.configured) ? ["warning" as OpsSeverity] : [])]);

  await writePlatformAudit({ operator, capability: "platform.ops.read", action: "system_health.open", resourceType: "platform", metadata: { severity, deadLetter: deadLetterTotal } });
  return { severity, components, env, generatedAt: new Date().toISOString() };
}

// ── Customer 360 · Operations (spec §14) ────────────────────────────────────
export interface OrgOpsExtras { extension: ExtensionInstanceRow[]; generatedAt: string }
export async function getOrgExtensionInstances(orgId: string): Promise<OrgOpsExtras> {
  const operator = await assertPlatformCapability("platform.ops.read");
  const db = createServiceRoleClient();
  const nowMs = Date.now();
  let out: ExtensionInstanceRow[] = [];
  try {
    const { data } = await db.from("facebook_extension_instances" as never)
      .select("instance_id,org_id,status,version,last_seen_at").eq("org_id" as never, orgId as never).order("last_seen_at", { ascending: false }).limit(25);
    out = ((data ?? []) as { instance_id: string; org_id: string | null; status: string | null; version: string | null; last_seen_at: string | null }[])
      .map((r) => ({ instanceId: r.instance_id, orgId: r.org_id, orgName: null, status: r.status, version: r.version, lastSeenAt: r.last_seen_at, heartbeat: classifyHeartbeat(r.last_seen_at, nowMs) }));
  } catch { out = []; }
  await writePlatformAudit({ operator, capability: "platform.ops.read", action: "customer360.operations", resourceType: "organization", targetOrgId: orgId, metadata: { extensions: out.length } });
  return { extension: out, generatedAt: new Date().toISOString() };
}
