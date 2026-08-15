// ============================================================================
// ZONO Agent Website — CANONICAL public site data (server-only, service-role).
// ----------------------------------------------------------------------------
// ONE assembler for the canonical /agent/[slug] premium template. Resolves the
// agent + org from the slug, pulls ONLY public-safe data, resolves the effective
// brand (office colors + agent overrides) into design tokens, and shapes every
// section the reference layout needs — each as a data-driven block the template
// renders / falls back / hides. No CRM notes, leads, commissions or secrets ever
// enter the payload (spec §30). AI copy is a capability folded in here, not a
// separate route (consolidation: /ai-agent → /agent).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveEffectiveBrand } from "@/lib/brand-identity/engine";
import { buildBrandTokens, waLink, type BrandTokens } from "./brand-tokens";
import { deriveBrandColorFromLogo } from "@/lib/office-website/logo-brand-color";
import { isSiteTheme, type SiteTheme } from "@/lib/brokerage-site/branding";

// ── Public-safe shapes ───────────────────────────────────────────────────────
export interface SiteProperty {
  id: string;
  title: string;
  price: number | null;
  monthlyRent: number | null;
  listingKind: string | null; // sale | rent
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  type: string;
  status: string;
  image: string | null;
  tag: string | null; // badge label (חדש / בלעדיות / למכירה / להשכרה …)
  lat: number | null;
  lng: number | null;
  href: string;
}

export interface SiteArea {
  name: string;
  deals: number | null;
  inventory: number; // active listings the agent has in this area
}

export interface SiteStat { value: string; label: string }

export interface AgentSitePayload {
  slug: string;
  theme: SiteTheme;
  brand: {
    tokens: Record<string, string>;
    primary: string;
    onPrimary: string;
    hasBrandColor: boolean;
    logo: string | null;
    profileImage: string | null;
  };
  agent: {
    name: string;
    firstName: string;
    title: string | null;
    headline: string | null;
    valueProp: string | null;
    bio: string | null;
    cover: string | null;
    phone: string | null;
    whatsapp: string | null; // wa.me url (safe) or null
    tel: string | null; // tel: number or null
    email: string | null;
    yearsExperience: number | null;
    languages: string[];
    specialties: string[];
    areas: string[];
    social: Record<string, string>;
    officeName: string | null;
    officeAddress: string | null;
  };
  sections: Record<string, boolean>;
  proofPoints: SiteStat[]; // small hero proof points (only real data)
  stats: SiteStat[]; // big trust-numbers strip (only real data)
  featured: SiteProperty[];
  recommended: SiteProperty[]; // second discovery — excludes featured
  allProperties: SiteProperty[]; // full public inventory (featured-first) for live in-page filtering
  mapPoints: SiteProperty[]; // geocoded subset for the expertise map
  areas: SiteArea[];
  testimonials: { name: string; area: string | null; text: string; rating: number | null }[];
}

const PUBLIC_STATUSES = ["active", "published", "under_offer"] as const;

const TAG_BY_STATUS: Record<string, string> = { under_offer: "בבלעדיות", sold: "נמכר", rented: "הושכר" };
const TAG_BY_LISTING: Record<string, string> = { sale: "למכירה", rent: "להשכרה" };

interface RawProp {
  id: string; title: string | null; price: number | null; monthly_rent: number | null; listing_kind: string | null;
  city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; floor: number | null;
  type: string; status: string; primary_image_url: string | null; latitude: number | null; longitude: number | null;
  listing_tag: string | null; has_exclusivity: boolean | null; created_at: string;
}

function toProperty(slug: string, p: RawProp): SiteProperty {
  const loc = [p.neighborhood, p.city].filter(Boolean).join(" · ");
  const tag = p.has_exclusivity ? "בלעדיות"
    : (p.listing_tag && p.listing_tag !== "none" ? LISTING_TAG_LABEL[p.listing_tag] ?? null : null)
    ?? TAG_BY_STATUS[p.status]
    ?? (p.listing_kind ? TAG_BY_LISTING[p.listing_kind] ?? null : null);
  return {
    id: p.id, title: p.title || loc || "נכס", price: p.price, monthlyRent: p.monthly_rent, listingKind: p.listing_kind,
    city: p.city, neighborhood: p.neighborhood, rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor,
    type: p.type, status: p.status, image: p.primary_image_url, tag,
    lat: typeof p.latitude === "number" ? p.latitude : null,
    lng: typeof p.longitude === "number" ? p.longitude : null,
    href: `/p/${p.id}`,
  };
}

