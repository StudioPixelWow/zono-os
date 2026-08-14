// ============================================================================
// ZONO Office Website — CANONICAL public site data (server-only, service-role).
// ----------------------------------------------------------------------------
// ONE assembler for the canonical /site/[slug] premium OFFICE template. Resolves
// the office (org) from the slug, pulls ONLY public-safe data, resolves the
// office brand into design tokens (reusing the agent-site brand engine), and
// shapes every section — with the RELATIONSHIPS the office site is built on:
//   · Property → handling Agent (owner)         (spec §14/§15/§45)
//   · Testimonial → Agent (client_reviews.agent_id)   (spec §8/§10/§37)
//   · Team (Agents) → their public /agent/[slug] profile (spec §6/§7)
// No CRM notes, leads, commissions or secrets ever enter the payload (§38).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveEffectiveBrand } from "@/lib/brand-identity/engine";
import { buildBrandTokens, waLink } from "@/lib/agent-website/brand-tokens";
import { isSiteTheme, type SiteTheme } from "@/lib/brokerage-site/branding";

// ── Public-safe shapes ───────────────────────────────────────────────────────
export interface OfficeAgentRef {
  id: string;
  name: string;
  photo: string | null;
  href: string | null; // /agent/[slug] when they have a published site, else null
}

export interface OfficeProperty {
  id: string;
  title: string;
  price: number | null;
  monthlyRent: number | null;
  listingKind: string | null;
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  type: string;
  status: string;
  image: string | null;
  tag: string | null;
  lat: number | null;
  lng: number | null;
  href: string;
  agent: OfficeAgentRef | null; // handling agent (owner)
}

export interface OfficeTeamMember {
  id: string;
  name: string;
  title: string | null;
  photo: string | null;
  phone: string | null;
  whatsapp: string | null; // wa.me url
  areas: string[];
  specialties: string[];
  activeProperties: number;
  href: string | null; // /agent/[slug]
}

export interface OfficeStat { value: string; label: string }
export interface OfficeArea { name: string; properties: number; agents: number }
export interface OfficeTestimonial {
  name: string;
  text: string;
  rating: number | null;
  area: string | null;
  agent: OfficeAgentRef | null; // linked agent (integrity: never mis-attributed)
}

export interface OfficeSitePayload {
  slug: string;
  theme: SiteTheme;
  brand: { tokens: Record<string, string>; primary: string; onPrimary: string; hasBrandColor: boolean; logo: string | null };
  office: {
    name: string; tagline: string | null; description: string | null;
    cover: string | null; phone: string | null; whatsapp: string | null; tel: string | null;
    email: string | null; address: string | null; hours: string | null; social: Record<string, string>;
  };
  sections: Record<string, boolean>;
  proofPoints: OfficeStat[];
  stats: OfficeStat[];
  team: OfficeTeamMember[];
  featured: OfficeProperty[];
  recommended: OfficeProperty[];
  mapPoints: OfficeProperty[];
  areas: OfficeArea[];
  testimonials: OfficeTestimonial[];
}

const PUBLIC_STATUSES = ["active", "published", "under_offer"] as const;
const LISTING_TAG_LABEL: Record<string, string> = { new: "חדש", exclusive: "בלעדיות", opportunity: "הזדמנות", premium: "פרימיום", price_drop: "ירידת מחיר", hot: "חם" };
const TAG_BY_STATUS: Record<string, string> = { under_offer: "בבלעדיות", sold: "נמכר", rented: "הושכר" };
const TAG_BY_LISTING: Record<string, string> = { sale: "למכירה", rent: "להשכרה" };

interface RawProp {
  id: string; title: string | null; price: number | null; monthly_rent: number | null; listing_kind: string | null;
  city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; floor: number | null;
  type: string; status: string; primary_image_url: string | null; latitude: number | null; longitude: number | null;
  listing_tag: string | null; has_exclusivity: boolean | null; owner_id: string | null; created_at: string;
}

const propTag = (p: RawProp): string | null =>
  p.has_exclusivity ? "בלעדיות"
    : (p.listing_tag && p.listing_tag !== "none" ? LISTING_TAG_LABEL[p.listing_tag] ?? null : null)
    ?? TAG_BY_STATUS[p.status]
    ?? (p.listing_kind ? TAG_BY_LISTING[p.listing_kind] ?? null : null);

