// ============================================================================
// ZONO — P6.0 Product Telemetry · canonical model (PURE, client-safe).
// The single deterministic definition of what counts as meaningful product
// usage, how a canonical event decomposes into module/action, and the exact
// DAU/WAU/MAU + active-organization boundaries. Every telemetry reader (Platform
// Usage, Customer 360, Owner Intelligence) derives from THIS module so the three
// surfaces can never drift into competing definitions.
//
// CANONICAL SOURCE DECISION (P6.0 audit):
//   The authoritative product-usage event store is `domain_events` (the event
//   kernel), NOT `usage_events` (which is empty and wired to nothing). Every
//   meaningful action already emits here via emitBusinessEvent(). Event names use
//   dotted `module.action` naming, so module/action are DERIVED deterministically
//   — no duplicate columns, no second event system.
// ============================================================================
import { DOMAIN_EVENTS } from "@/lib/kernel/events";

// ── Activity windows (deterministic, inclusive lower bound) ─────────────────
export const WINDOW_DAYS = { DAU: 1, WAU: 7, MAU: 30 } as const;
export const DAY_MS = 86_400_000;

/** True when `occurredAt` falls within the last `days` days from `nowMs`
 *  (inclusive of the boundary instant). Deterministic — no Date.now() here. */
export function isWithinDays(occurredAt: string | number | Date, nowMs: number, days: number): boolean {
  const t = occurredAt instanceof Date ? occurredAt.getTime() : new Date(occurredAt).getTime();
  if (Number.isNaN(t)) return false;
  const cutoff = nowMs - days * DAY_MS;
  return t >= cutoff && t <= nowMs;
}

// ── module / action derivation from a canonical event name ──────────────────
/** `property.stage_changed` → `property`. Deterministic split on the first dot. */
export function moduleOf(eventType: string): string {
  const i = eventType.indexOf(".");
  return i === -1 ? eventType : eventType.slice(0, i);
}
/** `property.stage_changed` → `stage_changed`. */
export function actionOf(eventType: string): string {
  const i = eventType.indexOf(".");
  return i === -1 ? "" : eventType.slice(i + 1);
}

// ── Meaningful-activity allowlist ───────────────────────────────────────────
// What counts as meaningful CUSTOMER product usage. Login alone is intentionally
// EXCLUDED from "meaningful activity" per the P6.0 mandate — a session with no
// product action is not adoption. Platform-admin operator activity can never
// appear here: it is written to a SEPARATE table (platform_audit_log) via
// writePlatformAudit(), never to domain_events — so there is nothing to filter
// out, but we allowlist positively regardless for defense in depth.
//
// `auth.login` and `auth.session` (when later emitted) are deliberately NOT in
// this set: they are tracked for security/session analytics but excluded from
// DAU/WAU/MAU meaningful-activity math.
const NON_MEANINGFUL_MODULES = new Set<string>(["auth", "platform", "system"]);

/** The canonical set of meaningful product-usage event names (from the kernel
 *  catalog), minus non-meaningful modules. Sorted for stable QA snapshots. */
export const MEANINGFUL_EVENT_TYPES: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(DOMAIN_EVENTS) as string[]))
    .filter((t) => !NON_MEANINGFUL_MODULES.has(moduleOf(t)))
    .sort(),
);
const MEANINGFUL_SET = new Set(MEANINGFUL_EVENT_TYPES);

/** Deterministic: does this event name count as meaningful product usage? */
export function isMeaningfulEvent(eventType: string): boolean {
  return MEANINGFUL_SET.has(eventType);
}

// ── Module catalog + Hebrew labels (single source for the usage surfaces) ────
export const TELEMETRY_MODULES: readonly string[] = Object.freeze(
  Array.from(new Set(MEANINGFUL_EVENT_TYPES.map(moduleOf))).sort(),
);

export const MODULE_LABEL: Record<string, string> = {
  property: "נכסים",
  lead: "לידים",
  buyer: "קונים",
  seller: "מוכרים",
  deal: "עסקאות",
  journey: "מסעות לקוח",
  task: "משימות",
  meeting: "פגישות",
  document: "מסמכים",
  matching: "התאמות",
  recommendation: "המלצות",
  campaign: "קמפיינים",
  publish: "הפצה",
  whatsapp: "וואטסאפ",
  facebook: "פייסבוק",
  communication: "תקשורת",
  integration: "אינטגרציות",
  automation: "אוטומציות",
  external_listing: "ליסטינגים חיצוניים",
  organization: "ארגון",
  agent: "סוכנים",
  ai: "בינה מלאכותית",
};
export function moduleLabel(mod: string): string {
  return MODULE_LABEL[mod] ?? mod;
}

