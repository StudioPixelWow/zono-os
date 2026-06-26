// ============================================================================
// ZONO — Agency repository (Phase 26.0, SERVER-ONLY). Org-scoped CRUD via RLS.
// All writes stamp organization_id from the session. Normalized name + slug are
// computed on write so matching/dedupe stay consistent.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeAgencyName, agencySlug } from "./normalize";
import { toAgency } from "./mappers";
import type { Agency, CreateAgencyInput, UpdateAgencyInput } from "./types";

const COLS =
  "id,organization_id,name,normalized_name,legal_name,slug,logo_url,website,description,founded_year,headquarters_city,headquarters_address,google_place_id,phone,email,facebook_url,instagram_url,linkedin_url,youtube_url,active,created_at,updated_at";

async function orgId(): Promise<string> {
  const { profile, state } = await getSessionContext();
  if (state !== "ready" || !profile?.org_id) throw new Error("unauthorized");
  return profile.org_id;
}

/** Ensure the slug is unique within the org by appending -2, -3, … */
async function uniqueSlug(db: Awaited<ReturnType<typeof createClient>>, org: string, base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await db.from("agencies").select("id").eq("organization_id", org).eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export async function createAgency(input: CreateAgencyInput): Promise<Agency> {
  const org = await orgId();
  const db = await createClient();
  const normalized = normalizeAgencyName(input.name);
  const slug = await uniqueSlug(db, org, agencySlug(input.name));
  const { data, error } = await db.from("agencies").insert({
    organization_id: org,
    name: input.name,
    normalized_name: normalized,
    slug,
    legal_name: input.legalName ?? null,
    website: input.website ?? null,
    description: input.description ?? null,
    founded_year: input.foundedYear ?? null,
    headquarters_city: input.headquartersCity ?? null,
    headquarters_address: input.headquartersAddress ?? null,
    google_place_id: input.googlePlaceId ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    facebook_url: input.facebookUrl ?? null,
    instagram_url: input.instagramUrl ?? null,
    linkedin_url: input.linkedinUrl ?? null,
    youtube_url: input.youtubeUrl ?? null,
    logo_url: input.logoUrl ?? null,
    active: input.active ?? true,
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toAgency(data as Record<string, unknown>);
}

export async function updateAgency(id: string, patch: UpdateAgencyInput): Promise<Agency> {
  const db = await createClient();
  const upd: Record<string, unknown> = {};
  if (patch.name !== undefined) { upd.name = patch.name; upd.normalized_name = normalizeAgencyName(patch.name); }
  const map: Record<keyof UpdateAgencyInput, string> = {
    name: "name", legalName: "legal_name", website: "website", description: "description",
    foundedYear: "founded_year", headquartersCity: "headquarters_city", headquartersAddress: "headquarters_address",
    googlePlaceId: "google_place_id", phone: "phone", email: "email", facebookUrl: "facebook_url",
    instagramUrl: "instagram_url", linkedinUrl: "linkedin_url", youtubeUrl: "youtube_url",
    logoUrl: "logo_url", active: "active",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined && k !== "name") upd[col] = v;
  }
  const { data, error } = await db.from("agencies").update(upd as never).eq("id", id).select(COLS).single();
  if (error) throw new Error(error.message);
  return toAgency(data as Record<string, unknown>);
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  const db = await createClient();
  const { data } = await db.from("agencies").select(COLS).eq("id", id).maybeSingle();
  return data ? toAgency(data as Record<string, unknown>) : null;
}

export async function findByNormalizedName(normalized: string): Promise<Agency[]> {
  const org = await orgId();
  const db = await createClient();
  const { data } = await db.from("agencies").select(COLS)
    .eq("organization_id", org).eq("normalized_name", normalized).limit(20);
  return ((data as Record<string, unknown>[] | null) ?? []).map(toAgency);
}

export async function searchAgencies(query: string, limit = 25): Promise<Agency[]> {
  const org = await orgId();
  const db = await createClient();
  const q = query.trim();
  let req = db.from("agencies").select(COLS).eq("organization_id", org).order("name", { ascending: true }).limit(limit);
  if (q) req = req.or(`name.ilike.%${q}%,normalized_name.ilike.%${normalizeAgencyName(q)}%`);
  const { data } = await req;
  return ((data as Record<string, unknown>[] | null) ?? []).map(toAgency);
}

export async function listAgencies(limit = 200): Promise<Agency[]> {
  const org = await orgId();
  const db = await createClient();
  const { data } = await db.from("agencies").select(COLS)
    .eq("organization_id", org).order("name", { ascending: true }).limit(limit);
  return ((data as Record<string, unknown>[] | null) ?? []).map(toAgency);
}

export async function deactivateAgency(id: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.from("agencies").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}
