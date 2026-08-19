// ============================================================================
// ZONO — canonical Hebrew UI labels (PURE, client-safe, no imports). ONE source
// for the status/enum wordings that were previously duplicated or leaking raw
// English into the authenticated UI. Business logic is untouched — these are
// DISPLAY strings only. When a state family already has a single canonical map
// elsewhere (e.g. properties/labels.ts for property status/type, follow-up/state
// for follow-up states, marketing-autopilot/plan-core for plan status) reuse THAT;
// this module fills the gaps + the cross-surface duplicates.
// ============================================================================

/** Human Hebrew title per domain event_type (mirrors the timeline projector).
 *  Used by client timelines that render event_type; the fallback is Hebrew-only. */
export const EVENT_TYPE_HE: Record<string, string> = {
  "organization.created": "ארגון נוצר", "organization.updated": "פרטי ארגון עודכנו",
  "agent.invited": "סוכן הוזמן", "agent.activated": "סוכן הופעל", "agent.deactivated": "סוכן הושבת",
  "agent.role_changed": "תפקיד סוכן שונה", "agent.profile_updated": "פרופיל סוכן עודכן",
  "buyer.created": "נוצר קונה חדש", "buyer.updated": "פרטי קונה עודכנו", "buyer.stage_changed": "שלב הקונה השתנה", "buyer.archived": "קונה הועבר לארכיון",
  "seller.created": "נוצר מוכר חדש", "seller.updated": "פרטי מוכר עודכנו", "seller.linked_to_property": "מוכר קושר לנכס", "seller.unlinked_from_property": "מוכר נותק מנכס", "seller.risk_changed": "סיכון מוכר השתנה",
  "lead.created": "נוצר ליד חדש", "lead.updated": "פרטי ליד עודכנו", "lead.stage_changed": "שלב הליד השתנה", "lead.assigned": "ליד שויך",
  "lead.converted_to_buyer": "ליד הומר לקונה", "lead.converted_to_seller": "ליד הומר למוכר",
  "lead.followup_due": "מעקב ליד מתוזמן", "lead.followup_overdue": "מעקב ליד באיחור", "lead.unassigned": "ליד ללא שיוך",
  "lead.hot_without_next_action": "ליד חם ללא פעולה הבאה", "lead.sla_breached": "חריגת זמן טיפול בליד",
  "property.created": "נוצר נכס חדש", "property.updated": "פרטי נכס עודכנו", "property.published": "נכס פורסם",
  "property.price_changed": "מחיר הנכס עודכן", "property.status_changed": "סטטוס הנכס השתנה", "property.stage_changed": "שלב הנכס השתנה",
  "property.sold": "נכס נמכר", "property.archived": "נכס הועבר לארכיון", "property.price_dropped": "מחיר הנכס ירד", "property.back_on_market": "הנכס חזר לשוק",
  "external_listing.ingested": "מודעה חיצונית נקלטה", "external_listing.promoted": "מודעה חיצונית קודמה לנכס",
  "deal.created": "נוצרה עסקה חדשה", "deal.stage_changed": "שלב העסקה השתנה", "deal.won": "עסקה נסגרה בהצלחה", "deal.lost": "עסקה אבדה", "deal.updated": "פרטי עסקה עודכנו",
  "task.created": "נוצרה משימה", "task.assigned": "משימה שויכה", "task.completed": "משימה הושלמה", "task.overdue": "משימה באיחור",
  "meeting.created": "נקבעה פגישה", "meeting.rescheduled": "פגישה נדחתה למועד אחר", "meeting.completed": "פגישה הושלמה", "meeting.cancelled": "פגישה בוטלה", "meeting.no_show": "אי-הגעה לפגישה", "meeting.reminder": "תזכורת פגישה",
  "viewing.requested": "התבקש ביקור", "viewing.scheduled": "נקבע ביקור", "viewing.confirmed": "ביקור אושר", "viewing.rescheduled": "ביקור נדחה למועד אחר", "viewing.cancelled": "ביקור בוטל", "viewing.completed": "ביקור הושלם", "viewing.feedback_received": "התקבל משוב לאחר ביקור", "viewing.followup_required": "נדרש מעקב לאחר ביקור",
  "journey.created": "מסע לקוח נפתח", "journey.stage_changed": "שלב במסע הלקוח השתנה", "journey.completed": "מסע לקוח הושלם", "journey.blocked": "מסע לקוח נחסם",
  "document.created": "נוצר מסמך", "document.approval_requested": "התבקש אישור למסמך", "document.approved": "מסמך אושר", "document.sent": "מסמך נשלח", "document.viewed": "מסמך נצפה", "document.signed": "מסמך נחתם", "document.completed": "מסמך הושלם", "document.failed": "טיפול במסמך נכשל",
  "facebook.connected": "חשבון פייסבוק חובר", "facebook.disconnected": "חשבון פייסבוק נותק", "whatsapp.connected": "וואטסאפ חובר", "whatsapp.disconnected": "וואטסאפ נותק",
  "automation.activated": "אוטומציה הופעלה", "automation.run_completed": "ריצת אוטומציה הושלמה", "automation.run_failed": "ריצת אוטומציה נכשלה",
  "matching.executed": "בוצעה התאמה", "buyer.matches_ready": "נמצאו התאמות לקונה", "recommendation.generated": "נוצרה המלצה", "recommendation.opened": "המלצה נפתחה",
  "campaign.created": "נוצר קמפיין", "publish.requested": "התבקש פרסום", "publish.succeeded": "פרסום הצליח", "publish.failed": "פרסום נכשל",
  "customer.whatsapp_received": "לקוח הגיב בוואטסאפ", "customer.whatsapp_action_required": "הודעת לקוח דורשת טיפול",
};

