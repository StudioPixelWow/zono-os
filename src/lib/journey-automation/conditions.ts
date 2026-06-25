// ============================================================================
// ZONO — Journey condition evaluation (pure, deterministic). Conditions read
// ONLY the trigger context produced by the deterministic engines. They never
// recompute scores. AND-semantics across clauses on a condition node.
// ============================================================================
import type { ConditionClause, ConditionField, ConditionOperator, TriggerContext } from "./types";

export const CONDITION_FIELDS: { field: ConditionField; label: string; kind: "number" | "string" | "boolean" }[] = [
  { field: "opportunity_score", label: "ציון הזדמנות", kind: "number" },
  { field: "buyer_count", label: "מספר קונים", kind: "number" },
  { field: "exclusive_probability", label: "סבירות בלעדיות", kind: "number" },
  { field: "seller_score", label: "ציון מוכר", kind: "number" },
  { field: "role", label: "תפקיד", kind: "string" },
  { field: "office", label: "משרד", kind: "string" },
  { field: "city", label: "עיר", kind: "string" },
  { field: "neighborhood", label: "שכונה", kind: "string" },
  { field: "provider", label: "ספק", kind: "string" },
  { field: "listing_type", label: "סוג מודעה", kind: "string" },
  { field: "is_private", label: "נכס פרטי", kind: "boolean" },
  { field: "task_status", label: "סטטוס משימה", kind: "string" },
  { field: "meeting_status", label: "סטטוס פגישה", kind: "string" },
  { field: "time_hour", label: "שעה ביום", kind: "number" },
];

export const OPERATORS: { op: ConditionOperator; label: string }[] = [
  { op: "gte", label: "≥" }, { op: "lte", label: "≤" }, { op: "gt", label: ">" }, { op: "lt", label: "<" },
  { op: "eq", label: "=" }, { op: "neq", label: "≠" }, { op: "in", label: "אחד מ" }, { op: "contains", label: "מכיל" },
];

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Evaluate ONE clause against the context. Deterministic. */
export function evaluateClause(c: ConditionClause, ctx: TriggerContext): boolean {
  const raw = ctx[c.field];
  switch (c.operator) {
    case "gte": case "lte": case "gt": case "lt": {
      const a = asNumber(raw), b = asNumber(c.value as number);
      if (a == null || b == null) return false;
      return c.operator === "gte" ? a >= b : c.operator === "lte" ? a <= b : c.operator === "gt" ? a > b : a < b;
    }
    case "eq": return String(raw ?? "") === String(c.value ?? "");
    case "neq": return String(raw ?? "") !== String(c.value ?? "");
    case "in": return Array.isArray(c.value) && c.value.map(String).includes(String(raw ?? ""));
    case "contains": return String(raw ?? "").includes(String(c.value ?? ""));
    default: return false;
  }
}

/** AND across all clauses; empty clause set passes. */
export function evaluateConditions(clauses: ConditionClause[], ctx: TriggerContext): { passed: boolean; failed: ConditionField[] } {
  const failed: ConditionField[] = [];
  for (const c of clauses) if (!evaluateClause(c, ctx)) failed.push(c.field);
  return { passed: failed.length === 0, failed };
}
