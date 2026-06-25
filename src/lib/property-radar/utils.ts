// ============================================================================
// ZONO Property Radar™ — pure utility functions (Phase 1, client-safe).
// Deterministic helpers used by change-detection and outreach: a stable content
// hash for listings, Israeli phone normalization for WhatsApp, and the exact
// Hebrew outreach message + wa.me link builder. No I/O, no runtime deps.
// ============================================================================
import type { NormalizedListingMetadata } from "./providers/types";

// ── createListingContentHash ─────────────────────────────────────────────────
// Stable hash over the price-sensitive fields of a listing. Used to detect when a
// listing actually changed (price / rooms / size / status / title) so the radar
// can skip an expensive full fetch when nothing meaningful moved.
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function createListingContentHash(
  listing: Partial<NormalizedListingMetadata>,
): string {
  const parts = [
    listing.price ?? "",
    listing.rooms ?? "",
    listing.sizeSqm ?? "",
    listing.floor ?? "",
    listing.title ?? "",
    listing.propertyType ?? "",
    listing.city ?? "",
    listing.neighborhood ?? "",
    listing.street ?? "",
    listing.listingType ?? "",
  ].map((v) => String(v).trim().toLowerCase());
  return djb2(parts.join("|"));
}

// ── normalizePhoneForWhatsapp ────────────────────────────────────────────────
// Returns a wa.me-ready international number (no '+', no separators) for Israeli
// numbers, or null when the input can't be a valid IL mobile/landline.
//   050-123-4567  → 972501234567
//   +972 50 1234567 → 972501234567
//   972501234567  → 972501234567
export function normalizePhoneForWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  digits = digits.replace(/\D/g, "");
  if (!digits) return null;

  // Already international (972...) — strip a leading 0 after the country code.
  if (digits.startsWith("972")) {
    const rest = digits.slice(3).replace(/^0+/, "");
    if (rest.length < 8 || rest.length > 9) return null;
    return `972${rest}`;
  }
  // 00972... international prefix
  if (digits.startsWith("00972")) {
    const rest = digits.slice(5).replace(/^0+/, "");
    if (rest.length < 8 || rest.length > 9) return null;
    return `972${rest}`;
  }
  // Local 0XXXXXXXXX → drop leading 0, prefix 972
  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    if (rest.length < 8 || rest.length > 9) return null;
    return `972${rest}`;
  }
  // Bare 9-digit local without leading 0 (e.g. 501234567)
  if (digits.length === 9 || digits.length === 8) return `972${digits}`;
  return null;
}

// ── buildPropertyWhatsappMessage ─────────────────────────────────────────────
// The exact Hebrew outreach templates. Uses the contact's name when known,
// otherwise the no-name variant. neighborhood_text becomes " בשכונת <X>" or ''.
export interface BuildPropertyWhatsappMessageInput {
  contactName?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  agentName?: string | null;
}

export function buildPropertyWhatsappMessage(input: BuildPropertyWhatsappMessageInput): string {
  const city = (input.city ?? "").trim() || "האזור";
  const neighborhood = (input.neighborhood ?? "").trim();
  const neighborhoodText = neighborhood ? ` בשכונת ${neighborhood}` : "";
  const agentName = (input.agentName ?? "").trim();
  const agentSignature = agentName ? `\n\n${agentName}` : "";
  const contactName = (input.contactName ?? "").trim();

  if (contactName) {
    return (
      `היי ${contactName}, ראיתי שפרסמת את הנכס ב${city}${neighborhoodText}. ` +
      `אני מתמחה באזור ויש לי קונים רלוונטיים שיכולים להתאים לנכס כזה. ` +
      `אשמח לדבר איתך כמה דקות ולבדוק איך אפשר לקדם את זה בצורה מהירה ומדויקת.` +
      agentSignature
    );
  }
  return (
    `היי, ראיתי שפרסמת את הנכס ב${city}${neighborhoodText}. ` +
    `אני מתמחה באזור ויש לי קונים רלוונטיים שיכולים להתאים לנכס כזה. ` +
    `אשמח לדבר איתך כמה דקות ולבדוק איך אפשר לקדם את זה בצורה מהירה ומדויקת.` +
    agentSignature
  );
}

// ── buildWhatsappUrl ─────────────────────────────────────────────────────────
// wa.me deep link. Returns null when the phone can't be normalized.
export function buildWhatsappUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const normalized = normalizePhoneForWhatsapp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
