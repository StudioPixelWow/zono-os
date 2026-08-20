// ============================================================================
// ZONO — Morning / Green Invoice API CLIENT (server-only). Thin, typed wrapper over
// the CURRENT api.greeninvoice.co.il/api/v1 endpoints. Modeled on grow-client.ts:
// creds from env, fail-closed (never throws), never logs secret/token/authorization.
//   • POST /account/token   — client_credentials-style { id, secret } → JWT (~30 min)
//   • POST /clients         — create a Morning client (billing customer)
//   • POST /clients/search  — deterministic client lookup (tax id / email)
//   • POST /documents       — create the accounting document
// Token is cached in-process until shortly before expiry. An AbortController bounds
// every request (Grow omits a timeout; Morning gets an explicit one).
// ============================================================================
import "server-only";
import { morningConfig } from "./morning-config";

const REQUEST_TIMEOUT_MS = 12_000;
const TOKEN_SKEW_MS = 60_000; // refresh a minute before expiry

interface CachedToken { token: string; expiresAtMs: number; env: string; idFingerprint: string }
let cachedToken: CachedToken | null = null;

export interface MorningResult<T = Record<string, unknown>> {
  ok: boolean;
  httpStatus: number;      // 0 = network/timeout
  data: T | null;
  error: string | null;    // safe, no secrets
}

/** A short, non-sensitive fingerprint of the api id so a credential rotation
 *  invalidates the cache — NOT the id itself (never stored/logged in full). */
function idFingerprint(apiId: string): string {
  return apiId ? `${apiId.slice(0, 3)}:${apiId.length}` : "none";
}

async function fetchJson(url: string, init: RequestInit): Promise<{ httpStatus: number; json: Record<string, unknown> | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    let json: Record<string, unknown> | null = null;
    try { json = (await res.json()) as Record<string, unknown>; } catch { json = null; }
    return { httpStatus: res.status, json };
  } catch {
    return { httpStatus: 0, json: null }; // network / timeout → transient
  } finally {
    clearTimeout(timer);
  }
}

/** Obtain a bearer token (cached). Never logs the secret or the token. */
async function morningToken(): Promise<{ token: string | null; httpStatus: number; error: string | null }> {
  const cfg = morningConfig();
  if (!cfg.configured) return { token: null, httpStatus: 0, error: "morning_not_configured" };

  const fp = idFingerprint(cfg.apiId);
  const now = Date.now();
  if (cachedToken && cachedToken.env === cfg.env && cachedToken.idFingerprint === fp && cachedToken.expiresAtMs - TOKEN_SKEW_MS > now) {
    return { token: cachedToken.token, httpStatus: 200, error: null };
  }

  const { httpStatus, json } = await fetchJson(`${cfg.baseUrl}/account/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: cfg.apiId, secret: cfg.apiSecret }),
  });
  const token = typeof json?.token === "string" ? (json.token as string) : null;
  if (!token) {
    cachedToken = null;
    return { token: null, httpStatus, error: httpStatus === 0 ? "token_network_error" : `token_http_${httpStatus}` };
  }
  // `expires` may be an epoch-seconds number or an ISO string; fall back to 25 min.
  let expiresAtMs = now + 25 * 60_000;
  const exp = json?.expires;
  if (typeof exp === "number" && exp > 0) expiresAtMs = exp > 1e12 ? exp : exp * 1000;
  else if (typeof exp === "string") { const t = Date.parse(exp); if (!Number.isNaN(t)) expiresAtMs = t; }
  cachedToken = { token, expiresAtMs, env: cfg.env, idFingerprint: fp };
  return { token, httpStatus, error: null };
}

/** Authenticated JSON POST. Fail-closed; never throws; never logs auth header. */
async function morningPost<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<MorningResult<T>> {
  const { token, httpStatus: tokenStatus, error: tokenErr } = await morningToken();
  if (!token) return { ok: false, httpStatus: tokenStatus, data: null, error: tokenErr };

  const cfg = morningConfig();
  const { httpStatus, json } = await fetchJson(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (httpStatus >= 200 && httpStatus < 300) {
    return { ok: true, httpStatus, data: (json as T) ?? null, error: null };
  }
  // On 401, drop the cached token so the next call re-authenticates.
  if (httpStatus === 401) cachedToken = null;
  const errCode = typeof json?.errorCode === "number" ? String(json.errorCode) : "";
  return { ok: false, httpStatus, data: null, error: httpStatus === 0 ? "network_error" : `http_${httpStatus}${errCode ? `_${errCode}` : ""}` };
}

// ── Typed endpoints ──────────────────────────────────────────────────────────

export interface MorningClientInput {
  name: string;
  taxId?: string | null;      // ח.פ / עוסק
  emails?: string[];
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string;           // ISO-2, default IL
}
export interface MorningClientResult { id: string | null }

export async function morningSearchClientByTaxId(taxId: string): Promise<MorningResult<{ items?: Array<{ id: string }> }>> {
  return morningPost("/clients/search", { taxId, page: 1, pageSize: 5 });
}

export async function morningCreateClient(input: MorningClientInput): Promise<MorningResult<{ id?: string }>> {
  return morningPost("/clients", {
    name: input.name,
    taxCode: input.taxId ?? undefined,
    emails: input.emails ?? [],
    phone: input.phone ?? undefined,
    address: input.address ?? undefined,
    city: input.city ?? undefined,
    country: input.country ?? "IL",
    add: true, // create if not present
  });
}

export interface MorningDocumentIncome {
  description: string;
  quantity: number;
  price: number;         // unit price (document currency)
  currency: string;
  vatType: number;
}
export interface MorningDocumentPayment {
  type: number;          // MORNING_PAYMENT_TYPE (3 = credit card)
  price: number;
  currency: string;
  date: string;          // YYYY-MM-DD
}
export interface MorningDocumentInput {
  type: number;                 // MORNING_DOC_TYPE
  date: string;                 // YYYY-MM-DD
  lang: string;
  currency: string;
  vatType: number;
  clientId?: string | null;     // reuse an existing Morning client
  client?: MorningClientInput;  // or inline (when no clientId)
  income: MorningDocumentIncome[];
  payment: MorningDocumentPayment[];
  remarks?: string;
  emails?: string[];            // when set, Morning emails the document to these
}
export interface MorningDocumentResult {
  id?: string;
  number?: string | number;
  url?: { origin?: string; he?: string } | string;
  amount?: number;
  lang?: string;
}

export async function morningCreateDocument(input: MorningDocumentInput): Promise<MorningResult<MorningDocumentResult>> {
  const body: Record<string, unknown> = {
    type: input.type,
    date: input.date,
    lang: input.lang,
    currency: input.currency,
    vatType: input.vatType,
    income: input.income,
    payment: input.payment,
    remarks: input.remarks,
  };
  if (input.clientId) body.client = { id: input.clientId };
  else if (input.client) {
    body.client = {
      name: input.client.name,
      taxId: input.client.taxId ?? undefined,
      emails: input.client.emails ?? [],
      phone: input.client.phone ?? undefined,
      address: input.client.address ?? undefined,
      city: input.client.city ?? undefined,
      country: input.client.country ?? "IL",
      add: true,
    };
  }
  if (input.emails && input.emails.length) body.emails = input.emails; // Morning sends the document
  return morningPost<MorningDocumentResult>("/documents", body);
}

/** Extract a Morning-hosted document URL (never fabricated) from a create response. */
export function morningDocUrl(r: MorningDocumentResult | null): string | null {
  if (!r) return null;
  if (typeof r.url === "string") return r.url || null;
  return r.url?.origin || r.url?.he || null;
}
