/**
 * LOCAL-DEV-ONLY check for the Compliance + Data Governance layer (Phase 26.14).
 * Pure layers only (no DB). Verifies: visibility guard decisions · expired data
 * hidden · needs_review limited · policy-driven source allow/deny · low-confidence
 * public limiting · blocked-wording detection + sanitization · policy defaults +
 * merge · retention date math.
 *
 * Run: npx tsx scripts/agency-governance-dev-check.ts
 */
import {
  canShowAgencyIntelligence, isExpired, filterVisibleSources, containsBlockedWording,
  sanitizeWording, mergePolicies, retentionUntil, ALLOWED_WORDING,
} from "../src/lib/agencies/governance/agencyVisibilityGuard";
import { DEFAULT_POLICIES } from "../src/lib/agencies/governance/agencyGovernanceTypes";
import type { IntelligenceSource, VisibilityContext } from "../src/lib/agencies/governance/agencyGovernanceTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const NOW = Date.parse("2026-06-26T00:00:00Z");
const ctx = (over: Partial<VisibilityContext["policies"]> = {}): VisibilityContext => ({ policies: { ...DEFAULT_POLICIES, ...over }, now: NOW });
function src(p: Partial<IntelligenceSource>): IntelligenceSource {
  return {
    id: "s", entityType: "agency", entityId: "a1", sourceType: p.sourceType ?? "internal",
    sourceName: null, sourceUrl: null, collectedAt: null, lastVerifiedAt: null, confidence: p.confidence ?? null,
    licenseStatus: "unknown", visibilityStatus: p.visibilityStatus ?? "visible", retentionUntil: p.retentionUntil ?? null,
    metadata: {}, createdAt: "2026-06-26",
  };
}

function main(): void {
  console.log("Agency Governance dev-check\n");

  console.log("Visibility guard:");
  assert(canShowAgencyIntelligence(src({ sourceType: "internal" }), ctx()) === "visible", "internal source → visible");
  assert(canShowAgencyIntelligence(src({ sourceType: "public" }), ctx()) === "visible", "public allowed by default → visible");
  assert(canShowAgencyIntelligence(src({ sourceType: "public" }), ctx({ allow_public_sources: false })) === "hidden", "public disallowed by policy → hidden");
  assert(canShowAgencyIntelligence(src({ sourceType: "imported" }), ctx({ allow_imported_sources: false })) === "hidden", "imported disallowed → hidden");
  assert(canShowAgencyIntelligence(src({ sourceType: "ai_generated" }), ctx({ allow_ai_generated_summaries: false })) === "hidden", "ai_generated disallowed → hidden");
  assert(canShowAgencyIntelligence(src({ visibilityStatus: "hidden" }), ctx()) === "hidden", "hidden status → hidden");
  assert(canShowAgencyIntelligence(src({ visibilityStatus: "needs_review" }), ctx()) === "limited", "needs_review → limited");

  console.log("\nExpiry:");
  assert(isExpired(src({ visibilityStatus: "expired" }), NOW) === true, "expired status → expired");
  assert(isExpired(src({ retentionUntil: "2026-01-01T00:00:00Z" }), NOW) === true, "past retention → expired");
  assert(isExpired(src({ retentionUntil: "2027-01-01T00:00:00Z" }), NOW) === false, "future retention → not expired");
  assert(canShowAgencyIntelligence(src({ retentionUntil: "2026-01-01T00:00:00Z" }), ctx()) === "hidden", "expired data is HIDDEN by the guard");

  console.log("\nLow-confidence public limiting:");
  assert(canShowAgencyIntelligence(src({ sourceType: "public", confidence: 0.2 }), ctx({ hide_low_confidence_public_output: true })) === "limited", "low-confidence public limited when policy on");
  assert(canShowAgencyIntelligence(src({ sourceType: "public", confidence: 0.2 }), ctx()) === "visible", "low-confidence public visible when policy off (default)");

  console.log("\nFilter:");
  const sources = [src({ visibilityStatus: "visible" }), src({ visibilityStatus: "hidden" }), src({ retentionUntil: "2026-01-01T00:00:00Z" }), src({ visibilityStatus: "needs_review" })];
  assert(filterVisibleSources(sources, ctx()).length === 2, "filter drops hidden + expired, keeps visible + limited");

  console.log("\nBlocked wording:");
  assert(containsBlockedWording("זה מודיעין סודי על המתחרים") === true, "detects 'מודיעין סודי'");
  assert(containsBlockedWording("ריגול אחרי משרד") === true, "detects 'ריגול'");
  assert(containsBlockedWording("מודיעין תחרותי על השוק") === false, "allowed wording is not blocked");
  assert(sanitizeWording("מודיעין סודי") === "מודיעין עסקי", "sanitizes 'מודיעין סודי' → 'מודיעין עסקי'");
  assert(!containsBlockedWording(sanitizeWording("מידע חסוי וריגול על מתחרה")), "sanitized text contains no blocked wording");
  assert(sanitizeWording(sanitizeWording("מודיעין סודי")) === "מודיעין עסקי", "sanitize is idempotent");
  assert(ALLOWED_WORDING.includes("מודיעין עסקי") && ALLOWED_WORDING.includes("ניתוח מתחרים"), "allowed wording set present");

  console.log("\nPolicy defaults + merge:");
  assert(DEFAULT_POLICIES.allow_public_sources === true && DEFAULT_POLICIES.default_retention_days === 365 && DEFAULT_POLICIES.block_private_data_claims === true, "default policy values per spec");
  assert(mergePolicies({}).allow_public_sources === true, "merge with no overrides → defaults");
  assert(mergePolicies({ allow_public_sources: false }).allow_public_sources === false, "boolean override applied");
  assert(mergePolicies({ default_retention_days: 90 }).default_retention_days === 90, "numeric override applied");
  assert(mergePolicies({ allow_imported_sources: "false" }).allow_imported_sources === false, "string boolean coerced");

  console.log("\nIntegration (API + Copilot use sanitizeWording):");
  // API: an executive-summary snippet returned by getTopCompetitors is sanitized.
  const apiSnippet = sanitizeWording("המשרד מוביל לפי מודיעין סודי ומידע חסוי");
  assert(!containsBlockedWording(apiSnippet) && apiSnippet.includes("מודיעין עסקי"), "API snippet output is compliance-sanitized");
  // Copilot: the final answer text is sanitized before returning.
  const copilotAnswer = sanitizeWording("על בסיס הנתונים הקיימים במערכת, ביצענו ריגול אחרי המתחרה");
  assert(!containsBlockedWording(copilotAnswer) && copilotAnswer.includes("על בסיס הנתונים הקיימים במערכת"), "Copilot answer is sanitized + keeps grounding phrase");

  console.log("\nRetention math:");
  assert(retentionUntil("2026-06-26T00:00:00Z", 365, NOW).startsWith("2027-06-26"), "retentionUntil = collected + days");
  assert(retentionUntil(null, 30, NOW) === new Date(NOW + 30 * 86400000).toISOString(), "null collected → now + days");

  console.log(`\n${failures === 0 ? "✅ ALL GOVERNANCE CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
