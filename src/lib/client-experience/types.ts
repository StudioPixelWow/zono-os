// ============================================================================
// 🤝 ZONO — Client Experience 2.0 — types (pure, client-safe). PHASE 56.0.
// Upgrades the EXISTING buyer/seller portals (no new portal) with a UNIFIED,
// live client timeline + consolidated notification center + status/offer/
// marketing blocks. Isolation is enforced twice: the service reuses the portals'
// authenticated getters (RLS-scoped), and this pure layer additionally redacts —
// dropping anything not owned by the current client and stripping internal-only
// fields. Nothing here fetches data or bypasses the boundary.
// ============================================================================

export const CLIENT_EXPERIENCE_VERSION = "56.0";

export type ClientRole = "buyer" | "seller";
export type Visibility = "client" | "internal";

export type TimelineKind = "appointment" | "message" | "document" | "offer" | "marketing" | "status" | "update" | "action";

export const KIND_HE: Record<TimelineKind, string> = {
  appointment: "פגישה/סיור", message: "הודעה", document: "מסמך", offer: "הצעה",
  marketing: "עדכון שיווק", status: "עדכון סטטוס", update: "עדכון", action: "פעולה ממתינה",
};
export const KIND_ICON: Record<TimelineKind, string> = {
  appointment: "Calendar", message: "MessageCircle", document: "FileText", offer: "Tag",
  marketing: "Megaphone", status: "Activity", update: "Sparkles", action: "ListChecks",
};

/** A generic client-safe source item (each carries ownership + visibility for redaction). */
export interface SourceItem {
  id?: string;
  at: string | null;
  title: string;
  detail?: string | null;
  kind: TimelineKind;
  requiresApproval?: boolean;
  href?: string | null;
  important?: boolean;
  ownerId?: string | null;      // if set, MUST equal the current client's id
  visibility?: Visibility;      // "internal" items are dropped
  internalNote?: string | null; // never surfaced to the client
}

/** Normalized bundle the service builds from the portals' authenticated getters. */
export interface ClientSourceBundle {
  role: ClientRole;
  clientId: string;
  clientName: string;
  items: SourceItem[];
}

// ── Output ────────────────────────────────────────────────────────────────────
export interface ClientTimelineItem {
  id: string; at: string | null; kind: TimelineKind; kindHe: string; icon: string;
  title: string; detail: string | null; requiresApproval: boolean; href: string | null; important: boolean;
}
export interface ClientNotification {
  id: string; kind: TimelineKind; title: string; detail: string | null; at: string | null; requiresApproval: boolean;
}
export interface ClientBlock { kind: TimelineKind; label: string; items: ClientTimelineItem[] }

export interface ClientExperience {
  version: string; role: ClientRole; clientName: string; generatedAt: string | null;
  timeline: ClientTimelineItem[];
  notifications: ClientNotification[];
  unreadCount: number;
  blocks: ClientBlock[];             // grouped: appointments, documents, offers/marketing…
  hasData: boolean;
  notes: string[];
}

export const PRIVACY_NOTE =
  "אתה רואה אך ורק את המידע שלך. פרטי לקוחות אחרים, הערות פנימיות של המשרד ונתונים תפעוליים אינם נחשפים. עדכונים ופעולות רגישות דורשים אישור.";
