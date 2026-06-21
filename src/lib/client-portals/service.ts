/**
 * Client Portal OS — server service. The first client-facing layer.
 *
 * SECURITY MODEL
 * - Public access is by a high-entropy token. Only its SHA-256 hash is stored
 *   (`access_token_hash`); the raw token is returned once to the agent and lives
 *   only in the share link. Public reads go through `getPublicPortalByToken`
 *   using the service-role client AFTER validating the hash + status — never via
 *   RLS, and the returned shape is sanitised (no org id, no internal scores, no
 *   raw payloads, no token hash, only approved + visible sections/items).
 * - Internal reads/writes are org-scoped RLS via the authenticated client.
 *
 * No LLM. No auto-send. Generators emit ONLY curated, client-safe fields.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getBuyerById } from "@/lib/buyers/repository";
import { getSellerById } from "@/lib/sellers/repository";
import { getPropertyById } from "@/lib/properties/repository";
import { recommendedPropertiesForBuyer, recommendedBuyersForProperty } from "@/lib/matching-intelligence/service";
import { listRecommendationsForEntity } from "@/lib/recommendations/service";
import { logActivityEvent } from "@/lib/activity/service";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hashOpt = (s: string | null | undefined) => (s ? sha256(s).slice(0, 32) : null);

export type PortalType = "buyer" | "seller" | "lead" | "deal" | "property";

// ── Curated section/item builders ────────────────────────────────────────────
interface SectionDraft { type: string; title: string; content: Record<string, unknown>; requiresApproval: boolean; items: ItemDraft[] }
interface ItemDraft { type: string; title: string; description?: string; data: Record<string, unknown>; sourceType?: string; sourceId?: string }

// Only safe, comparable transaction fields are ever exposed (no raw payload).
async function similarTransactions(orgId: string, city: string | null, neighborhood: string | null): Promise<ItemDraft[]> {
  if (!city) return [];
  const admin = createServiceRoleClient();
  let q = admin.from("property_transactions")
    .select("deal_date,deal_amount,price_per_sqm,neighborhood_name,street,rooms,area")
    .eq("organization_id", orgId).eq("city_name", city).order("deal_date", { ascending: false }).limit(8);
  if (neighborhood) q = q.eq("neighborhood_name", neighborhood);
  const { data } = await q;
  let rows = (data ?? []) as { deal_date: string | null; deal_amount: number | null; price_per_sqm: number | null; neighborhood_name: string | null; street: string | null; rooms: number | null; area: number | null }[];
  if (!rows.length && neighborhood) {
    const { data: c } = await admin.from("property_transactions").select("deal_date,deal_amount,price_per_sqm,neighborhood_name,street,rooms,area").eq("organization_id", orgId).eq("city_name", city).order("deal_date", { ascending: false }).limit(8);
    rows = (c ?? []) as typeof rows;
  }
  // Confidence gate: only show when there is a meaningful sample.
  if (rows.length < 3) return [];
  return rows.map((t) => ({
    type: "transaction", title: `${t.neighborhood_name ?? city}${t.street ? " · " + t.street : ""}`,
    data: { date: t.deal_date, price: t.deal_amount, price_per_sqm: t.price_per_sqm, rooms: t.rooms, area: t.area, neighborhood: t.neighborhood_name },
  }));
}

async function neighborhoodInsight(orgId: string, city: string | null, neighborhood: string | null): Promise<Record<string, unknown> | null> {
  if (!city) return null;
  const admin = createServiceRoleClient();
  const key = neighborhood ? `${city}|${neighborhood}` : city;
  const { data } = await admin.from("territory_profiles")
    .select("demand_score,supply_score,avg_price_sqm,growth_score,confidence_score,territory_level")
    .eq("organization_id", orgId).eq("territory_type", neighborhood ? "neighborhood" : "city").eq("territory_key", key).maybeSingle();
  if (!data) return null;
  const d = data as { demand_score: number; supply_score: number; avg_price_sqm: number | null; growth_score: number; confidence_score: number };
  if (d.confidence_score < 25) return null; // never present low-confidence as fact
  return {
    demand: d.demand_score >= 66 ? "גבוה" : d.demand_score >= 33 ? "בינוני" : "נמוך",
    supply: d.supply_score >= 66 ? "גבוה" : d.supply_score >= 33 ? "בינוני" : "נמוך",
    avg_price_sqm: d.avg_price_sqm, trend: d.growth_score >= 55 ? "עולה" : d.growth_score <= 35 ? "יורד" : "יציב",
    confidence: d.confidence_score >= 70 ? "גבוה" : "בינוני",
  };
}

async function agentContact(orgId: string, createdBy: string | null): Promise<Record<string, unknown>> {
  const admin = createServiceRoleClient();
  let agent: { full_name: string | null; email: string | null; phone: string | null } | null = null;
  if (createdBy) {
    const { data } = await admin.from("users").select("*").eq("id", createdBy).maybeSingle();
    const r = (data ?? null) as Record<string, unknown> | null;
    if (r) agent = { full_name: (r.full_name as string) ?? null, email: (r.email as string) ?? null, phone: (r.phone as string) ?? null };
  }
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return { agent_name: agent?.full_name ?? null, agent_email: agent?.email ?? null, agent_phone: agent?.phone ?? null, office_name: (org as { name?: string } | null)?.name ?? null };
}

// Curated recommendations (review-safe only; no internal evidence weights).
async function curatedRecommendations(entityType: string, entityId: string): Promise<ItemDraft[]> {
  const recs = await listRecommendationsForEntity(entityType, entityId).catch(() => []);
  return recs.filter((r) => r.review_status !== "needs_more_data" && (r.status === "new" || r.status === "reviewed" || r.status === "accepted")).slice(0, 6)
    .map((r) => ({ type: "recommendation", title: r.title_hebrew, description: r.next_best_action_hebrew ?? undefined, data: { reason: r.reason_hebrew, score: r.recommendation_score } }));
}

// ── Generators (Parts 3-6) ───────────────────────────────────────────────────
async function buildBuyerSections(orgId: string, buyerId: string): Promise<SectionDraft[]> {
  const buyer = await getBuyerById(buyerId);
  if (!buyer) throw new Error("הקונה לא נמצא");
  const city = (buyer.preferred_areas ?? [])[0] ?? null;
  const sections: SectionDraft[] = [];

  sections.push({
    type: "summary", title: "פרופיל החיפוש שלך", requiresApproval: false, items: [],
    content: { budget_min: buyer.budget_min, budget_max: buyer.budget_max, areas: buyer.preferred_areas ?? [], types: buyer.preferred_types ?? [], rooms_min: buyer.rooms_min, rooms_max: buyer.rooms_max },
  });

  // Recommended properties (from matches; curated fields only)
  const matches = await recommendedPropertiesForBuyer(buyerId).catch(() => []);
  const propItems: ItemDraft[] = [];
  if (matches.length) {
    const admin = createServiceRoleClient();
    const { data: props } = await admin.from("properties").select("id,title,price,rooms,size_sqm,city,neighborhood,type").in("id", matches.map((m) => m.otherId)).limit(20);
    const byId = new Map(((props ?? []) as { id: string; title: string; price: number; rooms: number | null; size_sqm: number | null; city: string | null; neighborhood: string | null; type: string }[]).map((p) => [p.id, p]));
    for (const m of matches.slice(0, 8)) {
      const p = byId.get(m.otherId); if (!p) continue;
      propItems.push({ type: "property", title: p.title, sourceType: "property", sourceId: p.id,
        data: { price: p.price, rooms: p.rooms, area: p.size_sqm, neighborhood: p.neighborhood, city: p.city, type: p.type, match_score: Math.round(m.compatibility), why: "מתאים לפרופיל החיפוש שלך" } });
    }
  }
  sections.push({ type: "recommended_properties", title: "נכסים שמתאימים לך", requiresApproval: true, content: {}, items: propItems });

  if (propItems.length >= 2) {
    sections.push({ type: "property_comparison", title: "השוואת נכסים", requiresApproval: true, content: { fields: ["price", "rooms", "area", "neighborhood"] },
      items: propItems.map((p) => ({ type: "property", title: p.title, data: { price: p.data.price, rooms: p.data.rooms, area: p.data.area, neighborhood: p.data.neighborhood } })) });
  }

  const txns = await similarTransactions(orgId, city, null);
  if (txns.length) sections.push({ type: "similar_transactions", title: "עסקאות דומות שנמכרו", requiresApproval: true, content: { note: "מבוסס עסקאות אמת" }, items: txns });

  const hood = await neighborhoodInsight(orgId, city, null);
  if (hood) sections.push({ type: "neighborhood_insights", title: "תובנות שכונה", requiresApproval: true, content: hood, items: [] });

  sections.push({ type: "next_steps", title: "הצעדים הבאים", requiresApproval: false, content: {},
    items: [{ type: "task", title: "קבע צפייה בנכס שאהבת", data: {} }, { type: "task", title: "עבור על הנכסים המומלצים", data: {} }, { type: "task", title: "צור קשר עם הסוכן לכל שאלה", data: {} }] });
  return sections;
}

async function buildSellerSections(orgId: string, entityType: string, entityId: string): Promise<SectionDraft[]> {
  // Accept seller id or property id. Resolve a property to summarise.
  let property: Awaited<ReturnType<typeof getPropertyById>> = null;
  let sellerName: string | null = null;
  if (entityType === "property") {
    property = await getPropertyById(entityId);
  } else {
    const seller = await getSellerById(entityId);
    sellerName = seller?.full_name ?? null;
    const admin = createServiceRoleClient();
    const { data: link } = await admin.from("property_sellers").select("property_id").eq("seller_id", entityId).limit(1).maybeSingle();
    if (link) property = await getPropertyById((link as { property_id: string }).property_id);
  }
  if (!property) throw new Error("לא נמצא נכס למוכר");
  const sections: SectionDraft[] = [];

  sections.push({ type: "summary", title: "תמונת מצב לנכס שלך", requiresApproval: false, content: { title: property.title, price: property.price, rooms: property.rooms, area: property.size_sqm, city: property.city, neighborhood: property.neighborhood, status: "בשיווק", seller: sellerName }, items: [] });

  // Pricing analysis from comparable transactions (honest low-confidence state)
  const txns = await similarTransactions(orgId, property.city, property.neighborhood);
  if (txns.length) {
    const ppsqm = txns.map((t) => t.data.price_per_sqm as number | null).filter((n): n is number => typeof n === "number" && n > 0);
    const avg = ppsqm.length ? Math.round(ppsqm.reduce((a, b) => a + b, 0) / ppsqm.length) : null;
    const est = avg && property.size_sqm ? Math.round(avg * property.size_sqm) : null;
    sections.push({ type: "pricing_analysis", title: "ניתוח מחיר", requiresApproval: true,
      content: { estimated_market_value: est, avg_price_sqm: avg, asking_price: property.price, confidence: txns.length >= 5 ? "גבוה" : "בינוני", explanation: est ? `הערכת שווי מבוססת ${txns.length} עסקאות דומות באזור.` : "אין מספיק עסקאות להערכה ודאית — נדרשת זהירות." },
      items: txns });
  } else {
    sections.push({ type: "pricing_analysis", title: "ניתוח מחיר", requiresApproval: true, content: { confidence: "נמוך", explanation: "אין כרגע מספיק עסקאות דומות באזור להערכת שווי מבוססת." }, items: [] });
  }

  // Buyer demand (aggregate only; no private buyer details)
  const interested = await recommendedBuyersForProperty(property.id).catch(() => []);
  sections.push({ type: "buyer_demand", title: "ביקוש קונים", requiresApproval: true,
    content: { matching_buyers: interested.length, demand: interested.length >= 5 ? "גבוה" : interested.length >= 2 ? "בינוני" : "מתפתח" }, items: [] });

  // Market context
  const hood = await neighborhoodInsight(orgId, property.city, property.neighborhood);
  if (hood) sections.push({ type: "market_context", title: "הקשר שוק", requiresApproval: true, content: hood, items: [] });

  sections.push({ type: "next_steps", title: "פעולות מומלצות", requiresApproval: false, content: {},
    items: [{ type: "task", title: "בחן עדכון מחיר לפי השוק", data: {} }, { type: "task", title: "הגבר חשיפה שיווקית", data: {} }, { type: "task", title: "מעקב אחר פניות וצפיות", data: {} }] });
  return sections;
}

async function buildLeadSections(orgId: string, leadId: string): Promise<SectionDraft[]> {
  const admin = createServiceRoleClient();
  const { data: lead } = await admin.from("leads").select("full_name,property_id").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("הליד לא נמצא");
  const l = lead as { full_name: string; property_id: string | null };
  const sections: SectionDraft[] = [];
  sections.push({ type: "summary", title: "הפנייה שלך", requiresApproval: false, content: { name: l.full_name, status: "בטיפול" }, items: [] });
  if (l.property_id) {
    const { data: p } = await admin.from("properties").select("title,price,rooms,size_sqm,neighborhood,city").eq("id", l.property_id).maybeSingle();
    if (p) { const pr = p as { title: string; price: number; rooms: number | null; size_sqm: number | null; neighborhood: string | null; city: string | null };
      sections.push({ type: "recommended_properties", title: "הנכס שעניין אותך", requiresApproval: true, content: {}, items: [{ type: "property", title: pr.title, data: { price: pr.price, rooms: pr.rooms, area: pr.size_sqm, neighborhood: pr.neighborhood, city: pr.city } }] }); }
  }
  sections.push({ type: "next_steps", title: "הצעדים הבאים", requiresApproval: false, content: {}, items: [{ type: "task", title: "הסוכן יחזור אליך בהקדם", data: {} }, { type: "task", title: "צור קשר לכל שאלה", data: {} }] });
  return sections;
}

async function buildDealSections(orgId: string, dealId: string): Promise<SectionDraft[]> {
  const admin = createServiceRoleClient();
  const { data: deal } = await admin.from("deal_profiles").select("*").eq("id", dealId).maybeSingle();
  const sections: SectionDraft[] = [];
  const stage = (deal as { stage?: string } | null)?.stage ?? "בתהליך";
  sections.push({ type: "deal_progress", title: "התקדמות העסקה", requiresApproval: false, content: { stage }, items: [
    { type: "deal_stage", title: "פתיחת עסקה", data: { done: true } },
    { type: "deal_stage", title: "משא ומתן", data: {} },
    { type: "deal_stage", title: "חתימה", data: {} },
    { type: "deal_stage", title: "סגירה", data: {} },
  ] });
  sections.push({ type: "next_steps", title: "הצעדים הבאים", requiresApproval: false, content: {}, items: [{ type: "task", title: "השלמת מסמכים נדרשים", data: {} }, { type: "task", title: "תיאום פגישה הבאה", data: {} }] });
  void orgId;
  return sections;
}

// ── Create + generate ────────────────────────────────────────────────────────
const PORTAL_TITLES: Record<PortalType, string> = {
  buyer: "פורטל קונה", seller: "פורטל מוכר", lead: "פורטל פנייה", deal: "פורטל עסקה", property: "פורטל נכס",
};

/** Create a portal + curated sections. Returns the raw token (shown once). */
export async function createClientPortal(input: { entityType: string; entityId: string; portalType: PortalType; visibility?: "minimal" | "curated" | "detailed"; clientName?: string; expiresInDays?: number }) {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();

  const token = randomBytes(24).toString("base64url");
  const slug = randomBytes(8).toString("base64url");
  const expires = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : null;

  const { data: portal, error } = await supabase.from("client_portals").insert({
    organization_id: orgId, portal_type: input.portalType, entity_type: input.entityType, entity_id: input.entityId,
    client_name: input.clientName ?? null, title_hebrew: PORTAL_TITLES[input.portalType],
    access_token_hash: sha256(token), access_slug: slug, status: "draft",
    visibility_level: input.visibility ?? "curated", expires_at: expires, created_by: userId,
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  const portalId = (portal as { id: string }).id;

  await generatePortalSections(portalId);
  try { await logActivityEvent({ eventType: "client_portal.created", entityType: input.entityType, entityId: input.entityId, title: "נוצר פורטל ללקוח" }); } catch { /* best-effort */ }
  return { portalId, token, slug };
}

/** (Re)build sections+items for a portal from current intelligence. */
export async function generatePortalSections(portalId: string) {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data: portal } = await supabase.from("client_portals").select("portal_type,entity_type,entity_id").eq("id", portalId).maybeSingle();
  if (!portal) throw new Error("הפורטל לא נמצא");
  const p = portal as { portal_type: PortalType; entity_type: string; entity_id: string };

  let drafts: SectionDraft[] = [];
  if (p.portal_type === "buyer") drafts = await buildBuyerSections(orgId, p.entity_id);
  else if (p.portal_type === "seller" || p.portal_type === "property") drafts = await buildSellerSections(orgId, p.entity_type, p.entity_id);
  else if (p.portal_type === "lead") drafts = await buildLeadSections(orgId, p.entity_id);
  else if (p.portal_type === "deal") drafts = await buildDealSections(orgId, p.entity_id);

  // Agent contact section is always present (safe, public).
  const contact = await agentContact(orgId, null);
  drafts.push({ type: "agent_contact", title: "יצירת קשר", requiresApproval: false, content: contact, items: [] });

  // Clear previous sections/items and re-insert.
  await supabase.from("client_portal_items").delete().eq("portal_id", portalId);
  await supabase.from("client_portal_sections").delete().eq("portal_id", portalId);

  let order = 0;
  for (const d of drafts) {
    const { data: sec } = await supabase.from("client_portal_sections").insert({
      organization_id: orgId, portal_id: portalId, section_type: d.type, title_hebrew: d.title,
      content: d.content as never, sort_order: order++, is_visible: true, requires_approval: d.requiresApproval,
    } as never).select("id").single();
    const sectionId = (sec as { id: string } | null)?.id;
    if (sectionId && d.items.length) {
      await supabase.from("client_portal_items").insert(d.items.map((it, i) => ({
        organization_id: orgId, portal_id: portalId, section_id: sectionId, item_type: it.type,
        source_entity_type: it.sourceType ?? null, source_entity_id: it.sourceId ?? null,
        title_hebrew: it.title, description_hebrew: it.description ?? null, data: it.data as never, is_visible: true, sort_order: i,
      })) as never);
    }
  }
  // Add curated recommendations into a dedicated section for buyer/seller/property.
  if (p.portal_type === "buyer" || p.portal_type === "seller" || p.portal_type === "property") {
    const recItems = await curatedRecommendations(p.entity_type, p.entity_id);
    if (recItems.length) {
      const { data: sec } = await supabase.from("client_portal_sections").insert({
        organization_id: orgId, portal_id: portalId, section_type: "next_steps", title_hebrew: "המלצות מותאמות",
        content: {} as never, sort_order: order++, is_visible: true, requires_approval: true,
      } as never).select("id").single();
      const sid = (sec as { id: string } | null)?.id;
      if (sid) await supabase.from("client_portal_items").insert(recItems.map((it, i) => ({ organization_id: orgId, portal_id: portalId, section_id: sid, item_type: it.type, title_hebrew: it.title, description_hebrew: it.description ?? null, data: it.data as never, is_visible: true, sort_order: i })) as never);
    }
  }
  return { ok: true };
}

export async function regeneratePortalContent(portalId: string) { return generatePortalSections(portalId); }

// ── Lifecycle ────────────────────────────────────────────────────────────────
export async function approvePortal(portalId: string) {
  const { orgId, userId } = await ctx();
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("client_portal_sections").update({ approved_by: userId, approved_at: now } as never).eq("portal_id", portalId);
  await supabase.from("client_portals").update({ status: "active", approved_by: userId, approved_at: now } as never).eq("organization_id", orgId).eq("id", portalId);
  return { ok: true };
}
export async function revokePortal(portalId: string) {
  const { orgId } = await ctx(); const supabase = await createClient();
  await supabase.from("client_portals").update({ status: "revoked" } as never).eq("organization_id", orgId).eq("id", portalId);
  return { ok: true };
}
export async function pausePortal(portalId: string) {
  const { orgId } = await ctx(); const supabase = await createClient();
  await supabase.from("client_portals").update({ status: "paused" } as never).eq("organization_id", orgId).eq("id", portalId);
  return { ok: true };
}
export async function extendPortalExpiration(portalId: string, days = 30) {
  const { orgId } = await ctx(); const supabase = await createClient();
  await supabase.from("client_portals").update({ expires_at: new Date(Date.now() + days * 86_400_000).toISOString(), status: "active" } as never).eq("organization_id", orgId).eq("id", portalId);
  return { ok: true };
}
export async function updatePortalSectionVisibility(sectionId: string, isVisible: boolean) {
  const { orgId } = await ctx(); const supabase = await createClient();
  await supabase.from("client_portal_sections").update({ is_visible: isVisible } as never).eq("organization_id", orgId).eq("id", sectionId);
  return { ok: true };
}
export async function updatePortalItemVisibility(itemId: string, isVisible: boolean) {
  const { orgId } = await ctx(); const supabase = await createClient();
  await supabase.from("client_portal_items").update({ is_visible: isVisible } as never).eq("organization_id", orgId).eq("id", itemId);
  return { ok: true };
}

// ── Public access (service-role; sanitised; validated) ───────────────────────
export interface PublicPortalSection { type: string; title: string | null; content: Record<string, unknown>; items: { type: string; title: string | null; description: string | null; data: Record<string, unknown> }[] }
export interface PublicPortal { title: string | null; description: string | null; portalType: string; clientName: string | null; sections: PublicPortalSection[] }

/**
 * Validate a raw token → return the sanitised public portal, or null when the
 * portal is missing / not active / expired / revoked. Uses the service-role
 * client; returns ONLY approved + visible sections/items with curated content —
 * never org id, token hash, internal scores or raw payloads.
 */
export async function getPublicPortalByToken(token: string): Promise<PublicPortal | "inactive" | null> {
  if (!token || token.length < 8) return null;
  const admin = createServiceRoleClient();
  // Accept either the high-entropy token (hash stored) or the stored slug.
  const { data: portal } = await admin.from("client_portals")
    .select("id,portal_type,title_hebrew,description_hebrew,client_name,status,expires_at")
    .or(`access_token_hash.eq.${sha256(token)},access_slug.eq.${token}`).maybeSingle();
  if (!portal) return null;
  const p = portal as { id: string; portal_type: string; title_hebrew: string | null; description_hebrew: string | null; client_name: string | null; status: string; expires_at: string | null };
  if (p.status !== "active") return "inactive";
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return "inactive";

  const { data: secs } = await admin.from("client_portal_sections")
    .select("id,section_type,title_hebrew,content,is_visible,requires_approval,approved_at,sort_order")
    .eq("portal_id", p.id).eq("is_visible", true).order("sort_order", { ascending: true });
  const sections = ((secs ?? []) as { id: string; section_type: string; title_hebrew: string | null; content: Record<string, unknown>; requires_approval: boolean; approved_at: string | null }[])
    .filter((s) => !s.requires_approval || s.approved_at); // approval gate
  const ids = sections.map((s) => s.id);
  const { data: items } = ids.length ? await admin.from("client_portal_items")
    .select("section_id,item_type,title_hebrew,description_hebrew,data,is_visible,sort_order")
    .in("section_id", ids).eq("is_visible", true).order("sort_order", { ascending: true }) : { data: [] };
  const bySection = new Map<string, { type: string; title: string | null; description: string | null; data: Record<string, unknown> }[]>();
  for (const it of (items ?? []) as { section_id: string; item_type: string; title_hebrew: string | null; description_hebrew: string | null; data: Record<string, unknown> }[]) {
    const arr = bySection.get(it.section_id) ?? []; arr.push({ type: it.item_type, title: it.title_hebrew, description: it.description_hebrew, data: it.data ?? {} }); bySection.set(it.section_id, arr);
  }
  return {
    title: p.title_hebrew, description: p.description_hebrew, portalType: p.portal_type, clientName: p.client_name,
    sections: sections.map((s) => ({ type: s.section_type, title: s.title_hebrew, content: s.content ?? {}, items: bySection.get(s.id) ?? [] })),
  };
}

/** Log a public view (service-role): increment counter + view row + activity. */
export async function logPortalView(token: string, meta: { ip?: string; userAgent?: string; referrer?: string }) {
  if (!token) return;
  const admin = createServiceRoleClient();
  const { data: portal } = await admin.from("client_portals").select("id,organization_id,entity_type,entity_id,view_count,portal_type").or(`access_token_hash.eq.${sha256(token)},access_slug.eq.${token}`).maybeSingle();
  if (!portal) return;
  const p = portal as { id: string; organization_id: string; entity_type: string; entity_id: string; view_count: number; portal_type: string };
  await admin.from("client_portals").update({ view_count: (p.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() } as never).eq("id", p.id);
  await admin.from("client_portal_views").insert({ organization_id: p.organization_id, portal_id: p.id, ip_hash: hashOpt(meta.ip), user_agent_hash: hashOpt(meta.userAgent), referrer: meta.referrer ?? null } as never);
}

// ── Internal reads ───────────────────────────────────────────────────────────
export interface PortalRow { id: string; portal_type: string; entity_type: string; entity_id: string; client_name: string | null; title_hebrew: string | null; status: string; visibility_level: string; view_count: number; last_viewed_at: string | null; expires_at: string | null; access_slug: string | null; created_at: string }

export async function getPortalForInternalUser(portalId: string) {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data: portal } = await supabase.from("client_portals").select("id,portal_type,entity_type,entity_id,client_name,title_hebrew,status,visibility_level,view_count,last_viewed_at,expires_at,access_slug,created_at").eq("organization_id", orgId).eq("id", portalId).maybeSingle();
  if (!portal) return null;
  const { data: secs } = await supabase.from("client_portal_sections").select("id,section_type,title_hebrew,is_visible,requires_approval,approved_at,sort_order").eq("portal_id", portalId).order("sort_order", { ascending: true });
  return { portal: portal as PortalRow, sections: (secs ?? []) as { id: string; section_type: string; title_hebrew: string | null; is_visible: boolean; requires_approval: boolean; approved_at: string | null }[] };
}

export async function listPortalsForEntity(entityType: string, entityId: string): Promise<PortalRow[]> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const { data } = await supabase.from("client_portals").select("id,portal_type,entity_type,entity_id,client_name,title_hebrew,status,visibility_level,view_count,last_viewed_at,expires_at,access_slug,created_at").eq("organization_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
  return (data ?? []) as PortalRow[];
}

export interface PortalCommandCenter { total: number; active: number; buyer: number; seller: number; viewsToday: number; inactive: number; notViewed: number; portals: PortalRow[] }

export async function getPortalCommandCenter(): Promise<PortalCommandCenter> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [allR, viewsR] = await Promise.all([
    supabase.from("client_portals").select("id,portal_type,entity_type,entity_id,client_name,title_hebrew,status,visibility_level,view_count,last_viewed_at,expires_at,access_slug,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(500),
    supabase.from("client_portal_views").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("viewed_at", todayStart.toISOString()),
  ]);
  const all = (allR.data ?? []) as PortalRow[];
  return {
    total: all.length,
    active: all.filter((p) => p.status === "active").length,
    buyer: all.filter((p) => p.portal_type === "buyer").length,
    seller: all.filter((p) => p.portal_type === "seller" || p.portal_type === "property").length,
    viewsToday: viewsR.count ?? 0,
    inactive: all.filter((p) => p.status === "revoked" || p.status === "expired" || p.status === "paused").length,
    notViewed: all.filter((p) => p.status === "active" && p.view_count === 0).length,
    portals: all.slice(0, 100),
  };
}
