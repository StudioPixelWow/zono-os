// ============================================================================
// ZONO — Marketing Autopilot 2.0 · PURE plan snapshot core (no IO, no clock,
// no LLM). Turns the deterministic WeeklyPlan into a STATEFUL, editable, approvable
// snapshot; decides plan/item status transitions; filters buyer recipients by REAL
// eligibility; reconciles a server validation into human-readable blockers; and
// mints the (planId,itemId) idempotency identity every executor keys on. Everything
// here is a pure function over data the server supplies — an LLM never decides an
// item's fate and a metric is never invented. Self-contained on purpose so the
// deterministic test suite runs under `node --test` with zero resolution.
// ============================================================================

export type PlanItemType =
  | "facebook_publish" | "buyer_bundle" | "interest_followup" | "group_expansion" | "creative_refresh";

// Per-item lifecycle. draft/ready/blocked are pre-approval; approved..skipped are
// execution states. A creative_refresh is a PREPARATION (handled in Creative Studio,
// or gated at validation) — it never executes as an external send, so it settles to
// "skipped" during activation rather than "completed".
export type PlanExecStatus =
  | "draft" | "ready" | "blocked" | "approved"
  | "executing" | "scheduled" | "completed" | "failed" | "skipped";

// Whole-plan status — mirrors the marketing_plans.status check constraint.
export type PlanStatus =
  | "draft" | "approved" | "activating" | "active"
  | "partially_completed" | "completed" | "cancelled" | "failed";

export interface PlanFacebookConfig {
  caption: string;
  media: { kind: string; id: string; url: string } | null;
  creativeOutputId: string | null;
  groupIds: string[];
  groupNames: string[];
  frequency: string;            // reuses distribution Frequency values
  startDate: string;            // yyyy-mm-dd
}
export interface PlanBuyerConfig {
  recipientIds: string[];       // eligible buyer ids at prepare/validate time
  removedIds: string[];         // recipients the user removed by hand
  estimatedRecipients: number;
  channelSummary: string;       // human-readable (e.g. "וואטסאפ / אימייל לפי הסכמה")
}
export interface PlanFollowupConfig {
  customerIds: string[];        // interested buyers needing an action
  count: number;
}
export interface PlanCreativeConfig {
  currentOutputId: string | null;
  refreshRecommended: boolean;
  publishReady: boolean | null;
}

export interface PlanItemExecution {
  status: PlanExecStatus;
  campaignId?: string | null;
  postsCreated?: number;
  recipientsSent?: number;
  taskId?: string | null;
  error?: string | null;
  at?: string | null;           // ISO — set by the (impure) orchestrator
}

export interface PlanItem {
  itemId: string;               // STABLE within a plan — `${type}:${index}`
  type: PlanItemType;
  title: string;
  why: string;                  // WHY, backed by a real number
  who: string;                  // WHO / audience
  when: string | null;          // WHEN (day label) or null
  status: PlanExecStatus;
  requiresApproval: boolean;
  facebook?: PlanFacebookConfig;
  buyer?: PlanBuyerConfig;
  followup?: PlanFollowupConfig;
  creative?: PlanCreativeConfig;
  execution?: PlanItemExecution;
}

export interface PlanAudit {
  preparedBy: string | null; preparedAt: string | null;
  editedBy: string | null; editedAt: string | null;
  approvedBy: string | null; approvedAt: string | null;
  activatedBy: string | null; activatedAt: string | null;
}

export interface PlanSummary {
  publications: number; groups: number; buyers: number; followups: number; creatives: number;
}

export interface MarketingPlanSnapshot {
  planId: string;
  propertyId: string;
  propertyTitle: string | null;
  propertyImageUrl: string | null;
  marketingState: string;
  stateLabel: string;
  sourceVersion: string;
  items: PlanItem[];
  summary: PlanSummary;
  audit: PlanAudit;
}

// ── Constants ────────────────────────────────────────────────────────────────
export const PLAN_SOURCE_VERSION = "autopilot-2.0";
const TERMINAL_PLAN: PlanStatus[] = ["completed", "cancelled", "failed"];
const OPEN_PLAN: PlanStatus[] = ["draft", "approved", "activating", "active", "partially_completed"];

export function isTerminalPlan(s: PlanStatus): boolean { return TERMINAL_PLAN.includes(s); }
export function isOpenPlan(s: PlanStatus): boolean { return OPEN_PLAN.includes(s); }

// ── Idempotency identity (every executor keys on this) ───────────────────────
export function execIdentity(planId: string, itemId: string): string {
  return `marketing-plan:${planId}:${itemId}`;
}

// ── Stable itemId ────────────────────────────────────────────────────────────
export function stableItemId(type: PlanItemType, index: number): string {
  return `${type}:${index}`;
}

