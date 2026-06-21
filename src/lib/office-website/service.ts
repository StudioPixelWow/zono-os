/**
 * Office Website Generator OS — server service.
 *
 * The public office website is assembled server-side from the existing ZONO
 * brains (team / properties / projects / territory / transactions) and exposes
 * ONLY public-safe data (no internal scores, revenue, risk or raw payloads).
 * Public reads + lead/event writes use the service-role client (the site is
 * unauthenticated); the org is resolved from the site slug, never from the URL.
 * Internal config is org-scoped, manager-gated RLS. No LLM, no auto-send.
 */
import "server-only";
import { createHash } from "node:crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}
const hashOpt = (s: string | null | undefined) => (s ? createHash("sha256").update(s).digest("hex").slice(0, 32) : null);

const DEFAULT_SECTIONS = {
  hero: true, why_us: true, featured_properties: true, valuation: true, agents: true,
  projects: true, metrics: true, testimonials: true, territory: true, market_insights: true,
  recruitment: true, contact: true,
};

// ── Manager: create / read / update / publish ────────────────────────────────
export async function createOrGetOfficeWebsite() {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data: existing } = await supabase.from("office_websites").select("*").eq("organization_id", orgId).maybeSingle();
  if (existing) return existing as never;

  const { data: org } = await supabase.from("organizations").select("name,logo_url,phone,email,city").eq("id", orgId).maybeSingle();
  const o = (org ?? {}) as { name?: string; logo_url?: string | null; phone?: string | null; email?: string | null; city?: string | null };
  const slug = `office-${orgId.slice(0, 8)}`;
  const { data, error } = await supabase.from("office_websites").insert({
    organization_id: orgId, slug, status: "draft",
    office_name: o.name ?? "המשרד שלי", headline_hebrew: o.city ? `המשרד שמוביל את הנדל"ן באזור ${o.city}` : 'המשרד שמוביל את הנדל"ן באזור',
    description_hebrew: "מאגר קונים פעיל, סוכנים מקומיים ושיווק מתקדם שמייצר תוצאות.",
    logo_url: o.logo_url ?? null, phone: o.phone ?? null, email: o.email ?? null, address: o.city ?? null,
    enabled_sections: DEFAULT_SECTIONS as never, created_by: userId,
  } as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as never;
}

export interface OfficeWebsiteConfig {
  id: string; slug: string | null; status: string; office_name: string | null; headline_hebrew: string | null;
  description_hebrew: string | null; cover_image_url: string | null; logo_url: string | null; phone: string | null;
  whatsapp: string | null; email: string | null; address: string | null; office_hours: string | null;
  social_links: Record<string, unknown>; enabled_sections: Record<string, boolean>;
  featured_property_ids: string[]; featured_project_ids: string[]; view_count: number; last_published_at: string | null;
}

export async function getOfficeWebsiteForManager(): Promise<OfficeWebsiteConfig | null> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("office_websites").select("id,slug,status,office_name,headline_hebrew,description_hebrew,cover_image_url,logo_url,phone,whatsapp,email,address,office_hours,social_links,enabled_sections,featured_property_ids,featured_project_ids,view_count,last_published_at").eq("organization_id", orgId).maybeSingle();
  return (data as OfficeWebsiteConfig | null) ?? null;
}

export async function updateOfficeWebsite(patch: Partial<{ office_name: string; headline_hebrew: string; description_hebrew: string; cover_image_url: string; logo_url: string; phone: string; whatsapp: string; email: string; address: string; office_hours: string; slug: string; enabled_sections: Record<string, boolean>; featured_property_ids: string[]; social_links: Record<string, unknown> }>) {
  const { orgId } = await ctx();
  const supabase = await createClient();
  await supabase.from("office_websites").update(patch as never).eq("organization_id", orgId);
  return { ok: true };
}

export async function publishOfficeWebsite() {
  const { orgId } = await ctx();
  const supabase = await createClient();
  await supabase.from("office_websites").update({ status: "published", last_published_at: new Date().toISOString() } as never).eq("organization_id", orgId);
  return { ok: true };
}
export async function unpublishOfficeWebsite() {
  const { orgId } = await ctx();
  const supabase = await createClient();
  await supabase.from("office_websites").update({ status: "disabled" } as never).eq("organization_id", orgId);
  return { ok: true };
}

