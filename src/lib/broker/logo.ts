/**
 * Logo extraction + matching — adapter architecture (server-only).
 *
 * Phase-3 vision work (real perceptual hashing / image embeddings) plugs in
 * behind `LogoVisionAdapter`. Until a real model is connected, the default
 * adapter is a deterministic placeholder so the DB/services/UI are fully wired
 * and a stronger model can be dropped in with zero call-site changes.
 *
 * Safety: only public listing images / public brand assets are ever processed.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];

export interface LogoCandidate { url: string; source: string; width?: number | null; height?: number | null }
export interface LogoMatch { brokerId: string; assetId: string; similarity: number; hash: string | null }

/** Pluggable vision backend. Swap for a real model/API in Phase 3. */
export interface LogoVisionAdapter {
  /** Returns a stable perceptual-hash-like fingerprint for an image URL. */
  hash(url: string): Promise<string | null>;
  /** Returns 0..1 similarity between two fingerprints. */
  similarity(a: string, b: string): Promise<number>;
}

/**
 * Deterministic placeholder: hashes the URL string (NOT pixels). Exact-URL or
 * exact-hash equality is treated as a perfect match; everything else is 0.
 * Clearly a stand-in — real perceptual hashing replaces `hash`/`similarity`.
 */
export const placeholderVisionAdapter: LogoVisionAdapter = {
  async hash(url: string) {
    if (!url) return null;
    let h = 0;
    for (let i = 0; i < url.length; i++) { h = (h * 31 + url.charCodeAt(i)) >>> 0; }
    return `ph_${h.toString(16)}`;
  },
  async similarity(a: string, b: string) {
    return a && b && a === b ? 1 : 0;
  },
};

let activeAdapter: LogoVisionAdapter = placeholderVisionAdapter;
/** Allow a future real adapter to be registered (e.g. from an env-gated module). */
export function setLogoVisionAdapter(a: LogoVisionAdapter) { activeAdapter = a; }

async function orgId(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

/** Register a logo asset for a broker + (optionally) set it as the profile logo. */
export async function registerLogoAsset(input: {
  brokerId: string; url: string; source: string; status?: string; setAsPrimary?: boolean; width?: number | null; height?: number | null;
}): Promise<{ assetId: string | null }> {
  const org = await orgId();
  const supabase = await createClient();
  const hash = await activeAdapter.hash(input.url);
  const row: DB["broker_logo_assets"]["Insert"] = {
    org_id: org, broker_id: input.brokerId, original_url: input.url, image_hash: hash,
    source: input.source, status: input.status ?? "detected", confidence_score: input.source === "manual_upload" ? 100 : 50,
    width: input.width ?? null, height: input.height ?? null,
  };
  const { data, error } = await supabase.from("broker_logo_assets").insert(row as never).select("id").single();
  if (error) { console.error("[logo] register failed:", error); return { assetId: null }; }
  if (input.setAsPrimary) {
    await supabase.from("broker_profiles").update({ logo_url: input.url, logo_hash: hash } as never).eq("id", input.brokerId);
  }
  return { assetId: data?.id ?? null };
}

/**
 * Match a listing image against all known broker logos in the org.
 * Returns candidate matches sorted by similarity. With the placeholder adapter
 * this only fires on exact-hash equality; a real model lifts this to fuzzy.
 */
export async function matchListingImageToLogos(imageUrl: string): Promise<LogoMatch[]> {
  const supabase = await createClient();
  const target = await activeAdapter.hash(imageUrl);
  if (!target) return [];
  const { data: assets } = await supabase.from("broker_logo_assets").select("id,broker_id,image_hash").not("image_hash", "is", null).limit(2000);
  const out: LogoMatch[] = [];
  for (const a of assets ?? []) {
    if (!a.image_hash) continue;
    const sim = await activeAdapter.similarity(target, a.image_hash);
    if (sim >= 0.85) out.push({ brokerId: a.broker_id, assetId: a.id, similarity: sim, hash: a.image_hash });
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

export async function listLogoAssets(brokerId: string): Promise<DB["broker_logo_assets"]["Row"][]> {
  const supabase = await createClient();
  const { data } = await supabase.from("broker_logo_assets").select("*").eq("broker_id", brokerId).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}
