// ============================================================================
// 🌐 ZONO Website Builder OS™ — server service (server-only). 38.0.
// COMPOSES the EXISTING website modules into one builder. Reuses:
//   agent-website (config/analytics/publish/toggle) · office-website (same) ·
//   the pure catalog/templates/recommender. Section ORDER + VISIBILITY persist
//   into the EXISTING agent_websites/office_websites columns (theme jsonb +
//   enabled_sections) — no new table, no new renderer. Nothing auto-publishes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getAgentWebsiteForAgent, getAgentWebsiteAnalytics, publishAgentWebsite, unpublishAgentWebsite, updateAgentWebsite } from "@/lib/agent-website/service";
import { getOfficeWebsiteForManager, getOfficeWebsiteAnalytics, publishOfficeWebsite, unpublishOfficeWebsite, updateOfficeWebsite } from "@/lib/office-website/service";
import { isSiteTheme } from "@/lib/brokerage-site/branding";
import { assembleBuilderView } from "./assemble";
import { getTemplate, applyTemplate } from "./catalog";
import { buildRecommendations, buildHealth, analyzeSeo } from "./recommend";
import type { BuilderTarget, BuilderView, SiteConfigLean, WebsiteAnalyticsLean, BrokerWebsiteSummary, PropertyWebsitePresence } from "./types";

const TABLE = (t: BuilderTarget) => (t === "agent" ? "agent_websites" : "office_websites");

async function orgUser() { const s = await getSessionContext(); return { orgId: s.profile?.org_id ?? s.organization?.id ?? null, userId: s.user?.id ?? null }; }

interface SiteMeta { order: string[]; preset: string | null; updatedAt: string | null }

async function readSiteMeta(target: BuilderTarget, orgId: string, userId: string | null): Promise<SiteMeta> {
  try {
    const db = await createClient();
    let q = db.from(TABLE(target) as never).select("theme,updated_at" as never).eq("organization_id" as never, orgId as never);
    if (target === "agent" && userId) q = q.eq("user_id" as never, userId as never);
    const { data } = await q.limit(1).maybeSingle();
    const row = data as { theme?: { order?: unknown; preset?: unknown }; updated_at?: unknown } | null;
    const order = row?.theme?.order;
    const preset = row?.theme?.preset;
    return {
      order: Array.isArray(order) ? order.filter((x): x is string => typeof x === "string") : [],
      preset: typeof preset === "string" && preset ? preset : null,
      updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
    };
  } catch { return { order: [], preset: null, updatedAt: null }; }
}

async function loadConfig(target: BuilderTarget): Promise<{ config: SiteConfigLean | null; analytics: WebsiteAnalyticsLean }> {
  const emptyAnalytics: WebsiteAnalyticsLean = { visitors: 0, leads: 0, propertyViews: 0, conversionRate: 0, whatsappClicks: 0, calls: 0 };
  const { orgId, userId } = await orgUser();
  if (!orgId) return { config: null, analytics: emptyAnalytics };

  if (target === "agent") {
    const [c, a] = await Promise.all([getAgentWebsiteForAgent().catch(() => null), getAgentWebsiteAnalytics().catch(() => emptyAnalytics)]);
    if (!c) return { config: null, analytics: emptyAnalytics };
    const meta = await readSiteMeta("agent", orgId, userId);
    return {
      config: { target: "agent", slug: c.slug, status: c.status, title: c.display_name, headline: c.headline_hebrew, description: c.bio_hebrew, imageUrl: c.profile_image_url ?? c.cover_image_url, sections: c.enabled_sections, order: meta.order, featuredCount: c.featured_property_ids.length, viewCount: c.view_count, theme: meta.preset, phone: c.phone, whatsapp: c.whatsapp, email: c.email, updatedAt: meta.updatedAt },
      analytics: { visitors: a.visitors, leads: a.leads, propertyViews: a.propertyViews, conversionRate: a.conversionRate, whatsappClicks: a.whatsappClicks, calls: a.calls },
    };
  }
  const [c, a] = await Promise.all([getOfficeWebsiteForManager().catch(() => null), getOfficeWebsiteAnalytics().catch(() => emptyAnalytics)]);
  if (!c) return { config: null, analytics: emptyAnalytics };
  const meta = await readSiteMeta("office", orgId, null);
  return {
    config: { target: "office", slug: c.slug, status: c.status, title: c.office_name, headline: c.headline_hebrew, description: c.description_hebrew, imageUrl: c.logo_url ?? c.cover_image_url, sections: c.enabled_sections, order: meta.order, featuredCount: c.featured_property_ids.length, viewCount: c.view_count, theme: meta.preset, phone: c.phone, whatsapp: c.whatsapp, email: c.email, updatedAt: meta.updatedAt },
    analytics: { visitors: a.visitors, leads: a.leads, propertyViews: a.propertyViews, conversionRate: a.conversionRate, whatsappClicks: a.whatsappClicks, calls: a.calls },
  };
}

