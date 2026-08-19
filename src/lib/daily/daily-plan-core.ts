// ============================================================================
// ZONO — Agent Daily Autopilot: PURE daily-plan core (no IO, no clock, no LLM).
// "תכנן לי את היום" — given the REAL, already-prioritized daily actions (from the
// deterministic Daily Command Center) plus today's hard-time meetings/viewings,
// this builds ONE realistic, capacity-aware, time-anchored operating plan: it maps
// each action to a plan item with a conservative time estimate, anchors fixed-time
// commitments, orders by the EXISTING priority (never re-invents it), fits the day
// to a realistic capacity, buckets must-do / fixed-time / should-do / if-time,
// derives the single next-best action, detects calendar conflicts, and reports plan
// health + done-today. Self-contained so the deterministic suite runs under
// `node --test`. An LLM never decides priority, obligation, or capacity — this does.
// ============================================================================

export type DailyPlanItemType =
  | "lead_followup" | "buyer_reply" | "seller_callback" | "viewing" | "meeting"
  | "deal_action" | "marketing_plan" | "publication" | "task" | "property_attention";

export type DailyPlanPriority = "P0" | "P1" | "P2";
export type DailyPlanBucket = "needs_attention" | "fixed_time" | "should_today" | "if_time";
export type DailyPlanItemStatus = "pending" | "done";

// The subset of a Daily Command Center action the plan needs (kept structural so
// this file stays pure and self-contained — no import of the command-center type).
export interface DailyActionInput {
  id: string;
  kind: string;
  priority: DailyPlanPriority;
  urgency: number;
  title: string;
  reason: string;
  href: string;
  cta: string;
  icon: string;
  entity?: { type: string; id: string };
}

// A today meeting/viewing (hard-time anchor) — real start/end from the canonical
// meetings source. Duration derives from end−start (fallback by type).
export interface DailyMeetingInput {
  id: string;
  type: string;            // meeting_type (viewing/open_house/meeting/call/…)
  title: string;
  startAt: string;         // ISO
  endAt: string | null;    // ISO
  buyerName?: string | null;
  propertyTitle?: string | null;
  propertyId?: string | null;
  href: string;
  status: string;          // scheduled/confirmed/completed/…
}

export interface DailyPlanItem {
  id: string;
  type: DailyPlanItemType;
  priority: DailyPlanPriority;
  urgency: number;
  title: string;
  reason: string;
  entityType: string | null;
  entityId: string | null;
  dueAt: string | null;            // hard time for anchors; null for flexible work
  estimatedMinutes: number;
  route: string;
  actionType: string;              // execute | prepare | open
  canPrepare: boolean;             // ZONO can prepare this (draft/plan/bundle/task)
  requiresConfirmation: boolean;   // consequential (send/approve) — gated elsewhere
  status: DailyPlanItemStatus;
  bucket: DailyPlanBucket;
  icon: string;
  cta: string;
  fixedTime: boolean;              // true for meetings/viewings
}

export interface DailyDoneItem { id: string; label: string; icon: string }

export interface DailyPlanConflict { aId: string; bId: string; label: string }

export interface DailyPlanHealth {
  level: "busy" | "manageable" | "quiet";
  mustDo: number;          // P0 count
  fixedCount: number;      // meetings/viewings
  plannedMinutes: number;  // committed minutes (fixed + selected work)
  capacityMinutes: number;
  overCapacity: boolean;
  conflicts: DailyPlanConflict[];
}

export interface DailyPlanSummary {
  total: number;
  mustDo: number;
  shouldToday: number;
  ifTime: number;
  fixed: number;
}

export interface DailyPlan {
  date: string;             // ISO date (yyyy-mm-dd), supplied by caller
  role: "agent" | "manager" | "owner";
  headline: string;
  quiet: boolean;
  primaryAction: DailyPlanItem | null;
  items: DailyPlanItem[];   // full ordered plan
  buckets: {
    needsAttention: DailyPlanItem[];   // P0 must-do
    fixedTime: DailyPlanItem[];        // meetings/viewings by time
    shouldToday: DailyPlanItem[];      // P1 within capacity
    ifTime: DailyPlanItem[];           // P2 / capacity overflow
  };
  summary: DailyPlanSummary;
  health: DailyPlanHealth;
  doneToday: DailyDoneItem[];
}

// ── Deterministic policy: conservative time estimates (minutes) ──────────────
export const ESTIMATED_MINUTES: Record<DailyPlanItemType, number> = {
  lead_followup: 10, buyer_reply: 10, seller_callback: 15, viewing: 45, meeting: 30,
  deal_action: 15, marketing_plan: 15, publication: 10, task: 10, property_attention: 10,
};
export const DEFAULT_CAPACITY_MINUTES = 360;   // ~6 focused hours in a workday
const IMMINENT_MINUTES = 90;                    // a meeting this soon becomes primary
const MEETING_DEFAULT_MINUTES = 30;
const VIEWING_DEFAULT_MINUTES = 45;

