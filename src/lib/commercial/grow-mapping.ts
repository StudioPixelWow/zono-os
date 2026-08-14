// ============================================================================
// ZONO — GROW (Meshulam) PROVIDER MAPPING (PURE, server-safe). P8.4.
// The ONE place Grow's provider-specific vocabulary is translated into ZONO's
// canonical billing model. Nothing else in the app parses Grow strings. Derived
// STRICTLY from the official docs (developers.grow.business) — not from prior
// ZONO code. Anything the docs do not explicitly define is treated as UNKNOWN
// and NEVER mapped to a paid/active state (fail-closed).
//
// Primary-source facts encoded here:
//  • Callback + getTransactionInfo return data.statusCode; "2" = "שולם" = PAID.
//    No other statusCode success value is documented → everything else is NOT paid.
//  • Grow provides NO webhook signature/HMAC. Origin is authenticated by (a) an IP
//    allowlist (published source IPs) and (b) an independent server-to-server
//    getTransactionInfo re-query — a forged callback cannot pass the re-query.
// ============================================================================

/** The ONLY documented "paid" statusCode from Grow (data.statusCode === "2"). */
export const GROW_PAID_STATUS_CODE = "2";

/** Canonical payment outcome derived from a Grow statusCode. Unknown → "unknown"
 *  (never "paid"). We only trust "2" (documented); we do NOT invent a failure map. */
export type GrowOutcome = "paid" | "not_paid" | "unknown";

export function growOutcomeFromStatusCode(statusCode: string | number | null | undefined): GrowOutcome {
  if (statusCode === undefined || statusCode === null) return "unknown";
  const s = String(statusCode).trim();
  if (s === GROW_PAID_STATUS_CODE) return "paid";
  if (s === "") return "unknown";
  // Any documented non-2 numeric code is a real, non-paid terminal outcome; a
  // non-numeric/empty is unknown. We deliberately do NOT enumerate failure codes
  // that the docs don't publish — non-paid is enough (no revenue is recorded).
  return /^\d+$/.test(s) ? "not_paid" : "unknown";
}

/** Map a Grow outcome to the canonical payments.status vocabulary. */
export function growPaymentStatus(outcome: GrowOutcome): "paid" | "failed" | "pending" {
  switch (outcome) {
    case "paid": return "paid";
    case "not_paid": return "failed";
    default: return "pending";      // unknown → stay pending; never activate
  }
}

// ── Grow published source IPs (firewall allowlist; primary source: /reference/ip-address)
// Used as DEFENSE-IN-DEPTH on webhook ingress. NOT the sole gate — behind proxies
// the source IP can be obscured, so the authoritative check is the server-to-server
// getTransactionInfo re-query. When the caller cannot determine a trustworthy IP,
// it must fall back to the re-query, never fail-open.
export const GROW_SOURCE_IPS: readonly string[] = [
  "3.123.194.128", "3.124.62.248", "18.198.97.252", "3.75.43.49", "18.156.94.176",
  "18.158.107.17", "3.121.149.170", "3.76.166.104", "3.69.160.29", "3.78.79.166",
  "3.71.221.153", "3.78.131.18", "3.67.110.47", "18.192.112.151", "52.59.95.229",
  "18.158.145.146", "3.75.128.58", "3.78.28.179", "3.122.21.187", "3.66.126.119",
  "35.158.249.118", "52.29.70.254", "52.59.159.234", "3.76.183.119", "18.157.106.67",
  "18.197.238.68", "3.66.129.154", "3.77.123.153", "3.70.40.72",
] as const;

/** Extract the leftmost (client) IP from an x-forwarded-for header, if any. */
export function clientIpFromForwardedFor(xff: string | null): string | null {
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

/** Is the source IP a known Grow IP? true/false; null when it cannot be determined
 *  (caller must then rely on the server-to-server re-query, never fail-open). */
export function isGrowSourceIp(ip: string | null): boolean | null {
  if (!ip) return null;
  return GROW_SOURCE_IPS.includes(ip);
}

// ── Grow environment base URLs (primary source: /reference/testing-environment,
//    /reference/live-environment). Server-side only; browser requests are blocked.
export const GROW_SANDBOX_BASE = "https://sandbox.meshulam.co.il/api/light/server/1.0/";
export const GROW_PRODUCTION_BASE = "https://secure.meshulam.co.il/api/light/server/1.0/";

/** Resolve the Grow base URL from the environment mode. Defaults to SANDBOX — a
 *  missing/unknown GROW_ENV must NEVER silently hit production. */
export function growBaseUrl(env: string | undefined | null): string {
  return (env ?? "").toLowerCase() === "production" ? GROW_PRODUCTION_BASE : GROW_SANDBOX_BASE;
}

/** Constant-time-ish equality for the optional webhookKey defense-in-depth check.
 *  (Length-leaking but adequate for a non-cryptographic shared token; the real
 *  gate is the server-to-server re-query.) */
export function safeStringEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
