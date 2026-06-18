/**
 * Serializable DTOs passed from the server (getDashboardContext) into the
 * client dashboard contexts. No server imports here so client components can
 * import the types freely.
 */

export interface DashboardUser {
  id: string;
  fullName: string;
  firstName: string;
  roleKey: string | null;
  roleLabel: string | null;
  title: string | null;
  onboardingCompleted: boolean;
  propertyTypes: string[];
  dealTypes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  minRooms: number | null;
  maxRooms: number | null;
}

export interface DashboardOrganization {
  id: string;
  name: string;
  plan: string;
}

export interface DashboardLocality {
  name: string;
  subdistrict: string | null;
  isPrimary: boolean;
}

export interface DashboardContextData {
  user: DashboardUser | null;
  organization: DashboardOrganization | null;
  localities: DashboardLocality[];
  primaryLocality: string | null;
  localitiesCount: number;
  /** True when the context could not be loaded (render error state). */
  error: boolean;
}

export const EMPTY_DASHBOARD_CONTEXT: DashboardContextData = {
  user: null,
  organization: null,
  localities: [],
  primaryLocality: null,
  localitiesCount: 0,
  error: false,
};
