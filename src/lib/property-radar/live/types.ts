// ============================================================================
// ZONO Property Radar™ — Phase 13 Live Command Center DTOs (client-safe).
// Everything here is REAL org-scoped data aggregated from the existing Property
// Radar tables — no fabricated values. The screen sits ABOVE the dashboard and
// reuses the existing settings/status, market cache, events, matches + alerts.
// ============================================================================
import type { ProviderHealth } from "../settings/types";

export type LiveEventKind =
  | "new_property"
  | "price_drop"
  | "hot_deal"
  | "back_on_market"
  | "removed"
  | "buyer_match"
  | "status_change";

export interface LiveKpis {
  newListings: number;
  privateListings: number;
  priceDrops: number;
  hotDeals: number;
  backOnMarket: number;
  buyerMatchesCreated: number;
  alertsSent: number;
  tasksCreated: number;
  creditsSaved: number;
  duplicateScansAvoided: number;
}

export interface LiveFeedItem {
  id: string;
  kind: LiveEventKind;
  at: string;
  marketPropertySourceId: string | null;
  listingType: string | null;
  city: string | null;
  neighborhood: string | null;
  addressText: string | null;
  price: number | null;
  priceDelta: number | null;
  imageUrl: string | null;
  externalUrl: string | null;
  phone: string | null;
  opportunityScore: number | null;
  buyerMatchCount: number;
  provider: string;
}

export interface HotDealItem {
  marketPropertySourceId: string;
  city: string | null;
  neighborhood: string | null;
  addressText: string | null;
  price: number | null;
  priceDelta: number | null;
  imageUrl: string | null;
  opportunityScore: number;
  buyerMatchCount: number;
  publishedAt: string | null;
  provider: string;
}

export interface BuyerStreamBuyer {
  matchId: string;
  buyerId: string;
  buyerName: string;
  phone: string | null;
  matchScore: number;
  matchLevel: string;
  positives: string[];
}

export interface BuyerStreamItem {
  marketPropertySourceId: string;
  addressText: string | null;
  city: string | null;
  price: number | null;
  imageUrl: string | null;
  buyers: BuyerStreamBuyer[];
}

export interface ActionItem {
  id: string;
  kind: "task" | "alert";
  priority: "low" | "medium" | "high" | "urgent" | string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  overdue: boolean;
  marketPropertySourceId: string | null;
  phone: string | null;
}

export interface ActivityItem {
  id: string;
  eventType: string;
  title: string;
  channel: string | null;
  at: string;
}

export interface CreditMonitor {
  usedToday: number;
  savedToday: number;
  remainingToday: number;
  efficiencyPct: number;
}

export interface LiveMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  details: string[];
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
}

export interface PropertyRadarLiveData {
  kpis: LiveKpis;
  feed: LiveFeedItem[];
  hotDeals: HotDealItem[];
  buyerStream: BuyerStreamItem[];
  actionCenter: ActionItem[];
  activity: ActivityItem[];
  providerHealth: ProviderHealth[];
  creditMonitor: CreditMonitor;
  mapPoints: LiveMapPoint[];
  cities: string[];
  lastRefreshAt: string;
  generatedAt: string;
}

export interface PropertyTimelineEntryDTO {
  at: string;
  kind: string;
  label: string;
}

export interface PropertySidePanelData {
  marketPropertySourceId: string;
  addressText: string | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: string | null;
  propertyType: string | null;
  listingType: string | null;
  provider: string;
  phone: string | null;
  externalUrl: string | null;
  images: string[];
  firstSeen: string | null;
  timeline: PropertyTimelineEntryDTO[];
  priceHistory: { at: string; price: number | null }[];
}
