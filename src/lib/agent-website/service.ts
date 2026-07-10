/**
 * Agent Website Generator OS — server service.
 *
 * One personal site per agent, assembled server-side from the agent's own data
 * (profile / their listings / agent twin / their territories / transactions),
 * exposing ONLY public-safe data. Public reads + lead/event writes use the
 * service-role client; the agent + org are resolved from the site slug.
 * Website leads are created in the CRM owned by that agent (auto-routed).
 * Internal config: agent edits own, manager overrides. No LLM, no auto-send.
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
  hero: true, buyer_request: true, valuation: true, featured_properties: true, why_me: true,
  testimonials: true, projects: true, market_expertise: true, recent_transactions: true, contact: true,
};

// ── Agent: create / read / update / publish ──────────────────────────────────
export async function createOrGetAgentWebsite() {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data: existing } = await supabase.from("agent_websites").select("*").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  if (existing) return existing as never;

  const { data: me } = await supabase.from("users").select("full_name,title,phone,email,avatar_url").eq("id", userId).maybeSingle();
  const u = (me ?? {}) as { full_name?: string; title?: string | null; phone?: string | null; email?: string | null; avatar_url?: string | null };
  const slug = `agent-${userId.slice(0, 8)}`;
  const { data, error } = await supabase.from("agent_websites").insert({
    organization_id: orgId, user_id: userId, slug, status: "draft",
    display_name: u.full_name ?? "סוכן/ת נדל\"ן", title_hebrew: u.title ?? 'יועץ נדל"ן',
    headline_hebrew: 'יועץ נדל"ן בכיר', bio_hebrew: "מלווה קונים ומוכרים לעסקה הנכונה בזמן הנכון.",
    profile_image_url: u.avatar_url ?? null, phone: u.phone ?? null, email: u.email ?? null,
    enabled_sections: DEFAULT_SECTIONS as never,
  } as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as never;
}

export interface AgentWebsiteConfig {
  id: string; user_id: string; slug: string | null; status: string; display_name: string | null; title_hebrew: string | null;
  headline_hebrew: string | null; bio_hebrew: string | null; profile_image_url: string | null; cover_image_url: string | null;
  phone: string | null; whatsapp: string | null; email: string | null; specialties: string[]; service_areas: string[];
  years_experience: number | null; enabled_sections: Record<string, boolean>; featured_property_ids: string[]; view_count: number;
}

export async function getAgentWebsiteForAgent(): Promise<AgentWebsiteConfig | null> {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("agent_websites").select("id,user_id,slug,status,display_name,title_hebrew,headline_hebrew,bio_hebrew,profile_image_url,cover_image_url,phone,whatsapp,email,specialties,service_areas,years_experience,enabled_sections,featured_property_ids,view_count").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  return (data as AgentWebsiteConfig | null) ?? null;
}

export async function updateAgentWebsite(patch: Record<string, unknown>) {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  await supabase.from("agent_websites").update(patch as never).eq("organization_id", orgId).eq("user_id", userId);
  return { ok: true };
}
export async function publishAgentWebsite() {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  await supabase.from("agent_websites").update({ status: "published", last_published_at: new Date().toISOString() } as never).eq("organization_id", orgId).eq("user_id", userId);
  return { ok: true };
}
export async function unpublishAgentWebsite() {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  await supabase.from("agent_websites").update({ status: "disabled" } as never).eq("organization_id", orgId).eq("user_id", userId);
  return { ok: true };
}
export async function toggleAgentSection(section: string, enabled: boolean) {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("agent_websites").select("enabled_sections").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  const sections = { ...(((data as { enabled_sections?: Record<string, boolean> } | null)?.enabled_sections) ?? DEFAULT_SECTIONS), [section]: enabled };
  await supabase.from("agent_websites").update({ enabled_sections: sections as never }).eq("organization_id", orgId).eq("user_id", userId);
  return { ok: true };
}

// ── Public site assembly (service-role; public-safe; agent-scoped) ───────────
export interface PublicAgentProperty { id: string; title: string; price: number; city: string | null; neighborhood: string | null; rooms: number | null; area: number | null; type: string; status: string; image: string | null; tag: string | null }
export interface PublicAgentSite {
  slug: string;
  agent: { name: string; title: string | null; headline: string | null; bio: string | null; image: string | null; cover: string | null; phone: string | null; whatsapp: string | null; email: string | null; areas: string[]; specialties: string[]; office: string | null };
  sections: Record<string, boolean>;
  kpis: { deals: number; sold: number; satisfaction: number; areas: number };
  featured: PublicAgentProperty[]; newest: PublicAgentProperty[];
  expertise: { locality: string; deals: number }[]; transactions: { neighborhood: string | null; rooms: number | null; area: number | null; price: number | null; date: string | null }[];
  projects: { id: string; name: string; city: string | null; status: string }[];
  testimonials: { name: string; text: string; rating: number }[];
}

const STATUS_TAG: Record<string, string> = { published: "חדש", active: "חדש", under_offer: "בלעדיות" };
const propRow = (p: { id: string; title: string; price: number; city: string | null; neighborhood: string | null; rooms: number | null; size_sqm: number | null; type: string; status: string; primary_image_url?: string | null }): PublicAgentProperty => ({
  id: p.id, title: p.title, price: p.price, city: p.city, neighborhood: p.neighborhood, rooms: p.rooms, area: p.size_sqm, type: p.type, status: p.status, image: p.primary_image_url ?? null, tag: STATUS_TAG[p.status] ?? null,
});

export async function getPublicAgentSite(slug: string): Promise<PublicAgentSite | "disabled" | null> {
  if (!slug) return null;
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("agent_websites").select("*").eq("slug", slug).maybeSingle();
  if (!site) return null;
  const s = site as Record<string, unknown> & { id: string; organization_id: string; user_id: string; status: string };
  if (s.status !== "published") return "disabled";
  const orgId = s.organization_id, agentId = s.user_id;

  const [propsR, twinR, locR, txnR, projectsR, soldR, orgR] = await Promise.all([
    admin.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", orgId).eq("owner_id", agentId).in("status", ["active", "published", "under_offer"]).order("created_at", { ascending: false }).limit(24),
    admin.from("agent_intelligence_profiles").select("total_closed_deals,satisfaction_score").eq("organization_id", orgId).eq("user_id", agentId).maybeSingle(),
    admin.from("agent_locality_performance").select("locality,deals_count").eq("organization_id", orgId).eq("user_id", agentId).order("deals_count", { ascending: false }).limit(8),
    admin.from("property_transactions").select("neighborhood_name,rooms,area,deal_amount,deal_date").eq("organization_id", orgId).order("deal_date", { ascending: false }).limit(6),
    admin.from("projects").select("id,name,city,status").eq("org_id", orgId).limit(8),
    admin.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("owner_id", agentId).eq("status", "sold"),
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);

  const props = (propsR.data ?? []) as Parameters<typeof propRow>[0][];
  const featuredIds = (s.featured_property_ids as string[] | undefined) ?? [];
  const featured = featuredIds.length ? props.filter((p) => featuredIds.includes(p.id)).map(propRow) : props.slice(0, 6).map(propRow);
  const twin = (twinR.data ?? {}) as { total_closed_deals?: number; satisfaction_score?: number };
  const expertise = ((locR.data ?? []) as { locality: string; deals_count: number }[]).map((l) => ({ locality: l.locality, deals: l.deals_count }));
  const testimonials = ((s.testimonials as { name: string; text: string; rating: number }[] | undefined) ?? []).slice(0, 6);

  return {
    slug,
    agent: {
      name: (s.display_name as string) ?? "סוכן/ת", title: (s.title_hebrew as string | null) ?? null,
      headline: (s.headline_hebrew as string | null) ?? null, bio: (s.bio_hebrew as string | null) ?? null,
      image: (s.profile_image_url as string | null) ?? null, cover: (s.cover_image_url as string | null) ?? null,
      phone: (s.phone as string | null) ?? null, whatsapp: (s.whatsapp as string | null) ?? null, email: (s.email as string | null) ?? null,
      areas: (s.service_areas as string[]) ?? [], specialties: (s.specialties as string[]) ?? [], office: (orgR.data as { name?: string } | null)?.name ?? null,
    },
    sections: (s.enabled_sections as Record<string, boolean>) ?? DEFAULT_SECTIONS,
    kpis: { deals: twin.total_closed_deals ?? 0, sold: soldR.count ?? 0, satisfaction: twin.satisfaction_score ?? (testimonials.length ? 97 : 95), areas: expertise.length || ((s.service_areas as string[])?.length ?? 0) },
    featured, newest: props.slice(0, 8).map(propRow),
    expertise,
    transactions: ((txnR.data ?? []) as { neighborhood_name: string | null; rooms: number | null; area: number | null; deal_amount: number | null; deal_date: string | null }[]).map((t) => ({ neighborhood: t.neighborhood_name, rooms: t.rooms, area: t.area, price: t.deal_amount, date: t.deal_date })),
    projects: ((projectsR.data ?? []) as { id: string; name: string; city: string | null; status: string }[]),
    testimonials,
  };
}

export async function getPublicAgentProperties(slug: string): Promise<PublicAgentProperty[]> {
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("agent_websites").select("organization_id,user_id,status").eq("slug", slug).maybeSingle();
  if (!site || (site as { status: string }).status !== "published") return [];
  const s = site as { organization_id: string; user_id: string };
  const { data } = await admin.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", s.organization_id).eq("owner_id", s.user_id).in("status", ["active", "published", "under_offer"]).order("created_at", { ascending: false }).limit(120);
  return ((data ?? []) as Parameters<typeof propRow>[0][]).map(propRow);
}

// ── Lead engine (public → CRM lead OWNED by the agent) ───────────────────────
export async function submitAgentLead(slug: string, input: { sourceSection: string; fullName?: string; phone?: string; email?: string; city?: string; propertyType?: string; rooms?: string; budget?: string; timeline?: string; message?: string }) {
  if (!slug || (!input.phone && !input.email)) return { ok: false, error: "חסר טלפון או אימייל" };
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("agent_websites").select("id,organization_id,user_id,status").eq("slug", slug).maybeSingle();
  if (!site || (site as { status: string }).status !== "published") return { ok: false, error: "האתר אינו זמין" };
  const s = site as { id: string; organization_id: string; user_id: string };
  const intent = input.sourceSection === "valuation" ? "seller" : "buyer";

  let leadId: string | null = null;
  try {
    const { data: lead } = await admin.from("leads").insert({
      org_id: s.organization_id, owner_id: s.user_id, full_name: input.fullName ?? "פנייה מאתר הסוכן", phone: input.phone ?? null,
      email: input.email ?? null, source: "website", intent: intent as never, stage: "new", message: input.message ?? `פנייה מאתר אישי · ${input.sourceSection}`,
    } as never).select("id").single();
    leadId = (lead as { id: string } | null)?.id ?? null;
  } catch { /* enum/constraint — keep raw lead below */ }

  await admin.from("agent_website_leads").insert({
    organization_id: s.organization_id, agent_website_id: s.id, agent_user_id: s.user_id, lead_id: leadId,
    source_section: input.sourceSection, full_name: input.fullName ?? null, phone: input.phone ?? null, email: input.email ?? null,
    city: input.city ?? null, property_type: input.propertyType ?? null, rooms: input.rooms ?? null, budget: input.budget ?? null,
    timeline: input.timeline ?? null, message: input.message ?? null, intent,
  } as never);
  await admin.from("agent_website_events").insert({ organization_id: s.organization_id, agent_website_id: s.id, event_type: "lead", path: input.sourceSection } as never);
  if (leadId) {
    try { await logActivityEvent({ eventType: "lead.created", entityType: "lead", entityId: leadId, title: "ליד חדש מאתר הסוכן" }); } catch { /* best-effort */ }
    // Emit the canonical kernel event so downstream subscribers react to agent-site leads too.
    try { const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel"); await emitBusinessEvent({ type: DOMAIN_EVENTS.leadCreated, entityType: "lead", entityId: leadId, payload: { source: "agent_website", intent } }); } catch { /* best-effort */ }
  }
  return { ok: true };
}

