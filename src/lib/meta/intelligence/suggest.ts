// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · NEXT-BEST-ACTION DERIVATION (PURE). Phase 4.
// ----------------------------------------------------------------------------
// Deterministically maps a validated signal → a BOUNDED set of next-best-action
// SUGGESTIONS. Suggestions never execute: `suggest_reply` prepares a reviewable
// Copilot draft, `prepare_moderation_action` routes into the Phase-1 approval-
// gated engine, routing/escalation use the Phase-3 inbox state — all on explicit
// user acceptance. Rationale is provider-neutral + content-free. Same input →
// same suggestions (deterministic; drives QA).
// ============================================================================
import { MAX_ACTIVE_SUGGESTIONS, type ActionKind, type Intent, type Urgency, type Sentiment } from "./domain";

export interface SignalInput { sentiment: Sentiment; intent: Intent; urgency: Urgency; confidence: number }
export interface DerivedSuggestion { actionKind: ActionKind; rationaleSafe: string; needsDraft: boolean; confidence: number }

const RATIONALE: Partial<Record<ActionKind, string>> = {
  suggest_reply: "פנייה ממתינה למענה — הוכנה טיוטת תשובה לאישור",
  request_human_review: "סיווג לא ודאי או רגיש — מומלץ אישור אנושי",
  escalate: "זוהתה הסלמה או תלונה — יש להסלים לטיפול",
  route_to_sales: "זוהתה פנייה עם פוטנציאל ליד — ניתוב למכירות",
  route_to_support: "בקשת תמיכה — ניתוב לצוות התמיכה",
  prepare_moderation_action: "תוכן חשוד כספאם — הכנת פעולת ניהול לאישור",
  mark_spam_candidate: "מועמד לספאם — סימון לבדיקה",
  ignore: "אין צורך בפעולה — ניתן לסגור את ההצעה",
  no_action: "לא נדרשת פעולה",
};
const mk = (actionKind: ActionKind, confidence: number, needsDraft = false): DerivedSuggestion =>
  ({ actionKind, rationaleSafe: RATIONALE[actionKind] ?? "", needsDraft, confidence });

/** Derive bounded, deterministic suggestions from a validated signal. */
export function deriveSuggestions(sig: SignalInput): DerivedSuggestion[] {
  const out: DerivedSuggestion[] = [];
  const c = Math.max(0, Math.min(100, sig.confidence));

  // Low-confidence / unknown → always route to a human, nothing risky.
  if (sig.intent === "unknown" || c < 30) return [mk("request_human_review", Math.max(c, 40))];

  switch (sig.intent) {
    case "lead":
      out.push(mk("route_to_sales", c), mk("suggest_reply", c, true)); break;
    case "pricing_question":
    case "availability_question":
    case "project_question":
    case "general_question":
      out.push(mk("suggest_reply", c, true)); break;
    case "support_request":
      out.push(mk("route_to_support", c), mk("suggest_reply", c, true)); break;
    case "complaint":
      out.push(mk("escalate", c), mk("request_human_review", c), mk("suggest_reply", Math.min(c, 60), true)); break;
    case "escalation":
      out.push(mk("escalate", c), mk("request_human_review", c)); break;
    case "spam":
      out.push(mk("mark_spam_candidate", c), mk("prepare_moderation_action", c)); break;
    case "praise":
      out.push(mk("suggest_reply", c, true)); break;
    case "feedback":
      out.push(mk("request_human_review", c)); break;
    case "unrelated":
      out.push(mk("ignore", c)); break;
    default:
      out.push(mk("request_human_review", c)); break;
  }

  // Urgency floor: high/critical always guarantees a human is in the loop.
  if ((sig.urgency === "high" || sig.urgency === "critical") && !out.some((s) => s.actionKind === "escalate" || s.actionKind === "request_human_review")) {
    out.unshift(mk(sig.urgency === "critical" ? "escalate" : "request_human_review", Math.max(c, 60)));
  }

  // Dedup by action kind + bound the set (reviewable, never a flood).
  const seen = new Set<string>();
  const bounded: DerivedSuggestion[] = [];
  for (const s of out) { if (seen.has(s.actionKind)) continue; seen.add(s.actionKind); bounded.push(s); if (bounded.length >= MAX_ACTIVE_SUGGESTIONS) break; }
  return bounded;
}
