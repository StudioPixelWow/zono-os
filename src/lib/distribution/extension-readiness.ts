// ============================================================================
// ZONO — Chrome publishing-extension READINESS resolver (pure, dependency-free).
// ----------------------------------------------------------------------------
// Maps raw instance/path signals (status + last heartbeat + fb-session + version)
// to ONE customer-facing state with Hebrew copy. NEVER exposes internal status
// names. Freshness is computed from the last heartbeat (path.last_checked_at,
// refreshed on every heartbeat). Publishing requires state === "ready".
// IMPORTANT: campaign CREATION must NOT depend on this — readiness is a
// publish-time requirement only.
// ============================================================================

export type ExtensionReadinessState =
  | "not_installed"
  | "installed_idle"
  | "needs_facebook_login"
  | "ready"
  | "offline"
  | "needs_update"
  | "error";

/** Heartbeat cadence is 5 min; 12 min tolerates ~2 missed beats before "offline". */
export const EXTENSION_FRESH_WINDOW_MS = 12 * 60 * 1000;
/** Minimum FUNCTIONALLY-CAPABLE publishing version. 1.0.2 publishes correctly;
 *  1.0.3 only adds heartbeat-readiness stability. "needs_update" is reserved for
 *  genuinely unsupported builds (< this), NOT merely "not the latest" — otherwise a
 *  connected, FB-logged-in office is falsely shown as unable to publish. */
export const MIN_SUPPORTED_EXTENSION_VERSION = "1.0.2";

export interface ExtensionReadinessInput {
  status: string | null | undefined;          // raw ExtensionPathStatus
  lastCheckedAt: string | null | undefined;   // ISO of last heartbeat
  facebookSessionDetected?: boolean;
  version?: string | null;
  nowMs?: number;
}

export interface ExtensionReadinessView {
  state: ExtensionReadinessState;
  label: string;          // customer-facing Hebrew label
  hint: string;           // one actionable Hebrew sentence
  isPublishable: boolean; // true ONLY when state === "ready"
}

const LABEL: Record<ExtensionReadinessState, string> = {
  not_installed: "לא מותקן",
  installed_idle: "מותקן — לא פעיל",
  needs_facebook_login: "נדרש להתחבר לפייסבוק",
  ready: "פעיל",
  offline: "לא זמין כרגע",
  needs_update: "נדרש עדכון",
  error: "תקלה",
};

const HINT: Record<ExtensionReadinessState, string> = {
  not_installed: "התקן את תוסף ZONO לדפדפן וחבר אותו כדי לפרסם בקבוצות.",
  installed_idle: "התוסף מותקן אך טרם דיווח פעילות. פתח את הדפדפן שבו הותקן התוסף.",
  needs_facebook_login: "התוסף פעיל — פתח פייסבוק באותו דפדפן והתחבר, ואז ניתן לפרסם.",
  ready: "התוסף פעיל ומחובר לפייסבוק — אפשר לפרסם.",
  offline: "לא התקבל אות מהתוסף לאחרונה. ודא שהדפדפן פתוח והתוסף פעיל.",
  needs_update: "גרסת התוסף אינה נתמכת. עדכן את התוסף לגרסה האחרונה.",
  error: "אירעה תקלה בתוסף. פתח את הגדרות התוסף לפרטים.",
};

function view(state: ExtensionReadinessState): ExtensionReadinessView {
  return { state, label: LABEL[state], hint: HINT[state], isPublishable: state === "ready" };
}

/** Numeric semver compare: -1 (a<b), 0 (equal), 1 (a>b). Missing parts → 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * Resolve the customer-facing readiness. Precedence (most actionable first):
 *   not_installed → error → installed_idle (never beat) → offline (stale beat)
 *   → needs_update (alive but unsupported) → needs_facebook_login → ready.
 * offline is evaluated BEFORE fb/version: a silent extension's primary problem
 * is that it is not running, so we do not claim it merely needs a FB login.
 */
