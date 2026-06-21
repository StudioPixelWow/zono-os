"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/session";
import { provisionUserProfile } from "@/lib/repositories/userRepository";
import {
  createOrganizationWithRoles,
  getRoleIdByKey,
} from "@/lib/repositories/organizationRepository";
import {
  setOrgOperatingLocalities,
  setUserOperatingLocalities,
  type OperatingLocalityInput,
} from "@/lib/repositories/operatingLocalitiesRepository";
import type { ListingKind, PropertyType } from "@/lib/supabase/types";

export interface SelectedLocalityPayload {
  localityId: string;
  nameHe: string;
  isPrimary: boolean;
}

export interface OnboardingPayload {
  // Step 1 — organization
  organizationName: string;
  organizationLogoUrl?: string;
  organizationPhone?: string;
  organizationEmail?: string;
  // Step 2 — user details
  fullName: string;
  phone?: string;
  jobTitle?: string;
  avatarUrl?: string;
  // Step 3 — role
  roleKey: string;
  // Step 4 — operating localities (from public.israel_localities)
  localities: SelectedLocalityPayload[];
  // Step 5 — property focus
  propertyTypes: PropertyType[];
  dealTypes: ListingKind[];
  // Step 6 — price / rooms ranges
  minPrice?: number | null;
  maxPrice?: number | null;
  minRooms?: number | null;
  maxRooms?: number | null;
  // notification preferences
  notificationPreferences?: Record<string, boolean>;
}

export interface OnboardingResult {
  error?: string;
}

/**
 * Finalize onboarding: create the organization (+ default roles), provision the
 * current user's profile with all collected fields, mark both as onboarded,
 * then enter the dashboard. All writes run server-side under service-role but
 * are scoped to the authenticated user's id.
 */
export async function completeOnboarding(
  payload: OnboardingPayload,
): Promise<OnboardingResult> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  if (!payload.organizationName?.trim()) return { error: "נא להזין שם ארגון." };
  if (!payload.fullName?.trim()) return { error: "נא להזין שם מלא." };
  const localities = payload.localities ?? [];
  if (localities.length === 0) return { error: "נא לבחור לפחות עיר פעילות אחת." };

  const roleKey = payload.roleKey || "owner";
  const primary = localities.find((l) => l.isPrimary) ?? localities[0];

  try {
    const org = await createOrganizationWithRoles({
      name: payload.organizationName.trim(),
      logo_url: payload.organizationLogoUrl || null,
      phone: payload.organizationPhone || null,
      email: payload.organizationEmail || null,
      city: primary?.nameHe ?? null,
      operating_cities: localities.map((l) => l.nameHe),
      operating_neighborhoods: [],
      default_property_types: payload.propertyTypes ?? [],
      default_deal_types: payload.dealTypes ?? [],
      onboarding_completed: true,
    });

    const roleId = await getRoleIdByKey(org.id, roleKey);

    await provisionUserProfile({
      id: user.id,
      org_id: org.id,
      role_id: roleId,
      email: user.email ?? payload.organizationEmail ?? "",
      full_name: payload.fullName.trim(),
      phone: payload.phone || null,
      title: payload.jobTitle || null,
      avatar_url: payload.avatarUrl || null,
      status: "active",
      operating_city: primary?.nameHe ?? null,
      operating_neighborhoods: [],
      property_types: payload.propertyTypes ?? [],
      deal_types: payload.dealTypes ?? [],
      min_price: payload.minPrice ?? null,
      max_price: payload.maxPrice ?? null,
      min_rooms: payload.minRooms ?? null,
      max_rooms: payload.maxRooms ?? null,
      notification_preferences: payload.notificationPreferences ?? {},
      onboarding_completed: true,
    });

    // Save selected localities to org + user join tables (same focus/price
    // defaults applied per locality for now).
    const rows: OperatingLocalityInput[] = localities.map((l) => ({
      locality_id: l.localityId,
      is_primary: l.isPrimary,
      min_price: payload.minPrice ?? null,
      max_price: payload.maxPrice ?? null,
      min_rooms: payload.minRooms ?? null,
      max_rooms: payload.maxRooms ?? null,
      property_types: payload.propertyTypes ?? [],
      deal_types: payload.dealTypes ?? [],
    }));
    await setOrgOperatingLocalities(org.id, rows);
    await setUserOperatingLocalities(user.id, rows);

    // Mandatory early step: populate the shared national neighborhood reference
    // (OSM + OpenAI) for the agent's operating cities, so neighborhoods are
    // available system-wide from day one — coverage scans, external listings,
    // internal properties, marketing. Best-effort: never blocks onboarding.
    try {
      const { ensureNationalNeighborhoods } = await import("@/lib/transactions/service");
      await ensureNationalNeighborhoods(localities.map((l) => l.nameHe));
    } catch (geoError) {
      console.error("[onboarding] neighborhood discovery skipped:", geoError);
    }
  } catch (error) {
    console.error("[onboarding] failed:", error);
    return { error: "אירעה שגיאה בשמירת הנתונים. נסה/י שוב." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