const PRIORITY_RANK: Record<DailyPlanPriority, number> = { P0: 0, P1: 1, P2: 2 };

// Command-center action.kind → plan item type.
const KIND_TO_TYPE: Record<string, DailyPlanItemType> = {
  lead_callback: "lead_followup", lead_unassigned: "lead_followup",
  customer_reply: "buyer_reply", price_drop_response: "buyer_reply",
  seller_callback: "seller_callback", seller_strategy: "seller_callback",
  publish_failed: "publication", publish_today: "publication",
  task_overdue: "task", task_today: "task", onboarding: "task",
  deal_stuck: "deal_action",
  property_attention: "property_attention", property_unmarketed: "property_attention", price_drop: "property_attention",
  marketing_attention: "marketing_plan",
};

// Kinds ZONO can PREPARE (draft/plan/bundle/task) rather than "you must do".
const PREPARABLE_KINDS = new Set(["marketing_attention"]);
// Kinds whose next step is a consequential send/approve (gated in their engine).
const CONFIRM_KINDS = new Set(["marketing_attention", "price_drop_response"]);

function typeForKind(kind: string): DailyPlanItemType {
  return KIND_TO_TYPE[kind] ?? "task";
}

/** Map a Daily Command Center action → a flexible (non-time-anchored) plan item. */
export function mapActionToPlanItem(a: DailyActionInput): DailyPlanItem {
  const type = typeForKind(a.kind);
  return {
    id: a.id, type, priority: a.priority, urgency: a.urgency, title: a.title, reason: a.reason,
    entityType: a.entity?.type ?? null, entityId: a.entity?.id ?? null,
    dueAt: null, estimatedMinutes: ESTIMATED_MINUTES[type], route: a.href,
    actionType: PREPARABLE_KINDS.has(a.kind) ? "prepare" : "open",
    canPrepare: PREPARABLE_KINDS.has(a.kind), requiresConfirmation: CONFIRM_KINDS.has(a.kind),
    status: "pending", bucket: "should_today", icon: a.icon, cta: a.cta, fixedTime: false,
  };
}

function minutesBetween(startIso: string, endIso: string | null, fallback: number): number {
  if (!endIso) return fallback;
  const s = Date.parse(startIso), e = Date.parse(endIso);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return fallback;
  return Math.max(5, Math.round((e - s) / 60000));
}

/** Map a today meeting/viewing → a fixed-time anchor plan item. */
export function mapMeetingToPlanItem(m: DailyMeetingInput): DailyPlanItem {
  const isViewing = m.type === "viewing" || m.type === "open_house";
  const type: DailyPlanItemType = isViewing ? "viewing" : "meeting";
  const est = minutesBetween(m.startAt, m.endAt, isViewing ? VIEWING_DEFAULT_MINUTES : MEETING_DEFAULT_MINUTES);
  const who = [m.propertyTitle, m.buyerName].filter(Boolean).join(" · ");
  return {
    id: `meeting:${m.id}`, type, priority: "P0", urgency: 100, title: m.title || (isViewing ? "ביקור בנכס" : "פגישה"),
    reason: who || (isViewing ? "ביקור מתוזמן" : "פגישה מתוזמנת"),
    entityType: m.propertyId ? "property" : null, entityId: m.propertyId ?? null,
    dueAt: m.startAt, estimatedMinutes: est, route: m.href, actionType: "open",
    canPrepare: false, requiresConfirmation: false,
    status: m.status === "completed" ? "done" : "pending",
    bucket: "fixed_time", icon: isViewing ? "MapPin" : "Calendar", cta: "פתיחה", fixedTime: true,
  };
}

// Rank flexible work: priority asc, then urgency desc, then stable by input order.
function rankWork(items: DailyPlanItem[]): DailyPlanItem[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((x, y) => PRIORITY_RANK[x.it.priority] - PRIORITY_RANK[y.it.priority] || y.it.urgency - x.it.urgency || x.i - y.i)
    .map((w) => w.it);
}

function overlaps(a: DailyPlanItem, b: DailyPlanItem): boolean {
  if (!a.dueAt || !b.dueAt) return false;
  const as = Date.parse(a.dueAt), ae = as + a.estimatedMinutes * 60000;
  const bs = Date.parse(b.dueAt), be = bs + b.estimatedMinutes * 60000;
  if (Number.isNaN(as) || Number.isNaN(bs)) return false;
  return as < be && bs < ae;
}

export interface BuildPlanInput {
  actions: DailyActionInput[];
  meetings: DailyMeetingInput[];
  doneToday: DailyDoneItem[];
  role: "agent" | "manager" | "owner";
  nowMs: number;
  date: string;
  capacityMinutes?: number;
}