export function computeExtensionReadiness(input: ExtensionReadinessInput): ExtensionReadinessView {
  const now = input.nowMs ?? Date.now();
  const status = input.status ?? "not_installed";

  if (status === "not_installed") return view("not_installed");
  if (status === "error") return view("error");

  const ts = input.lastCheckedAt ? Date.parse(input.lastCheckedAt) : NaN;
  if (!input.lastCheckedAt || Number.isNaN(ts)) return view("installed_idle");

  const fresh = now - ts <= EXTENSION_FRESH_WINDOW_MS;
  if (!fresh) return view("offline");

  if (input.version && compareVersions(input.version, MIN_SUPPORTED_EXTENSION_VERSION) < 0) {
    return view("needs_update");
  }
  return input.facebookSessionDetected ? view("ready") : view("needs_facebook_login");
}

/**
 * Office readiness across ALL of an org's extension instances. A stale/installed
 * instance must NEVER make the office appear offline when another instance is ready.
 * Rank the per-instance readiness and pick the strongest; tie-break by freshest beat.
 */
const READINESS_RANK: Record<ExtensionReadinessState, number> = {
  ready: 6, needs_facebook_login: 5, needs_update: 4, installed_idle: 3, offline: 2, error: 1, not_installed: 0,
};
export function pickBestReadiness(inputs: ExtensionReadinessInput[]): ExtensionReadinessView {
  if (!inputs.length) return computeExtensionReadiness({ status: "not_installed", lastCheckedAt: null });
  let best = computeExtensionReadiness(inputs[0]);
  let bestFresh = inputs[0].lastCheckedAt ? Date.parse(inputs[0].lastCheckedAt) : 0;
  for (let i = 1; i < inputs.length; i++) {
    const v = computeExtensionReadiness(inputs[i]);
    const fresh = inputs[i].lastCheckedAt ? Date.parse(inputs[i].lastCheckedAt) : 0;
    if (READINESS_RANK[v.state] > READINESS_RANK[best.state] ||
        (READINESS_RANK[v.state] === READINESS_RANK[best.state] && fresh > bestFresh)) {
      best = v; bestFresh = fresh;
    }
  }
  return best;
}

// ── Pure self-check (offline; not wired into runtime) ────────────────────────
export function __extReadinessSelfCheck(): boolean {
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  const fresh = new Date(now - 60_000).toISOString();
  const stale = new Date(now - 30 * 60_000).toISOString();
  const cases: Array<[ExtensionReadinessInput, ExtensionReadinessState]> = [
    [{ status: "not_installed", lastCheckedAt: null }, "not_installed"],
    [{ status: "error", lastCheckedAt: fresh, nowMs: now }, "error"],
    [{ status: "installed", lastCheckedAt: null }, "installed_idle"],
    [{ status: "installed", lastCheckedAt: stale, nowMs: now }, "offline"],
    [{ status: "installed", lastCheckedAt: fresh, facebookSessionDetected: false, version: "1.0.3", nowMs: now }, "needs_facebook_login"],
    [{ status: "ready", lastCheckedAt: fresh, facebookSessionDetected: true, version: "1.0.3", nowMs: now }, "ready"],
    [{ status: "ready", lastCheckedAt: fresh, facebookSessionDetected: true, version: "1.0.2", nowMs: now }, "ready"],
    [{ status: "ready", lastCheckedAt: fresh, facebookSessionDetected: true, version: "1.0.1", nowMs: now }, "needs_update"],
  ];
  const perInstance = cases.every(([inp, exp]) => computeExtensionReadiness(inp).state === exp);
  // A ready instance B must beat a stale installed instance A.
  const office = pickBestReadiness([
    { status: "installed", lastCheckedAt: new Date(now - 26 * 60_000).toISOString(), nowMs: now },
    { status: "ready", lastCheckedAt: fresh, facebookSessionDetected: true, version: "1.0.2", nowMs: now },
  ]).state === "ready";
  return perInstance && office;
}