/** The unified website builder view for a target. Null-config → empty builder. */
export async function getWebsiteBuilder(target: BuilderTarget = "agent"): Promise<BuilderView | { missing: true; target: BuilderTarget }> {
  const { config, analytics } = await loadConfig(target);
  if (!config) return { missing: true, target };
  return assembleBuilderView({ config, analytics, notes: [] });
}

/** Persist section order + visibility into the existing columns (theme + enabled_sections). */
export async function saveWebsiteLayout(target: BuilderTarget, order: string[], sections: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  const { orgId, userId } = await orgUser();
  if (!orgId) return { ok: false, error: "no org" };
  try {
    const db = await createClient();
    // Merge order into the existing theme jsonb (preserve other theme keys).
    let readQ = db.from(TABLE(target) as never).select("theme" as never).eq("organization_id" as never, orgId as never);
    if (target === "agent" && userId) readQ = readQ.eq("user_id" as never, userId as never);
    const { data } = await readQ.limit(1).maybeSingle();
    const theme = { ...((data as { theme?: Record<string, unknown> } | null)?.theme ?? {}), order };
    let upd = db.from(TABLE(target) as never).update({ theme, enabled_sections: sections } as never).eq("organization_id" as never, orgId as never);
    if (target === "agent" && userId) upd = upd.eq("user_id" as never, userId as never);
    const { error } = await upd;
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Apply a template — sets order + enabled_sections. Reuses saveWebsiteLayout. */
export async function applyWebsiteTemplate(target: BuilderTarget, templateKey: string): Promise<{ ok: boolean; error?: string }> {
  const t = getTemplate(templateKey);
  if (!t) return { ok: false, error: "template not found" };
  const { order, enabled } = applyTemplate(t);
  return saveWebsiteLayout(target, order, enabled);
}

/** Publish (approval-gated) — reuses the existing publish functions. */
export async function publishWebsite(target: BuilderTarget): Promise<{ ok: boolean; error?: string }> {
  try { if (target === "agent") await publishAgentWebsite(); else await publishOfficeWebsite(); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Unpublish — reuses the existing unpublish functions (site goes back to draft). */
export async function unpublishWebsite(target: BuilderTarget): Promise<{ ok: boolean; error?: string }> {
  try { if (target === "agent") await unpublishAgentWebsite(); else await unpublishOfficeWebsite(); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Persist the chosen theme PRESET into the existing theme jsonb (merge — keeps order).
 *  The public renderers read theme.preset via branding.theme, so it applies live. */
export async function saveWebsiteTheme(target: BuilderTarget, preset: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSiteTheme(preset)) return { ok: false, error: "invalid theme" };
  const { orgId, userId } = await orgUser();
  if (!orgId) return { ok: false, error: "no org" };
  try {
    const db = await createClient();
    let readQ = db.from(TABLE(target) as never).select("theme" as never).eq("organization_id" as never, orgId as never);
    if (target === "agent" && userId) readQ = readQ.eq("user_id" as never, userId as never);
    const { data } = await readQ.limit(1).maybeSingle();
    const theme = { ...((data as { theme?: Record<string, unknown> } | null)?.theme ?? {}), preset };
    let upd = db.from(TABLE(target) as never).update({ theme } as never).eq("organization_id" as never, orgId as never);
    if (target === "agent" && userId) upd = upd.eq("user_id" as never, userId as never);
    const { error } = await upd;
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Persist contact channels (whatsapp/phone/email) — REUSES the existing website
 *  update functions; these power the public lead CTA + contact block. */
export async function saveWebsiteContact(target: BuilderTarget, contact: { phone?: string | null; whatsapp?: string | null; email?: string | null }): Promise<{ ok: boolean; error?: string }> {
  try {
    const patch = {
      ...(contact.phone !== undefined ? { phone: contact.phone ?? "" } : {}),
      ...(contact.whatsapp !== undefined ? { whatsapp: contact.whatsapp ?? "" } : {}),
      ...(contact.email !== undefined ? { email: contact.email ?? "" } : {}),
    };
    if (target === "agent") await updateAgentWebsite(patch);
    else await updateOfficeWebsite(patch as Parameters<typeof updateOfficeWebsite>[0]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

// ── Broker /my summary (Part 14) ────────────────────────────────────────────
export async function getBrokerWebsite(): Promise<BrokerWebsiteSummary> {
  const empty: BrokerWebsiteSummary = { hasSite: false, published: false, healthScore: 0, seoAlerts: 0, landingDrafts: 0, approvalsPending: 0, alerts: [] };
  const { config, analytics } = await loadConfig("agent");
  if (!config) return empty;
  const recs = buildRecommendations(config, analytics);
  const health = buildHealth(config, recs);
  const seo = analyzeSeo(config);
  const alerts = recs.slice(0, 4).map((r) => ({ title: r.title, detail: r.why }));
  return { hasSite: true, published: config.status === "published", healthScore: health.score, seoAlerts: seo.issues.length, landingDrafts: config.status !== "published" ? 1 : 0, approvalsPending: config.status !== "published" ? 1 : 0, alerts };
}

// ── Property website presence (Part 13) ─────────────────────────────────────
export async function getPropertyWebsitePresence(propertyId: string): Promise<PropertyWebsitePresence> {
  const empty: PropertyWebsitePresence = { publishedPages: [], landingPages: [], seoStatus: "missing", views: 0, campaignLinks: [] };
  if (!propertyId) return empty;
  const { config } = await loadConfig("office").then((r) => (r.config ? r : loadConfig("agent")));
  const publishedPages: PropertyWebsitePresence["publishedPages"] = [];
  const landingPages: PropertyWebsitePresence["landingPages"] = [];
  if (config?.slug && config.status === "published") {
    const base = config.target === "agent" ? `/ai-agent/${config.slug}` : `/ai-site/${config.slug}`;
    publishedPages.push({ label: "עמוד הנכס באתר", href: `${base}/property/${propertyId}` });
    landingPages.push({ label: "דף נחיתה לנכס", href: `${base}/property/${propertyId}` });
  }
  const seoStatus: PropertyWebsitePresence["seoStatus"] = publishedPages.length ? "ok" : config?.slug ? "partial" : "missing";
  const campaignLinks = [{ label: "שיווק בפייסבוק", href: "/facebook" }, { label: "יומן שיווק הנכס", href: `/properties/${propertyId}` }];
  return { publishedPages, landingPages, seoStatus, views: config?.viewCount ?? 0, campaignLinks };
}

// ── Ask ZONO for website (Part 12) ──────────────────────────────────────────
export interface WebAnswer { question: string; answer: string; items: { title: string; detail: string }[] }
export async function answerWebsiteQuestion(question: string): Promise<WebAnswer> {
  const q = (question || "").trim();
  const { config, analytics } = await loadConfig("agent");
  if (!config) return { question: q, answer: "עדיין לא נוצר אתר. צור אתר כדי לקבל המלצות.", items: [] };
  const recs = buildRecommendations(config, analytics);
  const seo = analyzeSeo(config);

  if (/SEO|קידום|גוגל|אזור.*חסר/.test(q)) {
    return { question: q, answer: seo.ready ? "ה-SEO תקין." : `${seo.issues.length} בעיות SEO לתיקון.`, items: seo.issues.map((i) => ({ title: i.field, detail: i.issue })) };
  }
  if (/דף.*חסר|סקשן.*חסר|חסר.*דף/.test(q)) {
    const miss = recs.filter((r) => r.kind === "missing_section" || r.kind === "missing_cta" || r.kind === "missing_faq");
    return { question: q, answer: miss.length ? `${miss.length} סקשנים חיוניים חסרים.` : "כל הסקשנים החיוניים מוצגים.", items: miss.map((r) => ({ title: r.title, detail: r.why })) };
  }
  if (/הבלט|נכס|featured/.test(q)) {
    return { question: q, answer: config.featuredCount ? `${config.featuredCount} נכסים מובלטים כרגע.` : "לא הובלטו נכסים — כדאי לבחור נכסים איכותיים.", items: [{ title: "נכסים מובלטים", detail: `${config.featuredCount} נכסים` }] };
  }
  // How to improve the site → top recommendations.
  return { question: q, answer: recs.length ? `${recs.length} המלצות לשיפור האתר. התחל מהחשובות.` : "האתר במצב טוב.", items: recs.slice(0, 6).map((r) => ({ title: r.title, detail: r.why })) };
}
