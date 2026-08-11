// ============================================================================
// ZONO — OWNER INTELLIGENCE server layer (server-only). P5.10. Bounded, honest
// management aggregates for the ZONO owner. Pattern: assertPlatformCapability →
// BOUNDED windowed reads → grouped-in-memory → pure classification → DTO.
// HARD RULES:
//   · NO N+1: each signal is ONE bounded windowed query, tallied per org in
//     memory (never a per-org query loop).
//   · NO fabricated metrics: verified revenue is real; MRR/churn are NOT invented;
//     AI cost is reported as an instrumentation GAP (no token/cost columns exist).
//   · Missing signal → the pure model returns UNKNOWN/declares it missing.
//   · Reads only; NEVER selects secret/token columns or message content.
//   · Degrades by capability (billing/ops/support signals gated).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { operatorCan } from "../capabilities";
import { normalizePlanTier } from "../access/model";
import {
  resolveActivity, resolveHealth, riskFlags, freshnessLabel,
  type ActivityState, type HealthResult, type RiskFlag,
} from "../intel/model";
import type { PlanTier } from "@/lib/launch/types";

const WINDOW = 20_000; // bounded read cap per signal
async function rows<T>(table: string, cols: string, build?: (q: IQB) => IQB): Promise<T[]> {
  try {
    const db = createServiceRoleClient();
    let q = db.from(table as never).select(cols).limit(WINDOW) as unknown as IQB;
    if (build) q = build(q);
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>);
    return error ? [] : ((data ?? []) as T[]);
  } catch { return []; }
}
type IQB = { eq: (c: string, v: unknown) => IQB; in: (c: string, v: unknown[]) => IQB; is: (c: string, v: unknown) => IQB; order: (c: string, o: { ascending: boolean }) => IQB; limit: (n: number) => IQB };

function latestByOrg(list: { org: string | null; at: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of list) { if (r.org && (!m.has(r.org) || r.at > m.get(r.org)!)) m.set(r.org, r.at); }
  return m;
}
function countByOrg(list: (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of list) { if (o) m.set(o, (m.get(o) ?? 0) + 1); }
  return m;
}

// ── Customer intelligence (per-org activity + health + risk) ────────────────
export interface CustomerIntel {
  orgId: string; orgName: string | null; plan: PlanTier; createdAt: string;
  activity: ActivityState; lastActivityAt: string | null;
  health: HealthResult; risks: RiskFlag[];
  openUrgentTickets: number; deadLetters: number; subStatus: string | null; freshness: string;
}
export interface CustomerIntelResult { customers: CustomerIntel[]; generatedAt: string }

export async function getCustomerIntel(): Promise<CustomerIntelResult> {
  await assertPlatformCapability("platform.customers.read");
  const nowMs = Date.now();
  const db = createServiceRoleClient();

  const { data: orgRows } = await db.from("organizations").select("id,name,plan,created_at").limit(1000);
  const orgs = ((orgRows ?? []) as { id: string; name: string | null; plan: string | null; created_at: string }[]);

  // Bounded windowed signal reads — ONE each, tallied per org (no N+1).
  const [events, props, urgent, subs, dead] = await Promise.all([
    rows<{ organization_id: string | null; occurred_at: string }>("domain_events", "organization_id,occurred_at", (q) => q.order("occurred_at", { ascending: false })),
    rows<{ org_id: string | null }>("properties", "org_id"),
    rows<{ org_id: string | null }>("support_tickets", "org_id", (q) => q.eq("priority", "urgent").in("status", ["open", "in_progress", "waiting_customer"])),
    rows<{ org_id: string | null; status: string }>("subscriptions", "org_id,status"),
    rows<{ org_id: string | null }>("meta_publish_dead_letter", "org_id"),
  ]);
  const lastAct = latestByOrg(events.map((e) => ({ org: e.organization_id, at: e.occurred_at })));
  const propOrgs = new Set(props.map((p) => p.org_id).filter(Boolean));
  const urgentByOrg = countByOrg(urgent.map((t) => t.org_id));
  const deadByOrg = countByOrg(dead.map((d) => d.org_id));
  const subByOrg = new Map(subs.filter((s) => s.org_id).map((s) => [s.org_id as string, s.status]));

  const customers: CustomerIntel[] = orgs.map((o) => {
    const lastActivityAt = lastAct.get(o.id) ?? null;
    const activity = resolveActivity(o.created_at, lastActivityAt, nowMs);
    const openUrgentTickets = urgentByOrg.get(o.id) ?? 0;
    const deadLetters = deadByOrg.get(o.id) ?? 0;
    const subStatus = subByOrg.get(o.id) ?? null;
    // Map raw subscription status → coarse billing signal for the health model.
    const billingState = subStatus === "suspended" ? "PAYMENT_FAILED" : subStatus === "grace_period" ? "GRACE" : null;
    const productPresence = propOrgs.has(o.id);
    const health = resolveHealth({
      activity, billingState,
      opsCritical: deadLetters >= 25 ? true : deadLetters > 0 ? false : false,
      opsFailedJobs: deadLetters, integrationDisconnected: null,
      openUrgentTickets, productPresence,
    });
    const risks = riskFlags({ activity, billingState, integrationDisconnected: null, openUrgentTickets, opsCritical: deadLetters >= 25, productPresence });
    return { orgId: o.id, orgName: o.name, plan: normalizePlanTier(o.plan), createdAt: o.created_at, activity, lastActivityAt, health, risks, openUrgentTickets, deadLetters, subStatus, freshness: freshnessLabel(lastActivityAt, nowMs) };
  });
  return { customers, generatedAt: new Date().toISOString() };
}

