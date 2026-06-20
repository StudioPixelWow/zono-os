/**
 * Broker enrichment — public-data enrichment with a safe adapter seam.
 *
 * SAFETY/LEGAL: external enrichment is OFF by default (org switch
 * `broker_enrichment_enabled`). This phase NEVER fabricates social/website
 * data and performs no scraping. It records *candidate* public search entry
 * points (deterministic, derived only from the broker's own public name/city)
 * and marks the profile `needs_review` so a human confirms before anything is
 * treated as verified. A real enrichment backend plugs in behind
 * `ExternalEnrichmentAdapter` (Phase 2/4) without changing call sites.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];

export interface EnrichmentFound {
  website?: string | null;
  googleBusiness?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  emails?: string[];
  brandColors?: string[];
  logoUrl?: string | null;
}

export interface EnrichmentResult {
  brokerId: string;
  enabled: boolean;
  status: "none" | "enriched" | "needs_review" | "failed";
  found: EnrichmentFound;
  candidateSearchUrls: string[];
  message: string;
}

/** Pluggable real enrichment backend (Phase 2/4). Default = no-op (returns nothing). */
export interface ExternalEnrichmentAdapter {
  enrich(input: { name: string; city: string | null; phone: string | null }): Promise<EnrichmentFound>;
}
const noopAdapter: ExternalEnrichmentAdapter = { async enrich() { return {}; } };
let activeAdapter: ExternalEnrichmentAdapter = noopAdapter;
export function setEnrichmentAdapter(a: ExternalEnrichmentAdapter) { activeAdapter = a; }

/** Deterministic, public search entry points (links a human can verify). No scraping. */
function candidateSearchUrls(name: string, city: string | null): string[] {
  const q = encodeURIComponent([name, city, "תיווך נדל״ן"].filter(Boolean).join(" "));
  return [
    `https://www.google.com/search?q=${q}`,
    `https://www.google.com/maps/search/${q}`,
    `https://www.facebook.com/search/top?q=${q}`,
    `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`,
  ];
}

async function requireOrg(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

export async function enrichBrokerProfile(brokerId: string): Promise<EnrichmentResult> {
  const org = await requireOrg();
  const supabase = await createClient();

  const [{ data: orgRow }, { data: broker }] = await Promise.all([
    supabase.from("organizations").select("broker_enrichment_enabled").eq("id", org).maybeSingle(),
    supabase.from("broker_profiles").select("id,display_name,primary_city,phone").eq("id", brokerId).maybeSingle(),
  ]);
  if (!broker) throw new Error("broker not found");

  const candidates = candidateSearchUrls(broker.display_name, broker.primary_city);
  const enabled = orgRow?.broker_enrichment_enabled === true;

  // External enrichment disabled → record candidates for manual review only.
  let found: EnrichmentFound = {};
  let status: EnrichmentResult["status"] = "needs_review";
  let message = enabled
    ? "ההעשרה פעלה — נדרש אישור אנושי לפני סימון כמאומת."
    : "העשרה חיצונית כבויה (ברירת מחדל). נשמרו קישורי חיפוש ציבוריים לבדיקה ידנית.";

  if (enabled) {
    try {
      found = await activeAdapter.enrich({ name: broker.display_name, city: broker.primary_city, phone: broker.phone });
      status = Object.keys(found).length ? "needs_review" : "needs_review";
    } catch (e) {
      console.error("[enrichment] adapter failed:", e);
      status = "failed"; message = "ההעשרה נכשלה — נסה שוב מאוחר יותר.";
    }
  }

  // Persist candidate search entry points as evidence sources (never overwrite verified data).
  const sourceRows: DB["broker_sources"]["Insert"][] = candidates.map((url) => ({
    org_id: org, broker_id: brokerId, source_type: "enrichment:candidate", url, evidence: { kind: "search_entry_point" } as never, captured_at: new Date().toISOString(),
  }));
  if (sourceRows.length) await supabase.from("broker_sources").insert(sourceRows as never);

  // Only write fields the adapter actually returned (no fabrication).
  const update: Record<string, unknown> = { enrichment_status: status, last_enriched_at: new Date().toISOString() };
  if (found.website) update.website = found.website;
  if (found.googleBusiness) update.google_business_url = found.googleBusiness;
  if (found.facebook) update.facebook_url = found.facebook;
  if (found.instagram) update.instagram_url = found.instagram;
  if (found.linkedin) update.linkedin_url = found.linkedin;
  if (found.emails?.length) update.emails = found.emails as never;
  if (found.brandColors?.length) update.brand_colors = found.brandColors as never;
  if (found.logoUrl) { update.logo_url = found.logoUrl; }
  await supabase.from("broker_profiles").update(update as never).eq("id", brokerId);

  return { brokerId, enabled, status, found, candidateSearchUrls: candidates, message };
}
