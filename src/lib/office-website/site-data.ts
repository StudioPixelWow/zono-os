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
import { deriveBrandColorFromLogo } from "./logo-brand-color";
import { isSiteTheme, type SiteTheme } from "@/lib/brokerage-site/branding";
import { resolveAgentAvatar } from "@/lib/office/avatar";
import { resolveResponsibleMemberId, memberHandle } from "./attribution";

const ROLE_TITLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: 'יועץ/ת נדל"ן' };

// ── Public-safe shapes ───────────────────────────────────────────────────────
export interface OfficeAgentRef {
  id: string;         // office_members.id
  name: string;
  photo: string | null;
  href: string | null; // /site/[slug]/agents/[memberId]
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
export interface OfficeArea { name: string; properties: number; agents: number; agentNames: string[] }
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
  team: OfficeTeamMember[];          // public office AGENTS (role != owner)
  manager: OfficeTeamMember | null;  // office manager/owner — shown separately, not the brand
  featured: OfficeProperty[];
  recommended: OfficeProperty[];
  mapPoints: OfficeProperty[];
  areas: OfficeArea[];
  recentSold: OfficeProperty[];   // public-safe closed inventory (no price/parties)
  testimonials: OfficeTestimonial[];
}

// Shared site chrome (header + footer) for every office-site page — so internal
// pages carry the SAME header/footer as the homepage.
export interface OfficeChrome {
  slug: string;
  brandVars: Record<string, string>;
  logo: string | null;
  office: { name: string; phone: string | null; whatsapp: string | null; tel: string | null; email: string | null; address: string | null; social: Record<string, string>; description: string | null };
  areas: string[];
}
function buildChrome(slug: string, full: OfficeSitePayload): OfficeChrome {
  return {
    slug, brandVars: full.brand.tokens, logo: full.brand.logo,
    office: { name: full.office.name, phone: full.office.phone, whatsapp: full.office.whatsapp, tel: full.office.tel, email: full.office.email, address: full.office.address, social: full.office.social, description: full.office.description },
    areas: full.areas.map((a) => a.name),
  };
}

const PUBLIC_STATUSES = ["active", "published", "under_offer"] as const;
const LISTING_TAG_LABEL: Record<string, string> = { new: "חדש", exclusive: "בלעדיות", opportunity: "הזדמנות", premium: "פרימיום", price_drop: "ירידת מחיר", hot: "חם" };
const TAG_BY_STATUS: Record<string, string> = { under_offer: "בבלעדיות", sold: "נמכר", rented: "הושכר" };
const TAG_BY_LISTING: Record<string, string> = { sale: "למכירה", rent: "להשכרה" };

interface RawProp {
  id: string; title: string | null; price: number | null; monthly_rent: number | null; listing_kind: string | null;
  city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; floor: number | null;
  type: string; status: string; primary_image_url: string | null; latitude: number | null; longitude: number | null;
  listing_tag: string | null; has_exclusivity: boolean | null; owner_id: string | null; office_member_id: string | null; created_at: string;
}

