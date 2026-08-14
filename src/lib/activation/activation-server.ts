// ============================================================================
// ZONO — Office Activation (server-only). Loads the authoritative session
// org/owner, runs READ-ONLY, strictly org-scoped counts for every activation
// milestone, resolves real city/locality + brand + trial facts, and returns the
// canonical ActivationState. No writes. No fabrication. Tenant isolation: EVERY
// query is filtered by the caller's own orgId — never cross-org.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  ACTIVATION_COUNT_SOURCES, computeActivation,
  type ActivationMilestoneKey, type ActivationState,
} from "./activation";

export interface OfficeIdentity {
  orgId: string;
  officeName: string;
  officeLogoUrl: string | null;
  ownerName: string;
  ownerFirstName: string;
  ownerAvatarUrl: string | null;
  city: string | null;
  subdistrict: string | null;
  localityCode: string | null;
}

export interface OfficeBrand {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  logoUrl: string | null;
}

export interface OfficeTrial {
  active: boolean;
  endsAt: string | null;
  daysLeft: number | null;
}

export interface OfficeActivationResult {
  activation: ActivationState;
  identity: OfficeIdentity;
  brand: OfficeBrand;
  trial: OfficeTrial | null;
}

type Db = ReturnType<typeof createServiceRoleClient>;

async function countScoped(db: Db, table: string, column: string, orgId: string): Promise<number> {
  try {
    const { count } = await db
      .from(table as never)
      .select("*", { count: "exact", head: true })
      .eq(column as never, orgId as never);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Resolve the full office activation snapshot for the current session, or null
 * when there is no active org (unauthenticated / mid-onboarding).
 */
export async function getOfficeActivation(): Promise<OfficeActivationResult | null> {
  const { profile, organization } = await getSessionContext();
  if (!organization || !profile) return null;

  const db = createServiceRoleClient();
  const orgId = organization.id;

  // ── Count-derived milestones (each summed across its real sources) ──────────
  const countEntries = await Promise.all(
    ACTIVATION_COUNT_SOURCES.map(async (source) => {
      const parts = await Promise.all(
        source.tables.map((t) => countScoped(db, t.table, t.column, orgId)),
      );
      return [source.key, parts.reduce((a, b) => a + b, 0)] as [ActivationMilestoneKey, number];
    }),
  );
  const counts = Object.fromEntries(countEntries) as Partial<Record<ActivationMilestoneKey, number>>;

  // ── Team size (users in this org) ───────────────────────────────────────────
  const teamSize = await countScoped(db, "users", "org_id", orgId);

  // ── Brand configured (real primary color set on the office brand profile) ────
  let brand: OfficeBrand = { primary: null, secondary: null, accent: null, logoUrl: organization.logo_url ?? null };
  try {
    const { data } = await db
      .from("brand_identity_profiles" as never)
      .select("brand_primary,brand_secondary,brand_accent,logo_url,profile_image_url")
      .eq("org_id" as never, orgId as never)
      .eq("entity_type" as never, "office" as never)
      .maybeSingle();
    const row = data as {
      brand_primary: string | null; brand_secondary: string | null; brand_accent: string | null;
      logo_url: string | null; profile_image_url: string | null;
    } | null;
    if (row) {
      brand = {
        primary: row.brand_primary,
        secondary: row.brand_secondary,
        accent: row.brand_accent,
        logoUrl: organization.logo_url ?? row.logo_url ?? null,
      };
    }
  } catch { /* honest: treat as not configured */ }
  const brandConfigured = !!brand.primary;

  // ── Digital presence (a published office or agent website) ───────────────────
  let digitalPresence = false;
  try {
    const [ow, aw] = await Promise.all([
      db.from("office_websites" as never).select("id", { count: "exact", head: true }).eq("organization_id" as never, orgId as never).eq("status" as never, "published" as never),
      db.from("agent_websites" as never).select("id", { count: "exact", head: true }).eq("organization_id" as never, orgId as never).eq("status" as never, "published" as never),
    ]);
    digitalPresence = (ow.count ?? 0) > 0 || (aw.count ?? 0) > 0;
  } catch { /* honest: not published */ }

  // ── City / locality facts (real reference row; district/coords may be NULL) ──
  const city = organization.city ?? profile.primary_city ?? organization.operating_cities?.[0] ?? null;
  let subdistrict: string | null = null;
  let localityCode: string | null = null;
  if (city) {
    try {
      const { data } = await db
        .from("israel_localities" as never)
        .select("locality_code,subdistrict")
        .eq("name_he" as never, city as never)
        .maybeSingle();
      const row = data as { locality_code: string | null; subdistrict: string | null } | null;
      subdistrict = row?.subdistrict ?? null;
      localityCode = row?.locality_code ?? null;
    } catch { /* locality unknown */ }
  }

  // ── Trial (canonical billing state; may be absent if not provisioned) ────────
  let trial: OfficeTrial | null = null;
  try {
    const { data } = await db
      .from("subscriptions" as never)
      .select("status,trial_ends_at")
      .eq("org_id" as never, orgId as never)
      .maybeSingle();
    const row = data as { status: string | null; trial_ends_at: string | null } | null;
    if (row?.trial_ends_at) {
      const daysLeft = Math.max(0, Math.ceil((new Date(row.trial_ends_at).getTime() - Date.now()) / 86_400_000));
      trial = { active: row.status === "trialing" || daysLeft > 0, endsAt: row.trial_ends_at, daysLeft };
    }
  } catch { /* no subscription row */ }

  const ownerName = (profile.full_name ?? "").trim();
  const ownerFirstName = ownerName.split(/\s+/)[0] || "סוכן";

  const activation = computeActivation({
    orgExists: true,
    ownerIdentity: !!ownerName,
    cityDetected: !!city,
    counts,
    brandConfigured,
    digitalPresence,
    teamSize,
  });

  const identity: OfficeIdentity = {
    orgId,
    officeName: organization.name,
    officeLogoUrl: organization.logo_url ?? brand.logoUrl ?? null,
    ownerName,
    ownerFirstName,
    ownerAvatarUrl: profile.avatar_url ?? null,
    city,
    subdistrict,
    localityCode,
  };

  return { activation, identity, brand, trial };
}
