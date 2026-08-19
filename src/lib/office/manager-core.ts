// ============================================================================
// ZONO — Manager / Owner Command Center: PURE office-exception core (no IO, no
// clock, no LLM). "איפה המשרד צריך אותי?" — given the REAL office exceptions the
// server composed from existing sources (Daily Command Center feed + office follow-
// up + deals + support + billing + workload), this ranks them by ONE deterministic
// P0/P1/P2 model, dedupes, groups them into the operating buckets, derives the ONE
// primary manager decision, and computes 4–5 explicit office-health dimensions
// (never an opaque 0–100 score). It is an EXCEPTION + DECISION model, not analytics,
// not surveillance, not a leaderboard. Self-contained for `node --test`.
// ============================================================================

export type ManagerExceptionType =
  | "lead_unassigned" | "lead_sla_breach" | "followup_overdue" | "hot_lead_no_action"
  | "deal_stale" | "deal_no_next_action"
  | "seller_callback" | "seller_strategy"
  | "buyer_action_required" | "viewing_followup" | "viewing_unassigned"
  | "property_not_marketed" | "property_no_future_marketing" | "property_attention"
  | "marketing_plan_waiting_approval" | "marketing_plan_failed"
  | "publish_failed" | "publish_reconciliation"
  | "support_escalation" | "billing_action_required"
  | "agent_overloaded";

export type ManagerPriority = "P0" | "P1" | "P2";
export type ManagerGroup =
  | "leads" | "deals" | "properties" | "marketing" | "customers" | "sellers" | "viewings" | "operations" | "team";
export type HealthDimension = "customers" | "deals" | "marketing" | "properties" | "operations";
export type HealthStatus = "ok" | "attention" | "critical";

export interface ManagerException {
  id: string;
  type: ManagerExceptionType;
  priority: ManagerPriority;
  title: string;             // person / property / entity
  subtitle: string;          // what happened
  reason: string;            // why it matters
  agingLabel: string | null; // human aging ("ממתין 5 שעות")
  agentName: string | null;  // assigned agent (attribution), null = unassigned/office
  entityType: string | null;
  entityId: string | null;
  route: string;
  cta: string;
  canPrepare: boolean;       // ZONO can prepare (plan/update/bundle/task)
  requiresConfirmation: boolean;
  urgency: number;           // within-priority tie-break (higher first)
}

interface TypeMeta { group: ManagerGroup; defaultPriority: ManagerPriority; dimension: HealthDimension; icon: string }

export const EXCEPTION_META: Record<ManagerExceptionType, TypeMeta> = {
  lead_unassigned:              { group: "leads", defaultPriority: "P1", dimension: "customers", icon: "UserPlus" },
  lead_sla_breach:              { group: "leads", defaultPriority: "P0", dimension: "customers", icon: "AlertTriangle" },
  followup_overdue:             { group: "leads", defaultPriority: "P1", dimension: "customers", icon: "Clock" },
  hot_lead_no_action:           { group: "leads", defaultPriority: "P0", dimension: "customers", icon: "Flame" },
  deal_stale:                   { group: "deals", defaultPriority: "P1", dimension: "deals", icon: "Briefcase" },
  deal_no_next_action:          { group: "deals", defaultPriority: "P1", dimension: "deals", icon: "Briefcase" },
  seller_callback:              { group: "sellers", defaultPriority: "P1", dimension: "customers", icon: "MessageCircle" },
  seller_strategy:              { group: "sellers", defaultPriority: "P1", dimension: "customers", icon: "MessageCircle" },
  buyer_action_required:        { group: "customers", defaultPriority: "P1", dimension: "customers", icon: "MessageCircle" },
  viewing_followup:             { group: "viewings", defaultPriority: "P1", dimension: "customers", icon: "MapPin" },
  viewing_unassigned:           { group: "viewings", defaultPriority: "P1", dimension: "customers", icon: "MapPin" },
  property_not_marketed:        { group: "properties", defaultPriority: "P1", dimension: "properties", icon: "Home" },
  property_no_future_marketing: { group: "properties", defaultPriority: "P1", dimension: "properties", icon: "Home" },
  property_attention:           { group: "properties", defaultPriority: "P1", dimension: "properties", icon: "Home" },
  marketing_plan_waiting_approval: { group: "marketing", defaultPriority: "P1", dimension: "marketing", icon: "Megaphone" },
  marketing_plan_failed:        { group: "marketing", defaultPriority: "P0", dimension: "marketing", icon: "Megaphone" },
  publish_failed:               { group: "marketing", defaultPriority: "P0", dimension: "marketing", icon: "AlertTriangle" },
  publish_reconciliation:       { group: "marketing", defaultPriority: "P1", dimension: "marketing", icon: "RefreshCw" },
  support_escalation:           { group: "operations", defaultPriority: "P0", dimension: "operations", icon: "LifeBuoy" },
  billing_action_required:      { group: "operations", defaultPriority: "P0", dimension: "operations", icon: "CreditCard" },
  agent_overloaded:             { group: "team", defaultPriority: "P2", dimension: "operations", icon: "Users" },
};

