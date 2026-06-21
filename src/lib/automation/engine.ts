// ============================================================================
// ZONO — Automation & Workflow OS · Pure engine (client-safe, deterministic)
// ----------------------------------------------------------------------------
// No I/O, no autonomous communication. This module only DEFINES the catalog of
// triggers / conditions / actions and the deterministic logic that turns a
// trigger context + workflow steps into PREPARED action specs. Actually
// applying an action (creating a real task/opportunity/etc.) is done by the
// service AFTER a human approves the run.
// ============================================================================

export type AutomationCategory =
  | "lead" | "buyer" | "seller" | "property" | "deal" | "portal" | "website"
  | "marketing" | "distribution" | "recommendation" | "revenue" | "territory" | "recruitment";

export type TriggerType =
  | "manual"
  | "lead_created" | "lead_qualified"
  | "buyer_created" | "seller_created"
  | "property_added" | "property_updated"
  | "match_created" | "match_score_changed"
  | "deal_created" | "deal_stage_changed"
  | "forecast_changed" | "revenue_risk_detected"
  | "territory_opportunity_detected" | "recommendation_generated"
  | "portal_viewed" | "website_lead_created"
  | "social_lead_qualified" | "transaction_opportunity_detected"
  | "agent_added" | "recruitment_lead_created";

export type ActionType =
  | "create_task" | "create_follow_up" | "create_recommendation" | "create_activity"
  | "create_alert" | "assign_user" | "change_status" | "create_opportunity"
  | "create_decision_signal" | "create_dashboard_card" | "create_notification" | "create_queue_item"
  // Automation Library OS — richer (still safe, human-supervised, tracked-by-default) actions
  | "request_approval" | "create_portal_refresh_suggestion" | "create_distribution_item"
  | "create_document_checklist_item" | "create_signature_request_draft" | "create_research_request"
  | "create_pricing_review" | "create_routing_review" | "create_revenue_review" | "create_manager_alert"
  | "create_agent_coaching_signal" | "create_data_quality_issue" | "create_audit_log";

export type ConditionType =
  | "lead_not_contacted_hours" | "property_inactive_days" | "deal_at_risk"
  | "forecast_probability" | "buyer_viewed_properties" | "seller_viewed_pricing"
  | "revenue_gap" | "neighborhood_opportunity" | "social_lead_high_intent";

export type ConditionOperator = "gte" | "lte" | "gt" | "lt" | "eq" | "neq";

// ── catalogs ─────────────────────────────────────────────────────────────────
export const TRIGGERS: { type: TriggerType; label: string; category: AutomationCategory }[] = [
  { type: "manual", label: "הפעלה ידנית", category: "lead" },
  { type: "lead_created", label: "ליד נוצר", category: "lead" },
  { type: "lead_qualified", label: "ליד הוסמך", category: "lead" },
  { type: "buyer_created", label: "קונה נוצר", category: "buyer" },
  { type: "seller_created", label: "מוכר נוצר", category: "seller" },
  { type: "property_added", label: "נכס נוסף", category: "property" },
  { type: "property_updated", label: "נכס עודכן", category: "property" },
  { type: "match_created", label: "התאמה נוצרה", category: "deal" },
  { type: "match_score_changed", label: "ציון התאמה השתנה", category: "deal" },
  { type: "deal_created", label: "עסקה נוצרה", category: "deal" },
  { type: "deal_stage_changed", label: "שלב עסקה השתנה", category: "deal" },
  { type: "forecast_changed", label: "תחזית השתנתה", category: "revenue" },
  { type: "revenue_risk_detected", label: "זוהה סיכון הכנסות", category: "revenue" },
  { type: "territory_opportunity_detected", label: "זוהתה הזדמנות טריטוריה", category: "territory" },
  { type: "recommendation_generated", label: "המלצה נוצרה", category: "recommendation" },
  { type: "portal_viewed", label: "פורטל נצפה", category: "portal" },
  { type: "website_lead_created", label: "ליד מאתר נוצר", category: "website" },
  { type: "social_lead_qualified", label: "ליד חברתי הוסמך", category: "distribution" },
  { type: "transaction_opportunity_detected", label: "זוהתה הזדמנות עסקה", category: "deal" },
  { type: "agent_added", label: "סוכן נוסף", category: "recruitment" },
  { type: "recruitment_lead_created", label: "ליד גיוס נוצר", category: "recruitment" },
];

