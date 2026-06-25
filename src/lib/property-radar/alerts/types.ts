// ============================================================================
// ZONO Property Radar™ — alert DTOs for the global popup (client-safe types).
// Shape the UI consumes, derived from a property_alerts row + its metadata.
// ============================================================================

export interface PropertyRadarAlertMetadata {
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  addressText?: string | null;
  price?: number | null;
  rooms?: number | null;
  floor?: string | null;
  sizeSqm?: number | null;
  propertyType?: string | null;
  publishedAt?: string | null;
  imageUrl?: string | null;
  phone?: string | null;
  contactName?: string | null;
  provider?: string | null;
  externalUrl?: string | null;
  reasons?: string[];
  recommendation?: string | null;
  opportunityScore?: number | null;
  buyerMatchCount?: number | null;
  buyerMatchLine?: string | null;
  showBuyerMatches?: boolean | null;
  /** Set on shared-market alerts — the source id the Buyer Match Panel queries. */
  marketPropertySourceId?: string | null;
  whatsappUrl?: string | null;
  whatsappMessage?: string | null;
  callUrl?: string | null;
}

export interface PropertyRadarAlertDTO {
  id: string;
  alertType: string;
  title: string;
  message: string | null;
  priority: "low" | "medium" | "high" | "urgent" | string;
  status: "unread" | "shown" | "read" | "dismissed" | "contacted" | string;
  opportunityScore: number | null;
  createdAt: string;
  linkedPropertyId: string | null;
  propertySourceId: string | null;
  metadata: PropertyRadarAlertMetadata;
}

export interface PropertyRadarPopupSettings {
  popupAlertsEnabled: boolean;
  quietModeEnabled: boolean;
  maxPopupsPer10Minutes: number;
}

export interface FetchPropertyAlertsResult {
  alerts: PropertyRadarAlertDTO[];
  settings: PropertyRadarPopupSettings;
}

export const DEFAULT_POPUP_SETTINGS: PropertyRadarPopupSettings = {
  popupAlertsEnabled: true,
  quietModeEnabled: false,
  maxPopupsPer10Minutes: 3,
};
