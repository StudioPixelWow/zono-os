// ============================================================================
// 👤 ZONO — Agent Personal Area read model (server-only). The SINGLE source of
// truth for the broker's professional identity: the existing `agent_websites`
// row (one per org+user) enriched with the `users` identity, the office logo
// (office_websites) and a real completion score. No new tables — this reads/
// composes existing structures. All writes go through the existing actions.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { createOrGetAgentWebsite } from "@/lib/agent-website/service";

export interface ProfileTestimonial {
  id: string; name: string; text: string; rating?: number | null;
  transactionType?: string | null; area?: string | null; visible?: boolean; featured?: boolean;
}
export interface CompletionItem { key: string; label: string; done: boolean; hint: string }
export interface MyProfile {
  orgId: string; userId: string;
  slug: string | null; status: "draft" | "published" | "disabled";
  displayName: string; title: string; headline: string; bio: string;
  yearsExperience: number | null; languages: string[]; specialties: string[]; serviceAreas: string[];
  phone: string; whatsapp: string; email: string;
  profileImageUrl: string | null; coverImageUrl: string | null;
  social: Record<string, string>;
  testimonials: ProfileTestimonial[];
  achievements: string[];
  themePreset: string | null;
  enabledSections: Record<string, boolean>;
  officeName: string; officeLogo: string | null;
  userName: string; userTitle: string | null; userAvatar: string | null; roleLabel: string; isManager: boolean;
  completion: { score: number; items: CompletionItem[] };
  publicUrl: string | null;
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

function parseTestimonials(v: unknown): ProfileTestimonial[] {
  if (!Array.isArray(v)) return [];
  return v.map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    return {
      id: s(o.id) || `t${i}`, name: s(o.name) || "לקוח/ה", text: s(o.text),
      rating: typeof o.rating === "number" ? o.rating : null,
      transactionType: sn(o.transactionType), area: sn(o.area),
      visible: o.visible !== false, featured: o.featured === true,
    };
  }).filter((t) => t.text.trim().length > 0);
}

function completion(p: Omit<MyProfile, "completion">): { score: number; items: CompletionItem[] } {
  const items: CompletionItem[] = [
    { key: "photo", label: "תמונת פרופיל", done: !!p.profileImageUrl, hint: "הוסף תמונת פרופיל" },
    { key: "bio", label: "תיאור מקצועי", done: p.bio.trim().length >= 30, hint: "השלם תיאור מקצועי" },
    { key: "title", label: "תפקיד / התמחות", done: p.title.trim().length > 0, hint: "הוסף תפקיד והתמחות" },
    { key: "contact", label: "פרטי קשר", done: !!(p.phone || p.whatsapp), hint: "הוסף טלפון / וואטסאפ" },
    { key: "expertise", label: "אזורי התמחות", done: p.serviceAreas.length >= 3 || p.specialties.length >= 3, hint: "הוסף 3 אזורי התמחות" },
    { key: "testimonial", label: "המלצה", done: p.testimonials.some((t) => t.visible !== false), hint: "הוסף המלצה" },
    { key: "social", label: "רשת חברתית", done: Object.values(p.social).some((v) => !!v), hint: "הוסף קישור לרשת חברתית" },
    { key: "website", label: "אתר פעיל", done: p.status === "published", hint: "פרסם את אתר הסוכן" },
  ];
  const done = items.filter((i) => i.done).length;
  return { score: Math.round((done / items.length) * 100), items };
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return null;
  const orgId = profile.org_id, userId = user.id;
  const db = await createClient();

  const row = (await createOrGetAgentWebsite()) as Record<string, unknown>;
  const [meR, orgR, offR] = await Promise.all([
    db.from("users").select("full_name,title,avatar_url,role_id").eq("id", userId).maybeSingle(),
    db.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    db.from("office_websites").select("logo_url").eq("organization_id", orgId).maybeSingle(),
  ]);
  const me = (meR.data ?? {}) as { full_name?: string; title?: string | null; avatar_url?: string | null; role_id?: string | null };
  const roleByIdR = me.role_id ? await db.from("roles").select("key,name").eq("id", me.role_id).maybeSingle() : { data: null };
  const roleRow = (roleByIdR.data ?? null) as { key: string; name: string } | null;
  const isManager = !!roleRow && ["owner", "admin", "manager"].includes(roleRow.key);

  const theme = (row.theme ?? {}) as { preset?: unknown };
  const metadata = (row.metadata ?? {}) as { achievements?: unknown };
  const status = (["draft", "published", "disabled"].includes(String(row.status)) ? row.status : "draft") as MyProfile["status"];
  const slug = sn(row.slug);

  const base: Omit<MyProfile, "completion"> = {
    orgId, userId, slug, status,
    displayName: s(row.display_name) || s(me.full_name) || "מתווך/ת",
    title: s(row.title_hebrew), headline: s(row.headline_hebrew), bio: s(row.bio_hebrew),
    yearsExperience: typeof row.years_experience === "number" ? row.years_experience : null,
    languages: arr(row.languages), specialties: arr(row.specialties), serviceAreas: arr(row.service_areas),
    phone: s(row.phone), whatsapp: s(row.whatsapp), email: s(row.email),
    profileImageUrl: sn(row.profile_image_url), coverImageUrl: sn(row.cover_image_url),
    social: (row.social_links && typeof row.social_links === "object" ? row.social_links : {}) as Record<string, string>,
    testimonials: parseTestimonials(row.testimonials),
    achievements: arr(metadata.achievements),
    themePreset: typeof theme.preset === "string" ? theme.preset : null,
    enabledSections: (row.enabled_sections && typeof row.enabled_sections === "object" ? row.enabled_sections : {}) as Record<string, boolean>,
    officeName: s((orgR.data as { name?: string } | null)?.name) || "המשרד",
    officeLogo: sn((offR.data as { logo_url?: string } | null)?.logo_url),
    userName: s(me.full_name), userTitle: sn(me.title), userAvatar: sn(me.avatar_url),
    roleLabel: roleRow?.name ?? "סוכן", isManager,
    publicUrl: status === "published" && slug ? `/ai-agent/${slug}` : null,
  };
  return { ...base, completion: completion(base) };
}
