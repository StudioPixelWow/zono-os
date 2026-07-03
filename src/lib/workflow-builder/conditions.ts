// ============================================================================
// 🔁 Workflow Builder — condition evaluation (pure). 30.4. Part 3.
// Evaluates a step's condition against the WorkflowContext (assembled read-only
// from the existing engines). Returns pass + a human reason for explainability.
// ============================================================================
import type { Condition, WorkflowContext } from "./types";

function valueFor(type: Condition["type"], ctx: WorkflowContext): number | string | null {
  switch (type) {
    case "TRUTH_SCORE": return ctx.truthScore;
    case "CONFIDENCE": return ctx.confidence;
    case "BUSINESS_SCORE": return ctx.businessScore;
    case "RELATIONSHIP": return ctx.relationshipStrength;
    case "JOURNEY_STAGE": return ctx.journeyStage;
    case "MISSION_STATE": return ctx.missionState;
    case "TIME": return ctx.now;
    default: return null;
  }
}

export function evaluateCondition(cond: Condition, ctx: WorkflowContext): { pass: boolean; reason: string } {
  const actual = valueFor(cond.type, ctx);
  if (actual == null) return { pass: false, reason: `${cond.label} — אין נתון (${cond.type})` };

  let pass = false;
  if (cond.op === "in") {
    const set = (Array.isArray(cond.value) ? cond.value : [String(cond.value)]).map(String);
    pass = set.includes(String(actual));
  } else if (typeof actual === "number" && typeof cond.value === "number") {
    pass = cond.op === "gte" ? actual >= cond.value : cond.op === "lte" ? actual <= cond.value : cond.op === "eq" ? actual === cond.value : actual !== cond.value;
  } else {
    pass = cond.op === "eq" ? String(actual) === String(cond.value) : cond.op === "neq" ? String(actual) !== String(cond.value) : false;
  }
  return { pass, reason: `${cond.label} — ${pass ? "מתקיים" : "לא מתקיים"} (בפועל: ${actual})` };
}