/** Canonical public payload for the office site. "disabled" when unpublished, null when unknown. */
export async function getOfficeSite(
  slug: string,
  opts: { previewForOwner?: boolean } = {},
): Promise<OfficeSitePayload | "disabled" | null> {
  if (!slug) return null;
  const admin = createServiceRoleClient();
  const { data: siteRow } = await admin.from("office_websites").select("*").eq("slug", slug).maybeSingle();
  if (!siteRow) return null;
  const s = siteRow as Record<string, unknown> & { id: string; organization_id: string; status: string };
  // Owner draft preview: a signed-in viewer from this office's org can see the
  // unpublished draft (via ?preview); everyone else gets the "not active" page.
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
  const orgId = s.organization_id;

  const [propsR, usersR, agentSitesR, officeBrandR, reviewsR, txnR, orgR] = await Promise.all([
    admin.from("properties")
      .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,owner_id,created_at")
      .eq("org_id", orgId).in("status", [...PUBLIC_STATUSES] as never).order("created_at", { ascending: false }).limit(200),
    admin.from("users").select("id,full_name,title,phone,avatar_url,status,operating_neighborhoods,property_types").eq("org_id", orgId).eq("status", "active").limit(60),
    admin.from("agent_websites").select("user_id,slug,status,display_name,title_hebrew,profile_image_url,whatsapp,phone,service_areas,specialties").eq("organization_id", orgId),
    admin.from("brand_identity_profiles").select("*").eq("org_id", orgId).eq("entity_id", orgId).maybeSingle(),
    admin.from("client_reviews").select("agent_id,reviewer_name,rating,review_text,city,neighborhood,is_featured,quality_score,status,created_at").eq("organization_id", orgId).order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(24),
    admin.from("property_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin.from("organizations").select("name,city").eq("id", orgId).maybeSingle(),
  ]);

  // Per-agent brand-identity photos (real headshots). Preferred over the
  // agent_websites profile image, which can be a stock placeholder — mirrors the
  // agent site's resolution so a person shows the SAME photo everywhere.
  const { data: agentBrandRows } = await admin.from("brand_identity_profiles").select("entity_id,profile_image_url").eq("org_id", orgId);
  const agentPhotoByUser = new Map(((agentBrandRows ?? []) as { entity_id: string; profile_image_url: string | null }[]).map((r) => [r.entity_id, r.profile_image_url ?? null]));

  // ── Brand → tokens (office colors from brand_identity, office_websites fallback) ─
  const officeBrand = (officeBrandR.data ?? null) as Record<string, unknown> | null;
  const effective = resolveEffectiveBrand(null, officeBrand);
  const officeThemeColors = {
    brand_primary: (officeBrand?.brand_primary as string | null) ?? ((s.theme as { accent?: string } | null)?.accent ?? null),
    brand_secondary: officeBrand?.brand_secondary ?? null,
    brand_accent: officeBrand?.brand_accent ?? null,
  };
  const tokens = buildBrandTokens({
    primary: (officeThemeColors.brand_primary as string | null) ?? effective.primary,
    secondary: officeThemeColors.brand_secondary as string | null,
    accent: officeThemeColors.brand_accent as string | null,
    logo: (s.logo_url as string | null) ?? effective.logo,
    profileImage: null,
  });
  const themeRaw = (s.theme as { preset?: unknown } | null)?.preset;
  const theme: SiteTheme = isSiteTheme(themeRaw) ? themeRaw : "luxury-light";

  // ── Team + agent lookup maps (for property→agent + team section) ────────────
  interface RawUser { id: string; full_name: string | null; title: string | null; phone: string | null; avatar_url: string | null; operating_neighborhoods: string[] | null; property_types: string[] | null }
  interface RawSite { user_id: string; slug: string | null; status: string; display_name: string | null; title_hebrew: string | null; profile_image_url: string | null; whatsapp: string | null; phone: string | null; service_areas: string[] | null; specialties: string[] | null }
  const users = (usersR.data ?? []) as RawUser[];
  const sites = (agentSitesR.data ?? []) as RawSite[];
  const siteByUser = new Map(sites.map((a) => [a.user_id, a]));
  const publishedSlug = (uid: string): string | null => { const a = siteByUser.get(uid); return a && a.status === "published" && a.slug ? a.slug : null; };

  const rawProps = (propsR.data ?? []) as RawProp[];
  const propCountByOwner = new Map<string, number>();
  for (const p of rawProps) if (p.owner_id) propCountByOwner.set(p.owner_id, (propCountByOwner.get(p.owner_id) ?? 0) + 1);

  const agentRef = (uid: string | null): OfficeAgentRef | null => {
    if (!uid) return null;
    const u = users.find((x) => x.id === uid); const site = siteByUser.get(uid);
    const name = site?.display_name || u?.full_name; if (!name) return null;
    const slug = publishedSlug(uid);
    return { id: uid, name, photo: agentPhotoByUser.get(uid) ?? site?.profile_image_url ?? u?.avatar_url ?? null, href: slug ? `/agent/${slug}` : null };
  };

  const team: OfficeTeamMember[] = users.map((u) => {
    const site = siteByUser.get(u.id);
    const areas = (site?.service_areas?.length ? site.service_areas : (u.operating_neighborhoods ?? [])).filter(Boolean);
    const specialties = (site?.specialties ?? []).filter(Boolean);
    const slug = publishedSlug(u.id);
    return {
      id: u.id,
      name: site?.display_name || u.full_name || "סוכן/ת",
      title: site?.title_hebrew || u.title || 'יועץ נדל"ן',
      photo: agentPhotoByUser.get(u.id) ?? site?.profile_image_url ?? u.avatar_url ?? null,
      phone: site?.phone ?? u.phone ?? null,
      whatsapp: waLink(site?.whatsapp ?? null, site?.phone ?? u.phone ?? null),
      areas: areas.slice(0, 3),
      specialties: specialties.slice(0, 3),
      activeProperties: propCountByOwner.get(u.id) ?? 0,
      href: slug ? `/agent/${slug}` : null,
    };
  }).sort((a, b) => b.activeProperties - a.activeProperties);

  // ── Properties (with handling agent) ────────────────────────────────────────
  const toProp = (p: RawProp): OfficeProperty => ({
    id: p.id, title: p.title || [p.neighborhood, p.city].filter(Boolean).join(" · ") || "נכס",
    price: p.price, monthlyRent: p.monthly_rent, listingKind: p.listing_kind, city: p.city, neighborhood: p.neighborhood,
    rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor, type: p.type, status: p.status, image: p.primary_image_url, tag: propTag(p),
    lat: typeof p.latitude === "number" ? p.latitude : null, lng: typeof p.longitude === "number" ? p.longitude : null,
    href: `/p/${p.id}`, agent: agentRef(p.owner_id),
  });
  const all = rawProps.map(toProp);
  const featuredIds = (s.featured_property_ids as string[] | undefined) ?? [];
  const featured = (featuredIds.length ? all.filter((p) => featuredIds.includes(p.id)) : all).slice(0, 8);
  const featuredSet = new Set(featured.map((p) => p.id));
  const recommended = all.filter((p) => !featuredSet.has(p.id)).slice(0, 4);
  const mapPoints = all.filter((p) => p.lat != null && p.lng != null);

  // ── Areas (property inventory + agents per area) ────────────────────────────
  const areaAgg = new Map<string, { properties: number; agents: Set<string> }>();
  for (const p of rawProps) {
    const k = p.neighborhood || p.city; if (!k) continue;
    const e = areaAgg.get(k) ?? { properties: 0, agents: new Set<string>() };
    e.properties++; if (p.owner_id) e.agents.add(p.owner_id); areaAgg.set(k, e);
  }
  const areas: OfficeArea[] = Array.from(areaAgg.entries())
    .map(([name, e]) => ({ name, properties: e.properties, agents: e.agents.size }))
    .sort((a, b) => b.properties - a.properties).slice(0, 8);

  // ── Testimonials → agent (client_reviews; jsonb fallback) ───────────────────
  interface RawReview { agent_id: string | null; reviewer_name: string | null; rating: number | null; review_text: string | null; city: string | null; neighborhood: string | null; status: string | null }
  const reviews = ((reviewsR.data ?? []) as RawReview[]).filter((r) => r.review_text && (r.status ?? "published") !== "rejected");
  let testimonials: OfficeTestimonial[] = reviews.slice(0, 8).map((r) => ({
    name: r.reviewer_name || "לקוח/ה",
    text: r.review_text as string,
    rating: r.rating ?? null,
    area: r.neighborhood || r.city || null,
    agent: agentRef(r.agent_id),
  }));
  if (!testimonials.length) {
    const jsonb = ((s.testimonials as { name?: string; text: string; rating?: number }[] | undefined) ?? []).filter((t) => t && t.text);
    testimonials = jsonb.slice(0, 8).map((t) => ({ name: t.name || "לקוח/ה", text: t.text, rating: t.rating ?? null, area: null, agent: null }));
  }

  // ── Stats / proof points (real only) ────────────────────────────────────────
  const activeCount = all.length;
  const agentCount = team.length;
  const txnCount = txnR.count ?? 0;
  const foundingYear = (s.founding_year as number | null) ?? null;
  const years = foundingYear ? new Date().getFullYear() - foundingYear : null;

  const stats: OfficeStat[] = [];
  if (activeCount) stats.push({ value: `${activeCount}`, label: "נכסים פעילים" });
  if (txnCount) stats.push({ value: `${txnCount}+`, label: "עסקאות" });
  if (agentCount) stats.push({ value: `${agentCount}`, label: "סוכנים בצוות" });
  if (areas.length) stats.push({ value: `${areas.length}`, label: "אזורי פעילות" });
  if (years && years > 0) stats.push({ value: `${years}`, label: "שנות פעילות" });

  const proofPoints = stats.slice(0, 4);

  // ── Office identity ─────────────────────────────────────────────────────────
  const name = (s.office_name as string) || (orgR.data as { name?: string } | null)?.name || effective.officeName || "משרד תיווך";
  const phone = (s.phone as string | null) ?? effective.phone;

  return {
    slug,
    theme,
    brand: { tokens: tokens.vars, primary: tokens.primary, onPrimary: tokens.onPrimary, hasBrandColor: tokens.hasBrandColor, logo: tokens.logo },
    office: {
      name,
      tagline: (s.headline_hebrew as string | null) ?? null,
      description: (s.description_hebrew as string | null) ?? null,
      cover: (s.cover_image_url as string | null) ?? null,
      phone,
      whatsapp: waLink((s.whatsapp as string | null) ?? null, phone),
      tel: phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : null,
      email: (s.email as string | null) ?? null,
      address: (s.address as string | null) ?? (orgR.data as { city?: string | null } | null)?.city ?? null,
      hours: (s.office_hours as string | null) ?? null,
      social: ((s.social_links as Record<string, string> | undefined) ?? {}),
    },
    sections: (s.enabled_sections as Record<string, boolean>) ?? {},
    proofPoints,
    stats,
    team,
    featured,
    recommended,
    mapPoints,
    areas,
    testimonials,
  };
}

// ── Filtered listing for /site/[slug]/properties ─────────────────────────────
export interface OfficePropertyFilters { q?: string; area?: string; type?: string; min?: string; max?: string; rooms?: string }
export interface OfficeListingView { slug: string; brandVars: Record<string, string>; officeName: string; logo: string | null; properties: OfficeProperty[] }

export async function getOfficeListing(slug: string, filters: OfficePropertyFilters = {}): Promise<OfficeListingView | "disabled" | null> {
  const full = await getOfficeSite(slug);
  if (full === null || full === "disabled") return full;
  // getOfficeSite caps featured/recommended; re-derive the full filtered set from map+featured+recommended union is lossy,
  // so re-query all public properties for the listing (with agent refs already attached via getOfficeSite's map is not reused).
  const admin = createServiceRoleClient();
  const { data: siteRow } = await admin.from("office_websites").select("organization_id,office_name,logo_url").eq("slug", slug).maybeSingle();
  const org = (siteRow as { organization_id: string; office_name: string | null; logo_url: string | null } | null);
  if (!org) return null;
  const { data } = await admin.from("properties")
    .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,owner_id,created_at")
    .eq("org_id", org.organization_id).in("status", [...PUBLIC_STATUSES] as never).order("created_at", { ascending: false }).limit(300);

  // Reuse the agent-ref map from the full payload's team.
  const agentById = new Map(full.team.map((m) => [m.id, { id: m.id, name: m.name, photo: m.photo, href: m.href } as OfficeAgentRef]));
  let properties: OfficeProperty[] = ((data ?? []) as RawProp[]).map((p) => ({
    id: p.id, title: p.title || [p.neighborhood, p.city].filter(Boolean).join(" · ") || "נכס",
    price: p.price, monthlyRent: p.monthly_rent, listingKind: p.listing_kind, city: p.city, neighborhood: p.neighborhood,
    rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor, type: p.type, status: p.status, image: p.primary_image_url, tag: propTag(p),
    lat: typeof p.latitude === "number" ? p.latitude : null, lng: typeof p.longitude === "number" ? p.longitude : null,
    href: `/p/${p.id}`, agent: p.owner_id ? agentById.get(p.owner_id) ?? null : null,
  }));

  const q = filters.q?.trim().toLowerCase();
  if (q) properties = properties.filter((p) => [p.title, p.city, p.neighborhood].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q)));
  if (filters.area) properties = properties.filter((p) => p.city === filters.area || p.neighborhood === filters.area);
  if (filters.type) properties = properties.filter((p) => p.type === filters.type);
  const min = Number(filters.min), max = Number(filters.max), rooms = Number(filters.rooms);
  if (Number.isFinite(min) && min > 0) properties = properties.filter((p) => (p.price ?? p.monthlyRent ?? 0) >= min);
  if (Number.isFinite(max) && max > 0) properties = properties.filter((p) => (p.price ?? p.monthlyRent ?? Infinity) <= max);
  if (Number.isFinite(rooms) && rooms > 0) properties = properties.filter((p) => (p.rooms ?? 0) >= rooms);

  return { slug, brandVars: full.brand.tokens, officeName: full.office.name, logo: full.brand.logo, properties };
}
