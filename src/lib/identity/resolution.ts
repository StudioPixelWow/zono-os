// ============================================================================
// 🧬 ZONO — canonical identity resolution (PURE, offline-testable).
// Wave 1 foundation. The SINGLE dedup gate every person-creating path must call
// (manual, website, social, FB, WhatsApp, market-intel conversion, CSV/XLSX
// import, automation, comment-lead-bridge). Replaces the ad-hoc per-path
// normalizers (e.g. leads/service.ts normalizePhone) with one authority.
//
// RULES (hard):
//  • Identity is resolved by STABLE signals — normalized phone / email / external
//    source id — never by name similarity alone.
//  • Name is SUPPORTING evidence only; a name-only match is never auto-linked.
//  • Same phone but conflicting email/name → CONFLICTING → sent to review, never
//    auto-merged (families share phones).
//  • Everything is organization-scoped by the caller (this module never crosses
//    orgs — it only compares within the candidate set the caller supplies).
//  • Deterministic + no I/O, so the decision is fully unit-testable.
// ============================================================================

export type MatchConfidence = "exact_high" | "likely" | "ambiguous" | "conflicting" | "distinct";
export type ResolutionAction = "link" | "create" | "review";

/** Normalized identity keys for an existing person (org-scoped by the caller). */
export interface PersonIdentity {
  id: string;
  fullName?: string | null;
  phones?: (string | null)[];
  emails?: (string | null)[];
  sourceIds?: (string | null)[];
}

/** A raw contact from any creation path. */
export interface CandidateContact {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  /** stable external id, e.g. "yad2:12345" / "fb:comment:987" — used for idempotent ingestion. */
  sourceId?: string | null;
}

export interface NormalizedContact {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  sourceId: string | null;
}

export interface ResolutionMatch {
  personId: string;
  confidence: MatchConfidence;
  reasons: string[];
}

export interface ResolutionResult {
  action: ResolutionAction;
  normalized: NormalizedContact;
  /** Best match when action is "link"; candidate matches when "review". */
  match: ResolutionMatch | null;
  reviewCandidates: ResolutionMatch[];
}

// ── Normalization ───────────────────────────────────────────────────────────
/** Israeli-friendly phone key: digits only, last 9 (drops +972 / leading 0). */
export function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9);
}
export function normalizeEmail(e?: string | null): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null;
}
export function normalizeName(n?: string | null): string | null {
  if (!n) return null;
  const t = n.trim().replace(/\s+/g, " ").toLowerCase();
  return t.length >= 2 ? t : null;
}
export function normalizeSourceId(s?: string | null): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t.length ? t : null;
}

export function normalizeContact(c: CandidateContact): NormalizedContact {
  return {
    fullName: normalizeName(c.fullName),
    phone: normalizePhone(c.phone),
    email: normalizeEmail(c.email),
    sourceId: normalizeSourceId(c.sourceId),
  };
}

function personKeys(p: PersonIdentity) {
  return {
    phones: new Set((p.phones ?? []).map((x) => normalizePhone(x)).filter((x): x is string => !!x)),
    emails: new Set((p.emails ?? []).map((x) => normalizeEmail(x)).filter((x): x is string => !!x)),
    sourceIds: new Set((p.sourceIds ?? []).map((x) => normalizeSourceId(x)).filter((x): x is string => !!x)),
    name: normalizeName(p.fullName),
  };
}

/** Score one candidate against one existing person. */
function classifyAgainst(n: NormalizedContact, p: PersonIdentity): ResolutionMatch | null {
  const k = personKeys(p);
  const reasons: string[] = [];
  const phoneMatch = !!n.phone && k.phones.has(n.phone);
  const emailMatch = !!n.email && k.emails.has(n.email);
  const sourceMatch = !!n.sourceId && k.sourceIds.has(n.sourceId);
  const nameMatch = !!n.fullName && k.name === n.fullName;

  if (phoneMatch) reasons.push("phone");
  if (emailMatch) reasons.push("email");
  if (sourceMatch) reasons.push("sourceId");
  if (nameMatch) reasons.push("name");

  // A stable external id is authoritative for idempotent ingestion.
  if (sourceMatch) return { personId: p.id, confidence: "exact_high", reasons };

  // Two independent strong signals, or one strong signal with no conflict → high.
  if (phoneMatch && emailMatch) return { personId: p.id, confidence: "exact_high", reasons };

  if (phoneMatch) {
    // Same phone. If the candidate carries an email that the person does NOT have
    // AND the person has emails on file, that's a conflict (shared phone / family).
    const emailConflict = !!n.email && k.emails.size > 0 && !k.emails.has(n.email);
    const nameConflict = !!n.fullName && !!k.name && k.name !== n.fullName;
    if (emailConflict || nameConflict) {
      reasons.push(emailConflict ? "email_conflict" : "name_conflict");
      return { personId: p.id, confidence: "conflicting", reasons };
    }
    // Phone match with no conflicting evidence → high confidence (auto-link).
    return { personId: p.id, confidence: "exact_high", reasons };
  }

  if (emailMatch) {
    const nameConflict = !!n.fullName && !!k.name && k.name !== n.fullName;
    if (nameConflict) { reasons.push("name_conflict"); return { personId: p.id, confidence: "conflicting", reasons }; }
    return { personId: p.id, confidence: "exact_high", reasons };
  }

  // Name-only overlap is supporting evidence, never a merge signal.
  if (nameMatch) return { personId: p.id, confidence: "ambiguous", reasons };

  return null; // distinct
}

const RANK: Record<MatchConfidence, number> = { exact_high: 4, likely: 3, conflicting: 2, ambiguous: 1, distinct: 0 };

/**
 * Resolve a candidate against the org's existing persons.
 *  • single exact_high → link
 *  • any conflicting / ambiguous / multiple exact_high → review (never auto-merge)
 *  • a single "likely" → review (human confirms) — we do NOT auto-link "likely"
 *  • no match → create
 */
export function resolveIdentity(candidate: CandidateContact, existing: PersonIdentity[]): ResolutionResult {
  const normalized = normalizeContact(candidate);
  const matches = existing
    .map((p) => classifyAgainst(normalized, p))
    .filter((m): m is ResolutionMatch => m !== null)
    .sort((a, b) => RANK[b.confidence] - RANK[a.confidence]);

  const highs = matches.filter((m) => m.confidence === "exact_high");
  if (highs.length === 1) {
    return { action: "link", normalized, match: highs[0], reviewCandidates: [] };
  }
  if (highs.length > 1) {
    // Multiple confident matches = the existing data itself is duplicated → review.
    return { action: "review", normalized, match: null, reviewCandidates: highs };
  }
  const reviewable = matches.filter((m) => m.confidence === "likely" || m.confidence === "conflicting" || m.confidence === "ambiguous");
  if (reviewable.length > 0) {
    return { action: "review", normalized, match: null, reviewCandidates: reviewable };
  }
  return { action: "create", normalized, match: null, reviewCandidates: [] };
}