// A public roster member (office_members). NON-auth members are first-class here.
interface RawMember { id: string; full_name: string; role: string; specialty: string | null; avatar_url: string | null; user_id: string | null; phone: string | null; public_slug: string | null }

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

  const [propsR, membersR, usersR, officeBrandR, reviewsR, txnR, orgR] = await Promise.all([
    admin.from("properties")
      .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,owner_id,office_member_id,created_at")
      .eq("org_id", orgId).in("status", [...PUBLIC_STATUSES] as never).order("created_at", { ascending: false }).limit(200),
    // CANONICAL public team source: office_members (roster). NON-auth members are
    // included — publication is governed by show_on_website, not by an Auth login.
    admin.from("office_members" as never).select("id,full_name,role,specialty,avatar_url,user_id,phone,status,show_on_website,public_slug")
      .eq("org_id", orgId).eq("status", "active").eq("show_on_website", true).limit(60),
    admin.from("users").select("id,avatar_url").eq("org_id", orgId).eq("status", "active").limit(60),
    admin.from("brand_identity_profiles").select("*").eq("org_id", orgId).eq("entity_id", orgId).maybeSingle(),
    admin.from("client_reviews").select("agent_id,reviewer_name,rating,review_text,city,neighborhood,is_featured,quality_score,status,created_at").eq("organization_id", orgId).order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(24),
    admin.from("property_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin.from("organizations").select("name,city").eq("id", orgId).maybeSingle(),
  ]);

  // Per-agent brand-identity photos (real headshots). Preferred over the
  // agent_websites profile image, which can be a stock placeholder — mirrors the
  // agent site's resolution so a person shows the SAME photo everywhere.
  const { data: agentBrandRows } = await admin.from("brand_identity_profiles")
    .select("entity_id,entity_type,profile_image_url,brand_primary,brand_secondary,brand_accent,logo_url").eq("org_id", orgId);
  type BrandRow = { entity_id: string; entity_type: string | null; profile_image_url: string | null; brand_primary: string | null; brand_secondary: string | null; brand_accent: string | null; logo_url: string | null };
  const brandRows = (agentBrandRows ?? []) as BrandRow[];

  // ── Brand → tokens (office colors from brand_identity, office_websites fallback) ─
  // The office brand lives on the OFFICE entity (entity_id = orgId). A fresh office
  // often has none yet — but the owner set their brand on the AGENT entity (e.g.
  // Landsman gold #FBBF24). Fall back to a real in-org agent brand so the public
  // site uses the office's ACTUAL identity instead of the generic ZONO blue.
  const officeBrand = (officeBrandR.data ?? null) as Record<string, unknown> | null;
  const brandFallback = brandRows.find((r) => r.entity_id === orgId && r.brand_primary)
    ?? brandRows.find((r) => r.brand_primary)
    ?? null;
  const effective = resolveEffectiveBrand(null, officeBrand);
  const officeThemeColors = {
    brand_primary: (officeBrand?.brand_primary as string | null) ?? brandFallback?.brand_primary ?? ((s.theme as { accent?: string } | null)?.accent ?? null),
    brand_secondary: (officeBrand?.brand_secondary as string | null) ?? brandFallback?.brand_secondary ?? null,
    brand_accent: (officeBrand?.brand_accent as string | null) ?? brandFallback?.brand_accent ?? null,
  };
  const configuredPrimary = officeThemeColors.brand_primary as string | null;
  const logoUrl = (s.logo_url as string | null) ?? brandFallback?.logo_url ?? effective.logo;
  // Last resort before the generic default: when NO brand color is configured
  // anywhere, adopt the office logo's own dominant hue (a gold logo → a gold
  // site). Nothing hardcoded per tenant; best-effort with safe neutral fallback.
  const derivedPrimary = configuredPrimary ? null : await deriveBrandColorFromLogo(logoUrl);
  const tokens = buildBrandTokens({
    primary: configuredPrimary ?? derivedPrimary ?? effective.primary,
    secondary: officeThemeColors.brand_secondary as string | null,
    accent: officeThemeColors.brand_accent as string | null,
    logo: logoUrl,
    profileImage: null,
  });
  const themeRaw = (s.theme as { preset?: unknown } | null)?.preset;
  const theme: SiteTheme = isSiteTheme(themeRaw) ? themeRaw : "luxury-light";

  // ── Roster (office_members) → team + property/agent resolution ──────────────
  interface RawUser { id: string; avatar_url: string | null }
  const users = (usersR.data ?? []) as RawUser[];
  const userAvatar = new Map(users.map((u) => [u.id, u.avatar_url ?? null]));  // linked-user avatar fallback

  const members = (membersR.data ?? []) as RawMember[];
  const memberById = new Map(members.map((m) => [m.id, m]));
  const publicMemberIds = new Set(members.map((m) => m.id));
  const memberIdByUserId = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.id]));
  const memberAvatar = (m: RawMember): string | null =>
    resolveAgentAvatar({ avatarUrl: m.avatar_url, linkedUserAvatarUrl: m.user_id ? userAvatar.get(m.user_id) ?? null : null });
  const agentHref = (m: RawMember) => `/site/${slug}/agents/${memberHandle(m)}`;

  // Responsible PUBLIC member: office_member_id → legacy owner → null (pure helper).
  const resolveMemberId = (p: { office_member_id: string | null; owner_id: string | null }): string | null =>
    resolveResponsibleMemberId(p, publicMemberIds, memberIdByUserId);
  const memberRef = (memberId: string | null): OfficeAgentRef | null => {
    if (!memberId) return null; const m = memberById.get(memberId); if (!m) return null;
    return { id: m.id, name: m.full_name, photo: memberAvatar(m), href: agentHref(m) };
  };

  const rawProps = (propsR.data ?? []) as unknown as RawProp[];
  const propCountByMember = new Map<string, number>();
  const areasByMember = new Map<string, Set<string>>();
  for (const p of rawProps) {
    const mid = resolveMemberId(p); if (!mid) continue;
    propCountByMember.set(mid, (propCountByMember.get(mid) ?? 0) + 1);
    const k = p.neighborhood || p.city;
    if (k) { const set = areasByMember.get(mid) ?? new Set<string>(); set.add(k); areasByMember.set(mid, set); }
  }

  const toTeamMember = (m: RawMember): OfficeTeamMember => ({
    id: m.id,
    name: m.full_name,
    title: m.specialty || ROLE_TITLE_HE[m.role] || 'יועץ/ת נדל"ן',
    photo: memberAvatar(m),
    phone: m.phone ?? null,
    whatsapp: waLink(null, m.phone ?? null),
    areas: [...(areasByMember.get(m.id) ?? [])].slice(0, 3),
    specialties: m.specialty ? [m.specialty] : [],
    activeProperties: propCountByMember.get(m.id) ?? 0,
    href: agentHref(m),
  });
  // Team = public AGENTS only; the manager/owner is presented separately so no
  // single person becomes the office brand. Sorted by inventory, but ALL show.
  const team: OfficeTeamMember[] = members.filter((m) => m.role !== "owner").map(toTeamMember)
    .sort((a, b) => b.activeProperties - a.activeProperties);
  const managerMember = members.find((m) => m.role === "owner") ?? null;
  const manager: OfficeTeamMember | null = managerMember ? toTeamMember(managerMember) : null;

  // ── Properties (with responsible agent) ─────────────────────────────────────
  const toProp = (p: RawProp): OfficeProperty => ({
    id: p.id, title: p.title || [p.neighborhood, p.city].filter(Boolean).join(" · ") || "נכס",
    price: p.price, monthlyRent: p.monthly_rent, listingKind: p.listing_kind, city: p.city, neighborhood: p.neighborhood,
    rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor, type: p.type, status: p.status, image: p.primary_image_url, tag: propTag(p),
    lat: typeof p.latitude === "number" ? p.latitude : null, lng: typeof p.longitude === "number" ? p.longitude : null,
    href: `/p/${p.id}`, agent: memberRef(resolveMemberId(p)),
  });
  const all = rawProps.map(toProp);
  const featuredIds = (s.featured_property_ids as string[] | undefined) ?? [];
  const featured = (featuredIds.length ? all.filter((p) => featuredIds.includes(p.id)) : all).slice(0, 8);
  const featuredSet = new Set(featured.map((p) => p.id));
  const recommended = all.filter((p) => !featuredSet.has(p.id)).slice(0, 4);
  const mapPoints = all.filter((p) => p.lat != null && p.lng != null);

  // ── Areas (property inventory + public agents per area) ─────────────────────
  const areaAgg = new Map<string, { properties: number; agents: Set<string> }>();
  for (const p of rawProps) {
    const k = p.neighborhood || p.city; if (!k) continue;
    const e = areaAgg.get(k) ?? { properties: 0, agents: new Set<string>() };
    e.properties++; const mid = resolveMemberId(p); if (mid) e.agents.add(mid); areaAgg.set(k, e);
  }
  const areas: OfficeArea[] = Array.from(areaAgg.entries())
    .map(([name, e]) => ({ name, properties: e.properties, agents: e.agents.size, agentNames: [...e.agents].map((id) => memberById.get(id)?.full_name).filter((n): n is string => !!n).slice(0, 3) }))
    .sort((a, b) => b.properties - a.properties).slice(0, 8);

  // ── Recent success (public-safe closed inventory) — NO price, NO parties ────
  const { data: soldRows } = await admin.from("properties")
    .select("id,title,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,owner_id,office_member_id,created_at")
    .eq("org_id", orgId).in("status", ["sold", "rented"] as never).order("updated_at", { ascending: false }).limit(6);
  const recentSold: OfficeProperty[] = ((soldRows ?? []) as unknown as RawProp[]).map((p) => ({
    id: p.id, title: p.title || [p.neighborhood, p.city].filter(Boolean).join(" · ") || "נכס",
    price: null, monthlyRent: null, listingKind: p.listing_kind, city: p.city, neighborhood: p.neighborhood,
    rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor, type: p.type, status: p.status, image: p.primary_image_url,
    tag: p.status === "rented" ? "הושכר" : "נמכר",
    lat: null, lng: null, href: `/p/${p.id}`, agent: memberRef(resolveMemberId(p)),
  }));

  // ── Testimonials → responsible member (client_reviews.agent_id is a user id) ─
  interface RawReview { agent_id: string | null; reviewer_name: string | null; rating: number | null; review_text: string | null; city: string | null; neighborhood: string | null; status: string | null }
  const reviews = ((reviewsR.data ?? []) as RawReview[]).filter((r) => r.review_text && (r.status ?? "published") !== "rejected");
  let testimonials: OfficeTestimonial[] = reviews.slice(0, 8).map((r) => ({
    name: r.reviewer_name || "לקוח/ה",
    text: r.review_text as string,
    rating: r.rating ?? null,
    area: r.neighborhood || r.city || null,
    agent: memberRef(r.agent_id ? memberIdByUserId.get(r.agent_id) ?? null : null),
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
    manager,
    featured,
    recommended,
    mapPoints,
    areas,
    recentSold,
    testimonials,
  };
}

// ── Filtered listing for /site/[slug]/properties ─────────────────────────────
export interface OfficePropertyFilters { q?: string; area?: string; type?: string; min?: string; max?: string; rooms?: string; agent?: string }
export interface OfficeListingView { slug: string; brandVars: Record<string, string>; officeName: string; logo: string | null; properties: OfficeProperty[]; members: { id: string; name: string }[]; chrome: OfficeChrome }

export async function getOfficeListing(slug: string, filters: OfficePropertyFilters = {}): Promise<OfficeListingView | "disabled" | null> {
  const full = await getOfficeSite(slug);
  if (full === null || full === "disabled") return full;
  const admin = createServiceRoleClient();
  const { data: siteRow } = await admin.from("office_websites").select("organization_id,office_name,logo_url").eq("slug", slug).maybeSingle();
  const org = (siteRow as { organization_id: string; office_name: string | null; logo_url: string | null } | null);
  if (!org) return null;

  const [{ data: propData }, { data: memberData }, { data: userData }] = await Promise.all([
    admin.from("properties")
      .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,owner_id,office_member_id,created_at")
      .eq("org_id", org.organization_id).in("status", [...PUBLIC_STATUSES] as never).order("created_at", { ascending: false }).limit(300),
    admin.from("office_members" as never).select("id,full_name,role,specialty,avatar_url,user_id,phone,status,show_on_website,public_slug")
      .eq("org_id", org.organization_id).eq("status", "active").eq("show_on_website", true).limit(60),
    admin.from("users").select("id,avatar_url").eq("org_id", org.organization_id).eq("status", "active").limit(60),
  ]);

  // Same office_member resolution as the homepage (office_member_id → linked owner).
  const members = (memberData ?? []) as RawMember[];
  const userAvatar = new Map(((userData ?? []) as { id: string; avatar_url: string | null }[]).map((u) => [u.id, u.avatar_url ?? null]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const publicMemberIds = new Set(members.map((m) => m.id));
  const memberIdByUserId = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.id]));
  const resolveMemberId = (p: { office_member_id: string | null; owner_id: string | null }): string | null =>
    resolveResponsibleMemberId(p, publicMemberIds, memberIdByUserId);
  const memberRef = (memberId: string | null): OfficeAgentRef | null => {
    if (!memberId) return null; const m = memberById.get(memberId); if (!m) return null;
    return { id: m.id, name: m.full_name, photo: resolveAgentAvatar({ avatarUrl: m.avatar_url, linkedUserAvatarUrl: m.user_id ? userAvatar.get(m.user_id) ?? null : null }), href: `/site/${slug}/agents/${memberHandle(m)}` };
  };

  let properties: OfficeProperty[] = ((propData ?? []) as unknown as RawProp[]).map((p) => ({
    id: p.id, title: p.title || [p.neighborhood, p.city].filter(Boolean).join(" · ") || "נכס",
    price: p.price, monthlyRent: p.monthly_rent, listingKind: p.listing_kind, city: p.city, neighborhood: p.neighborhood,
    rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor, type: p.type, status: p.status, image: p.primary_image_url, tag: propTag(p),
    lat: typeof p.latitude === "number" ? p.latitude : null, lng: typeof p.longitude === "number" ? p.longitude : null,
    href: `/p/${p.id}`, agent: memberRef(resolveMemberId(p)),
  }));

  const q = filters.q?.trim().toLowerCase();
  if (q) properties = properties.filter((p) => [p.title, p.city, p.neighborhood].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q)));
  if (filters.area) properties = properties.filter((p) => p.city === filters.area || p.neighborhood === filters.area);
  if (filters.type) properties = properties.filter((p) => p.type === filters.type);
  if (filters.agent) properties = properties.filter((p) => p.agent?.id === filters.agent);
  const min = Number(filters.min), max = Number(filters.max), rooms = Number(filters.rooms);
  if (Number.isFinite(min) && min > 0) properties = properties.filter((p) => (p.price ?? p.monthlyRent ?? 0) >= min);
  if (Number.isFinite(max) && max > 0) properties = properties.filter((p) => (p.price ?? p.monthlyRent ?? Infinity) <= max);
  if (Number.isFinite(rooms) && rooms > 0) properties = properties.filter((p) => (p.rooms ?? 0) >= rooms);

  // Agents that actually own public inventory → the "סוכן" filter options.
  const memberList = members.filter((m) => m.role !== "owner").map((m) => ({ id: m.id, name: m.full_name }));
  return { slug, brandVars: full.brand.tokens, officeName: full.office.name, logo: full.brand.logo, properties, members: memberList, chrome: buildChrome(slug, full) };
}

