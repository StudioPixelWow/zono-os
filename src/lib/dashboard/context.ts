/**
 * Server-side aggregation of the signed-in user's dashboard context:
 * users + organizations + roles + user_operating_localities (+ israel_localities
 * names). Reads run under the caller's RLS session. Error-safe: never throws,
 * returns an EMPTY context with `error: true` so the UI can show a fallback.
 */
import { getSessionContext } from "@/lib/auth/session";
import { getCurrentUserOperatingLocalities } from "@/lib/repositories/operatingLocalitiesRepository";
import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_DASHBOARD_CONTEXT,
  type DashboardContextData,
} from "./types";

export type { DashboardContextData } from "./types";

export async function getDashboardContext(): Promise<DashboardContextData> {
  try {
    const { profile, organization } = await getSessionContext();
    if (!profile) return EMPTY_DASHBOARD_CONTEXT;

    // Role label (Hebrew) from the roles table.
    let roleKey: string | null = null;
    let roleLabel: string | null = null;
    if (profile.role_id) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("roles")
        .select("key, name")
        .eq("id", profile.role_id)
        .maybeSingle();
      if (data) {
        roleKey = data.key;
        roleLabel = data.name;
      }
    }

    const locRows = await getCurrentUserOperatingLocalities();
    const localities = locRows.map((l) => ({
      name: l.name_he,
      subdistrict: l.subdistrict,
      isPrimary: l.is_primary,
    }));
    const primaryLocality =
      localities.find((l) => l.isPrimary)?.name ?? localities[0]?.name ?? null;

    const fullName = profile.full_name ?? "";
    const firstName = fullName.trim().split(/\s+/)[0] || fullName;

    return {
      user: {
        id: profile.id,
        fullName,
        firstName,
        roleKey,
        roleLabel,
        title: profile.title,
        avatarUrl: profile.avatar_url ?? null,
        onboardingCompleted: profile.onboarding_completed,
        propertyTypes: profile.property_types ?? [],
        dealTypes: profile.deal_types ?? [],
        minPrice: profile.min_price,
        maxPrice: profile.max_price,
        minRooms: profile.min_rooms,
        maxRooms: profile.max_rooms,
      },
      organization: organization
        ? { id: organization.id, name: organization.name, plan: organization.plan }
        : null,
      localities,
      primaryLocality,
      localitiesCount: localities.length,
      error: false,
    };
  } catch (e) {
    console.error("[dashboard] failed to load context:", e);
    return { ...EMPTY_DASHBOARD_CONTEXT, error: true };
  }
}
