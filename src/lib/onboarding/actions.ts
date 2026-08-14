"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
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
import { resolveLimitEnforcementForMutation } from "@/lib/enforcement/server/enforcement";
import { ensureTrialSubscription } from "@/lib/commercial/store";
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

  // P9.0 idempotency fast-path: if this user already belongs to an org (a prior
  // onboarding succeeded), never create a second — go straight to the dashboard.
  // This covers refresh / back-button / re-submit; the DB partial-unique index on
  // organizations.created_by_user_id covers the true concurrent race. (The read is
  // isolated so the NEXT_REDIRECT throw is NOT swallowed by a catch.)
  let alreadyOnboarded = false;
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server");
    const { data: existingProfile } = await createServiceRoleClient()
      .from("users").select("org_id").eq("id", user.id).maybeSingle();
    alreadyOnboarded = !!existingProfile?.org_id;
  } catch { /* fall through to normal creation */ }
  if (alreadyOnboarded) { revalidatePath("/", "layout"); redirect("/"); }

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
    }, { createdByUserId: user.id });

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

    // P8.1 — every new office automatically enters a real 14-day trial. Idempotent:
    // a retry never resets or duplicates it (subscriptions.PK = org_id). Trial is the
    // canonical billing state; commercial/enforcement stay separate + unchanged.
    try {
      const { created } = await ensureTrialSubscription(org.id, 14);
      if (created) {
        const { createServiceRoleClient } = await import("@/lib/supabase/server");
        await createServiceRoleClient().from("audit_log").insert({
          organization_id: org.id, actor_id: user.id, actor_name: payload.fullName.trim(),
          action: "billing.trial.started", category: "configuration",
          entity_type: "organization", entity_id: org.id,
          summary: "התחיל ניסיון בן 14 ימים", metadata: { trialDays: 14 } as never,
        } as never).then(() => undefined, () => undefined);
      }
    } catch (e) { console.error("[onboarding] trial provisioning skipped:", e); }

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
    // P7.2C: under operatingAreas enforcement (PILOT/ENFORCED for this org) the
    // org's initial area count must respect the plan cap — closes the bulk-onboard
    // bypass. This is org-creation (one owner, fresh org → rows.length is the whole
    // org count). SHADOW (every onboarding org today) → no-op, flow unchanged.
    const enfAreas = await resolveLimitEnforcementForMutation(org.id, "operatingAreas");
    if (enfAreas.active && enfAreas.configuredLimit != null && enfAreas.configuredLimit >= 0 && rows.length > enfAreas.configuredLimit) {
      throw new Error("הגעתם למכסת אזורי הפעילות בתוכנית — צמצמו את מספר הערים.");
    }
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

    // P9.0D — AUTOMATIC CITY BOOTSTRAP. Kick off the office's city intelligence
    // the moment onboarding succeeds, so a fresh office is never a cold system.
    // FREE/INTERNAL only: brokerage/city learning from data ZONO already owns
    // (throttled + idempotent + never throws). Runs via `after()` so it does NOT
    // block onboarding/redirect. NEIGHBORHOODS already ran above. EXPENSIVE
    // provider scans (Apify listings) are deliberately NOT launched here — the
    // nightly external-listings/master crons already pick up the new org (its
    // operating locality was just written), keeping signup cost bounded. No
    // fabrication: this only schedules real discovery over real sources.
    const bootstrapOrgId = org.id;
    const bootstrapCities = localities.map((l) => l.nameHe);
    after(async () => {
      try {
        const { triggerCityLearning } = await import("@/lib/brokerage-data/city-learning-trigger");
        for (const city of bootstrapCities) {
          void triggerCityLearning(bootstrapOrgId, city, "onboarding_primary_city");
        }
        // P9.0D — when the external provider is configured, run ONE BOUNDED quick
        // scan (≤50/city) so the office gets real discovered listings immediately
        // instead of waiting for the nightly cron. Gated on APIFY_TOKEN so it is a
        // clean no-op (no failed job) when unconfigured. Idempotent upsert; the
        // nightly cron backstops anything the request budget truncates. Cost stays
        // bounded (quick mode, one office). NO fabrication — real provider only.
        if (process.env.APIFY_TOKEN) {
          const { syncExternalListingsForOrganization } = await import("@/lib/external-listings/service");
          // The ONE-TIME signup scan uses "standard" (≤250/city) so a new office
          // opens to a THOROUGH picture of its registration city — not a thin
          // sample. Still bounded (only the office's own operating cities, one
          // pass). The per-login refresh-on-entry stays "quick" for cost. NO
          // fabrication — real Yad2/Madlan via the provider only.
          void syncExternalListingsForOrganization(bootstrapOrgId, { mode: "standard" })
            .catch((e) => console.error("[onboarding] bootstrap scan skipped:", e));
        }
      } catch (e) {
        console.error("[onboarding] city bootstrap skipped:", e);
      }
    });
  } catch (error) {
    console.error("[onboarding] failed:", error);
    return { error: "אירעה שגיאה בשמירת הנתונים. נסה/י שוב." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