const PRIORITY_RANK: Record<ManagerPriority, number> = { P0: 0, P1: 1, P2: 2 };

export function metaFor(type: ManagerExceptionType): TypeMeta { return EXCEPTION_META[type]; }

// ── Aging (pure) ─────────────────────────────────────────────────────────────
export function humanizeAging(iso: string | null, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const h = Math.max(0, (nowMs - t) / 3_600_000);
  if (h < 1) return "פחות משעה";
  if (h < 24) return `ממתין ${Math.floor(h)} שעות`;
  const d = Math.floor(h / 24);
  if (d === 1) return "באיחור יום";
  if (d < 7) return `${d} ימים`;
  const w = Math.floor(d / 7);
  return w === 1 ? "כשבוע" : `${w} שבועות`;
}

// ── Ranking + dedupe ─────────────────────────────────────────────────────────
export function rankExceptions(items: ManagerException[]): ManagerException[] {
  return items
    .map((e, i) => ({ e, i }))
    .sort((a, b) => PRIORITY_RANK[a.e.priority] - PRIORITY_RANK[b.e.priority] || b.e.urgency - a.e.urgency || a.i - b.i)
    .map((w) => w.e);
}

/** Dedupe by (type + entity) so nothing is represented twice. First (highest-ranked) wins. */
export function dedupeExceptions(items: ManagerException[]): ManagerException[] {
  const seen = new Set<string>();
  const out: ManagerException[] = [];
  for (const e of items) {
    const key = `${e.type}:${e.entityType ?? ""}:${e.entityId ?? e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// ── Office health dimensions ─────────────────────────────────────────────────
export interface DimensionHealth { dimension: HealthDimension; status: HealthStatus; reasons: string[] }
export const DIMENSION_LABEL: Record<HealthDimension, string> = {
  customers: "לקוחות", deals: "עסקאות", marketing: "שיווק", properties: "נכסים", operations: "תפעול",
};
export const HEALTH_LABEL: Record<HealthStatus, string> = { ok: "תקין", attention: "דורש תשומת לב", critical: "קריטי" };

function dimensionHealth(dim: HealthDimension, exceptions: ManagerException[]): DimensionHealth {
  const inDim = exceptions.filter((e) => EXCEPTION_META[e.type].dimension === dim);
  const p0 = inDim.filter((e) => e.priority === "P0");
  const p1 = inDim.filter((e) => e.priority === "P1");
  const status: HealthStatus = p0.length ? "critical" : p1.length ? "attention" : "ok";
  const reasons = (p0.length ? p0 : p1).slice(0, 2).map((e) => e.title + " — " + e.subtitle);
  return { dimension: dim, status, reasons };
}

// ── DTO ──────────────────────────────────────────────────────────────────────
export interface ManagerSummary {
  needsAttention: number;      // P0 + P1
  unassignedLeads: number;
  staleDeals: number;
  propertiesNotMarketed: number;
  plansAwaiting: number;
}

export interface ManagerCommandCenter {
  date: string;
  role: "manager" | "owner";
  quiet: boolean;
  headline: string;
  nextDecision: ManagerException | null;
  summary: ManagerSummary;
  critical: ManagerException[];        // P0
  attention: ManagerException[];       // P1
  opportunities: ManagerException[];   // P2
  groups: Record<ManagerGroup, ManagerException[]>;
  health: DimensionHealth[];           // the 5 dimensions
}

export interface BuildManagerInput {
  exceptions: ManagerException[];
  role: "manager" | "owner";
  date: string;
}

function emptyGroups(): Record<ManagerGroup, ManagerException[]> {
  return { leads: [], deals: [], properties: [], marketing: [], customers: [], sellers: [], viewings: [], operations: [], team: [] };
}

/** Compose the manager command center from real, already-typed office exceptions. */
export function buildManagerCommandCenter(input: BuildManagerInput): ManagerCommandCenter {
  const ranked = rankExceptions(dedupeExceptions(input.exceptions));

  const groups = emptyGroups();
  for (const e of ranked) groups[EXCEPTION_META[e.type].group].push(e);

  const critical = ranked.filter((e) => e.priority === "P0");
  const attention = ranked.filter((e) => e.priority === "P1");
  const opportunities = ranked.filter((e) => e.priority === "P2");

  const summary: ManagerSummary = {
    needsAttention: critical.length + attention.length,
    unassignedLeads: ranked.filter((e) => e.type === "lead_unassigned").length,
    staleDeals: ranked.filter((e) => e.type === "deal_stale" || e.type === "deal_no_next_action").length,
    propertiesNotMarketed: ranked.filter((e) => e.type === "property_not_marketed" || e.type === "property_no_future_marketing").length,
    plansAwaiting: ranked.filter((e) => e.type === "marketing_plan_waiting_approval").length,
  };

  const health: DimensionHealth[] = (["customers", "deals", "marketing", "properties", "operations"] as HealthDimension[])
    .map((d) => dimensionHealth(d, ranked));

  // The ONE decision: the top-ranked non-opportunity exception.
  const nextDecision = critical[0] ?? attention[0] ?? null;
  const quiet = critical.length === 0 && attention.length === 0;

  return {
    date: input.date, role: input.role, quiet,
    headline: buildManagerHeadline(summary),
    nextDecision, summary, critical, attention, opportunities, groups, health,
  };
}

export function buildManagerHeadline(s: ManagerSummary): string {
  if (s.needsAttention === 0) return "המשרד בשליטה — אין חריגים שדורשים אותך ✓";
  const bits: string[] = [];
  if (s.unassignedLeads > 0) bits.push(`${s.unassignedLeads} לידים ללא אחראי`);
  if (s.staleDeals > 0) bits.push(`${s.staleDeals} עסקאות תקועות`);
  if (s.plansAwaiting > 0) bits.push(`${s.plansAwaiting} תוכניות לאישור`);
  const lead = s.needsAttention === 1 ? "חריג אחד דורש אותך היום" : `${s.needsAttention} חריגים דורשים אותך היום`;
  return bits.length ? `${lead} · ${bits.slice(0, 2).join(" · ")}` : lead;
}

// ── Helper for the server: build a typed exception with defaults ─────────────
export function makeException(e: {
  id: string; type: ManagerExceptionType; title: string; subtitle: string; reason: string;
  route: string; cta: string; priority?: ManagerPriority; agentName?: string | null;
  agingLabel?: string | null; entityType?: string | null; entityId?: string | null;
  canPrepare?: boolean; requiresConfirmation?: boolean; urgency?: number;
}): ManagerException {
  const meta = EXCEPTION_META[e.type];
  return {
    id: e.id, type: e.type, priority: e.priority ?? meta.defaultPriority,
    title: e.title, subtitle: e.subtitle, reason: e.reason,
    agingLabel: e.agingLabel ?? null, agentName: e.agentName ?? null,
    entityType: e.entityType ?? null, entityId: e.entityId ?? null,
    route: e.route, cta: e.cta,
    canPrepare: e.canPrepare ?? false, requiresConfirmation: e.requiresConfirmation ?? false,
    urgency: e.urgency ?? (e.priority === "P0" || meta.defaultPriority === "P0" ? 80 : 50),
  };
}
