// Serializable view-models passed from the server home page to the client
// control-center. Every value here comes from a real service (see page.tsx).
export interface HomeKpi {
  id: string;
  label: string;
  value: string;
  icon: string;
  href: string;
  hint?: string | null;
}

export interface HomeRec {
  id: string;
  title: string;
  why: string;
  urgency: "critical" | "high" | "medium" | "low";
  href: string | null;
  action: string;
  area: string;
}

export interface HomeActivityItem {
  id: string;
  title: string;
  description: string | null;
  at: string;          // ISO
  icon: string;
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
  href: string | null;
}

export interface HomeTerritory {
  areaLabel: string | null;
  properties: number;
  buyers: number;
  deals: number;
}

export interface HomePerf {
  leadsBySource: { label: string; value: number }[];
  dealsByStage: { label: string; value: number }[];
  expectedRevenue: number;
  activeDeals: number;
  newLeads: number;
}

// ── Command-center view-models (all fed from real services in page.tsx) ───────

/** Hero: one actionable headline + micro-summary chips. */
export interface HomeHero {
  opportunities: number; // # of actionable AI recommendations right now
  chips: { id: string; label: string; value: number; tone: "brand" | "success" | "warning" | "danger"; href: string }[];
}

/** NOW — operational urgency rows (distinct from the AI Coach). */
export interface HomeNowItem {
  id: string;
  icon: string;
  tone: "brand" | "success" | "warning" | "danger";
  label: string;
  action: string;
  href: string;
}

/** Deal pipeline summary (money-first). */
export interface HomePipeline {
  weightedRevenue: number;
  expectedCommission: number;
  pipelineValue: number;
  stages: { stage: string; label: string; count: number; value: number }[];
}

/** Follow-up radar row — a real person who shouldn't go cold. */
export interface HomeFollowUpItem {
  id: string;
  name: string;
  tag: string;              // e.g. "ליד חם" / "לקוח חמים"
  tagTone: "danger" | "warning" | "brand";
  sub: string;              // e.g. "אין קשר 8 ימים"
  action: string;           // CTA label
  href: string;
}

/** Property-acquisition radar counts. */
export interface HomeAcquisition {
  total: number;
  highPriority: number;
  privateSellers: number;
  buyerDemand: number;
  doubleSide: number;
  contacted: number;
}

/** The next-deal killer card (top real active deal). */
export interface HomeNextDeal {
  id: string;
  buyerName: string;
  propertyTitle: string;
  probability: number;      // 0..100
  commission: number;       // ₪ estimated commission
  stageLabel: string;
  href: string;
}

/** WhatsApp — a conversation that needs the agent's attention. */
export interface HomeWaConversation {
  id: string;
  name: string;
  reason: string;           // recommended next action (from the inbox engine)
  href: string;             // /whatsapp/inbox?c=…
  urgency: number;          // 0..100
}
/** WhatsApp summary + the conversations worth acting on now. */
export interface HomeWhatsapp {
  connected: boolean;       // any real conversation data exists
  waiting: number;
  urgent: number;
  today: number;
  conversations: HomeWaConversation[];
}

/** Marketing — one thing worth promoting/acting on now. */
export interface HomeMarketingItem {
  id: string;
  title: string;
  detail: string;           // why / what to do
  action: string;           // CTA label
  href: string;
  score: number;            // impact / marketing score 0..100
}
export interface HomeMarketing {
  hasData: boolean;
  items: HomeMarketingItem[];
}

/** A dormant lead worth bringing back into play. */
export interface HomeDormantLead {
  id: string;
  name: string;
  sub: string;              // e.g. "אין קשר 41 ימים"
  href: string;
}

/** "ZONO worked for you" — what the system did recently (real activity counts). */
export interface HomeZonoWork {
  windowLabel: string;      // e.g. "ב-24 השעות האחרונות"
  items: { id: string; icon: string; label: string; tone: "brand" | "success" | "warning" }[];
  total: number;
}

/** A private-owner (no-broker) listing card with a direct WhatsApp-to-owner CTA. */
export interface HomePrivateListing {
  id: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  imageUrl: string | null;
  ownerName: string | null;
  whatsappUrl: string | null;  // wa.me link to the owner (null if no valid phone)
  href: string;                // /external-listings/[id]
}
