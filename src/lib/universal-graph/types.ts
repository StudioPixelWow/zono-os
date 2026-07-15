// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — types (pure, client-safe). PHASE 51.0.
// EXTENDS the existing Relationship Graph (27.9) into a platform-wide graph that
// connects EVERY entity — buyer, seller, lead, property, street, building,
// neighborhood, broker, office, conversation, whatsapp, facebook comment,
// campaign, creative, meeting, mission, workflow, deal, document, website,
// landing. It REUSES relationship-graph's node/edge model, buildGraph, and the
// Truth-Engine-backed edge freshness/confidence/verification. No new graph
// engine, no new tables. Every edge already carries evidence + confidence +
// freshness + truth (verification).
// ============================================================================
import type {
  EntityType, RelationType, FreshnessLevel, VerificationLevel,
  RelationshipEdge, EntityGraph, GraphNode,
} from "@/lib/relationship-graph/types";

export const UNIVERSAL_GRAPH_VERSION = "51.0";

// Re-export the reused primitives so consumers import from one place.
export type { EntityType, RelationType, FreshnessLevel, VerificationLevel, RelationshipEdge, EntityGraph, GraphNode };

/** The full set of first-class node kinds the universal graph connects. */
export type UniversalKind =
  | "buyer" | "seller" | "lead" | "property" | "street" | "building" | "neighborhood"
  | "broker" | "office" | "organization" | "conversation" | "whatsapp" | "facebook_comment"
  | "campaign" | "creative" | "meeting" | "mission" | "workflow" | "deal" | "document"
  | "website" | "landing" | "territory" | "valuation" | "market" | "listing" | "decision";

export const KIND_HE: Record<string, string> = {
  buyer: "קונה", seller: "מוכר", lead: "ליד", property: "נכס", street: "רחוב", building: "בניין",
  neighborhood: "שכונה", broker: "סוכן", office: "משרד", organization: "ארגון", conversation: "שיחה",
  whatsapp: "וואטסאפ", facebook_comment: "תגובת פייסבוק", campaign: "קמפיין", creative: "קריאייטיב",
  meeting: "פגישה", mission: "משימה", workflow: "תהליך", deal: "עסקה", document: "מסמך",
  website: "אתר", landing: "דף נחיתה", territory: "טריטוריה", valuation: "הערכת שווי", market: "שוק",
  listing: "ליסטינג", decision: "החלטה", journey: "מסע",
};

/** Map raw persisted entity_type strings → a canonical UniversalKind. Permissive. */
export function normalizeKind(raw: string | null | undefined): string {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return "unknown";
  const map: Record<string, string> = {
    whatsapp_conversation: "whatsapp", whatsapp_message: "whatsapp", wa_conversation: "whatsapp",
    facebook_comment: "facebook_comment", fb_comment: "facebook_comment", distribution_comment: "facebook_comment",
    social_comment: "facebook_comment", comment: "facebook_comment",
    communication_thread: "conversation", thread: "conversation", conversation: "conversation",
    distribution_campaign: "campaign", marketing_campaign: "campaign",
    creative_asset: "creative", creative_output: "creative", creative: "creative",
    calendar_event: "meeting", event: "meeting", meeting: "meeting", visit: "meeting",
    automation_workflow: "workflow", workflow: "workflow",
    office_website: "website", agent_website: "website", website: "website", landing_page: "landing", landing: "landing",
    task: "mission", agent: "broker", brokerage_agent: "broker", brokerage_office: "office",
    property_listing: "property", listing: "property",
  };
  return map[k] ?? k;
}

/** Best-effort deep link to an entity's page (pure). "#" when unknown. */
export function entityHref(kind: string, id: string): string {
  const k = normalizeKind(kind);
  const routes: Record<string, (id: string) => string> = {
    buyer: (i) => `/buyers/${i}`, seller: (i) => `/sellers/${i}`, lead: (i) => `/leads/${i}`,
    property: (i) => `/properties/${i}`, office: (i) => `/offices/${i}`, deal: (i) => `/deals/${i}`,
    document: () => `/documents`, campaign: () => `/distribution`, whatsapp: () => `/whatsapp/inbox`,
    conversation: () => `/whatsapp/inbox`, facebook_comment: () => `/facebook`, workflow: () => `/workflow-builder`,
    mission: () => `/today`, territory: () => `/territory`, neighborhood: () => `/territory`, street: () => `/territory`,
    website: () => `/office-website`, landing: () => `/office-website`, meeting: () => `/calendar`, broker: () => `/team`,
    journey: () => `/journeys`,
  };
  const fn = routes[k];
  return fn ? fn(id) : "#";
}

// ── Read models ───────────────────────────────────────────────────────────────
export interface SummaryConnection {
  id: string;                 // neighbor node id
  kind: string; kindHe: string; name: string;
  relation: RelationType; relationHe: string;
  direction: "out" | "in";    // this entity → neighbor, or neighbor → this entity
  strength: number; confidence: number;
  freshness: number; freshnessLevel: FreshnessLevel; verification: VerificationLevel;
  evidence: string[]; href: string;
}

export interface RelationshipTypeGroup { type: string; typeHe: string; count: number }

export interface RelationshipSummary {
  entityType: string; entityId: string; entityName: string;
  totalConnections: number;
  byType: RelationshipTypeGroup[];
  connections: SummaryConnection[];
  avgConfidence: number;
  strongestConnection: SummaryConnection | null;
  hasData: boolean;
  notes: string[];
}

/** A compact, evidence-backed context pack for AI consumers (Ask ZONO / pages). */
export interface EntityContextPack {
  entityType: string; entityId: string; entityName: string;
  lines: string[];                 // natural-language relationship lines (evidence-backed)
  connections: SummaryConnection[];
  totalConnections: number;
  avgConfidence: number;
  generatedAt: string | null;
}

export interface UniversalGraphOverview {
  version: string; generatedAt: string | null;
  counts: { nodes: number; edges: number; byKind: { kind: string; kindHe: string; count: number }[] };
  topConnected: { id: string; name: string; kind: string; kindHe: string; degree: number }[];
  strongestEdges: SummaryConnection[];
  hasData: boolean;
  notes: string[];
}

export const NO_FABRICATION_NOTE =
  "הגרף מציג רק קשרים מבוססי ראיות שכבר תועדו במערכת. קשר חסר לא נוצר יש מאין, וקשרים ישנים מסומנים בביטחון נמוך.";
