/**
 * Broker discovery architecture — provider-ready, NO web scraping yet.
 * Only lawful, public, business sources. Each provider is a pluggable adapter;
 * today only the manual CSV + CRM-contacts/listing-publisher providers exist.
 */
import "server-only";

export type DiscoveryProviderId =
  | "manual_csv"
  | "listing_publishers" // names already present on imported Yad2/Madlan listings
  | "crm_contacts"
  | "public_registry" // future: official public broker registry (if/when API available)
  | "google_business" // future: only if legally/API accessible
  | "agency_websites"; // future

export interface DiscoveryCandidate {
  displayName: string;
  phone?: string | null;
  agencyName?: string | null;
  city?: string | null;
  website?: string | null;
  sourceUrl?: string | null;
  evidence?: Record<string, unknown>;
}

export interface DiscoveryProvider {
  id: DiscoveryProviderId;
  label: string;
  /** Whether this provider is allowed to run now (scraping ones are disabled). */
  enabled: boolean;
  /** No-op until implemented; future providers return public candidates only. */
  discover?(params: { city?: string }): Promise<DiscoveryCandidate[]>;
}

/** Registry. Scraping providers are intentionally disabled (architecture only). */
export const DISCOVERY_PROVIDERS: DiscoveryProvider[] = [
  { id: "manual_csv", label: "ייבוא CSV ידני", enabled: true },
  { id: "listing_publishers", label: "מפרסמים ממודעות חיצוניות", enabled: true },
  { id: "crm_contacts", label: "אנשי קשר ב-CRM", enabled: false },
  { id: "public_registry", label: "מרשם מתווכים ציבורי", enabled: false },
  { id: "google_business", label: "Google Business (עתידי)", enabled: false },
  { id: "agency_websites", label: "אתרי משרדי תיווך (עתידי)", enabled: false },
];

/** Future entry point. Today it never performs network discovery. */
export async function runDiscovery(): Promise<{ ran: false; reason: string }> {
  return { ran: false, reason: "web discovery disabled — use manual CSV import or listing publishers" };
}
