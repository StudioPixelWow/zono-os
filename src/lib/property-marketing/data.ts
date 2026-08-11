// ============================================================================
// ZONO Property Marketing Page — CANONICAL public data (server-only, service-role).
// ----------------------------------------------------------------------------
// ONE engine → a premium shareable marketing landing page for ANY public
// property. STRUCTURE = ZONO · BRAND = office · PERSON = listing agent ·
// CONTENT = property · CONVERSION = attributed lead. Public-safe DTO only (§47);
// address privacy honored via show_exact_address / show_neighborhood_only (§7).
// Reuses the office/agent brand engine (§33). No invented facts (§11/§35).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveEffectiveBrand } from "@/lib/brand-identity/engine";
import { buildBrandTokens, waLink } from "@/lib/agent-website/brand-tokens";
import type { OfficeProperty, OfficeAgentRef } from "@/lib/office-website/site-data";

const PUBLIC_STATUSES = ["active", "published", "under_offer"] as const;

export interface PropertyMedia { images: string[]; video: string | null; floorPlan: string | null; tour360: string | null }
export interface PropertyFeature { label: string; icon: string }

export interface ListingAgent {
  id: string; name: string; title: string | null; photo: string | null;
  phone: string | null; tel: string | null; whatsapp: string | null; email: string | null;
  areas: string[]; href: string | null; // /agent/[slug]
}

export interface PropertyMarketingPayload {
  id: string;
  brand: { tokens: Record<string, string>; primary: string; onPrimary: string; logo: string | null };
  office: { name: string; logo: string | null; phone: string | null };
  status: string;
  statusLabel: string | null;
  listingKind: string | null; // sale | rent
  title: string;
  description: string | null;
  type: string;
  price: number | null;
  priceBefore: number | null;
  pricePerSqm: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  outdoorSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  availabilityDate: string | null;
  address: { display: string; area: string; exact: boolean; lat: number | null; lng: number | null };
  media: PropertyMedia;
  features: PropertyFeature[];
  agent: ListingAgent | null;
  testimonials: { name: string; text: string; rating: number | null; area: string | null }[];
  related: OfficeProperty[];
  shareText: string;
}

const STATUS_LABEL: Record<string, string> = { under_offer: "בבלעדיות", active: "למכירה", published: "למכירה", sold: "נמכר", rented: "הושכר" };

interface RawUser { id: string; full_name: string | null; title: string | null; phone: string | null; email: string | null; avatar_url: string | null }
interface RawSite { user_id: string; slug: string | null; status: string; display_name: string | null; title_hebrew: string | null; profile_image_url: string | null; whatsapp: string | null; phone: string | null; email: string | null; service_areas: string[] | null }

function featureList(p: Record<string, unknown>): PropertyFeature[] {
  const f: PropertyFeature[] = [];
  const n = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : 0);
  if (p.has_parking) f.push({ label: n("parking_count") > 1 ? `${n("parking_count")} חניות` : "חניה", icon: "car" });
  if (p.has_elevator) f.push({ label: "מעלית", icon: "elevator" });
  if (p.has_balcony) f.push({ label: n("balcony_count") > 1 ? `${n("balcony_count")} מרפסות` : "מרפסת", icon: "balcony" });
  if (p.has_safe_room) f.push({ label: 'ממ"ד', icon: "shield" });
  if (p.has_storage) f.push({ label: n("storage_count") > 1 ? `${n("storage_count")} מחסנים` : "מחסן", icon: "box" });
  if (p.is_accessible) f.push({ label: "נגישות", icon: "access" });
  const extra = Array.isArray(p.features) ? (p.features as unknown[]).filter((x) => typeof x === "string") as string[] : [];
  for (const e of extra) if (!f.some((x) => x.label === e)) f.push({ label: e, icon: "check" });
  return f;
}

/** Canonical public payload for a property marketing page. "unavailable" for a
 *  non-public property, null when the id resolves to nothing. */