// ── Public office-agent profile: /site/[slug]/agents/[memberId] ──────────────
// Canonical public profile for ONE office member — works for NON-auth roster
// members. Public-safe only (no CRM stats/leads/deals/notes). Returns null for a
// non-public / unknown member (never exposes an internal member).
export interface OfficeSiteAgent {
  slug: string;
  brandVars: Record<string, string>;
  logo: string | null;
  office: { name: string; phone: string | null; whatsapp: string | null; tel: string | null };
  member: { id: string; name: string; title: string | null; role: string; photo: string | null; phone: string | null; whatsapp: string | null; areas: string[]; specialties: string[]; activeCount: number };
  listings: OfficeProperty[];
  chrome: OfficeChrome;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOfficeSiteAgent(slug: string, handle: string): Promise<OfficeSiteAgent | "disabled" | null> {
  if (!slug || !handle) return null;
  const full = await getOfficeSite(slug);
  if (full === null || full === "disabled") return full;

  const admin = createServiceRoleClient();
  const { data: siteRow } = await admin.from("office_websites").select("organization_id").eq("slug", slug).maybeSingle();
  const orgId = (siteRow as { organization_id: string } | null)?.organization_id;
  if (!orgId) return null;

  // Resolve by public_slug first; fall back to the raw id only when it's a UUID
  // (never cast a slug to uuid). Both org-scoped.
  type MRow = { id: string; user_id: string | null; role: string; status: string; show_on_website: boolean | null; public_slug: string | null };
  const sel = "id,user_id,role,status,show_on_website,public_slug";
  let memberRow = ((await admin.from("office_members" as never).select(sel).eq("org_id", orgId).eq("public_slug", handle).maybeSingle()).data as MRow | null);
  if (!memberRow && UUID_RE.test(handle)) memberRow = ((await admin.from("office_members" as never).select(sel).eq("org_id", orgId).eq("id", handle).maybeSingle()).data as MRow | null);
  // Must be an active, publicly-visible member (never expose an internal one).
  if (!memberRow || memberRow.status !== "active" || memberRow.show_on_website !== true) return null;
  const publicMember = [...full.team, ...(full.manager ? [full.manager] : [])].find((m) => m.id === memberRow!.id);
  if (!publicMember) return null;
  const memberId = memberRow.id;
  const linkedUserId = memberRow.user_id;
  const role = memberRow.role;

  const { data: propData } = await admin.from("properties")
    .select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,latitude,longitude,listing_tag,has_exclusivity,owner_id,office_member_id,created_at")
    .eq("org_id", orgId).in("status", [...PUBLIC_STATUSES] as never).order("created_at", { ascending: false }).limit(200);

  const isMine = (p: RawProp): boolean =>
    p.office_member_id === memberId || (!p.office_member_id && !!linkedUserId && p.owner_id === linkedUserId);
  const selfRef: OfficeAgentRef = { id: publicMember.id, name: publicMember.name, photo: publicMember.photo, href: publicMember.href };
  const listings: OfficeProperty[] = ((propData ?? []) as unknown as RawProp[]).filter(isMine).map((p) => ({
    id: p.id, title: p.title || [p.neighborhood, p.city].filter(Boolean).join(" · ") || "נכס",
    price: p.price, monthlyRent: p.monthly_rent, listingKind: p.listing_kind, city: p.city, neighborhood: p.neighborhood,
    rooms: p.rooms, sizeSqm: p.size_sqm, floor: p.floor, type: p.type, status: p.status, image: p.primary_image_url, tag: propTag(p),
    lat: typeof p.latitude === "number" ? p.latitude : null, lng: typeof p.longitude === "number" ? p.longitude : null,
    href: `/p/${p.id}`, agent: selfRef,
  }));

  return {
    slug,
    brandVars: full.brand.tokens,
    logo: full.brand.logo,
    office: { name: full.office.name, phone: full.office.phone, whatsapp: full.office.whatsapp, tel: full.office.tel },
    member: {
      id: publicMember.id, name: publicMember.name, title: publicMember.title, role,
      photo: publicMember.photo, phone: publicMember.phone, whatsapp: publicMember.whatsapp,
      areas: publicMember.areas, specialties: publicMember.specialties, activeCount: listings.length,
    },
    listings,
    chrome: buildChrome(slug, full),
  };
}