export async function toggleWebsiteSection(section: string, enabled: boolean) {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("office_websites").select("enabled_sections").eq("organization_id", orgId).maybeSingle();
  const sections = { ...(((data as { enabled_sections?: Record<string, boolean> } | null)?.enabled_sections) ?? DEFAULT_SECTIONS), [section]: enabled };
  await supabase.from("office_websites").update({ enabled_sections: sections as never }).eq("organization_id", orgId);
  return { ok: true };
}

// ── Public site assembly (service-role, public-safe only) ────────────────────
export interface PublicProperty { id: string; title: string; price: number; city: string | null; neighborhood: string | null; rooms: number | null; area: number | null; type: string; status: string; image: string | null; tag: string | null }
export interface PublicAgent { id: string; name: string; title: string | null; phone: string | null; avatar: string | null; siteSlug: string | null }
export interface PublicProject { id: string; name: string; city: string | null; status: string; units: number | null; developer: string | null }
export interface PublicTransaction { neighborhood: string | null; rooms: number | null; area: number | null; price: number | null; date: string | null }
export interface PublicSite {
  slug: string; office: { name: string; headline: string | null; description: string | null; logo: string | null; cover: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; hours: string | null; social: Record<string, unknown> };
  sections: Record<string, boolean>;
  kpis: { properties: number; agents: number; territories: number; rating: number };
  featured: PublicProperty[]; newest: PublicProperty[]; agents: PublicAgent[]; projects: PublicProject[];
  territories: { city: string; areas: string[] }[]; transactions: PublicTransaction[]; hotAreas: string[];
  testimonials: { name: string; text: string; rating: number }[];
}

const STATUS_TAG: Record<string, string> = { published: "חדש בשוק", active: "חדש בשוק", under_offer: "בלעדיות" };
const propRow = (p: { id: string; title: string; price: number; city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; type: string; status: string; primary_image_url?: string | null }): PublicProperty => ({
  id: p.id, title: p.title, price: p.price, city: p.city, neighborhood: p.neighborhood, rooms: p.rooms, area: p.size_sqm, type: p.type, status: p.status, image: p.primary_image_url ?? null, tag: STATUS_TAG[p.status] ?? null,
});