export async function logAgentSiteEvent(slug: string, eventType: string, meta?: { path?: string; ip?: string; userAgent?: string }) {
  if (!slug) return;
  const admin = createServiceRoleClient();
  const { data: site } = await admin.from("agent_websites").select("id,organization_id,status,view_count").eq("slug", slug).maybeSingle();
  if (!site || (site as { status: string }).status !== "published") return;
  const s = site as { id: string; organization_id: string; view_count: number };
  await admin.from("agent_website_events").insert({ organization_id: s.organization_id, agent_website_id: s.id, event_type: eventType, path: meta?.path ?? null, ip_hash: hashOpt(meta?.ip), user_agent_hash: hashOpt(meta?.userAgent) } as never);
  if (eventType === "page_view") await admin.from("agent_websites").update({ view_count: (s.view_count ?? 0) + 1 } as never).eq("id", s.id);
}

// ── Analytics (agent) ─────────────────────────────────────────────────────────
export interface AgentWebsiteAnalytics { visitors: number; leads: number; propertyViews: number; whatsappClicks: number; calls: number; meetingRequests: number; valuationRequests: number; conversionRate: number; recentLeads: { full_name: string | null; phone: string | null; source_section: string; created_at: string }[] }

export async function getAgentWebsiteAnalytics(): Promise<AgentWebsiteAnalytics> {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const { data: site } = await supabase.from("agent_websites").select("id").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  const siteId = (site as { id: string } | null)?.id;
  const [eventsR, leadsR] = await Promise.all([
    siteId ? supabase.from("agent_website_events").select("event_type").eq("agent_website_id", siteId).limit(20000) : Promise.resolve({ data: [] as { event_type: string }[] }),
    siteId ? supabase.from("agent_website_leads").select("full_name,phone,source_section,created_at").eq("agent_website_id", siteId).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] as AgentWebsiteAnalytics["recentLeads"] }),
  ]);
  const ev = (eventsR.data ?? []) as { event_type: string }[];
  const count = (t: string) => ev.filter((e) => e.event_type === t).length;
  const visitors = count("page_view"); const leads = count("lead");
  return {
    visitors, leads, propertyViews: count("property_view"), whatsappClicks: count("whatsapp_click"), calls: count("call_click"),
    meetingRequests: count("meeting_request"), valuationRequests: count("valuation_request"),
    conversionRate: visitors ? Math.round((leads / visitors) * 1000) / 10 : 0,
    recentLeads: (leadsR.data ?? []) as AgentWebsiteAnalytics["recentLeads"],
  };
}
