/**
 * Global / universal search (server-only, READ-ONLY, org-scoped via RLS).
 * Stage 4 · Batch 4.2 — CANONICAL-FIRST: reads the search_documents projection
 * first (fuzzy Hebrew + phone + address-variant matching, role/owner-aware,
 * exact-before-fuzzy ranking, stable pagination). The legacy live multi-table
 * union runs ONLY as a fallback (projection unavailable / not yet backfilled /
 * canonical error) — never both in parallel. Result shape + Command Center
 * keyboard navigation are preserved exactly.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { prepareQuery, rankSearchDocs, type RankableDoc } from "@/lib/search-projection/rank";
import { normalizePhone } from "@/lib/search-projection/normalize";

export interface SearchHit { id: string; title: string; subtitle: string | null; href: string }
export interface SearchGroup { type: string; label: string; icon: string; hits: SearchHit[] }

/** Internal result-source diagnostics (never shown to users). */
export type SearchSource = "canonical" | "legacy_fallback";
export interface SearchResult { groups: SearchGroup[]; source: SearchSource }

const LIMIT = 6;
const esc = (s: string) => s.replace(/[%,()]/g, " ").trim();
/** Normalize Hebrew for tolerant matching: drop gershayim/quotes, collapse
 *  spaces, lowercase — so "קקל" matches "קק״ל" and "קק''ל". */