export async function getPublicOfficeSite(slug: string): Promise<PublicSite | "disabled" | null> {
  if (!slug) return null;
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("office_websites").select("*").eq("slug", slug).maybeSingle();
  if (!site) return null;
  const s = site as Record<string, unknown> & { id: string; organization_id: string; status: string };
  if (s.status !== "published") return "disabled";
  const orgId = s.organization_id;

  const [propsR, agentsR, projectsR, terrR, txnR, kpiPropsR, kpiAgentsR, kpiTerrR] = await Promise.all([
    admin.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).in("status", ["active", "published", "under_offer"]).order("created_at", { ascending: false }).limit(24),
    admin.from("users").select("id,full_name,title,phone,avatar_url,status").eq("org_id", orgId).eq("status", "active").limit(24),
    admin.from("projects").select("id,name,city,status,total_units,developer_name").eq("org_id", orgId).limit(12),
    admin.from("territory_profiles").select("city_name,neighborhood_name,territory_type,opportunity_score").eq("organization_id", orgId).order("opportunity_score", { ascending: false }).limit(200),
    admin.from("property_transactions").select("neighborhood_name,rooms,area,deal_amount,deal_date").eq("organization_id", orgId).order("deal_date", { ascending: false }).limit(8),
    admin.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
    admin.from("territory_profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("territory_type", "city"),
  ]);

  const props = (propsR.data ?? []) as Parameters<typeof propRow>[0][];
  const featuredIds = (s.featured_property_ids as string[] | undefined) ?? [];
  const featured = featuredIds.length ? props.filter((p) => featuredIds.includes(p.id)).map(propRow) : props.slice(0, 6).map(propRow);

  // Territory coverage grouped by city.
  const byCity = new Map<string, Set<string>>();
  for (const t of (terrR.data ?? []) as { city_name: string | null; neighborhood_name: string | null; territory_type: string }[]) {
    if (!t.city_name) continue;
    const set = byCity.get(t.city_name) ?? new Set<string>();
    if (t.neighborhood_name) set.add(t.neighborhood_name);
    byCity.set(t.city_name, set);
  }
  const territories = [...byCity.entries()].slice(0, 8).map(([city, areas]) => ({ city, areas: [...areas].slice(0, 6) }));
  const txns = (txnR.data ?? []) as { neighborhood_name: string | null; rooms: number | null; area: number | null; deal_amount: number | null; deal_date: string | null }[];
  const hotAreas = [...new Set(txns.map((t) => t.neighborhood_name).filter((n): n is string => !!n))].slice(0, 6);

  const testimonials = ((s.testimonials as { name: string; text: string; rating: number }[] | undefined) ?? []).slice(0, 6);

  // Office → agent personal sites: link each agent card to their published site.
  const agentRows = (agentsR.data ?? []) as { id: string; full_name: string; title: string | null; phone: string | null; avatar_url: string | null }[];
  const slugByAgent = new Map<string, string>();
  if (agentRows.length) {
    const { data: agentSites } = await admin.from("agent_websites").select("user_id,slug").eq("organization_id", orgId).eq("status", "published").in("user_id", agentRows.map((a) => a.id));
    for (const r of (agentSites ?? []) as { user_id: string; slug: string | null }[]) { if (r.slug) slugByAgent.set(r.user_id, r.slug); }
  }

  return {
    slug,
    office: {
      name: (s.office_name as string) ?? "המשרד שלי", headline: (s.headline_hebrew as string | null) ?? null,
      description: (s.description_hebrew as string | null) ?? null, logo: (s.logo_url as string | null) ?? null,
      cover: (s.cover_image_url as string | null) ?? null, phone: (s.phone as string | null) ?? null,
      whatsapp: (s.whatsapp as string | null) ?? null, email: (s.email as string | null) ?? null,
      address: (s.address as string | null) ?? null, hours: (s.office_hours as string | null) ?? null,
      social: (s.social_links as Record<string, unknown>) ?? {},
    },
    sections: (s.enabled_sections as Record<string, boolean>) ?? DEFAULT_SECTIONS,
    kpis: { properties: kpiPropsR.count ?? props.length, agents: kpiAgentsR.count ?? 0, territories: kpiTerrR.count ?? territories.length, rating: testimonials.length ? Math.round((testimonials.reduce((a, t) => a + (t.rating || 5), 0) / testimonials.length) * 10) / 10 : 4.9 },
    featured,
    newest: props.slice(0, 8).map(propRow),
    agents: agentRows.map((a) => ({ id: a.id, name: a.full_name, title: a.title, phone: a.phone, avatar: a.avatar_url, siteSlug: slugByAgent.get(a.id) ?? null })),
    projects: ((projectsR.data ?? []) as { id: string; name: string; city: string | null; status: string; total_units: number | null; developer_name: string | null }[]).map((p) => ({ id: p.id, name: p.name, city: p.city, status: p.status, units: p.total_units, developer: p.developer_name })),
    territories, transactions: txns.map((t) => ({ neighborhood: t.neighborhood_name, rooms: t.rooms, area: t.area, price: t.deal_amount, date: t.deal_date })), hotAreas,
    testimonials,
  };
}

export async function getPublicOfficeProperties(slug: string, filters?: { city?: string; type?: string; rooms?: number; maxPrice?: number }): Promise<PublicProperty[]> {
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("office_websites").select("organization_id,status").eq("slug", slug).maybeSingle();
  if (!site || (site as { status: string }).status !== "published") return [];
  const orgId = (site as { organization_id: string }).organization_id;
  let q = admin.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).in("status", ["active", "published", "under_offer"]).order("created_at", { ascending: false }).limit(120);
  if (filters?.city) q = q.eq("city", filters.city);
  if (filters?.type) q = q.eq("type", filters.type as never);
  if (filters?.rooms) q = q.gte("rooms", filters.rooms);
  if (filters?.maxPrice) q = q.lte("price", filters.maxPrice);
  const { data } = await q;
  return ((data ?? []) as Parameters<typeof propRow>[0][]).map(propRow);
}

