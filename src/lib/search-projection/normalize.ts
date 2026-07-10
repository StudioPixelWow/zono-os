// ============================================================================
// 🔤 ZONO OS 2.0 — Stage 4 · Search projection · normalization (PURE).
// Hebrew-aware text + phone + keyword normalization for the canonical search
// haystack. Pure + deterministic + offline-testable. Produces the safe
// normalized_text and keyword array; it NEVER receives sensitive fields (the
// document builder decides what is safe to pass in).
// ============================================================================

/** Strip Hebrew niqqud (vowel points) + cantillation so search is robust. */
function stripNiqqud(s: string): string {
  // Hebrew combining marks: U+0591–U+05C7.
  return s.replace(/[֑-ׇ]/g, "");
}

/**
 * Normalize free text for fuzzy/full-text search: lowercase, strip niqqud,
 * collapse punctuation to spaces, squeeze whitespace. Latin + Hebrew safe.
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return stripNiqqud(String(input))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // keep letters/numbers, drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonicalize an Israeli phone to a comparable digit string:
 * +972-5X-XXXXXXX / 05X-XXXXXXX → 05XXXXXXXX. Returns null when not phone-like.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = String(input).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) d = "0" + d.slice(3);           // +972… → 0…
  else if (d.startsWith("00972")) d = "0" + d.slice(5);
  if (d.length < 6) return null;                            // too short to be a real number
  return d;
}

/** A phone's last-7 "local" form, useful for partial matches. */
export function phoneTail(input: string | null | undefined): string | null {
  const p = normalizePhone(input);
  return p ? p.slice(-7) : null;
}

/** Split normalized text into distinct word tokens (length ≥ 2). */
export function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return [...new Set(normalized.split(" ").filter((t) => t.length >= 2))];
}

/**
 * Build the searchable keyword array from a set of safe fields (titles, city,
 * status, identifiers, phone). Deduped, normalized, phone forms included.
 */
export function buildKeywords(parts: (string | null | undefined)[], phones: (string | null | undefined)[] = []): string[] {
  const out = new Set<string>();
  for (const p of parts) for (const t of tokenize(normalizeText(p))) out.add(t);
  for (const ph of phones) {
    const full = normalizePhone(ph);
    const tail = phoneTail(ph);
    if (full) out.add(full);
    if (tail) out.add(tail);
  }
  return [...out];
}

/**
 * Build the normalized_text haystack from safe fields + phones. This is the
 * column trigram/full-text indexes run over — safe fields only.
 */
export function buildNormalizedText(parts: (string | null | undefined)[], phones: (string | null | undefined)[] = []): string {
  const words = parts.map((p) => normalizeText(p)).filter(Boolean);
  const phoneForms: string[] = [];
  for (const ph of phones) {
    const full = normalizePhone(ph);
    const tail = phoneTail(ph);
    if (full) phoneForms.push(full);
    if (tail && tail !== full) phoneForms.push(tail);
  }
  return [...words, ...phoneForms].join(" ").replace(/\s+/g, " ").trim();
}
