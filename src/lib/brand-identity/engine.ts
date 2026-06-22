// ============================================================================
// ZONO — Brand Identity Engine (pure, client-safe, deterministic)
// ----------------------------------------------------------------------------
// Catalogs (styles/tones), completion scoring, AI design profile builder, and
// the inheritance resolver (agent inherits office brand unless override allowed).
// This is the design brain consumed by every generator.
// ============================================================================

export const BRAND_STYLES: { key: string; label: string }[] = [
  { key: "professional", label: "מקצועי" }, { key: "luxury", label: "יוקרה" }, { key: "modern", label: "מודרני" },
  { key: "minimal", label: "מינימלי" }, { key: "corporate", label: "תאגידי" }, { key: "family", label: "משפחתי" },
  { key: "premium_real_estate", label: "נדל״ן פרימיום" }, { key: "investment", label: "השקעות" }, { key: "project_marketing", label: "שיווק פרויקטים" },
];
export const BRAND_TONES: { key: string; label: string }[] = [
  { key: "warm", label: "חם ואישי" }, { key: "authoritative", label: "סמכותי" }, { key: "energetic", label: "אנרגטי" },
  { key: "calm", label: "רגוע ואמין" }, { key: "luxury", label: "יוקרתי" }, { key: "direct", label: "ישיר ומכירתי" },
];
export const POST_STYLES: { key: string; label: string }[] = [
  { key: "clean", label: "נקי" }, { key: "bold", label: "בולט" }, { key: "editorial", label: "מערכתי" }, { key: "data", label: "מבוסס נתונים" },
];
export const VISIBILITY: { key: string; label: string }[] = [
  { key: "public", label: "ציבורי" }, { key: "org", label: "פנים-ארגוני" }, { key: "private", label: "פרטי" },
];

export interface BrandProfileLike {
  profile_image_url?: string | null; logo_url?: string | null; brand_primary?: string | null; brand_style?: string | null;
  full_name?: string | null; phone?: string | null; brand_tone?: string | null; brand_secondary?: string | null;
}

export interface CompletionBreakdown { score: number; profileComplete: boolean; logoUploaded: boolean; colorsSelected: boolean; profileImageUploaded: boolean; styleSelected: boolean }

export function computeCompletion(p: BrandProfileLike): CompletionBreakdown {
  const profileComplete = Boolean(p.full_name && p.phone);
  const logoUploaded = Boolean(p.logo_url);
  const colorsSelected = Boolean(p.brand_primary);
  const profileImageUploaded = Boolean(p.profile_image_url);
  const styleSelected = Boolean(p.brand_style);
  const parts = [profileComplete, logoUploaded, colorsSelected, profileImageUploaded, styleSelected];
  const score = Math.round((parts.filter(Boolean).length / parts.length) * 100);
  return { score, profileComplete, logoUploaded, colorsSelected, profileImageUploaded, styleSelected };
}

/** Compose the AI design profile (the design brain) from the saved brand fields. */
export function buildAiDesignProfile(p: Record<string, unknown>): Record<string, unknown> {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    colors: { primary: p.brand_primary ?? null, secondary: p.brand_secondary ?? null, accent: p.brand_accent ?? null, palette: arr(p.brand_palette) },
    logos: { primary: p.logo_url ?? null, dark: p.logo_dark_url ?? null, light: p.logo_light_url ?? null, transparent: p.logo_transparent_url ?? null },
    profileImage: p.profile_image_url ?? null,
    style: p.brand_style ?? null,
    visualLanguage: p.preferred_design_language ?? p.brand_style ?? null,
    contentTone: p.communication_tone ?? p.brand_tone ?? null,
    designPreferences: { postStyle: p.preferred_post_style ?? null, ctaStyle: p.preferred_cta_style ?? null, personality: p.brand_personality ?? null, audience: p.target_audience ?? null, writingStyle: p.writing_style ?? null },
    generatedAt: new Date().toISOString(),
  };
}

export interface EffectiveBrand {
  source: "agent" | "office" | "merged" | "none";
  primary: string | null; secondary: string | null; accent: string | null; palette: string[];
  logo: string | null; profileImage: string | null; style: string | null; tone: string | null;
  agentName: string | null; phone: string | null; whatsapp: string | null; officeName: string | null;
}

/** Resolve effective brand: agent overrides office only when allowed + not inheriting. */
export function resolveEffectiveBrand(agent: Record<string, unknown> | null, office: Record<string, unknown> | null): EffectiveBrand {
  const pick = (k: string): unknown => {
    const inheriting = agent ? Boolean(agent.inherit_brand_settings) : true;
    const officeAllows = office ? (office.allow_agent_override !== false) : true;
    // If agent inherits (or office forbids override), prefer office value, fallback agent.
    if (inheriting || !officeAllows) return (office?.[k] ?? agent?.[k]) ?? null;
    return (agent?.[k] ?? office?.[k]) ?? null;
  };
  const str = (k: string) => { const v = pick(k); return typeof v === "string" ? v : null; };
  const palV = pick("brand_palette");
  const source: EffectiveBrand["source"] = agent && office ? "merged" : agent ? "agent" : office ? "office" : "none";
  return {
    source,
    primary: str("brand_primary"), secondary: str("brand_secondary"), accent: str("brand_accent"),
    palette: Array.isArray(palV) ? (palV as unknown[]).filter((x) => typeof x === "string") as string[] : [],
    logo: str("logo_url"), profileImage: (typeof agent?.profile_image_url === "string" ? agent.profile_image_url as string : null) ?? str("logo_url"),
    style: str("brand_style"), tone: str("brand_tone"),
    agentName: (typeof agent?.full_name === "string" ? agent.full_name as string : null) ?? str("full_name"),
    phone: (typeof agent?.phone === "string" ? agent.phone as string : null) ?? str("phone"),
    whatsapp: (typeof agent?.whatsapp === "string" ? agent.whatsapp as string : null) ?? str("whatsapp"),
    officeName: str("office_name"),
  };
}
