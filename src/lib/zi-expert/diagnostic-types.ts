// ============================================================================
// ZI Expert™ Diagnostics Engine — types (Phase 24, client-safe).
// ZI is SUPPORT-ONLY: it inspects allowed, non-sensitive diagnostics, explains
// what's happening, suggests next steps and links to screens. It NEVER performs
// actions, mutates data, runs workflows or approves anything. No secrets, no
// raw provider payloads, no cross-org data ever leave this layer.
// ============================================================================
import type { RoleKey } from "./types";
export type { RoleKey };

export type DiagnosticStatus = "healthy" | "warning" | "critical" | "unknown";
export type FindingSeverity = "ok" | "info" | "warning" | "critical";

export type IssueType =
  | "property_radar_empty"
  | "map_empty"
  | "buyer_matching_zero"
  | "seller_intelligence_empty"
  | "journey_not_running"
  | "ai_unavailable"
  | "provider_sync_failed"
  | "cron_not_running"
  | "realtime_not_arriving"
  | "feature_unavailable"
  | "permission_denied"
  | "credits_exhausted"
  | "reports_not_generating"
  | "notifications_missing"
  | "general";

/** Input to runZIDiagnostics. orgId/userId are resolved server-side from session. */
export interface DiagnosticInput {
  currentRoute: string | null;
  module: string | null;
  issueType?: IssueType;
  entityId?: string | null;
  timeframe?: "today" | "week" | "all";
}

export interface DiagnosticFinding {
  id: string;
  severity: FindingSeverity;
  title: string;       // short Hebrew label
  detail: string;      // one-sentence explanation
  fixHint?: string | null;
}

export interface DiagnosticResult {
  status: DiagnosticStatus;
  issueType: IssueType;
  summary: string;
  findings: DiagnosticFinding[];
  likelyCause: string | null;
  userNextSteps: string[];
  adminNextSteps: string[];
  relatedScreens: { label: string; route: string }[];
  explanation: string;          // formatted Hebrew block
  supportPayload: SupportPayload;
}

/**
 * Non-sensitive, redacted payload for opening a support ticket. NEVER contains
 * secrets, API keys, raw provider payloads, or another org's data.
 */
export interface SupportPayload {
  correlationId: string;
  orgId: string;
  userId: string | null;
  role: RoleKey | null;
  currentRoute: string | null;
  module: string | null;
  issueType: IssueType;
  status: DiagnosticStatus;
  summary: string;
  findings: { id: string; severity: FindingSeverity; title: string }[];
  recentLogRefs: string[];      // safe references only (e.g. "import_job:<id>:failed")
  browser: string | null;
  timestamp: string;            // ISO
}

/**
 * The bounded, safe signal snapshot the repository collects (all org-scoped,
 * all non-sensitive). Env values are presence booleans only — never the value.
 */
export interface DiagnosticSignals {
  // identity / permissions
  role: RoleKey | null;
  // org config
  operatingAreaCount: number;
  // env presence (booleans only — never the secret value)
  hasAiProvider: boolean;
  aiDisabled: boolean;
  hasMapsBrowserKey: boolean;
  hasGeocodeKey: boolean;
  hasApifyToken: boolean;
  hasCronSecret: boolean;
  // sync / providers
  lastSync: { status: string; finishedAt: string | null; startedAt: string | null; found: number; error: string | null } | null;
  // data coverage
  externalActiveCount: number;
  externalWithCoords: number;
  internalPropertyCount: number;
  internalWithCoords: number;
  activeBuyerCount: number;
  buyersWithBudget: number;
  // notifications
  recentNotificationCount: number;
}
