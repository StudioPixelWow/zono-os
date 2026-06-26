// ============================================================================
// ZI Expert™ Diagnostics — orchestrator (Phase 24, PURE composition).
// runZIDiagnostics(input, signals, identity) → DiagnosticResult.
// Combines the deterministic checks with the Hebrew explanation engine and
// builds a REDACTED support payload safe to attach to a support ticket.
// SUPPORT-ONLY: this layer inspects + explains, never acts or mutates.
// ============================================================================
import { runChecks } from "./diagnostic-checks";
import { buildExplanation, buildSummary } from "./diagnostic-explanations";
import type {
  DiagnosticInput, DiagnosticResult, DiagnosticSignals, IssueType, RoleKey, SupportPayload,
} from "./diagnostic-types";

/** Map a route to its most likely default issue type (when none was given). */
export function inferIssueType(input: DiagnosticInput): IssueType {
  if (input.issueType) return input.issueType;
  const r = (input.currentRoute ?? "").toLowerCase();
  const m = (input.module ?? "").toLowerCase();
  const hay = `${r} ${m}`;
  if (/property-radar|radar/.test(hay)) return "property_radar_empty";
  if (/map|heatmap|\bmarket\b/.test(hay)) return "map_empty";
  if (/match/.test(hay)) return "buyer_matching_zero";
  if (/exclusive|seller-intel|seller/.test(hay)) return "seller_intelligence_empty";
  if (/journey/.test(hay)) return "journey_not_running";
  if (/ai-office|copilot|ai\b/.test(hay)) return "ai_unavailable";
  if (/report|executive-intelligence|\bbi\b/.test(hay)) return "reports_not_generating";
  if (/notification/.test(hay)) return "notifications_missing";
  if (/automation|distribution|sync|external-listings/.test(hay)) return "provider_sync_failed";
  return "general";
}

function rid(): string {
  const s = "0123456789abcdef";
  let out = "zi-dx-";
  for (let i = 0; i < 12; i++) out += s[Math.floor(Math.random() * 16)];
  return out;
}

/** Build the redacted, non-sensitive support payload (safe for tickets). */
function buildSupportPayload(
  input: DiagnosticInput, issueType: IssueType, result: Omit<DiagnosticResult, "supportPayload">,
  identity: { orgId: string; userId: string | null; role: RoleKey | null }, signals: DiagnosticSignals, browser: string | null,
): SupportPayload {
  // Safe log references only — never raw provider payloads.
  const recentLogRefs: string[] = [];
  if (signals.lastSync) recentLogRefs.push(`import_job:${signals.lastSync.status}`);
  recentLogRefs.push(`coverage:ext_active=${signals.externalActiveCount},ext_geo=${signals.externalWithCoords},props=${signals.internalPropertyCount},buyers=${signals.activeBuyerCount}`);
  return {
    correlationId: rid(),
    orgId: identity.orgId,
    userId: identity.userId,
    role: identity.role,
    currentRoute: input.currentRoute,
    module: input.module,
    issueType,
    status: result.status,
    summary: result.summary,
    findings: result.findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
    recentLogRefs,
    browser: browser ? browser.slice(0, 160) : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Pure diagnosis: takes the collected signals + identity and returns a full,
 * Hebrew-explained, redacted-payload result. The repository handles IO; this
 * stays pure so it's unit-testable and never touches secrets directly.
 */
export function runZIDiagnostics(
  input: DiagnosticInput,
  signals: DiagnosticSignals,
  identity: { orgId: string; userId: string | null; role: RoleKey | null },
  browser: string | null = null,
): DiagnosticResult {
  const issueType = inferIssueType(input);
  const checks = runChecks(issueType, signals);
  const summary = buildSummary(issueType, checks.status, checks.likelyCause);
  const explanation = buildExplanation(issueType, checks);

  const partial: Omit<DiagnosticResult, "supportPayload"> = {
    status: checks.status,
    issueType,
    summary,
    findings: checks.findings,
    likelyCause: checks.likelyCause,
    userNextSteps: checks.userNextSteps,
    adminNextSteps: checks.adminNextSteps,
    relatedScreens: checks.relatedScreens,
    explanation,
  };

  return { ...partial, supportPayload: buildSupportPayload(input, issueType, partial, identity, signals, browser) };
}
