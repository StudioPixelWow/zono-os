// ============================================================================
// ZONO — Capability catalog (PURE). The real product world a new office can
// discover on first login: "מה ZONO כבר הכינה עבורך". Every entry maps to a
// REAL, existing route and carries an HONEST availability state. Nothing here
// pretends a dependency is configured. `related` links a capability to an
// activation milestone so the UI can mark it ✓ from real state.
// ============================================================================
import type { ActivationMilestoneKey } from "./activation";

/** Honest availability states (Phase 5). */
export type CapabilityState = "ready" | "connect" | "after_data" | "soon";

export const CAPABILITY_STATE_LABEL: Record<CapabilityState, string> = {
  ready: "מוכן להתחלה",
  connect: "דורש חיבור",
  after_data: "נפתח אחרי הוספת נתונים",
  soon: "בקרוב",
};

export interface Capability {
  key: string;
  label: string;
  value: string;        // the value it unlocks (one line)
  icon: string;         // lucide icon name
  href: string;         // real route
  state: CapabilityState;
  /** If set, the capability shows ✓ when this activation milestone is done. */
  related?: ActivationMilestoneKey;
  /** Grouping for layout. */
  group: "identity" | "growth" | "operations";
}

export const CAPABILITIES: Capability[] = [
  // ── Identity / digital presence ──────────────────────────────────────────
  { key: "brand", label: "מיתוג המשרד", value: "לוגו, צבעים וזהות מותג לכל התוצרים", icon: "Palette", href: "/settings/brand", state: "ready", related: "brand_configured", group: "identity" },
  { key: "office_website", label: "אתר המשרד", value: "אתר תדמית ממותג עם לכידת לידים", icon: "Globe", href: "/office-website", state: "ready", related: "digital_presence", group: "identity" },
  { key: "agent_website", label: "אתר סוכן אישי", value: "עמוד אישי לכל סוכן, לידים ישירים ל-CRM", icon: "UserRound", href: "/agent-website", state: "ready", group: "identity" },
  // ── Growth / marketing ───────────────────────────────────────────────────
  { key: "creative", label: "סטודיו קריאייטיב", value: "יצירת קופי, קונספט ומודעות בעברית", icon: "Sparkles", href: "/creative-lab", state: "ready", group: "growth" },
  { key: "facebook", label: "פייסבוק ואינסטגרם", value: "פרסום וקמפיינים ישירות מ-ZONO", icon: "Megaphone", href: "/facebook", state: "connect", group: "growth" },
  { key: "whatsapp", label: "וואטסאפ עסקי", value: "ניהול שיחות לקוחות מתוך המערכת", icon: "MessageCircle", href: "/whatsapp", state: "connect", group: "growth" },
  { key: "marketing", label: "מודיעין שיווקי", value: "התאמת נכסים לקהלים — נפתח עם נכסים ולקוחות", icon: "Target", href: "/marketing", state: "after_data", group: "growth" },
  // ── Operations ───────────────────────────────────────────────────────────
  { key: "operating_areas", label: "אזורי פעילות", value: "ניטור מקומי לערים ולשכונות שלך", icon: "MapPin", href: "/settings/operating-areas", state: "ready", related: "operating_area", group: "operations" },
  { key: "properties", label: "נכסים", value: "ניהול מלאי, התאמות ושיווק לכל נכס", icon: "Building2", href: "/properties/new", state: "ready", related: "first_property", group: "operations" },
  { key: "crm", label: "CRM — קונים ומוכרים", value: "ניהול הדרך מהליד ועד העסקה", icon: "Users", href: "/buyers/new", state: "ready", related: "first_contact", group: "operations" },
  { key: "team", label: "צוות המשרד", value: "הזמנת סוכנים והרשאות", icon: "UserPlus", href: "/team", state: "ready", related: "team_invited", group: "operations" },
  { key: "calendar", label: "משימות ופגישות", value: "יומן, סיורים ומשימות מעקב", icon: "Calendar", href: "/today", state: "ready", related: "first_task_meeting", group: "operations" },
];
