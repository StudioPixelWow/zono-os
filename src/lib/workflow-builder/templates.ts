// ============================================================================
// 🔁 Workflow Builder — templates (pure). 30.4. Part 5.
// Seven reusable workflows. Each step is approval-gated where it produces an
// action; steps map to EXISTING mission/draft/task systems (no logic duplicated).
// ============================================================================
import type { WorkflowTemplate, WorkflowStep, Condition, ActionType, StepKind } from "./types";

type StepDef = Omit<WorkflowStep, "status" | "blockedReason" | "outcome">;
let SEQ = 0;
const step = (title: string, kind: StepKind, opts: { action?: ActionType; missionType?: string; condition?: Condition; why?: string; approval?: boolean } = {}): StepDef => ({
  id: `s${++SEQ}`, order: 0, title, kind,
  action: opts.action ?? null, missionType: opts.missionType ?? null, condition: opts.condition ?? null,
  requiresApproval: opts.approval ?? (kind === "action"), why: opts.why ?? "",
});
const order = (steps: StepDef[]): StepDef[] => steps.map((s, i) => ({ ...s, order: i + 1 }));

const C = {
  confident: (v = 55): Condition => ({ type: "CONFIDENCE", op: "gte", value: v, label: `ביטחון ≥ ${v}` }),
  truth: (v = 45): Condition => ({ type: "TRUTH_SCORE", op: "gte", value: v, label: `אמת ≥ ${v}` }),
  business: (v = 50): Condition => ({ type: "BUSINESS_SCORE", op: "gte", value: v, label: `ציון עסקי ≥ ${v}` }),
  stageIn: (stages: string[]): Condition => ({ type: "JOURNEY_STAGE", op: "in", value: stages, label: `שלב: ${stages.join("/")}` }),
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "buyer_closing", name: "סגירת קונה", entityKind: "buyer", trigger: "BUYER_HOT",
    description: "מלווה קונה חם משליחת נכסים ועד סגירה.", expectedOutcome: "קידום הקונה לסגירת עסקה",
    steps: order([
      step("בדיקת מוכנות", "condition", { condition: C.confident(55), why: "מתחילים רק כשהקונה בשל מספיק" }),
      step("שליחת נכסים מתאימים", "action", { action: "CREATE_DRAFT", missionType: "SEND_PROPERTIES", why: "להציג התאמות" }),
      step("קביעת ביקור", "action", { action: "CREATE_MISSION", missionType: "BOOK_VISIT", why: "לקדם לפגישה בשטח" }),
      step("מעקב לאחר ביקור", "action", { action: "SCHEDULE_FOLLOWUP", missionType: "BUYER_FOLLOWUP", why: "לשמר מומנטום" }),
      step("קידום לסגירה", "action", { action: "CREATE_MISSION", missionType: "BUYER_CLOSE", why: "לנעול עסקה" }),
    ]),
  },
  {
    id: "seller_recovery", name: "שימור מוכר", entityKind: "seller", trigger: "SELLER_AT_RISK",
    description: "מונע נטישת מוכר בסיכון ומחזיר מומנטום.", expectedOutcome: "הפחתת סיכון נטישה",
    steps: order([
      step("זיהוי סיכון", "condition", { condition: C.truth(40), why: "לאמת שהסיכון אמיתי" }),
      step("יצירת קשר מיידית", "action", { action: "CREATE_DRAFT", missionType: "SELLER_RETENTION", why: "להרגיע ולחדש אמון" }),
      step("בחינת תמחור", "action", { action: "CREATE_MISSION", missionType: "PRICE_REVIEW", why: "לטפל בפער מחיר" }),
      step("מעקב שימור", "action", { action: "SCHEDULE_FOLLOWUP", missionType: "SELLER_FOLLOWUP", why: "לוודא יציבות" }),
    ]),
  },
  {
    id: "listing_refresh", name: "רענון נכס", entityKind: "property", trigger: "LISTING_STALE",
    description: "מחזיר ביקוש לנכס מתיישן.", expectedOutcome: "חידוש עניין ומכירה מהירה יותר",
    steps: order([
      step("אימות התיישנות", "condition", { condition: C.truth(40), why: "לוודא שהנכס אכן מתיישן" }),
      step("המלצת תמחור", "action", { action: "CREATE_MISSION", missionType: "LISTING_PRICE_REVIEW", why: "ליישר מחיר לשוק" }),
      step("רענון שיווק", "action", { action: "CREATE_MISSION", missionType: "REFRESH_MARKETING", why: "להגדיל חשיפה" }),
      step("הפעלת קונים", "action", { action: "CREATE_DRAFT", missionType: "BUYER_REACTIVATION", why: "לעורר קונים תואמים" }),
    ]),
  },
  {
    id: "recruit_broker", name: "גיוס מתווך", entityKind: "office", trigger: "MANUAL",
    description: "מוביל תהליך גיוס מתווך למשרד.", expectedOutcome: "הגדלת קיבולת המשרד",
    steps: order([
      step("בדיקת צורך/קיבולת", "condition", { condition: C.business(50), why: "לגייס רק כשהעסק תומך" }),
      step("הגדרת פרופיל גיוס", "action", { action: "CREATE_MISSION", missionType: "OFFICE_RECRUIT_PLAN", why: "למקד את הגיוס" }),
      step("פנייה למועמדים", "action", { action: "CREATE_DRAFT", missionType: "OFFICE_RECRUIT", why: "ליצור קשר" }),
      step("קליטה והכשרה", "action", { action: "CREATE_MISSION", missionType: "OFFICE_TRAINING", why: "לקלוט לתפוקה" }),
    ]),
  },
  {
    id: "price_review", name: "בחינת מחיר", entityKind: "property", trigger: "ASK_ZONO_REC",
    description: "מיישר תמחור נכס לפי נתוני שוק.", expectedOutcome: "מחיר תחרותי מבוסס נתונים",
    steps: order([
      step("בדיקת פער מחיר", "condition", { condition: C.confident(50), why: "לפעול רק על בסיס מוצק" }),
      step("עדכון הערכת שווי", "action", { action: "CREATE_MISSION", missionType: "VALUATION_UPDATE", why: "לרענן את ההערכה" }),
      step("שיחת מחיר עם המוכר", "action", { action: "CREATE_DRAFT", missionType: "PRICE_DISCUSSION", why: "ליישר ציפיות" }),
    ]),
  },
  {
    id: "luxury_campaign", name: "קמפיין יוקרה", entityKind: "property", trigger: "MANUAL",
    description: "משיק קמפיין פרימיום לנכס יוקרה.", expectedOutcome: "חשיפה ממוקדת לקהל יוקרה",
    steps: order([
      step("אימות פלח יוקרה", "condition", { condition: C.business(55), why: "לוודא התאמה לפלח" }),
      step("הכנת שיווק יוקרה", "action", { action: "CREATE_MISSION", missionType: "OFFICE_MARKETING_CAMPAIGN", why: "לבנות קמפיין פרימיום" }),
      step("פנייה לקהל פרימיום", "action", { action: "CREATE_DRAFT", missionType: "LUXURY_OUTREACH", why: "לפנות דיסקרטית" }),
    ]),
  },
  {
    id: "lead_qualification", name: "הסמכת ליד", entityKind: "lead", trigger: "AGENT_PROPOSAL",
    description: "מסמיך ליד חדש ומנתב אותו.", expectedOutcome: "ליד מוסמך ומנותב",
    steps: order([
      step("בדיקת ליד חדש", "condition", { condition: C.stageIn(["new", "new_lead", "contacted"]), why: "רלוונטי ללידים חדשים" }),
      step("הסמכה", "action", { action: "CREATE_TASK", missionType: "LEAD_QUALIFICATION", why: "לברר כוונה ותקציב" }),
      step("ניתוב (אישור)", "action", { action: "REQUEST_APPROVAL", missionType: "LEAD_ROUTING", why: "ניתוב מחייב אישור אנושי" }),
      step("יצירת קשר ראשוני", "action", { action: "CREATE_DRAFT", missionType: "LEAD_FOLLOWUP", why: "לפתוח קשר" }),
    ]),
  },
];

export function getTemplate(id: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id) ?? null;
}
