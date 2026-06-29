// ============================================================================
// 🧾 Brokerage Office Evidence Providers (Phase 26.9.7, Part 3). Pure + client-
// safe. A provider abstraction that COLLECTS structured evidence about which
// office a broker likely belongs to. Deterministic providers run first; the
// OpenAI reasoning provider (wired server-side) may ONLY reason over the evidence
// these collect — it can never invent an office name, phone, email, website, or
// relationship. Evidence-free AI output is rejected by the caller.
// ============================================================================

export interface OfficeEvidenceItem {
  label: string;   // human-readable, Hebrew
  source: string;  // which signal produced it (e.g. "shared_phone")
  value: string;   // the observed value (real, never invented)
}

export interface OfficeEvidence {
  providerId: string;
  likelyOfficeName: string | null;   // an OBSERVED name, or null — never invented
  matchedOfficeId: string | null;    // an existing office id when matched
  confidence: number;                // 0–100
  reasons: string[];
  items: OfficeEvidenceItem[];
  limitations: string[];
}

export interface OfficeEvidenceBroker {
  id: string; fullName: string; normalizedName: string | null; primaryPhone: string | null; city: string | null;
}
export interface OfficeEvidenceListing {
  id: string; contactName: string | null; contactPhone: string | null; city: string | null; source: string | null; detectedBrokerName: string | null;
}
export interface OfficeEvidenceOffice {
  id: string; name: string; normalizedName: string | null; primaryPhone: string | null; city: string | null;
}
export interface OfficeEvidenceContext {
  broker: OfficeEvidenceBroker;
  linkedListings: OfficeEvidenceListing[];
  /** Other DISTINCT broker names observed on the broker's phone line. */
  sharedPhoneBrokerNames: string[];
  existingOffices: OfficeEvidenceOffice[];
}

export interface BrokerageOfficeEvidenceProvider {
  id: string;
  label: string;
  isEnabled(): boolean;
  gather(ctx: OfficeEvidenceContext): OfficeEvidence | null;
}

const uniq = (xs: (string | null | undefined)[]): string[] =>
  Array.from(new Set(xs.filter((x): x is string => !!x && x.trim().length > 0).map((x) => x.trim())));