// ── Lead engine (service-role; public form → CRM lead + event + activity) ─────
export async function submitWebsiteLead(slug: string, input: { sourceSection: string; fullName?: string; phone?: string; email?: string; city?: string; propertyType?: string; rooms?: string; message?: string; intent?: string }) {
  if (!slug || (!input.phone && !input.email)) return { ok: false, error: "חסר טלפון או אימייל" };
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("office_websites").select("id,organization_id,status").eq("slug", slug).maybeSingle();
  if (!site || (site as { status: string }).status !== "published") return { ok: false, error: "האתר אינו זמין" };
  const siteRow = site as { id: string; organization_id: string };
  const orgId = siteRow.organization_id;

  // Create a CRM lead (source = website). Best-effort intent mapping.
  const intent = input.sourceSection === "valuation" ? "seller" : input.sourceSection === "recruitment" ? "unknown" : input.intent ?? "buyer";
  let leadId: string | null = null;
  try {
    const { data: lead } = await admin.from("leads").insert({
      org_id: orgId, full_name: input.fullName ?? "פנייה מהאתר", phone: input.phone ?? null, email: input.email ?? null,
      source: "website", intent: intent as never, stage: "new", message: input.message ?? `פנייה מאתר המשרד · ${input.sourceSection}`,
    } as never).select("id").single();
    leadId = (lead as { id: string } | null)?.id ?? null;
  } catch { /* lead enum/constraint — still record the raw website lead below */ }

  await admin.from("office_website_leads").insert({
    organization_id: orgId, website_id: siteRow.id, lead_id: leadId, source_section: input.sourceSection,
    full_name: input.fullName ?? null, phone: input.phone ?? null, email: input.email ?? null, city: input.city ?? null,
    property_type: input.propertyType ?? null, rooms: input.rooms ?? null, message: input.message ?? null, intent,
  } as never);
  await admin.from("office_website_events").insert({ organization_id: orgId, website_id: siteRow.id, event_type: "lead", path: input.sourceSection } as never);
  if (leadId) { try { await logActivityEvent({ eventType: "lead.created", entityType: "lead", entityId: leadId, title: "ליד חדש מאתר המשרד" }); } catch { /* best-effort */ } }
  return { ok: true };
}

export async function logSiteEvent(slug: string, eventType: string, meta?: { path?: string; ip?: string; userAgent?: string; entityId?: string; entityType?: string }) {
  if (!slug) return;
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("office_websites").select("id,organization_id,status,view_count").eq("slug", slug).maybeSingle();
  if (!site || (site as { status: string }).status !== "published") return;
  const s = site as { id: string; organization_id: string; view_count: number };
  await admin.from("office_website_events").insert({ organization_id: s.organization_id, website_id: s.id, event_type: eventType, path: meta?.path ?? null, entity_type: meta?.entityType ?? null, entity_id: meta?.entityId ?? null, ip_hash: hashOpt(meta?.ip), user_agent_hash: hashOpt(meta?.userAgent) } as never);
  if (eventType === "page_view") await admin.from("office_websites").update({ view_count: (s.view_count ?? 0) + 1 } as never).eq("id", s.id);
}

// ── Analytics (manager) ──────────────────────────────────────────────────────
export interface WebsiteAnalytics { visitors: number; leads: number; propertyViews: number; whatsappClicks: number; calls: number; formSubmits: number; conversionRate: number; recentLeads: { full_name: string | null; phone: string | null; source_section: string; created_at: string }[] }

export async function getOfficeWebsiteAnalytics(): Promise<WebsiteAnalytics> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const [eventsR, leadsR] = await Promise.all([
    supabase.from("office_website_events").select("event_type").eq("organization_id", orgId).limit(20000),
    supabase.from("office_website_leads").select("full_name,phone,source_section,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
  ]);
  const ev = (eventsR.data ?? []) as { event_type: string }[];
  const count = (t: string) => ev.filter((e) => e.event_type === t).length;
  const visitors = count("page_view");
  const leads = count("lead");
  return {
    visitors, leads, propertyViews: count("property_view"), whatsappClicks: count("whatsapp_click"),
    calls: count("call_click"), formSubmits: count("form_submit"),
    conversionRate: visitors ? Math.round((leads / visitors) * 1000) / 10 : 0,
    recentLeads: (leadsR.data ?? []) as WebsiteAnalytics["recentLeads"],
  };
}
