// ============================================================================
// ZONO — Journey trigger catalog (pure). The orchestrator dispatches a
// TriggerEvent to every active workflow whose primary trigger matches.
// ============================================================================
import type { TriggerType } from "./types";

export const TRIGGERS: { type: TriggerType; label: string; journeyHint: string }[] = [
  { type: "property_created", label: "נכס נוצר", journeyHint: "property" },
  { type: "property_updated", label: "נכס עודכן", journeyHint: "property" },
  { type: "price_drop", label: "ירידת מחיר", journeyHint: "property" },
  { type: "back_on_market", label: "חזר לשוק", journeyHint: "property" },
  { type: "buyer_match", label: "התאמת קונה", journeyHint: "buyer" },
  { type: "exclusive_opportunity", label: "הזדמנות בלעדיות", journeyHint: "seller" },
  { type: "exclusive_signed", label: "בלעדיות נחתמה", journeyHint: "seller" },
  { type: "task_completed", label: "משימה הושלמה", journeyHint: "office" },
  { type: "task_overdue", label: "משימה באיחור", journeyHint: "office" },
  { type: "meeting_created", label: "פגישה נקבעה", journeyHint: "deal" },
  { type: "meeting_completed", label: "פגישה הסתיימה", journeyHint: "deal" },
  { type: "call_logged", label: "שיחה תועדה", journeyHint: "lead" },
  { type: "whatsapp_sent", label: "וואטסאפ נשלח", journeyHint: "lead" },
  { type: "deal_stage_changed", label: "שלב עסקה השתנה", journeyHint: "deal" },
  { type: "manual", label: "הפעלה ידנית", journeyHint: "office" },
  { type: "scheduled", label: "מתוזמן", journeyHint: "office" },
];

const LABEL = new Map(TRIGGERS.map((t) => [t.type, t.label]));
export const triggerLabel = (t: string): string => LABEL.get(t as TriggerType) ?? t;
export const isTriggerType = (t: string): t is TriggerType => LABEL.has(t as TriggerType);