const LISTING_TAG_LABEL: Record<string, string> = {
  new: "חדש", exclusive: "בלעדיות", opportunity: "הזדמנות", premium: "פרימיום", price_drop: "ירידת מחיר", hot: "חם",
};

const firstNameOf = (full: string): string => full.trim().split(/\s+/)[0] || full;

export interface PropertyFilters { q?: string; area?: string; type?: string; min?: string; max?: string; rooms?: string }

export interface AgentListingView {
  slug: string;
  theme: SiteTheme;
  brandVars: Record<string, string>;
  agentName: string;
  officeName: string | null;
  logo: string | null;
  whatsapp: string | null;
  tel: string | null;
  properties: SiteProperty[];
}

/** Branded, filtered property listing for /agent/[slug]/properties. Reuses the
 *  same brand resolution + public-safe property shaping as the home template. */
export async function getAgentListing(slug: string, filters: PropertyFilters = {}): Promise<AgentListingView | "disabled" | null> {
  if (!slug) return null;
  const admin = createServiceRoleClient();
  const { data: siteRow } = await admin.from("agent_websites").select("*").eq("slug", slug).maybeSingle();
  if (!siteRow) return null;
  const s = siteRow as Record<string, unknown> & { id: string; organization_id: string; user_id: string; status: string };
  if (s.status !== "published") return "disabled";
  const orgId = s.organization_id, agentId = s.user_id;

  const [propsR, agentBrandR, officeBrandR, orgR] = await Promise.all([
    admin.from("properties")
      .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,created_at")
      .eq("org_id", orgId).eq("owner_id", agentId).in("status", [...PUBLIC_STATUSES] as never)
      .order("created_at", { ascending: false }).limit(200),
    admin.from("brand_identity_profiles").select("*").eq("org_id", orgId).eq("entity_id", agentId).maybeSingle(),
    admin.from("brand_identity_profiles").select("*").eq("org_id", orgId).eq("entity_id", orgId).maybeSingle(),
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);

  const effective = resolveEffectiveBrand((agentBrandR.data ?? null) as Record<string, unknown> | null, (officeBrandR.data ?? null) as Record<string, unknown> | null);
  const derivedPrimary = effective.primary ? null : await deriveBrandColorFromLogo(effective.logo);
  const tokens = buildBrandTokens({ primary: effective.primary ?? derivedPrimary, secondary: effective.secondary, accent: effective.accent, logo: effective.logo, profileImage: effective.profileImage ?? (s.profile_image_url as string | null) });
  const themeRaw = (s.theme as { preset?: unknown } | null)?.preset;

  let properties = ((propsR.data ?? []) as RawProp[]).map((p) => toProperty(slug, p));

  // Apply public-safe filters (all data-driven; no fabricated results).
  const q = filters.q?.trim().toLowerCase();
  if (q) properties = properties.filter((p) => [p.title, p.city, p.neighborhood].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q)));
  if (filters.area) properties = properties.filter((p) => p.city === filters.area || p.neighborhood === filters.area);
  if (filters.type) properties = properties.filter((p) => p.type === filters.type);
  const min = Number(filters.min), max = Number(filters.max), rooms = Number(filters.rooms);
  if (Number.isFinite(min) && min > 0) properties = properties.filter((p) => (p.price ?? p.monthlyRent ?? 0) >= min);
  if (Number.isFinite(max) && max > 0) properties = properties.filter((p) => (p.price ?? p.monthlyRent ?? Infinity) <= max);
  if (Number.isFinite(rooms) && rooms > 0) properties = properties.filter((p) => (p.rooms ?? 0) >= rooms);

  return {
    slug,
    theme: isSiteTheme(themeRaw) ? themeRaw : "luxury-light",
    brandVars: tokens.vars,
    agentName: effective.agentName || (s.display_name as string) || "סוכן/ת נדל\"ן",
    officeName: effective.officeName ?? (orgR.data as { name?: string } | null)?.name ?? null,
    logo: tokens.logo,
    whatsapp: waLink((s.whatsapp as string | null) ?? effective.whatsapp, (s.phone as string | null) ?? effective.phone),
    tel: (s.phone as string | null) ? `tel:${((s.phone as string) ?? "").replace(/[^0-9+]/g, "")}` : null,
    properties,
  };
}

/**
 * Canonical public payload for the agent site. Returns "disabled" for an
 * unpublished site and null when the slug resolves to nothing.
 */
