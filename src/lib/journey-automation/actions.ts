// ============================================================================
// ZONO — Journey action catalog + deterministic "prepare" layer (pure). Each
// action node is turned into a concrete, explainable instruction. The actual
// side effects (DB writes, AI calls) are performed by the server orchestrator's
// action handlers — this layer only describes WHAT will happen (so Simulation
// Mode can preview it exactly). AI actions are optional/augmentation.
// ============================================================================
import type { ActionType, TriggerContext, WorkflowNode } from "./types";

export const ACTIONS: { type: ActionType; label: string; sideEffect: boolean; ai: boolean }[] = [
  { type: "create_task", label: "צור משימה", sideEffect: true, ai: false },
  { type: "assign_user", label: "הקצה למשתמש", sideEffect: true, ai: false },
  { type: "move_stage", label: "קדם שלב", sideEffect: true, ai: false },
  { type: "generate_ai_brief", label: "הפק תדריך AI", sideEffect: false, ai: true },
  { type: "generate_whatsapp", label: "הפק וואטסאפ", sideEffect: false, ai: true },
  { type: "generate_email", label: "הפק אימייל", sideEffect: false, ai: true },
  { type: "create_reminder", label: "צור תזכורת", sideEffect: true, ai: false },
  { type: "schedule_meeting", label: "תזמן פגישה", sideEffect: true, ai: false },
  { type: "notify_manager", label: "התראה למנהל", sideEffect: true, ai: false },
  { type: "create_alert", label: "צור התראה", sideEffect: true, ai: false },
  { type: "update_journey", label: "עדכן מסע", sideEffect: true, ai: false },
  { type: "wait", label: "המתן", sideEffect: false, ai: false },
  { type: "end", label: "סיום", sideEffect: false, ai: false },
];

const META = new Map(ACTIONS.map((a) => [a.type, a]));
export const actionLabel = (a: string): string => META.get(a as ActionType)?.label ?? a;
export const actionMeta = (a: string) => META.get(a as ActionType) ?? null;
export const isAiAction = (a: string): boolean => META.get(a as ActionType)?.ai ?? false;

export interface PreparedAction {
  actionType: ActionType;
  title: string;
  /** Human-readable description of the side effect — shown verbatim in Simulation Mode. */
  preview: string;
  config: Record<string, unknown>;
}

function subject(ctx: TriggerContext): string {
  return (ctx.entity_label as string) || (ctx.address_text as string) || (ctx.city as string) || "הישות";
}

/** Turn an action node + context into a concrete, previewable instruction. */
export function prepareAction(node: WorkflowNode, ctx: TriggerContext): PreparedAction {
  const at = (node.actionType ?? "end") as ActionType;
  const cfg = node.config ?? {};
  const who = subject(ctx);
  const titleFromCfg = (node.title ?? "").trim();
  const mk = (preview: string): PreparedAction => ({ actionType: at, title: titleFromCfg || actionLabel(at), preview, config: cfg });

  switch (at) {
    case "create_task": return mk(`צור משימה: ${titleFromCfg || "מעקב"} עבור ${who}`);
    case "assign_user": return mk(`הקצה את ${who} ל${(cfg.assignee as string) ?? "הסוכן המתאים"}`);
    case "move_stage": return mk(`קדם את ${who} לשלב ${(cfg.stage as string) ?? "הבא"}`);
    case "generate_ai_brief": return mk(`הפק תדריך AI עבור ${who} (אם AI זמין — אחרת תקציר דטרמיניסטי)`);
    case "generate_whatsapp": return mk(`הפק טיוטת וואטסאפ עבור ${who} (לאישור — לא נשלח אוטומטית)`);
    case "generate_email": return mk(`הפק טיוטת אימייל עבור ${who}`);
    case "create_reminder": return mk(`צור תזכורת עבור ${who}`);
    case "schedule_meeting": return mk(`הצע פגישה עבור ${who}`);
    case "notify_manager": return mk(`שלח התראה למנהל לגבי ${who}`);
    case "create_alert": return mk(`צור התראה: ${titleFromCfg || who}`);
    case "update_journey": return mk(`עדכן את מסע הנכס/הלקוח של ${who}`);
    case "wait": return mk(`המתן ${(node.delayMinutes ?? 0)} דקות`);
    case "end": return mk("סיום המסע");
    default: return mk(`פעולה: ${at}`);
  }
}
