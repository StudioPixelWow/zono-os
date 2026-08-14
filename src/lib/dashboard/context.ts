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

    const supabase = await createClient();

    // Role label (Hebrew) from the roles table.
    let roleKey: string | null = null;
    let roleLabel: string | null = null;
    if (profile.role_id) {
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

    // Effective avatar: the agent photo uploaded in Brand & Identity lives in
    // brand_identity_profiles.profile_image_url — NOT users.avatar_url. Fall back
    // to it (then the office logo) so the photo shows EVERYWHERE the topbar/avatar
    // renders, even when avatar_url was never separately set.
    let brandAvatar: string | null = null;
    try {
      const { data: bip } = await supabase
        .from("brand_identity_profiles")
        .select("profile_image_url, logo_url, profile_image_status")
        .eq("entity_type", "agent")
        .eq("entity_id", profile.id)
        .maybeSingle();
      const row = bip as { profile_image_url: string | null; logo_url: string | null; profile_image_status: string | null } | null;
      if (row && row.profile_image_status !== "removed") {
        brandAvatar = row.profile_image_url ?? row.logo_url ?? null;
      }
    } catch { /* best-effort — avatar just falls back to the initial */ }

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
        avatarUrl: profile.avatar_url ?? brandAvatar,
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
