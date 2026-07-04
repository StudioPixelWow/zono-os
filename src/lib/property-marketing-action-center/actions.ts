// ============================================================================
// 🎯 ZONO — Property Marketing Action Center — engine (pure). 33.3.
// The ACTIONABLE counterpart to the Property Marketing Log: given the property's
// current marketing state (built from EXISTING sources — distribution + the
// marketing log + Facebook connection), it computes what to do NOW — due-now
// publishes, pending lead approvals, and recommended next steps — each routing to
// an EXISTING flow. Nothing executes here; every action is approval-gated.
// ============================================================================

export type ActionKind =
  | "assisted_publish" | "review_leads" | "monitor_comments"
  | "launch_campaign" | "connect_facebook" | "generate_creative" | "review_failed";

export type ActionStatus = "due_now" | "pending_approval" | "recommended" | "in_progress" | "attention";

export interface ActionItem {
  id: string; kind: ActionKind; status: ActionStatus;
  title: string; why: string; count: number | null; priority: number;
  requiresApproval: boolean; cta: { href: string; label: string };
}

export interface ActionCenterInput {
  campaigns: number; scheduled: number; dueNow: number; published: number;
  failed: number; comments: number; leads: number; pendingLeads: number; creatives: number;
  connected: boolean;
}

export interface ActionCenter {
  dueNow: ActionItem[]; pending: ActionItem[]; recommended: ActionItem[];
  stats: { open: number; dueNow: number; pending: number; recommended: number };
  headline: string; isEmpty: boolean;
}

const item = (o: Omit<ActionItem, "requiresApproval"> & { requiresApproval?: boolean }): ActionItem => ({ requiresApproval: true, ...o });

export function buildActionCenter(input: ActionCenterInput): ActionCenter {
  const items: ActionItem[] = [];

  // ── Due now — assisted-manual publishes waiting at their scheduled time ──────
  if (input.dueNow > 0) items.push(item({
    id: "assisted-publish", kind: "assisted_publish", status: "due_now", priority: 100,
    title: "פוסטים מוכנים לפרסום", why: `${input.dueNow} פוסטים הגיעו למועד — פרסום מסייע ידני (העתקה + פתיחת קבוצה + אישור).`,
    count: input.dueNow, cta: { href: "/distribution/daily", label: "לתור הפרסום" },
  }));

  // ── Attention — failed posts need review ────────────────────────────────────
  if (input.failed > 0) items.push(item({
    id: "review-failed", kind: "review_failed", status: "attention", priority: 92,
    title: "פוסטים שנכשלו", why: `${input.failed} פוסטים נכשלו — כדאי לבדוק ולתזמן מחדש.`,
    count: input.failed, cta: { href: "/distribution/daily", label: "בדיקה ותזמון מחדש" },
  }));

  // ── Pending — interested comments awaiting lead approval ─────────────────────
  if (input.pendingLeads > 0) items.push(item({
    id: "review-leads", kind: "review_leads", status: "pending_approval", priority: 90,
    title: "לידים מתגובות לאישור", why: `${input.pendingLeads} תגובות מתעניינות ממתינות — אישור יוצר ליד (לא נוצר אוטומטית).`,
    count: input.pendingLeads, cta: { href: "/social-leads", label: "אישור לידים" },
  }));

  // ── Recommended next steps ──────────────────────────────────────────────────
  if (!input.connected) items.push(item({
    id: "connect-fb", kind: "connect_facebook", status: "recommended", priority: 70, requiresApproval: false,
    title: "חיבור פייסבוק", why: "חיבור פייסבוק מאפשר תזמון ופרסום מסייע. ניתן להכין קמפיין גם בלי חיבור.",
    count: null, cta: { href: "/settings/distribution-connections", label: "חברו פייסבוק" },
  }));

  if (input.campaigns === 0) items.push(item({
    id: "launch-campaign", kind: "launch_campaign", status: "recommended", priority: 68,
    title: "השקת קמפיין לקבוצות", why: "עוד לא שווק הנכס בקבוצות פייסבוק — בנו קמפיין ממוקד עם אשף הקמפיין.",
    count: null, cta: { href: "/distribution/campaign-wizard", label: "בניית קמפיין" },
  }));

  if (input.creatives === 0) items.push(item({
    id: "generate-creative", kind: "generate_creative", status: "recommended", priority: 60,
    title: "יצירת קריאייטיב לנכס", why: "הפיקו וריאציות תוכן ותמונות לנכס לשימוש בקמפיינים.",
    count: null, cta: { href: "/distribution/campaign-wizard", label: "יצירת תוכן" },
  }));

  if (input.published > 0 && input.pendingLeads === 0) items.push(item({
    id: "monitor-comments", kind: "monitor_comments", status: "recommended", priority: 50, requiresApproval: false,
    title: "מעקב תגובות", why: `${input.published} פוסטים פורסמו — עקבו אחר תגובות וסווגו מתעניינים ללידים.`,
    count: input.comments || null, cta: { href: "/distribution/daily", label: "מרכז תגובות" },
  }));

  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const dueNow = sorted.filter((i) => i.status === "due_now" || i.status === "attention");
  const pending = sorted.filter((i) => i.status === "pending_approval");
  const recommended = sorted.filter((i) => i.status === "recommended" || i.status === "in_progress");

  const headline = dueNow.length ? "יש פעולות שממתינות לך עכשיו" : pending.length ? "לידים ממתינים לאישור" : recommended.length ? "הצעדים המומלצים לשיווק הנכס" : "אין פעולות פתוחות כרגע";
  return {
    dueNow, pending, recommended,
    stats: { open: sorted.length, dueNow: dueNow.length, pending: pending.length, recommended: recommended.length },
    headline, isEmpty: sorted.length === 0,
  };
}
