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
  hasParking: boolean;
  hasElevator: boolean;
  hasBalcony: boolean;
  hasSafeRoom: boolean;
  hasStorage: boolean;
  isAccessible: boolean;
  hasExclusivity: boolean;
  exclusivityEndsAt?: string | null;
}