export async function getAgentSite(
  slug: string,
  opts: { previewForOwner?: boolean } = {},
): Promise<AgentSitePayload | "disabled" | null> {
  if (!slug) return null;
  const admin = createServiceRoleClient();
  const { data: siteRow } = await admin.from("agent_websites").select("*").eq("slug", slug).maybeSingle();
  if (!siteRow) return null;
  const s = siteRow as Record<string, unknown> & { id: string; organization_id: string; user_id: string; status: string };
  // Owner draft preview (via ?preview): a signed-in viewer from this agent's org
  // can see the unpublished draft; everyone else gets the "not active" page.
  if (s.status !== "published") {
    let allowed = false;
    if (opts.previewForOwner) {
      try {
        const { getSessionContext } = await import("@/lib/auth/session");
        const { profile } = await getSessionContext();
        allowed = !!profile && profile.org_id === s.organization_id;
      } catch { /* not signed in → not allowed */ }
    }
    if (!allowed) return "disabled";
  }
  const orgId = s.organization_id, agentId = s.user_id;

  const [propsR, agentBrandR, officeBrandR, twinR, locR, soldR, orgR] = await Promise.all([
    admin.from("properties")
      .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,created_at")
      .eq("org_id", orgId).eq("owner_id", agentId).in("status", [...PUBLIC_STATUSES] as never)
      .order("created_at", { ascending: false }).limit(48),
    admin.from("brand_identity_profiles").select("*").eq("org_id", orgId).eq("entity_id", agentId).maybeSingle(),
    admin.from("brand_identity_profiles").select("*").eq("org_id", orgId).eq("entity_id", orgId).maybeSingle(),
    admin.from("agent_intelligence_profiles").select("total_closed_deals,satisfaction_score").eq("organization_id", orgId).eq("user_id", agentId).maybeSingle(),
    admin.from("agent_locality_performance").select("locality,deals_count").eq("organization_id", orgId).eq("user_id", agentId).order("deals_count", { ascending: false }).limit(8),
    admin.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("owner_id", agentId).eq("status", "sold"),
    admin.from("organizations").select("name,city").eq("id", orgId).maybeSingle(),
  ]);

  // ── Brand resolution → tokens (office colors, agent may override) ──────────
  const agentBrand = (agentBrandR.data ?? null) as Record<string, unknown> | null;
  const officeBrand = (officeBrandR.data ?? null) as Record<string, unknown> | null;
  const effective = resolveEffectiveBrand(agentBrand, officeBrand);
  // No configured brand color anywhere → adopt the logo's own dominant hue.
  const derivedPrimary = effective.primary ? null : await deriveBrandColorFromLogo(effective.logo);
  const tokens: BrandTokens = buildBrandTokens({
    primary: effective.primary ?? derivedPrimary,
    secondary: effective.secondary,
    accent: effective.accent,
    logo: effective.logo,
    // Prefer the agent's site profile image, then the brand-profile image.
    profileImage: effective.profileImage ?? (s.profile_image_url as string | null),
  });

  const themeRaw = (s.theme as { preset?: unknown } | null)?.preset;
  const theme: SiteTheme = isSiteTheme(themeRaw) ? themeRaw : "luxury-light";

  // ── Properties ────────────────────────────────────────────────────────────
  const rawProps = (propsR.data ?? []) as RawProp[];
  const all = rawProps.map((p) => toProperty(slug, p));
  const featuredIds = (s.featured_property_ids as string[] | undefined) ?? [];
  const featured = (featuredIds.length ? all.filter((p) => featuredIds.includes(p.id)) : all).slice(0, 8);
  const featuredSet = new Set(featured.map((p) => p.id));
  const recommended = all.filter((p) => !featuredSet.has(p.id)).slice(0, 4);
  const mapPoints = all.filter((p) => p.lat != null && p.lng != null);

  // ── Areas: merge locality performance with declared service areas ──────────
  const serviceAreas = ((s.service_areas as string[] | undefined) ?? []).filter(Boolean);
  const inventoryByArea = new Map<string, number>();
  for (const p of all) { const k = p.neighborhood || p.city; if (k) inventoryByArea.set(k, (inventoryByArea.get(k) ?? 0) + 1); }
  const locality = ((locR.data ?? []) as { locality: string; deals_count: number }[]);
  const areaNames = Array.from(new Set([...locality.map((l) => l.locality), ...serviceAreas]));
  const areas: SiteArea[] = areaNames.map((name) => ({
    name,
    deals: locality.find((l) => l.locality === name)?.deals_count ?? null,
    inventory: inventoryByArea.get(name) ?? 0,
  }));

  // ── Stats / proof points — ONLY real numbers (spec §13/§18) ────────────────
  const twin = (twinR.data ?? {}) as { total_closed_deals?: number; satisfaction_score?: number };
  const soldCount = soldR.count ?? 0;
  const years = (s.years_experience as number | null) ?? (typeof agentBrand?.years_experience === "number" ? (agentBrand.years_experience as number) : null);
  const testimonials = (((s.testimonials as { name: string; area?: string | null; text: string; rating?: number | null }[] | undefined) ?? [])
    .filter((t) => t && t.text)).slice(0, 6)
    .map((t) => ({ name: t.name, area: t.area ?? null, text: t.text, rating: t.rating ?? null }));

  const stats: SiteStat[] = [];
  if (twin.total_closed_deals) stats.push({ value: `${twin.total_closed_deals}+`, label: "עסקאות שבוצעו" });
  if (soldCount) stats.push({ value: `${soldCount}+`, label: "נכסים שנמכרו" });
  if (twin.satisfaction_score) stats.push({ value: `${twin.satisfaction_score}%`, label: "שביעות רצון לקוחות" });
  if (years) stats.push({ value: `${years}`, label: "שנות ניסיון" });

  const proofPoints: SiteStat[] = [];
  if (years) proofPoints.push({ value: `${years}`, label: "שנות ניסיון" });
  if (twin.total_closed_deals) proofPoints.push({ value: `${twin.total_closed_deals}+`, label: "עסקאות" });
  if (soldCount) proofPoints.push({ value: `${soldCount}+`, label: "נמכרו" });
  else if (all.length) proofPoints.push({ value: `${all.length}`, label: "נכסים פעילים" });

  // ── Agent identity — brand-identity profile is the canonical source of truth
  //    (real curated name/title/photo/office/contact); the agent_websites row is
  //    the fallback (it can hold onboarding placeholders). ────────────────────
  const bi = (k: string): string | null => { const v = agentBrand?.[k]; return typeof v === "string" && v.trim() ? v.trim() : null; };
  const biNum = (k: string): number | null => { const v = agentBrand?.[k]; return typeof v === "number" ? v : null; };
  const name = bi("display_name") ?? bi("full_name") ?? (s.display_name as string) ?? effective.agentName ?? "סוכן/ת נדל\"ן";
  const phone = bi("phone") ?? (s.phone as string | null) ?? effective.phone;
  const whatsappRaw = bi("whatsapp") ?? (s.whatsapp as string | null) ?? effective.whatsapp;
  const areasList = serviceAreas.length ? serviceAreas : areas.map((a) => a.name).slice(0, 6);
  const headline = (s.headline_hebrew as string | null) || null;
  // Value proposition: real headline if present, else composed from real facts only.
  const valueProp = headline
    || (areasList.length ? `המומחה שלך לנדל״ן ב${areasList[0]}` : null)
    || ((s.title_hebrew as string | null) ?? null);

  return {
    slug,
    theme,
    brand: {
      tokens: tokens.vars,
      primary: tokens.primary,
      onPrimary: tokens.onPrimary,
      hasBrandColor: tokens.hasBrandColor,
      logo: tokens.logo,
      profileImage: tokens.profileImage,
    },
    agent: {
      name,
      firstName: firstNameOf(name),
      title: bi("title") ?? (s.title_hebrew as string | null) ?? null,
      headline,
      valueProp,
      bio: (s.bio_hebrew as string | null) ?? bi("short_bio") ?? null,
      cover: (s.cover_image_url as string | null) ?? null,
      phone,
      whatsapp: waLink(whatsappRaw, phone),
      tel: phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : null,
      email: bi("email") ?? (s.email as string | null) ?? null,
      yearsExperience: years ?? biNum("years_experience"),
      languages: ((s.languages as string[] | undefined) ?? []).filter(Boolean),
      specialties: ((s.specialties as string[] | undefined) ?? []).filter(Boolean),
      areas: areasList,
      social: ((s.social_links as Record<string, string> | undefined) ?? {}),
      officeName: bi("office_name") ?? (orgR.data as { name?: string } | null)?.name ?? effective.officeName ?? null,
      officeAddress: (orgR.data as { city?: string | null } | null)?.city ?? null,
    },
    sections: (s.enabled_sections as Record<string, boolean>) ?? {},
    proofPoints: proofPoints.slice(0, 3),
    stats,
    featured,
    recommended,
    allProperties: [...featured, ...all.filter((p) => !featuredSet.has(p.id))],
    mapPoints,
    areas,
    testimonials,
  };
}
