// ============================================================================
// ZONO — SLA engine (pure, deterministic). Computes the SLA due time for an
// execution and whether it has breached, plus the on-breach action list.
// Example: a private property must be contacted within 30 minutes.
// ============================================================================
import type { SlaRule, SlaEvaluation, TriggerContext, TriggerType } from "./types";

/** Default SLA scope key derived from the trigger + context (deterministic). */
export function slaScopeFor(trigger: TriggerType, ctx: TriggerContext): string {
  if (trigger === "property_created" && (ctx.is_private === true || ctx.listing_type === "private")) return "private_property";
  if (trigger === "exclusive_opportunity") return "exclusive_opportunity";
  if (trigger === "buyer_match") return "buyer_match";
  if (trigger === "price_drop") return "price_drop";
  return trigger;
}

/** Pick the active rule that applies to this scope. */
export function selectSlaRule(rules: SlaRule[], scope: string): SlaRule | null {
  return rules.find((r) => r.active && r.appliesTo === scope) ?? null;
}

/**
 * Evaluate SLA for an execution. `elapsedMinutes` = minutes since it started
 * (the orchestrator passes the real elapsed time; deterministic given inputs).
 */
export function evaluateSla(rule: SlaRule | null, elapsedMinutes: number, contacted: boolean): SlaEvaluation {
  if (!rule) return { breached: false, dueAtOffsetMinutes: 0, rule: null };
  const breached = !contacted && elapsedMinutes > rule.minutes;
  return { breached, dueAtOffsetMinutes: rule.minutes, rule };
}

/** Default seed rules a new org gets (used by templates / first-run). */
export const DEFAULT_SLA_RULES: Omit<SlaRule, "id">[] = [
  {
    name: "נכס פרטי — יצירת קשר תוך 30 דק׳", appliesTo: "private_property", minutes: 30, active: true,
    onBreach: [
      { actionType: "create_reminder", config: { urgent: true } },
      { actionType: "notify_manager", config: {} },
      { actionType: "create_alert", config: { badge: "urgent" } },
    ],
  },
  {
    name: "הזדמנות בלעדיות — פנייה תוך שעתיים", appliesTo: "exclusive_opportunity", minutes: 120, active: true,
    onBreach: [{ actionType: "notify_manager", config: {} }, { actionType: "create_reminder", config: {} }],
  },
];