const norm = (s: string | null | undefined) =>
  (s ?? "").replace(/[׳״'"`׳״]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// Group label + icon + display order per entity_type (preserves legacy look).
const GROUP_META: Record<string, { label: string; icon: string; order: number }> = {
  property: { label: "נכסים", icon: "Building", order: 0 },
  external_listing: { label: "נכסים חיצוניים", icon: "Building2", order: 1 },
  buyer: { label: "קונים", icon: "Users", order: 2 },
  seller: { label: "מוכרים", icon: "Handshake", order: 3 },
  lead: { label: "לידים", icon: "UserPlus", order: 4 },
  deal: { label: "עסקאות", icon: "Briefcase", order: 5 },
  meeting: { label: "פגישות", icon: "Calendar", order: 6 },
  task: { label: "משימות", icon: "ListChecks", order: 7 },
  journey: { label: "מסעות לקוח", icon: "Route", order: 8 },
  document: { label: "מסמכים", icon: "FileText", order: 9 },
  agent: { label: "סוכנים", icon: "UserCheck", order: 10 },
};

/**
 * The public entry point — signature unchanged (globalSearchAction relies on it).
 * Canonical-first; legacy only on fallback. Returns just the groups.
 */
export async function searchEverything(query: string): Promise<SearchGroup[]> {
  return (await searchWithSource(query)).groups;
}

/**
 * Canonical-first orchestrator with internal source diagnostics. Never runs both
 * paths in parallel: legacy fires ONLY when canonical reports a fallback.
 */
export async function searchWithSource(query: string): Promise<SearchResult> {
  const canonical = await searchCanonical(query);
  if (canonical.ok) return { groups: canonical.groups, source: "canonical" };
  console.debug(`[search] canonical fallback → legacy (${canonical.reason})`);
  const groups = await searchLegacy(query);
  return { groups, source: "legacy_fallback" };
}

// ── Canonical projection read (search_documents) ─────────────────────────────
type CanonicalResult =
  | { ok: true; groups: SearchGroup[] }
  | { ok: false; reason: "table_unavailable" | "backfill_incomplete" | "error" | "unauthorized" };

const isMissingTable = (m: string) => /does not exist|schema cache|could not find the table/i.test(m);

async function searchCanonical(query: string): Promise<CanonicalResult> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { ok: false, reason: "unauthorized" };
  const orgId = profile.org_id;
  const raw = esc(query);
  if (raw.length < 2) return { ok: true, groups: [] };

  const { folded, tokens } = prepareQuery(raw);
  const supabase = await createClient();

  // Role: managers see everything; agents see owner-null OR own rows. Applied in
  // the query BEFORE ranking (never a UI-only filter).
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { isManager = false; }

  // Broad OR candidate set: any token in the haystack, or a title/phone hit.
  const orParts: string[] = [];
  for (const t of tokens) { const e = esc(t); if (e) orParts.push(`normalized_text.ilike.%${e}%`); }
  orParts.push(`title.ilike.%${esc(raw)}%`);
  const phone = normalizePhone(raw);
  if (phone) orParts.push(`normalized_text.ilike.%${phone}%`);
  if (orParts.length === 0) return { ok: true, groups: [] };

  let q = supabase
    .from("search_documents" as never)
    .select("entity_type,entity_id,title,subtitle,normalized_text,route,source_updated_at,owner_user_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(orParts.join(","))
    .limit(200);
  if (!isManager) q = q.or(`owner_user_id.is.null,owner_user_id.eq.${user.id}`);

  const { data, error } = await q;
  if (error) return { ok: false, reason: isMissingTable(error.message) ? "table_unavailable" : "error" };

  const rows = (data as unknown as (RankableDoc & { owner_user_id: string | null })[]) ?? [];
  if (rows.length === 0) {
    // Distinguish "no match" from "not backfilled yet" with ONE cheap count.
    const { count } = await supabase
      .from("search_documents" as never)
      .select("entity_id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if ((count ?? 0) === 0) return { ok: false, reason: "backfill_incomplete" };
    return { ok: true, groups: [] }; // genuine empty — do NOT fall back
  }

  const { hits } = rankSearchDocs(rows, folded, tokens);

  // Group by entity_type (best-tier order preserved), cap per group.
  const byType = new Map<string, SearchHit[]>();
  for (const h of hits) {
    if (!GROUP_META[h.entity_type]) continue;
    const arr = byType.get(h.entity_type) ?? [];
    if (arr.length >= LIMIT) continue;
    arr.push({ id: h.entity_id, title: h.title, subtitle: h.subtitle, href: h.route as string });
    byType.set(h.entity_type, arr);
  }
  const groups: SearchGroup[] = [...byType.entries()]
    .sort((a, b) => (GROUP_META[a[0]].order - GROUP_META[b[0]].order))
    .map(([type, hh]) => ({ type, label: GROUP_META[type].label, icon: GROUP_META[type].icon, hits: hh }));

  return { ok: true, groups };
}

// ── Legacy live multi-table union (FALLBACK ONLY) ────────────────────────────
async function searchLegacy(query: string): Promise<SearchGroup[]> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return [];
  const q = esc(query);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const orgId = profile.org_id;
  const like = `%${q}%`;
  const groups: SearchGroup[] = [];

  // Property text match across all common address/name fields, at the DB level so
  // it scans the WHOLE table (not just a 400-row prefix that synced external
  // inventory could otherwise fill, hiding manually-created listings).
  const propOr = ["title", "city", "neighborhood", "formatted_address", "building_number", "description", "marketing_description"]
    .map((c) => `${c}.ilike.${like}`).join(",");

  const [propsDirect, propsManual, buyers, sellers, brokers, competitors, ext, agents] = await Promise.all([
    // (a) Whole-table, punctuation-exact match. NO explicit org filter — rely on
    //     RLS (current_org_id) exactly like the Properties list that works, so any
    //     divergence between profile.org_id and current_org_id() can't hide rows.
    supabase.from("properties").select("id,title,city,neighborhood,price,formatted_address,building_number").neq("status", "archived").or(propOr).limit(30),
    // (b) Recent listings (manual AND external-origin), newest first — fed to the
    //     gershayim/token-tolerant JS filter below. RLS-scoped (no explicit org_id),
    //     matching the working list query, so manual uploads are always included.
    supabase.from("properties").select("id,title,city,neighborhood,price,formatted_address,building_number,description,marketing_description,location").neq("status", "archived").order("created_at", { ascending: false }).limit(1000),
    supabase.from("buyers").select("id,full_name,phone").eq("org_id", orgId).or(`full_name.ilike.${like},phone.ilike.${like}`).limit(LIMIT),
    supabase.from("sellers").select("id,full_name,phone").eq("org_id", orgId).or(`full_name.ilike.${like},phone.ilike.${like}`).limit(LIMIT),
    supabase.from("broker_profiles").select("id,display_name,agency_name").eq("org_id", orgId).or(`display_name.ilike.${like},agency_name.ilike.${like}`).limit(LIMIT),
    supabase.from("competitor_profiles").select("id,display_name").eq("organization_id", orgId).ilike("display_name", like).limit(LIMIT),
    supabase.from("external_listings").select("id,title,city").eq("org_id", orgId).or(`title.ilike.${like},city.ilike.${like}`).limit(LIMIT),
    supabase.from("users").select("id,full_name,title").eq("org_id", orgId).ilike("full_name", like).limit(LIMIT),
  ]);

  const push = (type: string, label: string, icon: string, hits: SearchHit[]) => { if (hits.length) groups.push({ type, label, icon, hits }); };

  // Surface any properties-query failure (e.g. RLS / missing column) instead of
  // silently returning zero manual properties while external listings still work.
  if (propsDirect.error) console.error("[search] properties (direct) query failed:", propsDirect.error.message);
  if (propsManual.error) console.error("[search] properties (scan) query failed:", propsManual.error.message);

  // Token-AND, gershayim-tolerant match over the property's combined text — every
  // word in the query must appear somewhere (title/city/neighborhood/address/
  // building/description/location JSON). So "קקל 54" matches the title
  // "קקל 54 קרית ביאליק", and word order / extra words never block a hit.
  const qn = norm(q);
  const tokens = qn.split(/\s+/).filter((t) => t.length >= 1);
  const jsMatched = (propsManual.data ?? []).filter((p) => {
    const locText = p.location ? JSON.stringify(p.location) : null;
    const hay = norm([p.title, p.city, p.neighborhood, p.formatted_address, p.building_number, p.description, p.marketing_description, locText].filter(Boolean).join(" "));
    return tokens.every((t) => hay.includes(t));
  });
  // Merge whole-table exact matches + tolerant manual matches, dedup by id.
  const propsById = new Map<string, { id: string; title: string | null; city: string | null; neighborhood: string | null; price: number | null }>();
  for (const p of [...(propsDirect.data ?? []), ...jsMatched]) propsById.set(p.id, p);
  const matchedProps = [...propsById.values()].slice(0, LIMIT);
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