/** Build ONE realistic daily plan. Deterministic, capacity-aware, time-anchored. */
export function buildDailyPlan(input: BuildPlanInput): DailyPlan {
  const capacityMinutes = input.capacityMinutes ?? DEFAULT_CAPACITY_MINUTES;

  // Fixed-time anchors (dedupe by id, sort by start).
  const seenMeeting = new Set<string>();
  const fixed = input.meetings
    .filter((m) => { if (seenMeeting.has(m.id)) return false; seenMeeting.add(m.id); return m.status !== "cancelled" && m.status !== "no_show"; })
    .map(mapMeetingToPlanItem)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));

  // Flexible work from the already-ranked actions (dedupe by id).
  const seenAction = new Set<string>();
  const work = rankWork(input.actions.filter((a) => { if (seenAction.has(a.id)) return false; seenAction.add(a.id); return true; }).map(mapActionToPlanItem));

  // Capacity fill: fixed commitments occupy the day first; then P0 work always
  // (must-do), then P1, then P2 while budget remains. Overflow → "if_time".
  const fixedMinutes = fixed.reduce((s, m) => (m.status === "done" ? s : s + m.estimatedMinutes), 0);
  let remaining = Math.max(0, capacityMinutes - fixedMinutes);

  const needsAttention: DailyPlanItem[] = [];
  const shouldToday: DailyPlanItem[] = [];
  const ifTime: DailyPlanItem[] = [];
  for (const it of work) {
    if (it.priority === "P0") { it.bucket = "needs_attention"; needsAttention.push(it); remaining -= it.estimatedMinutes; continue; }
    if (it.priority === "P1" && remaining - it.estimatedMinutes >= 0) { it.bucket = "should_today"; shouldToday.push(it); remaining -= it.estimatedMinutes; continue; }
    if (it.priority === "P2" && remaining - it.estimatedMinutes >= 0) { it.bucket = "if_time"; ifTime.push(it); remaining -= it.estimatedMinutes; continue; }
    it.bucket = "if_time"; ifTime.push(it);   // no capacity → deferred but visible
  }

  // Conflicts among fixed-time anchors (overlapping commitments).
  const conflicts: DailyPlanConflict[] = [];
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      if (overlaps(fixed[i], fixed[j])) conflicts.push({ aId: fixed[i].id, bId: fixed[j].id, label: `${fixed[i].title} ו${fixed[j].title} חופפים בזמן` });
    }
  }

  // Primary next-best action: an imminent meeting wins; else the top must-do; else
  // the top should-do; else the next upcoming meeting; else nothing (quiet).
  const upcomingFixed = fixed.filter((m) => m.status !== "done" && m.dueAt && Date.parse(m.dueAt) >= input.nowMs).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const imminent = upcomingFixed.find((m) => m.dueAt != null && Date.parse(m.dueAt) - input.nowMs <= IMMINENT_MINUTES * 60000) ?? null;
  const primaryAction = imminent ?? needsAttention[0] ?? shouldToday[0] ?? upcomingFixed[0] ?? null;

  // Full ordered plan: must-do, then interleave fixed-time + should-do by a simple
  // reading order (fixed-time listed by clock, work by rank underneath).
  const items = [...needsAttention, ...fixed.filter((m) => m.status !== "done"), ...shouldToday, ...ifTime];

  const mustDo = needsAttention.length;
  const planned = fixedMinutes + needsAttention.reduce((s, i) => s + i.estimatedMinutes, 0) + shouldToday.reduce((s, i) => s + i.estimatedMinutes, 0);
  const actionable = mustDo + fixed.filter((m) => m.status !== "done").length + shouldToday.length;
  const level: DailyPlanHealth["level"] = actionable >= 6 || mustDo >= 3 ? "busy" : actionable === 0 ? "quiet" : "manageable";

  return {
    date: input.date, role: input.role,
    headline: buildDailyHeadline(actionable, mustDo, fixed.filter((m) => m.status !== "done").length),
    quiet: actionable === 0,
    primaryAction,
    items,
    buckets: { needsAttention, fixedTime: fixed, shouldToday, ifTime },
    summary: { total: items.length, mustDo, shouldToday: shouldToday.length, ifTime: ifTime.length, fixed: fixed.length },
    health: { level, mustDo, fixedCount: fixed.length, plannedMinutes: planned, capacityMinutes, overCapacity: planned > capacityMinutes, conflicts },
    doneToday: input.doneToday,
  };
}

/** Deterministic Hebrew headline. */
export function buildDailyHeadline(actionable: number, mustDo: number, fixed: number): string {
  if (actionable === 0) return "הכול בשליטה להיום ✓";
  const parts: string[] = [];
  if (actionable === 1) parts.push("יש דבר אחד שחשוב לסגור היום");
  else parts.push(`יש לך ${actionable} דברים שחשוב לסגור היום`);
  if (fixed > 0) parts.push(fixed === 1 ? "פגישה אחת קבועה בזמן" : `${fixed} פגישות קבועות בזמן`);
  return parts.join(" · ");
}

export const PLAN_BUCKET_LABEL: Record<DailyPlanBucket, string> = {
  needs_attention: "דורש טיפול", fixed_time: "קבוע בזמן", should_today: "כדאי היום", if_time: "אם נשאר זמן",
};