// ── Summary ──────────────────────────────────────────────────────────────────
export function buildSummary(items: PlanItem[]): PlanSummary {
  const s: PlanSummary = { publications: 0, groups: 0, buyers: 0, followups: 0, creatives: 0 };
  for (const it of items) {
    if (it.type === "facebook_publish" || it.type === "group_expansion") {
      s.publications++;
      s.groups += it.facebook?.groupIds.length ?? 0;
    } else if (it.type === "buyer_bundle") {
      s.buyers += it.buyer?.recipientIds.length ?? 0;
    } else if (it.type === "interest_followup") {
      s.followups += it.followup?.count ?? 0;
    } else if (it.type === "creative_refresh") {
      s.creatives++;
    }
  }
  return s;
}

// ── Recipient eligibility (PURE — the testable core of buyer safety) ─────────
export interface RecipientEligibilityInput {
  candidates: string[];         // strong-match buyer ids
  rejected?: string[];          // buyers who rejected this property
  optedOut?: string[];          // no consented channel
  alreadySent?: string[];       // already received this property
  removed?: string[];           // user-removed in the draft
}
export interface RecipientEligibilityResult {
  eligible: string[];
  excluded: { id: string; reason: "rejected" | "opted_out" | "already_sent" | "removed" }[];
}
/** Deterministic recipient filter — order of precedence: removed → rejected →
 *  opted_out → already_sent. Never sends to anyone not in `candidates`. */
export function filterEligibleRecipients(input: RecipientEligibilityInput): RecipientEligibilityResult {
  const rejected = new Set(input.rejected ?? []);
  const optedOut = new Set(input.optedOut ?? []);
  const alreadySent = new Set(input.alreadySent ?? []);
  const removed = new Set(input.removed ?? []);
  const eligible: string[] = [];
  const excluded: RecipientEligibilityResult["excluded"] = [];
  const seen = new Set<string>();
  for (const id of input.candidates) {
    if (seen.has(id)) continue;            // dedupe candidates
    seen.add(id);
    if (removed.has(id)) { excluded.push({ id, reason: "removed" }); continue; }
    if (rejected.has(id)) { excluded.push({ id, reason: "rejected" }); continue; }
    if (optedOut.has(id)) { excluded.push({ id, reason: "opted_out" }); continue; }
    if (alreadySent.has(id)) { excluded.push({ id, reason: "already_sent" }); continue; }
    eligible.push(id);
  }
  return { eligible, excluded };
}

// ── Pre-approval validation → cleaned snapshot + blockers ────────────────────
export interface PlanValidationFacts {
  propertyMarketable: boolean;
  facebookConnected: boolean;
  activeGroupIds: string[];                        // group ids currently status='active'
  creativeReadyByItem: Record<string, boolean | null>;  // itemId → publish readiness
  buyerEligibilityByItem: Record<string, RecipientEligibilityInput>; // itemId → real eligibility inputs
}
export interface PlanValidationResult {
  snapshot: MarketingPlanSnapshot;
  blockers: string[];          // HARD — block approval
  notices: string[];           // SOFT — items auto-adjusted (recipients removed etc.)
  canApprove: boolean;
}

/** Reconcile a plan draft against fresh server facts. Removes ineligible buyer
 *  recipients, drops inactive groups, marks unpublishable items "blocked", and
 *  returns human-readable Hebrew blockers/notices. Never mutates the input. */