export const ACTIONS: {
  type: ActionType; label: string; reversible: boolean;
  materializes: "task" | "opportunity" | "notification" | "activity" | "attention" | "queue" | null;
}[] = [
  { type: "create_task", label: "יצירת משימה", reversible: true, materializes: "task" },
  { type: "create_follow_up", label: "יצירת מעקב", reversible: true, materializes: "task" },
  { type: "create_recommendation", label: "יצירת המלצה", reversible: true, materializes: "queue" },
  { type: "create_activity", label: "תיעוד פעילות", reversible: true, materializes: "activity" },
  { type: "create_alert", label: "יצירת התראה", reversible: true, materializes: "attention" },
  { type: "assign_user", label: "שיוך משתמש", reversible: true, materializes: "queue" },
  { type: "change_status", label: "שינוי סטטוס (להצעה)", reversible: true, materializes: "queue" },
  { type: "create_opportunity", label: "יצירת הזדמנות", reversible: true, materializes: "opportunity" },
  { type: "create_decision_signal", label: "יצירת אות מוח-החלטות", reversible: true, materializes: "attention" },
  { type: "create_dashboard_card", label: "יצירת כרטיס דשבורד", reversible: true, materializes: "queue" },
  { type: "create_notification", label: "יצירת התראה אישית", reversible: true, materializes: "notification" },
  { type: "create_queue_item", label: "יצירת פריט בתור", reversible: true, materializes: "queue" },
  // Automation Library OS — tracked-by-default (human enacts); manager_alert→notify, audit_log→activity
  { type: "request_approval", label: "בקשת אישור", reversible: true, materializes: "queue" },
  { type: "create_portal_refresh_suggestion", label: "הצעת רענון פורטל", reversible: true, materializes: "queue" },
  { type: "create_distribution_item", label: "יצירת פריט הפצה", reversible: true, materializes: "queue" },
  { type: "create_document_checklist_item", label: "פריט ברשימת מסמכים", reversible: true, materializes: "queue" },
  { type: "create_signature_request_draft", label: "טיוטת בקשת חתימה", reversible: true, materializes: "queue" },
  { type: "create_research_request", label: "בקשת מחקר", reversible: true, materializes: "queue" },
  { type: "create_pricing_review", label: "בדיקת תמחור", reversible: true, materializes: "queue" },
  { type: "create_routing_review", label: "בדיקת ניתוב", reversible: true, materializes: "queue" },
  { type: "create_revenue_review", label: "בדיקת הכנסות", reversible: true, materializes: "queue" },
  { type: "create_manager_alert", label: "התראת מנהל", reversible: true, materializes: "notification" },
  { type: "create_agent_coaching_signal", label: "אות חניכת סוכן", reversible: true, materializes: "queue" },
  { type: "create_data_quality_issue", label: "בעיית איכות נתונים", reversible: true, materializes: "queue" },
  { type: "create_audit_log", label: "רישום ביקורת", reversible: true, materializes: "activity" },
];

export const CONDITIONS: { type: ConditionType; label: string; operator: ConditionOperator; valueKind: "number" | "boolean" }[] = [
  { type: "lead_not_contacted_hours", label: "ליד ללא יצירת קשר (שעות)", operator: "gte", valueKind: "number" },
  { type: "property_inactive_days", label: "נכס לא פעיל (ימים)", operator: "gte", valueKind: "number" },
  { type: "deal_at_risk", label: "עסקה בסיכון", operator: "eq", valueKind: "boolean" },
  { type: "forecast_probability", label: "הסתברות תחזית (%)", operator: "gte", valueKind: "number" },
  { type: "buyer_viewed_properties", label: "קונה צפה בנכסים", operator: "eq", valueKind: "boolean" },
  { type: "seller_viewed_pricing", label: "מוכר צפה בתמחור", operator: "eq", valueKind: "boolean" },
  { type: "revenue_gap", label: "פער הכנסות (₪)", operator: "gte", valueKind: "number" },
  { type: "neighborhood_opportunity", label: "הזדמנות שכונתית", operator: "eq", valueKind: "boolean" },
  { type: "social_lead_high_intent", label: "ליד חברתי בכוונה גבוהה", operator: "eq", valueKind: "boolean" },
];