export async function getPropertyMarketing(id: string): Promise<PropertyMarketingPayload | "unavailable" | null> {
  if (!id) return null;
  const admin = createServiceRoleClient();
  const { data: row } = await admin.from("properties").select("*").eq("id", id).maybeSingle();
  if (!row) return null;
  const p = row as Record<string, unknown> & { id: string; org_id: string; status: string };
  if (!(PUBLIC_STATUSES as readonly string[]).includes(p.status)) return "unavailable";
  const orgId = p.org_id;
  const agentId = (p.owner_id as string | null) ?? (p.assigned_agent_id as string | null);

  const [mediaR, ownerR, siteR, officeBrandR, officeSiteR, reviewsR, relatedR, orgR] = await Promise.all([
    admin.from("property_media").select("type,url,is_primary,sort_order").eq("property_id", id).order("sort_order", { ascending: true }),
    agentId ? admin.from("users").select("id,full_name,title,phone,email,avatar_url").eq("id", agentId).maybeSingle() : Promise.resolve({ data: null }),
    agentId ? admin.from("agent_websites").select("user_id,slug,status,display_name,title_hebrew,profile_image_url,whatsapp,phone,email,service_areas").eq("user_id", agentId).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("brand_identity_profiles").select("brand_primary,brand_secondary,brand_accent,logo_url").eq("org_id", orgId).eq("entity_id", orgId).maybeSingle(),
    admin.from("office_websites").select("office_name,logo_url,phone").eq("organization_id", orgId).maybeSingle(),
    agentId ? admin.from("client_reviews").select("reviewer_name,rating,review_text,city,neighborhood,is_featured,status").eq("agent_id", agentId).order("is_featured", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
    admin.from("properties").select("id,title,price,monthly_rent,listing_kind,city,neighborhood,rooms,size_sqm,floor,type,status,primary_image_url,listing_tag,has_exclusivity,owner_id").eq("org_id", orgId).in("status", [...PUBLIC_STATUSES] as never).neq("id", id).order("created_at", { ascending: false }).limit(12),
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);

  // ── Brand (office) → tokens ─────────────────────────────────────────────────
  const ob = (officeBrandR.data ?? null) as Record<string, unknown> | null;
  const officeSite = (officeSiteR.data ?? null) as { office_name: string | null; logo_url: string | null; phone: string | null } | null;
  const effective = resolveEffectiveBrand(null, ob);
  const tokens = buildBrandTokens({
    primary: (ob?.brand_primary as string | null) ?? effective.primary,
    secondary: (ob?.brand_secondary as string | null) ?? null,
    accent: (ob?.brand_accent as string | null) ?? null,
    logo: officeSite?.logo_url ?? (ob?.logo_url as string | null) ?? null,
    profileImage: null,
  });

  // ── Media (grouped by type) ─────────────────────────────────────────────────
  const mediaRows = (mediaR.data ?? []) as { type: string; url: string | null; is_primary: boolean | null; sort_order: number | null }[];
  const imgs = mediaRows.filter((m) => m.type === "image" && m.url).map((m) => m.url as string);
  const primary = (p.primary_image_url as string | null) ?? null;
  const images = Array.from(new Set([...(primary ? [primary] : []), ...imgs]));
  const media: PropertyMedia = {
    images,
    video: mediaRows.find((m) => m.type === "video" && m.url)?.url ?? null,
    floorPlan: mediaRows.find((m) => m.type === "floor_plan" && m.url)?.url ?? null,
    tour360: mediaRows.find((m) => m.type === "tour_360" && m.url)?.url ?? null,
  };

  // ── Address privacy (§7) ────────────────────────────────────────────────────
  const exact = p.show_exact_address === true && p.show_neighborhood_only !== true;
  const area = [p.neighborhood, p.city].filter(Boolean).join(", ") || (p.city as string) || "";
  const display = exact
    ? [p.building_number, p.neighborhood, p.city].filter(Boolean).join(", ") || area
    : area;
  const address = {
    display, area, exact,
    lat: exact && typeof p.latitude === "number" ? (p.latitude as number) : null,
    lng: exact && typeof p.longitude === "number" ? (p.longitude as number) : null,
  };

  // ── Listing agent ───────────────────────────────────────────────────────────
  const owner = (ownerR.data ?? null) as RawUser | null;
  const site = (siteR.data ?? null) as RawSite | null;
  // Real headshot from the agent's brand-identity — preferred over the
  // agent_websites profile image (can be a stock placeholder). Same source the
  // agent site uses, so the agent shows the SAME photo everywhere.
  const agentBrandPhoto: string | null = agentId
    ? (((await admin.from("brand_identity_profiles").select("profile_image_url").eq("org_id", orgId).eq("entity_id", agentId).maybeSingle()).data as { profile_image_url: string | null } | null)?.profile_image_url ?? null)
    : null;
  const agentSlug = site && site.status === "published" && site.slug ? site.slug : null;
  const agentPhone = site?.phone ?? owner?.phone ?? null;
  const agent: ListingAgent | null = (owner || site) ? {
    id: agentId as string,
    name: site?.display_name || owner?.full_name || "סוכן/ת",
    title: site?.title_hebrew || owner?.title || 'יועץ נדל"ן',
    photo: agentBrandPhoto ?? site?.profile_image_url ?? owner?.avatar_url ?? null,
    phone: agentPhone,
    tel: agentPhone ? `tel:${agentPhone.replace(/[^0-9+]/g, "")}` : null,
    whatsapp: waLink(site?.whatsapp ?? null, agentPhone),
    email: site?.email ?? owner?.email ?? null,
    areas: (site?.service_areas ?? []).filter(Boolean).slice(0, 3),
    href: agentSlug ? `/agent/${agentSlug}` : null,
  } : null;

  // ── Agent testimonials (integrity: only this agent's) ───────────────────────
  const testimonials = ((reviewsR.data ?? []) as { reviewer_name: string | null; rating: number | null; review_text: string | null; city: string | null; neighborhood: string | null; status: string | null }[])
    .filter((r) => r.review_text && (r.status ?? "published") !== "rejected")
    .slice(0, 3)
    .map((r) => ({ name: r.reviewer_name || "לקוח/ה", text: r.review_text as string, rating: r.rating ?? null, area: r.neighborhood || r.city || null }));

  // ── Related properties (same area/type first) ───────────────────────────────
  interface RawRel { id: string; title: string | null; price: number | null; monthly_rent: number | null; listing_kind: string | null; city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; floor: number | null; type: string; status: string; primary_image_url: string | null; listing_tag: string | null; has_exclusivity: boolean | null; owner_id: string | null }
  const relRows = (relatedR.data ?? []) as RawRel[];
  const scoreRel = (r: RawRel) => (r.neighborhood && r.neighborhood === p.neighborhood ? 3 : 0) + (r.city === p.city ? 2 : 0) + (r.type === p.type ? 1 : 0);
  const agentRef = (uid: string | null): OfficeAgentRef | null => uid && uid === agentId && agent ? { id: agent.id, name: agent.name, photo: agent.photo, href: agent.href } : null;
  const related: OfficeProperty[] = relRows.sort((a, b) => scoreRel(b) - scoreRel(a)).slice(0, 4).map((r) => ({
    id: r.id, title: r.title || [r.neighborhood, r.city].filter(Boolean).join(" · ") || "נכס",
    price: r.price, monthlyRent: r.monthly_rent, listingKind: r.listing_kind, city: r.city, neighborhood: r.neighborhood,
    rooms: r.rooms, sizeSqm: r.size_sqm, floor: r.floor, type: r.type, status: r.status, image: r.primary_image_url,
    tag: r.has_exclusivity ? "בלעדיות" : (r.listing_kind === "rent" ? "להשכרה" : "למכירה"),
    lat: null, lng: null, href: `/p/${r.id}`, agent: agentRef(r.owner_id),
  }));

  const officeName = officeSite?.office_name || (orgR.data as { name?: string } | null)?.name || effective.officeName || "משרד תיווך";
  const rooms = typeof p.rooms === "number" ? (p.rooms as number) : null;
  const shareText = `היי, מתעניין/ת בנכס${area ? ` ב${address.area}` : ""}${rooms ? ` · ${rooms} חד׳` : ""} שפרסמת`;

  return {
    id,
    brand: { tokens: tokens.vars, primary: tokens.primary, onPrimary: tokens.onPrimary, logo: tokens.logo },
    office: { name: officeName, logo: tokens.logo, phone: officeSite?.phone ?? null },
    status: p.status,
    statusLabel: p.has_exclusivity ? "בבלעדיות" : STATUS_LABEL[p.status] ?? null,
    listingKind: (p.listing_kind as string | null) ?? null,
    title: (p.title as string) || address.display || "נכס למכירה",
    description: (p.marketing_description as string | null) || (p.description as string | null) || (p.ai_description as string | null) || null,
    type: p.type as string,
    price: typeof p.price === "number" ? (p.price as number) : null,
    priceBefore: typeof p.price_before_discount === "number" ? (p.price_before_discount as number) : null,
    pricePerSqm: typeof p.price_per_sqm === "number" ? (p.price_per_sqm as number) : null,
    rooms,
    sizeSqm: typeof p.size_sqm === "number" ? (p.size_sqm as number) : null,
    outdoorSqm: typeof p.outdoor_sqm === "number" ? (p.outdoor_sqm as number) : null,
    floor: typeof p.floor === "number" ? (p.floor as number) : null,
    totalFloors: typeof p.total_floors === "number" ? (p.total_floors as number) : null,
    availabilityDate: (p.availability_date as string | null) ?? null,
    address,
    media,
    features: featureList(p),
    agent,
    testimonials,
    related,
    shareText,
  };
}
