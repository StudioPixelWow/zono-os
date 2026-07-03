// ============================================================================
// ✉️ ZONO — Communication Intelligence™ & AI Draft Studio — types (pure). 30.3.
// ----------------------------------------------------------------------------
// ONE entity-agnostic communication engine. It PREPARES communication drafts for
// any ZONO entity (buyer/seller/lead/broker/office/property/mission/customer),
// across channels and tones, with explainability and versioning. It CONSUMES the
// existing engines (Digital Twins, Customer Journey, Truth, Chief of Staff,
// Decision/Mission, Ask ZONO, Org Memory) read-only via a normalized context —
// no engine modified, no business logic duplicated. It NEVER sends: every draft
// is approval-gated. Evidence-only.
// ============================================================================
export const DRAFT_STUDIO_VERSION = "30.3";

export type EntityKind = "buyer" | "seller" | "lead" | "broker" | "office" | "property" | "mission" | "customer";
export const ENTITY_HE: Record<EntityKind, string> = {
  buyer: "קונה", seller: "מוכר", lead: "ליד", broker: "מתווך", office: "משרד", property: "נכס", mission: "משימה", customer: "לקוח",
};

export type Channel = "whatsapp" | "sms" | "email" | "call" | "in_person";
export const CHANNEL_HE: Record<Channel, string> = { whatsapp: "וואטסאפ", sms: "SMS", email: "אימייל", call: "תסריט שיחה", in_person: "פגישה" };

// Part 2 — draft purposes.
export type Purpose =
  | "first_contact" | "follow_up" | "reminder" | "negotiation" | "thank_you" | "document_request"
  | "appointment_confirmation" | "listing_update" | "price_discussion" | "meeting_summary" | "general";
export const PURPOSE_HE: Record<Purpose, string> = {
  first_contact: "יצירת קשר ראשוני", follow_up: "מעקב", reminder: "תזכורת", negotiation: "משא ומתן", thank_you: "תודה",
  document_request: "בקשת מסמכים", appointment_confirmation: "אישור פגישה", listing_update: "עדכון נכס", price_discussion: "שיחת מחיר",
  meeting_summary: "סיכום פגישה", general: "כללי",
};

// Part 4 — tone.
export type Tone = "professional" | "friendly" | "luxury" | "urgent" | "negotiation" | "empathetic" | "formal" | "short" | "long";
export const TONE_HE: Record<Tone, string> = {
  professional: "מקצועי", friendly: "ידידותי", luxury: "יוקרתי", urgent: "דחוף", negotiation: "משא ומתן",
  empathetic: "אמפתי", formal: "רשמי", short: "קצר", long: "מפורט",
};

export type Language = "he" | "en";

// Part 3/5 — normalized entity context (assembled from the existing engines).
export interface CommContext {
  entityKind: EntityKind; entityId: string; name: string;
  firstName: string;
  brokerName: string | null; officeName: string | null;
  journeyStage: string | null;
  trust: number | null;                 // 0..100 (Digital Twin / Truth)
  relationshipPath: string[];           // Relationship Graph
  truthScore: number | null;            // Truth Engine
  recommendation: string | null;        // agent aiRecommendation
  strategy: string | null;              // agent recommended strategy
  reason: string | null;                // why now (from CoS / decision / mission)
  missionGoal: string | null;           // open mission goal
  lastActivity: string | null;          // last touch
  facts: string[];                      // evidence facts (price gap, health, matches…)
  preferences: string[];                // known preferences (area, budget, property type)
  propertyTitle: string | null; price: number | null;
}

// Part 6 — explainability.
export interface DraftExplain { why: string; evidence: string[]; goal: string; expectedOutcome: string; confidence: number }

// A single rendered draft.
export interface Draft {
  id: string; channel: Channel; purpose: Purpose; tone: Tone; language: Language;
  subject: string | null;               // email only
  body: string;
  explain: DraftExplain;
  requiresApproval: true;               // always — the studio never sends
}

// Part 8 — versioning bundle.
export interface DraftBundle {
  version: string; generatedAt: string;
  entityKind: EntityKind; entityId: string; entityName: string;
  request: { channel: Channel; purpose: Purpose; tone: Tone; language: Language };
  primary: Draft;
  versions: { short: Draft; long: Draft; alternative: Draft; altTone: Draft };
  notes: string[];
}

export interface DraftRequest {
  channel: Channel; purpose: Purpose; tone: Tone; language: Language;
}

// Studio invocation target + sender (used by the server service; pure types).
export interface DraftTarget { entityKind: EntityKind; entityId: string; name: string }
export interface DraftSender { brokerName: string | null; officeName: string | null }
