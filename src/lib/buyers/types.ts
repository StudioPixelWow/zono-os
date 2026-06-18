/** Client-safe shared types for the Buyers module (no server imports). */
import type {
  BuyerTemperature,
  LeadSource,
  PropertyType,
} from "@/lib/supabase/types";

export type BuyerDealKind = "sale" | "rent";

export interface BuyerFilters {
  locality?: string;
  minBudget?: number;
  maxBudget?: number;
  roomsMin?: number;
  type?: PropertyType;
  status?: BuyerTemperature;
  source?: LeadSource;
}

/** Field set the create/edit buyer forms submit. */
export interface BuyerInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  preferredAreas: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  roomsMin?: number | null;
  roomsMax?: number | null;
  preferredTypes: PropertyType[];
  dealKind?: BuyerDealKind | null;
  mustHaveElevator: boolean;
  mustHaveParking: boolean;
  mustHaveSafeRoom: boolean;
  temperature?: BuyerTemperature | null;
  source?: LeadSource | null;
  notes?: string | null;
}

/** Shape we persist into buyers.preferences (jsonb) — fields without columns. */
export interface BuyerPreferences {
  deal_kind?: BuyerDealKind;
  source?: LeadSource;
}