const ENTITY_HE: Record<string, string> = {
  organization: "ארגון", agent: "סוכן", buyer: "קונה", seller: "מוכר", lead: "ליד", property: "נכס",
  external_listing: "מודעה חיצונית", deal: "עסקה", task: "משימה", meeting: "פגישה", viewing: "ביקור",
  journey: "מסע לקוח", document: "מסמך", facebook: "פייסבוק", whatsapp: "וואטסאפ", communication: "תקשורת",
  automation: "אוטומציה", matching: "התאמה", recommendation: "המלצה", campaign: "קמפיין", publish: "פרסום",
  integration: "אינטגרציה", marketing: "שיווק", support: "תמיכה", billing: "חיוב", customer: "לקוח",
};

/** Hebrew label for a domain event_type — never returns English. */
export function eventTypeHe(eventType: string | null | undefined): string {
  if (!eventType) return "פעילות";
  const t = EVENT_TYPE_HE[eventType];
  if (t) return t;
  return `עדכון ${ENTITY_HE[eventType.split(".")[0] ?? ""] ?? "במערכת"}`.trim();
}

/** Task/priority — feminine (a task, "משימה", is feminine in Hebrew). Canonical. */
export const TASK_PRIORITY_HE: Record<string, string> = {
  low: "נמוכה", medium: "בינונית", high: "גבוהה", urgent: "דחופה",
};

/** Meeting/viewing status — canonical across calendar + viewings + entity detail. */
export const MEETING_STATUS_HE: Record<string, string> = {
  scheduled: "מתוזמנת", confirmed: "מאושרת", completed: "הושלמה", cancelled: "בוטלה", no_show: "לא הגיע", rescheduled: "נדחתה",
};

/** Offer status (deals). */
export const OFFER_STATUS_HE: Record<string, string> = {
  draft: "טיוטה", submitted: "הוגשה", countered: "הצעה נגדית", accepted: "אושרה",
  rejected: "נדחתה", withdrawn: "בוטלה", expired: "פג תוקף",
};

/** Commission status (deals). */
export const COMMISSION_STATUS_HE: Record<string, string> = {
  draft: "טיוטה", pending_approval: "ממתינה לאישור", approved: "מאושרת", cancelled: "מבוטלת",
};

/** Meta (WhatsApp) template review status — provider returns uppercase English. */
export const WA_TEMPLATE_STATUS_HE: Record<string, string> = {
  APPROVED: "מאושרת", PENDING: "בבדיקה", REJECTED: "נדחתה", PAUSED: "מושהית", DISABLED: "מושבתת", IN_APPEAL: "בערעור",
};

/** Creative content-mix media type. */
export const CONTENT_MIX_HE: Record<string, string> = {
  image: "תמונה", video: "וידאו", carousel: "קרוסלה", story: "סטורי", text: "טקסט", reel: "ריל",
};

/** Generic workflow/run status (broker workspace, jobs). */
export const WORKFLOW_STATUS_HE: Record<string, string> = {
  running: "פעיל", active: "פעיל", queued: "בתור", pending: "ממתין",
  completed: "הושלם", done: "הושלם", failed: "נכשל", paused: "מושהה", cancelled: "בוטל",
};

/** Insight/recommendation status (broker workspace, intelligence). */
export const INSIGHT_STATUS_HE: Record<string, string> = {
  pending: "ממתין", approved: "אושר", applied: "הוחל", dismissed: "נדחה", rejected: "נדחה", new: "חדש",
};