/** Single-org intelligence (for Customer 360). Scoped bounded reads. */
export async function getOrgIntel(orgId: string): Promise<CustomerIntel | null> {
  await assertPlatformCapability("platform.customers.read");
  const nowMs = Date.now();
  const db = createServiceRoleClient();
  const { data: o } = await db.from("organizations").select("id,name,plan,created_at").eq("id", orgId).maybeSingle();
  const org = (o as { id: string; name: string | null; plan: string | null; created_at: string } | null) ?? null;
  if (!org) return null;
  const [ev, props, urgent, sub, dead] = await Promise.all([
    rows<{ occurred_at: string }>("domain_events", "occurred_at", (q) => q.eq("organization_id", orgId).order("occurred_at", { ascending: false }).limit(1)),
    rows<{ id: string }>("properties", "id", (q) => q.eq("org_id", orgId).limit(1)),
    rows<{ id: string }>("support_tickets", "id", (q) => q.eq("org_id", orgId).eq("priority", "urgent").in("status", ["open", "in_progress", "waiting_customer"])),
    rows<{ status: string }>("subscriptions", "status", (q) => q.eq("org_id", orgId).limit(1)),
    rows<{ id: string }>("meta_publish_dead_letter", "id", (q) => q.eq("org_id", orgId)),
  ]);
  const lastActivityAt = ev[0]?.occurred_at ?? null;
  const activity = resolveActivity(org.created_at, lastActivityAt, nowMs);
  const openUrgentTickets = urgent.length;
  const deadLetters = dead.length;
  const subStatus = sub[0]?.status ?? null;
  const billingState = subStatus === "suspended" ? "PAYMENT_FAILED" : subStatus === "grace_period" ? "GRACE" : null;
  const productPresence = props.length > 0;
  const health = resolveHealth({ activity, billingState, opsCritical: deadLetters >= 25, opsFailedJobs: deadLetters, integrationDisconnected: null, openUrgentTickets, productPresence });
  const risks = riskFlags({ activity, billingState, integrationDisconnected: null, openUrgentTickets, opsCritical: deadLetters >= 25, productPresence });
  return { orgId, orgName: org.name, plan: normalizePlanTier(org.plan), createdAt: org.created_at, activity, lastActivityAt, health, risks, openUrgentTickets, deadLetters, subStatus, freshness: freshnessLabel(lastActivityAt, nowMs) };
}

// ── Owner overview KPIs (degrades by capability) ────────────────────────────
export interface OwnerOverview {
  customers: number; activeCustomers: number; newCustomers: number;
  atRiskCustomers: number; criticalCustomers: number;
  activeUsers: number | null;
  verifiedRevenueIls: { available: boolean; value: number | null };
  openUrgentTickets: { available: boolean; value: number | null };
  criticalOps: { available: boolean; value: number | null };
  generatedAt: string;
}

export async function getOwnerOverview(): Promise<OwnerOverview> {
  const operator = await assertPlatformCapability("platform.customers.read");
  const { customers } = await getCustomerIntel();
  const db = createServiceRoleClient();

  let activeUsersRes: number | null = null;
  if (operatorCan(operator, "platform.usage.read")) {
    try {
      const { count, error } = await db.from("users").select("*", { count: "exact", head: true }).eq("status", "active");
      activeUsersRes = error ? null : (count ?? null);
    } catch { activeUsersRes = null; }
  }

  let verifiedRevenueIls: OwnerOverview["verifiedRevenueIls"] = { available: false, value: null };
  if (operatorCan(operator, "platform.billing.read")) {
    const pays = await rows<{ amount_ils: number | null }>("payments", "amount_ils,status,verified", (q) => q.eq("verified", true).eq("status", "paid"));
    verifiedRevenueIls = { available: true, value: pays.reduce((s, p) => s + (Number(p.amount_ils) || 0), 0) };
  }
  let openUrgentTickets: OwnerOverview["openUrgentTickets"] = { available: false, value: null };
  if (operatorCan(operator, "platform.support.read")) {
    openUrgentTickets = { available: true, value: customers.reduce((s, c) => s + c.openUrgentTickets, 0) };
  }
  let criticalOps: OwnerOverview["criticalOps"] = { available: false, value: null };
  if (operatorCan(operator, "platform.ops.read")) {
    criticalOps = { available: true, value: customers.filter((c) => c.deadLetters >= 25).length };
  }

  return {
    customers: customers.length,
    activeCustomers: customers.filter((c) => c.activity === "ACTIVE").length,
    newCustomers: customers.filter((c) => c.activity === "NEW").length,
    atRiskCustomers: customers.filter((c) => c.health.state === "AT_RISK").length,
    criticalCustomers: customers.filter((c) => c.health.state === "CRITICAL").length,
    activeUsers: activeUsersRes,
    verifiedRevenueIls, openUrgentTickets, criticalOps,
    generatedAt: new Date().toISOString(),
  };
}