const CATEGORY_LABELS: Record<AutomationCategory, string> = {
  lead: "לידים", buyer: "קונים", seller: "מוכרים", property: "נכסים", deal: "עסקאות",
  portal: "פורטלים", website: "אתרים", marketing: "שיווק", distribution: "הפצה",
  recommendation: "המלצות", revenue: "הכנסות", territory: "טריטוריה", recruitment: "גיוס",
};
export const categoryLabel = (c: string): string => CATEGORY_LABELS[c as AutomationCategory] ?? c;
export const triggerLabel = (t: string): string => TRIGGERS.find((x) => x.type === t)?.label ?? t;
export const actionLabel = (a: string): string => ACTIONS.find((x) => x.type === a)?.label ?? a;
export const actionMeta = (a: string) => ACTIONS.find((x) => x.type === a) ?? null;

export const RUN_STATUS_LABELS: Record<string, string> = {
  pending_review: "ממתין לאישור", approved: "אושר", applied: "הוחל",
  failed: "נכשל", blocked: "חסום", reversed: "בוטל", rejected: "נדחה",
};

// ── condition evaluation (pure) ──────────────────────────────────────────────
export interface ConditionDef {
  condition_type: string;
  operator: string;
  value_number: number | null;
  value_text: string | null;
}
/** A flat bag of facts gathered by the service for the triggering entity. */
export type TriggerContext = Record<string, number | boolean | string | null | undefined>;

function cmp(op: string, a: number, b: number): boolean {
  switch (op) {
    case "gte": return a >= b; case "lte": return a <= b;
    case "gt": return a > b; case "lt": return a < b;
    case "eq": return a === b; case "neq": return a !== b;
    default: return false;
  }
}
export function evaluateCondition(c: ConditionDef, ctx: TriggerContext): boolean {
  const fact = ctx[c.condition_type];
  if (fact === undefined || fact === null) return false;
  if (typeof fact === "boolean") {
    const want = (c.value_text ?? "true").toLowerCase() === "true";
    return c.operator === "neq" ? fact !== want : fact === want;
  }
  const factNum = typeof fact === "number" ? fact : Number(fact);
  if (Number.isNaN(factNum)) return false;
  return cmp(c.operator, factNum, c.value_number ?? 0);
}
/** All conditions must pass (AND). Empty conditions = always passes. */
export function evaluateConditions(conds: ConditionDef[], ctx: TriggerContext): { passed: boolean; failed: string[] } {
  const failed: string[] = [];
  for (const c of conds) if (!evaluateCondition(c, ctx)) failed.push(c.condition_type);
  return { passed: failed.length === 0, failed };
}

// ── prepared-action builder (pure) ───────────────────────────────────────────
export interface StepDef { action_type: string; title?: string | null; config?: Record<string, unknown> }
export interface PreparedAction {
  action_type: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
}
export interface RunEntity { entity_type?: string | null; entity_id?: string | null; entity_label?: string | null }

/** Deterministically expand workflow steps into prepared action specs. */
export function buildPreparedActions(steps: StepDef[], entity: RunEntity, workflowName: string): PreparedAction[] {
  return steps
    .filter((s) => ACTIONS.some((a) => a.type === s.action_type))
    .map((s) => {
      const baseTitle = s.title || actionLabel(s.action_type);
      const label = entity.entity_label ? ` · ${entity.entity_label}` : "";
      return {
        action_type: s.action_type,
        title: `${baseTitle}${label}`,
        description: `אוטומציה: ${workflowName}`,
        entity_type: entity.entity_type ?? null,
        entity_id: entity.entity_id ?? null,
        payload: { ...(s.config ?? {}), source_workflow: workflowName },
      };
    });
}

// ── analytics helpers (pure) ─────────────────────────────────────────────────
export interface RunLike { status: string; actions_applied?: number; opportunities_generated?: number; created_at?: string }
export function summarizeRuns(runs: RunLike[]) {
  const today = new Date().toISOString().slice(0, 10);
  let pending = 0, completedToday = 0, failed = 0, blocked = 0, opportunities = 0, tasks = 0;
  for (const r of runs) {
    if (r.status === "pending_review" || r.status === "approved") pending++;
    if (r.status === "failed") failed++;
    if (r.status === "blocked") blocked++;
    if (r.status === "applied") {
      tasks += r.actions_applied ?? 0;
      opportunities += r.opportunities_generated ?? 0;
      if ((r.created_at ?? "").slice(0, 10) === today) completedToday++;
    }
  }
  return { pending, completedToday, failed, blocked, opportunities, tasks };
}
