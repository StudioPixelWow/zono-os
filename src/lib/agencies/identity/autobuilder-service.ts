// ============================================================================
// ZONO — Agency Auto-Builder service (Phase 26.2, SERVER-ONLY).
// Turns a built identity into a clean agency: dedupe → create-or-enrich →
// aliases → timeline event. Never creates rejected/low-quality identities.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { toAgency } from "../mappers";
import { findByNormalizedName } from "../agencyRepository";
import { addAlias, findAgencyIdByAlias } from "../resolver/aliasRepository";
import { addTimelineEvent } from "../timelineRepository";
import { getAgencyById } from "../agencyRepository";
import { buildAgencyIdentityFromRawText } from "./agencyAutoBuilder";
import type { AgencyIdentity, AutoBuildInput } from "./agencyIdentityTypes";
import type { Agency } from "../types";

const COLS =
  "id,organization_id,name,normalized_name,legal_name,slug,logo_url,website,description,founded_year,headquarters_city,headquarters_address,google_place_id,phone,email,facebook_url,instagram_url,linkedin_url,youtube_url,active,brand_name,franchise_name,display_name,created_from,creation_confidence,identity_status,identity_metadata,created_at,updated_at";

async function uniqueSlug(db: Awaited<ReturnType<typeof createClient>>, org: string, base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await db.from("agencies").select("id").eq("organization_id", org).eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** Persist a fresh agency from a clean identity (with identity columns + aliases). */
export async function createAgencyFromIdentity(identity: AgencyIdentity): Promise<Agency> {
  const org = await currentOrgId();
  const db = await createClient();
  const slug = await uniqueSlug(db, org, identity.slug);
  const { data, error } = await db.from("agencies").insert({
    organization_id: org,
    name: identity.canonicalName, normalized_name: identity.normalizedName, slug,
    display_name: identity.displayName,
    brand_name: identity.brand.brandName, franchise_name: identity.brand.franchiseName,
    headquarters_city: identity.location.city,
    created_from: "auto_builder", creation_confidence: identity.confidence,
    identity_status: identity.status, identity_metadata: identity.evidence, active: true,
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  const agency = toAgency(data as Record<string, unknown>);

  for (const a of identity.aliases) await addAlias(agency.id, a, "auto_builder").catch(() => {});
  await addTimelineEvent({
    agencyId: agency.id, eventType: "auto_created",
    title: "סוכנות נוצרה אוטומטית מזיהוי זהות", description: identity.displayName,
    metadata: { confidence: identity.confidence, brand: identity.brand.brandName, rawText: identity.rawText },
  }).catch(() => {});
  return agency;
}

/** Enrich an existing agency with newly-learned aliases + a timeline note. */
export async function enrichExistingAgencyIdentity(agencyId: string, identity: AgencyIdentity): Promise<Agency | null> {
  for (const a of identity.aliases) await addAlias(agencyId, a, "auto_builder").catch(() => {});
  await addTimelineEvent({
    agencyId, eventType: "identity_enriched",
    title: "זהות הסוכנות הועשרה מ‑Auto‑Builder", description: identity.displayName,
    metadata: { fromRawText: identity.rawText, brand: identity.brand.brandName },
  }).catch(() => {});
  return getAgencyById(agencyId);
}

export interface BuildResult {
  identity: AgencyIdentity;
  action: "created" | "enriched" | "rejected";
  agency: Agency | null;
}

/**
 * Full flow: build identity → quality guard → dedupe (normalized name / aliases)
 * → create or enrich. The resolver calls THIS instead of creating agencies from
 * raw text directly.
 */
export async function buildAndResolveAgency(input: AutoBuildInput): Promise<BuildResult> {
  const identity = buildAgencyIdentityFromRawText(input);
  if (identity.rejected) return { identity, action: "rejected", agency: null };

  // Dedupe: exact normalized name, then alias hits for canonical/display/aliases.
  let existingId: string | null = null;
  const byName = await findByNormalizedName(identity.normalizedName).catch(() => []);
  if (byName[0]) existingId = byName[0].id;
  if (!existingId) {
    for (const probe of [identity.displayName, identity.canonicalName, ...identity.aliases]) {
      existingId = await findAgencyIdByAlias(probe).catch(() => null);
      if (existingId) break;
    }
  }

  if (existingId) {
    const agency = await enrichExistingAgencyIdentity(existingId, identity);
    return { identity, action: "enriched", agency };
  }
  const agency = await createAgencyFromIdentity(identity);
  return { identity, action: "created", agency };
}