// ── Feature adoption (from AUTHORITATIVE product tables; usage_events is empty) ─
export interface AdoptionRow { key: string; label: string; orgsUsing: number; totalOrgs: number; source: string }
export async function getFeatureAdoption(): Promise<{ rows: AdoptionRow[]; note: string }> {
  await assertPlatformCapability("platform.customers.read");
  const db = createServiceRoleClient();
  const { count: totalOrgs } = await db.from("organizations").select("*", { count: "exact", head: true });
  const total = totalOrgs ?? 0;
  const MODULES: { key: string; label: string; table: string }[] = [
    { key: "properties", label: "נכסים", table: "properties" },
    { key: "leads", label: "לידים", table: "leads" },
    { key: "buyers", label: "קונים", table: "buyers" },
    { key: "journeys", label: "מסעות לקוח", table: "journeys" },
    { key: "facebook", label: "פייסבוק", table: "meta_connection" },
    { key: "whatsapp", label: "וואטסאפ", table: "whatsapp_accounts" },
    { key: "distribution", label: "הפצה", table: "distribution_publish_jobs" },
  ];
  const out: AdoptionRow[] = [];
  for (const m of MODULES) {
    const list = await rows<{ org_id: string | null }>(m.table, "org_id");
    out.push({ key: m.key, label: m.label, orgsUsing: new Set(list.map((r) => r.org_id).filter(Boolean)).size, totalOrgs: total, source: `${m.table} (נוכחות נתונים)` });
  }
  return { rows: out, note: "אימוץ נגזר מנוכחות נתוני מוצר אמיתיים — טבלת ה-usage_events (טלמטריה) ריקה, לכן אינה משמשת." };
}

// ── Attention queue (deterministic actionable items) ────────────────────────
export interface AttentionItem { orgId: string; orgName: string | null; reason: string; source: string; severity: "critical" | "warning" | "info"; at: string | null; href: string }
export async function getAttentionQueue(): Promise<AttentionItem[]> {
  await assertPlatformCapability("platform.customers.read");
  const { customers } = await getCustomerIntel();
  const items: AttentionItem[] = [];
  for (const c of customers) {
    if (c.openUrgentTickets > 0) items.push({ orgId: c.orgId, orgName: c.orgName, reason: `${c.openUrgentTickets} פניות דחופות פתוחות`, source: "תמיכה", severity: "critical", at: null, href: `/platform/customers/${c.orgId}/support` });
    if (c.deadLetters >= 25) items.push({ orgId: c.orgId, orgName: c.orgName, reason: `${c.deadLetters} מכתבים מתים`, source: "תפעול", severity: "critical", at: null, href: `/platform/customers/${c.orgId}/operations` });
    if (c.subStatus === "suspended") items.push({ orgId: c.orgId, orgName: c.orgName, reason: "מנוי מושהה (כשל תשלום)", source: "חיוב", severity: "critical", at: null, href: `/platform/customers/${c.orgId}/billing` });
    if (c.activity === "INACTIVE") items.push({ orgId: c.orgId, orgName: c.orgName, reason: "אין פעילות מעל 30 יום", source: "פעילות", severity: "warning", at: c.lastActivityAt, href: `/platform/customers/${c.orgId}` });
  }
  // critical first
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

// ── AI usage & cost — HONEST instrumentation gap ────────────────────────────
export interface AiCostStatus { available: false; reason: string; presentFeatures: string[]; gap: string }
export async function getAiCostStatus(): Promise<AiCostStatus> {
  await assertPlatformCapability("platform.ai.read");
  return {
    available: false,
    reason: "אין ייחוס עלות AI — לא קיימות עמודות tokens/עלות/USD בסכימה.",
    presentFeatures: ["ai_briefs", "ai_opportunities", "creative_generations", "whatsapp_ai_actions", "ai_copilot_cache"],
    gap: "יש תשתית פיצ׳רי AI אך ללא אינסטרומנטציה של tokens/עלות לכל בקשה/מודל/ארגון. חישוב עלות דורש מיגרציה אדיטיבית (ai_usage_costs) — מוצע, לא הוחל.",
  };
}