// ── DAU / WAU / MAU + active-organization computation ───────────────────────
export interface MeaningfulEvent {
  organization_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  occurred_at: string;
}
export interface ActiveCounts {
  /** distinct actor_user_id with ≥1 meaningful event in the window */
  dau: number; wau: number; mau: number;
  /** distinct organization_id with ≥1 meaningful event in the window */
  activeOrgsDay: number; activeOrgsWeek: number; activeOrgsMonth: number;
  events24h: number; events7d: number; events30d: number;
}

/**
 * Pure DAU/WAU/MAU + active-org roll-up over a bounded set of already-fetched
 * events. Only meaningful events with a non-null actor (for user metrics) or
 * non-null org (for org metrics) are counted. Deterministic given (events, nowMs).
 */
export function computeActiveCounts(events: MeaningfulEvent[], nowMs: number): ActiveCounts {
  const uDay = new Set<string>(), uWeek = new Set<string>(), uMonth = new Set<string>();
  const oDay = new Set<string>(), oWeek = new Set<string>(), oMonth = new Set<string>();
  let e24 = 0, e7 = 0, e30 = 0;
  for (const ev of events) {
    if (!isMeaningfulEvent(ev.event_type)) continue;
    const inDay = isWithinDays(ev.occurred_at, nowMs, WINDOW_DAYS.DAU);
    const inWeek = isWithinDays(ev.occurred_at, nowMs, WINDOW_DAYS.WAU);
    const inMonth = isWithinDays(ev.occurred_at, nowMs, WINDOW_DAYS.MAU);
    if (inDay) e24++; if (inWeek) e7++; if (inMonth) e30++;
    const u = ev.actor_user_id, o = ev.organization_id;
    if (u) { if (inDay) uDay.add(u); if (inWeek) uWeek.add(u); if (inMonth) uMonth.add(u); }
    if (o) { if (inDay) oDay.add(o); if (inWeek) oWeek.add(o); if (inMonth) oMonth.add(o); }
  }
  return {
    dau: uDay.size, wau: uWeek.size, mau: uMonth.size,
    activeOrgsDay: oDay.size, activeOrgsWeek: oWeek.size, activeOrgsMonth: oMonth.size,
    events24h: e24, events7d: e7, events30d: e30,
  };
}

/** Per-module meaningful-event counts within `days`. Deterministic. */
export function moduleUsage(events: MeaningfulEvent[], nowMs: number, days: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const ev of events) {
    if (!isMeaningfulEvent(ev.event_type)) continue;
    if (!isWithinDays(ev.occurred_at, nowMs, days)) continue;
    const mod = moduleOf(ev.event_type);
    m.set(mod, (m.get(mod) ?? 0) + 1);
  }
  return m;
}

// ── Metadata sanitization (bounded, secret-stripped) ────────────────────────
// Telemetry metadata must never carry secrets, tokens, message contents, or
// unbounded blobs. This mirrors the platform-audit stripSecrets contract.
const SECRET_KEY_RE = /(secret|token|password|api[_-]?key|authorization|refresh|access[_-]?token|private[_-]?key|credential|otp|pin|cvv|iban|card)/i;
const CONTENT_KEY_RE = /(message|body|content|prompt|transcript|raw|html|text)/i;
const MAX_KEYS = 24;
const MAX_STRING = 256;

/** Sanitize a metadata object for telemetry storage: strip secret-like and
 *  free-text-content keys, bound key count, truncate strings, collapse nested
 *  objects. Pure — returns a new safe object. */
export function sanitizeTelemetryMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_KEYS) { out["…truncated"] = true; break; }
    if (SECRET_KEY_RE.test(k)) { out[k] = "[redacted]"; n++; continue; }
    if (CONTENT_KEY_RE.test(k)) { out[k] = "[omitted]"; n++; continue; }
    if (v === null || typeof v === "number" || typeof v === "boolean") { out[k] = v; n++; continue; }
    if (typeof v === "string") { out[k] = v.length > MAX_STRING ? v.slice(0, MAX_STRING) + "…" : v; n++; continue; }
    if (typeof v === "object") { out[k] = "{…}"; n++; continue; }
    // functions/symbols/undefined dropped
  }
  return out;
}
