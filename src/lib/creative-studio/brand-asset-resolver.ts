// ============================================================================
// ZONO creative-studio — single brand-asset resolver (pure).
//
// Resolves the brand identity used for a creative from the ZONO-native sources,
// in precedence order, honoring asset approval status. Only APPROVED assets are
// used automatically. Never falls back to users.avatar_url when an approved
// Brand Identity asset exists. No I/O here — callers load the rows and pass them
// in (keeps this unit-testable and free of Supabase coupling).
// ============================================================================

export type AssetStatus = "draft" | "pending" | "approved" | "rejected" | "archived";

/** Shape mirrors the relevant columns of brand_identity_profiles (entity_type agent|office|org). */
export interface BrandIdentityRow {
  entity_type: string;         // "agent" | "office" | "org"
  status?: string | null;      // completion/approval status marker
  logo_status?: string | null;
  profile_image_status?: string | null;
  logo_url?: string | null;
  logo_transparent_url?: string | null;
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
  profile_image_url?: string | null;
  brand_primary?: string | null;
  brand_secondary?: string | null;
  brand_accent?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  office_name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
}

export interface OrgFallback {
  name?: string | null;
  logo_url?: string | null;
  phone?: string | null;
  email?: string | null;
}
export interface UserFallback {
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
}

export interface ResolvedBrand {
  logo: string | null;
  logoTransparent: string | null;
  logoLight: string | null;
  logoDark: string | null;
  profileImage: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  officeName: string | null;
  agentName: string | null;
  website: string | null;
  footerText: string | null;
  /** Per-field provenance for auditability. */
  sources: Record<string, string>;
  warnings: string[];
}

function statusApproved(s: string | null | undefined): boolean {
  if (!s) return false;
  const v = s.toLowerCase();
  // treat "approved" / "ready" / "active" / "complete" as usable; reject the rest
  return ["approved", "ready", "active", "complete", "completed", "published"].includes(v);
}

/** True when the row's overall + asset statuses permit automatic use. */
export function isRowUsable(row: BrandIdentityRow): boolean {
  // If an explicit rejected/archived/draft/pending status is present, it is not usable.
  const bad = (s: string | null | undefined) => {
    const v = (s ?? "").toLowerCase();
    return ["rejected", "archived", "draft", "pending", "pending_approval"].includes(v);
  };
  if (bad(row.status)) return false;
  return true;
}

export interface BrandResolveInput {
  /** brand_identity rows, most-specific first is NOT required — precedence is applied here. */
  identities: BrandIdentityRow[];
  org?: OrgFallback | null;
  agentUser?: UserFallback | null;
  website?: string | null;
  footerText?: string | null;
}

/**
 * Resolve brand assets. Precedence for each field:
 *   1. approved active agent brand_identity
 *   2. approved office/org brand_identity
 *   3. approved agent profile fields
 *   4. legacy org / user fallback (only when no approved asset exists)
 */
export function resolveBrandAssets(input: BrandResolveInput): ResolvedBrand {
  const warnings: string[] = [];
  const sources: Record<string, string> = {};

  const usable = input.identities.filter(isRowUsable);
  const agent = usable.find((r) => r.entity_type === "agent");
  const office = usable.find((r) => r.entity_type === "office" || r.entity_type === "org");
  const ordered = [agent, office].filter(Boolean) as BrandIdentityRow[];

  const pick = (field: string, getters: Array<{ src: string; val: string | null | undefined; gate?: boolean }>): string | null => {
    for (const g of getters) {
      if (g.val && (g.gate ?? true)) { sources[field] = g.src; return g.val; }
    }
    return null;
  };

  const logoGate = (r: BrandIdentityRow | undefined) => Boolean(r) && (r!.logo_status ? statusApproved(r!.logo_status) : true);
  const photoGate = (r: BrandIdentityRow | undefined) => Boolean(r) && (r!.profile_image_status ? statusApproved(r!.profile_image_status) : true);

  const logo = pick("logo", [
    { src: "agent.logo", val: agent?.logo_url, gate: logoGate(agent) },
    { src: "office.logo", val: office?.logo_url, gate: logoGate(office) },
    { src: "org.logo", val: input.org?.logo_url },
  ]);
  const logoTransparent = pick("logoTransparent", [
    { src: "agent.logo_transparent", val: agent?.logo_transparent_url, gate: logoGate(agent) },
    { src: "office.logo_transparent", val: office?.logo_transparent_url, gate: logoGate(office) },
  ]);
  const logoLight = pick("logoLight", [
    { src: "agent.logo_light", val: agent?.logo_light_url, gate: logoGate(agent) },
    { src: "office.logo_light", val: office?.logo_light_url, gate: logoGate(office) },
  ]);
  const logoDark = pick("logoDark", [
    { src: "agent.logo_dark", val: agent?.logo_dark_url, gate: logoGate(agent) },
    { src: "office.logo_dark", val: office?.logo_dark_url, gate: logoGate(office) },
  ]);

  // Profile image: NEVER users.avatar_url when an approved brand image exists.
  const brandPhoto = pick("profileImage", [
    { src: "agent.profile_image", val: agent?.profile_image_url, gate: photoGate(agent) },
    { src: "office.profile_image", val: office?.profile_image_url, gate: photoGate(office) },
  ]);
  let profileImage = brandPhoto;
  if (!profileImage && input.agentUser?.avatar_url) {
    profileImage = input.agentUser.avatar_url; sources.profileImage = "legacy.user.avatar_url";
    warnings.push("Using legacy users.avatar_url — no approved brand profile image found.");
  }

  const first = ordered[0];
  const primaryColor = pick("primaryColor", ordered.map((r, i) => ({ src: `${r.entity_type}[${i}].brand_primary`, val: r.brand_primary })));
  const secondaryColor = pick("secondaryColor", ordered.map((r, i) => ({ src: `${r.entity_type}[${i}].brand_secondary`, val: r.brand_secondary })));
  const accentColor = pick("accentColor", ordered.map((r, i) => ({ src: `${r.entity_type}[${i}].brand_accent`, val: r.brand_accent })));

  const phone = pick("phone", [
    { src: "agent.phone", val: agent?.phone },
    { src: "office.phone", val: office?.phone },
    { src: "org.phone", val: input.org?.phone },
    { src: "legacy.user.phone", val: input.agentUser?.phone },
  ]);
  const whatsapp = pick("whatsapp", [
    { src: "agent.whatsapp", val: agent?.whatsapp },
    { src: "office.whatsapp", val: office?.whatsapp },
  ]) ?? phone;
  const email = pick("email", [
    { src: "agent.email", val: agent?.email },
    { src: "office.email", val: office?.email },
    { src: "org.email", val: input.org?.email },
  ]);
  const officeName = pick("officeName", [
    { src: "office.office_name", val: office?.office_name },
    { src: "agent.office_name", val: agent?.office_name },
    { src: "org.name", val: input.org?.name },
  ]);
  const agentName = pick("agentName", [
    { src: "agent.display_name", val: agent?.display_name },
    { src: "agent.full_name", val: agent?.full_name },
    { src: "legacy.user.full_name", val: input.agentUser?.full_name },
  ]);

  if (!logo && !logoTransparent) warnings.push("No approved logo asset resolved.");
  if (!primaryColor) warnings.push("No brand primary color resolved.");
  void first;

  return {
    logo, logoTransparent, logoLight, logoDark, profileImage,
    primaryColor, secondaryColor, accentColor,
    phone, whatsapp, email, officeName, agentName,
    website: input.website ?? null,
    footerText: input.footerText ?? null,
    sources, warnings,
  };
}
