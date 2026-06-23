/**
 * Global / universal search (server-only, READ-ONLY, org-scoped via RLS).
 * Searches the org's core entities and returns results grouped by entity type,
 * each with a real detail-page href. Deterministic, fast (small per-type limits).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export interface SearchHit { id: string; title: string; subtitle: string | null; href: string }
export interface SearchGroup { type: string; label: string; icon: string; hits: SearchHit[] }

const LIMIT = 6;
const esc = (s: string) => s.replace(/[%,()]/g, " ").trim();
/** Normalize Hebrew for tolerant matching: drop gershayim/quotes, collapse
 *  spaces, lowercase — so "קקל" matches "קק״ל" and "קק''ל". */
const norm = (s: string | null | undefined) =>
  (s ?? "").replace(/[׳״'"`׳״]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export async function searchEverything(query: string): Promise<SearchGroup[]> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return [];
  const q = esc(query);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const orgId = profile.org_id;
  const like = `%${q}%`;
  const groups: SearchGroup[] = [];

  const [props, buyers, sellers, brokers, competitors, ext, agents] = await Promise.all([
    supabase.from("properties").select("id,title,city,neighborhood,price,status,formatted_address,building_number").eq("org_id", orgId).neq("status", "archived").limit(400),
    supabase.from("buyers").select("id,full_name,phone").eq("org_id", orgId).or(`full_name.ilike.${like},phone.ilike.${like}`).limit(LIMIT),
    supabase.from("sellers").select("id,full_name,phone").eq("org_id", orgId).or(`full_name.ilike.${like},phone.ilike.${like}`).limit(LIMIT),
    supabase.from("broker_profiles").select("id,display_name,agency_name").eq("org_id", orgId).or(`display_name.ilike.${like},agency_name.ilike.${like}`).limit(LIMIT),
    supabase.from("competitor_profiles").select("id,display_name").eq("organization_id", orgId).ilike("display_name", like).limit(LIMIT),
    supabase.from("external_listings").select("id,title,city").eq("org_id", orgId).or(`title.ilike.${like},city.ilike.${like}`).limit(LIMIT),
    supabase.from("users").select("id,full_name,title").eq("org_id", orgId).ilike("full_name", like).limit(LIMIT),
  ]);

  const push = (type: string, label: string, icon: string, hits: SearchHit[]) => { if (hits.length) groups.push({ type, label, icon, hits }); };

  // Tolerant, punctuation-insensitive match across the property's text fields.
  const qn = norm(q);
  const matchedProps = (props.data ?? []).filter((p) =>
    [p.title, p.city, p.neighborhood, p.formatted_address, p.building_number].some((f) => norm(f as string | null).includes(qn)),
  ).slice(0, LIMIT);
  push("properties", "נכסים", "Building", matchedProps.map((p) => ({
    id: p.id, title: p.title || p.neighborhood || p.city || "נכס", subtitle: [p.neighborhood, p.city, p.price ? `₪${Number(p.price).toLocaleString("he-IL")}` : null].filter(Boolean).join(" · ") || null, href: `/properties/${p.id}`,
  })));
  push("buyers", "קונים", "Users", (buyers.data ?? []).map((b) => ({ id: b.id, title: b.full_name, subtitle: b.phone, href: `/buyers/${b.id}` })));
  push("sellers", "מוכרים", "Handshake", (sellers.data ?? []).map((s) => ({ id: s.id, title: s.full_name, subtitle: s.phone, href: `/sellers/${s.id}` })));
  push("brokers", "מתווכים", "Users", (brokers.data ?? []).map((b) => ({ id: b.id, title: b.display_name, subtitle: b.agency_name, href: `/broker-intelligence/${b.id}` })));
  push("competitors", "מתחרים", "Shield", (competitors.data ?? []).map((c) => ({ id: c.id, title: c.display_name, subtitle: null, href: `/competitors/${c.id}` })));
  push("external_listings", "נכסים חיצוניים", "Building2", (ext.data ?? []).map((e) => ({ id: e.id, title: e.title ?? "מודעה", subtitle: e.city, href: `/external-listings/${e.id}` })));
  push("agents", "סוכנים", "UserCheck", (agents.data ?? []).map((a) => ({ id: a.id, title: a.full_name, subtitle: a.title, href: `/team/${a.id}` })));

  return groups;
}