const mostCommon = (xs: string[]): string | null => {
  const f = new Map<string, number>();
  for (const x of xs) if (x) f.set(x, (f.get(x) ?? 0) + 1);
  return [...f.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

// ── 1) ZONO observed evidence — internal observations only. ──────────────────
export const zonoObservedEvidenceProvider: BrokerageOfficeEvidenceProvider = {
  id: "zono_observed", label: "תצפיות ZONO פנימיות", isEnabled: () => true,
  gather(ctx) {
    const items: OfficeEvidenceItem[] = [];
    const reasons: string[] = [];
    let confidence = 0;
    if (ctx.sharedPhoneBrokerNames.length >= 1 && ctx.broker.primaryPhone) {
      const count = ctx.sharedPhoneBrokerNames.length + 1;
      items.push({ label: `טלפון משותף ל-${count} מתווכים`, source: "shared_phone", value: ctx.broker.primaryPhone });
      reasons.push(`קו טלפון משותף ל-${count} מתווכים — סימן למשרד`);
      confidence = count >= 4 ? 90 : count === 3 ? 80 : 70;
    }
    if (ctx.broker.city) items.push({ label: "עיר פעילות", source: "broker_city", value: ctx.broker.city });
    if (!items.length) return null;
    return { providerId: this.id, likelyOfficeName: null, matchedOfficeId: null, confidence, reasons, items, limitations: ctx.broker.primaryPhone ? [] : ["אין טלפון לזיהוי קו משרד"] };
  },
};

// ── 2) External listing evidence — broker/listing fields. ────────────────────
export const externalListingEvidenceProvider: BrokerageOfficeEvidenceProvider = {
  id: "external_listing", label: "שדות מודעות חיצוניות", isEnabled: () => true,
  gather(ctx) {
    const items: OfficeEvidenceItem[] = [];
    const cities = uniq(ctx.linkedListings.map((l) => l.city));
    const sources = uniq(ctx.linkedListings.map((l) => l.source));
    const brokerNames = uniq([...ctx.linkedListings.map((l) => l.contactName), ...ctx.linkedListings.map((l) => l.detectedBrokerName)]);
    if (ctx.linkedListings.length) items.push({ label: `${ctx.linkedListings.length} מודעות מקושרות`, source: "linked_listings", value: String(ctx.linkedListings.length) });
    if (cities.length) items.push({ label: `ערים: ${cities.slice(0, 4).join(", ")}`, source: "listing_cities", value: cities.join("|") });
    if (sources.length) items.push({ label: `מקורות: ${sources.slice(0, 4).join(", ")}`, source: "listing_sources", value: sources.join("|") });
    if (!items.length) return null;
    return {
      providerId: this.id, likelyOfficeName: mostCommon(brokerNames), matchedOfficeId: null,
      confidence: ctx.linkedListings.length >= 3 ? 45 : 30,
      reasons: ["נגזר משדות מודעות שכבר נסרקו (מקור ציבורי)"], items,
      limitations: ["למקור המודעות אין שדה שם משרד — שם המשרד אינו ודאי"],
    };
  },
};

// ── 3) Public search — disabled unless explicitly configured. ────────────────
export const publicSearchEvidenceProvider: BrokerageOfficeEvidenceProvider = {
  id: "public_search", label: "חיפוש ציבורי", isEnabled: () => !!process.env.ZONO_PUBLIC_SEARCH_ENABLED,
  gather() {
    if (!this.isEnabled()) return { providerId: this.id, likelyOfficeName: null, matchedOfficeId: null, confidence: 0, reasons: [], items: [], limitations: ["public_search_not_configured"] };
    return null; // no real provider configured yet — never fabricate
  },
};

/** Run all enabled deterministic providers and return their evidence. */
export function gatherDeterministicOfficeEvidence(ctx: OfficeEvidenceContext): OfficeEvidence[] {
  const providers = [zonoObservedEvidenceProvider, externalListingEvidenceProvider, publicSearchEvidenceProvider];
  const out: OfficeEvidence[] = [];
  for (const p of providers) {
    if (!p.isEnabled() && p.id !== "public_search") continue;
    const e = p.gather(ctx);
    if (e) out.push(e);
  }
  return out;
}

/** Whether the collected evidence is strong enough for the AI to even reason. */
export function hasUsableOfficeEvidence(evidences: OfficeEvidence[]): boolean {
  return evidences.some((e) => e.items.length > 0 && e.confidence > 0);
}

// ============================================================================
// 🧭 OFFICE DISCOVERY READINESS (Phase 26.9.8, Part 7).
// ----------------------------------------------------------------------------
// The architecture for the NEXT phase (public office discovery). The provider
// abstraction already exists above; this descriptor names the canonical
// providers and reports which are wired vs. skipped, WITHOUT implementing any
// public web discovery or OpenAI office reasoning yet. Nothing here fabricates
// an office.
//
// TODO (next phase): implement public office discovery (PublicSearchProvider)
// and OpenAI evidence reasoning (OpenAIReasoningProvider). Both must remain
// evidence-only — they may never invent an office name/phone/email/website.
// ============================================================================

export type OfficeDiscoveryProviderId =
  | "observed_listing_evidence"   // ExternalListingEvidenceProvider (live, deterministic)
  | "shared_phone_evidence"       // SharedPhoneEvidenceProvider (live, deterministic — zono_observed)
  | "public_search"               // PublicSearchProvider (not configured yet)
  | "openai_reasoning";           // OpenAIReasoningProvider (evidence-only, on-demand)

export interface OfficeDiscoveryProviderStatus {
  id: OfficeDiscoveryProviderId;
  label: string;
  kind: "deterministic" | "public_search" | "ai_reasoning";
  enabled: boolean;
  skippedReason: string | null;
}

export interface OfficeDiscoveryReadiness {
  providers: OfficeDiscoveryProviderStatus[];
  /** True once at least one provider can actually produce office evidence. */
  ready: boolean;
  nextPhase: string;
}

/** Report which office-discovery providers are wired vs. skipped. Pure. */
export function getOfficeDiscoveryReadiness(): OfficeDiscoveryReadiness {
  const publicSearchEnabled = !!process.env.ZONO_PUBLIC_SEARCH_ENABLED;
  const openaiEnabled = !!process.env.OPENAI_API_KEY;
  const providers: OfficeDiscoveryProviderStatus[] = [
    { id: "shared_phone_evidence", label: "ראיות קו טלפון משותף", kind: "deterministic", enabled: true, skippedReason: null },
    { id: "observed_listing_evidence", label: "ראיות משדות מודעות", kind: "deterministic", enabled: true, skippedReason: null },
    { id: "public_search", label: "חיפוש ציבורי", kind: "public_search", enabled: publicSearchEnabled, skippedReason: publicSearchEnabled ? null : "public_search_not_configured" },
    { id: "openai_reasoning", label: "הסקת OpenAI על ראיות", kind: "ai_reasoning", enabled: openaiEnabled, skippedReason: openaiEnabled ? null : "openai_not_configured" },
  ];
  return {
    providers,
    ready: providers.some((p) => p.enabled && p.kind === "deterministic"),
    nextPhase: "Next phase: implement public office discovery and OpenAI evidence reasoning (evidence-only — never invent an office).",
  };
}
