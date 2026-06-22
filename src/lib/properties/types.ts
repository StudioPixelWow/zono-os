/** Client-safe shared types for the Properties module (no server imports). */
import type {
  ListingKind,
  PropertyStatus,
  PropertyType,
} from "@/lib/supabase/types";

export interface PropertyFilters {
  city?: string;
  type?: PropertyType;
  status?: PropertyStatus;
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
  includeArchived?: boolean;
}

/** Field set the create/edit forms submit. */
export interface PropertyInput {
  title: string;
  description?: string | null;
  type: PropertyType;
  listingKind: ListingKind;
  status: PropertyStatus;
  price: number;
  monthlyRent?: number | null;
  rooms?: number | null;
  sizeSqm?: number | null;
  outdoorSqm?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  city?: string | null;
  region?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  buildingNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  showExactAddress: boolean;
  showNeighborhoodOnly: boolean;
  hasParking: boolean;
  hasElevator: boolean;
  hasBalcony: boolean;
  hasSafeRoom: boolean;
  hasStorage: boolean;
  isAccessible: boolean;
  parkingCount?: number | null;
  storageCount?: number | null;
  balconyCount?: number | null;
  features: string[];
  listingTag?: string | null;
  availabilityDate?: string | null;
  priceBeforeDiscount?: number | null;
  pricePerSqm?: number | null;
  marketingDescription?: string | null;
  aiDescription?: string | null;
  internalNotes?: string | null;
  targetAudience?: string | null;
  /** Structured target-audience keys (see lib/properties/audiences.ts). */
  marketingAudiences?: string[];
  primaryImageUrl?: string | null;
  hasExclusivity: boolean;
  exclusivityEndsAt?: string | null;
}

export type AiMode =
  | "description"
  | "improve"
  | "facebook"
  | "google"
  | "meta_titles";

export interface AiPropertyContext {
  title?: string;
  type?: PropertyType;
  city?: string | null;
  neighborhood?: string | null;
  rooms?: number | null;
  sizeSqm?: number | null;
  floor?: number | null;
  price?: number | null;
  features?: string[];
  mode: AiMode;
  current?: string;
}

export interface AiResult {
  text?: string;
  error?: string;
  source: "openai" | "template";
}

/** Stable keys for the extended feature chips (stored in properties.features). */
export const PROPERTY_FEATURE_KEYS = [
  "renovated",
  "air_conditioning",
  "bars",
  "pandor_doors",
  "upgraded_kitchen",
  "master_unit",
  "open_view",
  "front_facing",
  "rear_facing",
  "solar_heater",
] as const;
export type PropertyFeatureKey = (typeof PROPERTY_FEATURE_KEYS)[number];