export function validatePlan(snapshot: MarketingPlanSnapshot, facts: PlanValidationFacts): PlanValidationResult {
  const blockers: string[] = [];
  const notices: string[] = [];
  const activeGroups = new Set(facts.activeGroupIds);

  if (!facts.propertyMarketable) blockers.push("הנכס אינו זמין לשיווק (נמכר/הוסר) — לא ניתן להפעיל תוכנית.");

  const items: PlanItem[] = snapshot.items.map((raw) => {
    const it: PlanItem = { ...raw };

    if (it.type === "facebook_publish" || it.type === "group_expansion") {
      const fb = it.facebook;
      if (fb) {
        const keptGroups = fb.groupIds.filter((g) => activeGroups.has(g));
        const dropped = fb.groupIds.length - keptGroups.length;
        if (dropped > 0) notices.push(`${dropped} קבוצות כבר אינן פעילות והוסרו מהפרסום.`);
        const nextFb: PlanFacebookConfig = { ...fb, groupIds: keptGroups };
        it.facebook = nextFb;
        if (!facts.facebookConnected) { it.status = "blocked"; blockers.push("החשבון אינו מחובר לפייסבוק — לא ניתן לתזמן פרסום."); }
        else if (keptGroups.length === 0) { it.status = "blocked"; blockers.push(`"${it.title}" — לא נותרו קבוצות פעילות לפרסום.`); }
        else if (!fb.caption.trim()) { it.status = "blocked"; blockers.push(`"${it.title}" — חסר טקסט לפוסט.`); }
        else if (fb.creativeOutputId != null && facts.creativeReadyByItem[it.itemId] === false) {
          it.status = "blocked"; blockers.push("קריאייטיב אחד אינו מוכן לפרסום.");
        } else {
          it.status = "ready";
        }
      }
    } else if (it.type === "buyer_bundle") {
      const b = it.buyer;
      const elig = facts.buyerEligibilityByItem[it.itemId];
      if (b && elig) {
        const r = filterEligibleRecipients({ ...elig, removed: b.removedIds });
        const alreadySent = r.excluded.filter((e) => e.reason === "already_sent").length;
        const optedOut = r.excluded.filter((e) => e.reason === "opted_out").length;
        const rejected = r.excluded.filter((e) => e.reason === "rejected").length;
        if (alreadySent > 0) notices.push(`${alreadySent} מתוך הלקוחות כבר קיבלו את הנכס ולכן הוסרו מהתוכנית.`);
        if (optedOut > 0) notices.push(`${optedOut} לקוחות ללא הסכמה לדיוור הוסרו מהתוכנית.`);
        if (rejected > 0) notices.push(`${rejected} לקוחות שסירבו לנכס הוסרו מהתוכנית.`);
        const nextBuyer: PlanBuyerConfig = { ...b, recipientIds: r.eligible, estimatedRecipients: r.eligible.length };
        it.buyer = nextBuyer;
        it.status = r.eligible.length > 0 ? "ready" : "skipped";
      }
    } else if (it.type === "interest_followup") {
      it.status = (it.followup?.count ?? 0) > 0 ? "ready" : "skipped";
    } else if (it.type === "creative_refresh") {
      // Preparation item — resolved in Creative Studio, never an external send.
      it.status = it.creative?.publishReady === false ? "blocked" : "ready";
    }
    return it;
  });

  const next: MarketingPlanSnapshot = { ...snapshot, items, summary: buildSummary(items) };
  // Approvable only if nothing is hard-blocked AND at least one item is ready to run.
  const canApprove = blockers.length === 0 && items.some((i) => i.status === "ready");
  return { snapshot: next, blockers, notices, canApprove };
}

// ── Item is executable (a real external side-effect) ─────────────────────────
export function isExecutableItem(it: PlanItem): boolean {
  if (it.type === "creative_refresh") return false;        // handled in Studio
  if (it.status === "blocked" || it.status === "skipped") return false;
  return true;
}

// ── Post-activation roll-up: overall plan status from item execution states ──
export function rollupPlanStatus(items: PlanItem[]): PlanStatus {
  const exec = items.filter((i) => i.type !== "creative_refresh");
  const executable = exec.filter((i) => i.status !== "skipped");
  if (executable.length === 0) return "completed";         // nothing to do → done
  const statuses = executable.map((i) => i.execution?.status ?? i.status);
  const anyExecuting = statuses.some((s) => s === "executing");
  if (anyExecuting) return "activating";
  const done = statuses.filter((s) => s === "completed" || s === "scheduled");
  const failed = statuses.filter((s) => s === "failed");
  if (failed.length === 0 && done.length === executable.length) return "completed";
  if (done.length > 0 && failed.length > 0) return "partially_completed";
  if (done.length > 0 && failed.length === 0) return "active"; // some done, rest pending
  if (failed.length === executable.length) return "failed";
  return "partially_completed";
}

// ── Guarded transitions (concurrency + double-click safety live in the repo via
//    conditional updates; these are the PURE legality checks). ────────────────
export function canApproveFrom(status: PlanStatus): boolean { return status === "draft"; }
export function canActivateFrom(status: PlanStatus): boolean {
  return status === "approved" || status === "activating" || status === "partially_completed";
}
export function canEditFrom(status: PlanStatus): boolean { return status === "draft"; }
export function canCancelFrom(status: PlanStatus): boolean {
  return status === "draft" || status === "approved";
}

// ── Labels ───────────────────────────────────────────────────────────────────
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "טיוטה", approved: "מאושרת", activating: "מופעלת…", active: "פעילה",
  partially_completed: "הופעלה חלקית", completed: "הושלמה", cancelled: "בוטלה", failed: "נכשלה",
};
export const ITEM_STATUS_LABEL: Record<PlanExecStatus, string> = {
  draft: "טיוטה", ready: "מוכן", blocked: "חסום", approved: "מאושר",
  executing: "מופעל…", scheduled: "מתוזמן", completed: "בוצע", failed: "נכשל", skipped: "דולג",
};

// ── Empty audit ──────────────────────────────────────────────────────────────
export function emptyAudit(): PlanAudit {
  return { preparedBy: null, preparedAt: null, editedBy: null, editedAt: null, approvedBy: null, approvedAt: null, activatedBy: null, activatedAt: null };
}
