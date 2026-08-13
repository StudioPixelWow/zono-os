// ============================================================================
// ZONO — GROW (Meshulam) Light Server API CLIENT (server-only). P8.4.
// Thin, typed wrapper over the documented Grow endpoints. Server-to-server ONLY
// (Grow blocks browser requests). Credentials come from env and are NEVER logged.
// Endpoints + params derived strictly from developers.grow.business:
//   • createPaymentProcess   — build a hosted checkout (redirect/iframe)
//   • getTransactionInfo     — AUTHORITATIVE verification re-query (the security gate)
//   • approveTransaction     — acknowledgment of a received callback (NOT verification)
//   • updateDirectDebit      — change amount / cancel a recurring payment
// All request bodies are FormData; responses are JSON { status, err, data }.
// ============================================================================
import "server-only";
import { growBaseUrl } from "./grow-mapping";

export interface GrowCreds {
  userId: string;
  pageCode: string;
  recurringPageCode: string | null;
  apiKey: string | null;
  env: string;            // "sandbox" | "production"
  configured: boolean;    // userId + pageCode present
}

/** Read Grow credentials from env (presence-checked). Values are never returned to
 *  any client / DTO; used only to sign server-to-server calls. */
export function growCreds(): GrowCreds {
  const userId = process.env.GROW_USER_ID ?? "";
  const pageCode = process.env.GROW_PAGE_CODE ?? "";
  return {
    userId,
    pageCode,
    recurringPageCode: process.env.GROW_RECURRING_PAGE_CODE || null,
    apiKey: process.env.GROW_API_KEY || null,
    env: (process.env.GROW_ENV || "sandbox").toLowerCase(),
    configured: !!userId && !!pageCode,
  };
}

export interface GrowResponse<T = Record<string, unknown>> {
  ok: boolean;               // wrapper status === "1"
  status: string;            // "1" | "0"
  err: unknown;              // error object/string when status "0"
  data: T | null;
  httpStatus: number;
}

/** POST FormData to a Grow endpoint and parse the { status, err, data } envelope.
 *  Never throws on provider/HTTP errors — returns ok:false so callers fail closed. */
async function growPost<T = Record<string, unknown>>(
  path: string,
  fields: Record<string, string | number | undefined | null>,
  opts: { apiKeyHeader?: string | null } = {},
): Promise<GrowResponse<T>> {
  const creds = growCreds();
  const url = growBaseUrl(creds.env) + path;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (opts.apiKeyHeader) headers["x-api-key"] = opts.apiKeyHeader;

  try {
    const res = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
    const httpStatus = res.status;
    let json: { status?: string; err?: unknown; data?: T } = {};
    try { json = (await res.json()) as typeof json; } catch { /* non-JSON → treated as failure */ }
    const status = String(json.status ?? "0");
    return { ok: status === "1", status, err: json.err ?? null, data: (json.data ?? null) as T | null, httpStatus };
  } catch {
    // Network/other error — fail closed (never treat as success).
    return { ok: false, status: "0", err: "network_error", data: null, httpStatus: 0 };
  }
}

// ── createPaymentProcess — hosted checkout (one-time or recurring via pageCode) ──
export interface CreateProcessInput {
  sum: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  paymentNum?: number | null;      // 1..12
  chargeType?: number | null;      // 1 = regular
  cField1?: string | null;         // our paymentId, echoed back in the callback
  recurring?: boolean;             // use the recurring pageCode
}
export interface CreateProcessData { processId: string; processToken: string; url: string }

export async function growCreatePaymentProcess(input: CreateProcessInput): Promise<GrowResponse<CreateProcessData>> {
  const creds = growCreds();
  const pageCode = input.recurring ? (creds.recurringPageCode ?? creds.pageCode) : creds.pageCode;
  return growPost<CreateProcessData>("createPaymentProcess", {
    pageCode, userId: creds.userId,
    sum: input.sum, description: input.description,
    successUrl: input.successUrl, cancelUrl: input.cancelUrl, notifyUrl: input.notifyUrl,
    "pageField[fullName]": input.fullName ?? "",
    "pageField[phone]": input.phone ?? "",
    "pageField[email]": input.email ?? "",
    paymentNum: input.paymentNum ?? undefined,
    chargeType: input.chargeType ?? undefined,
    cField1: input.cField1 ?? undefined,
  });
}

// ── getTransactionInfo — AUTHORITATIVE verification (the security gate) ──────────
// A forged callback cannot pass this: we ask Grow, with OUR pageCode, whether the
// (transactionId, transactionToken) pair is a real, paid transaction.
export interface TransactionInfoData {
  statusCode?: string; status?: string; asmachta?: string; sum?: string | number;
  transactionId?: string; transactionToken?: string; processId?: string;
  cardSuffix?: string; cardBrand?: string; paymentType?: string | number;
  fullName?: string; payerEmail?: string; payerPhone?: string; paymentDate?: string;
  directDebitId?: string; recurringDebitId?: string;
}
export async function growGetTransactionInfo(transactionId: string, transactionToken: string): Promise<GrowResponse<TransactionInfoData>> {
  const creds = growCreds();
  return growPost<TransactionInfoData>("getTransactionInfo", {
    pageCode: creds.pageCode, transactionId, transactionToken,
  });
}

// ── approveTransaction — acknowledgment only (NOT verification) ──────────────────
export async function growApproveTransaction(callbackData: Record<string, string | number | undefined | null>): Promise<GrowResponse> {
  const creds = growCreds();
  return growPost("approveTransaction", { pageCode: creds.pageCode, ...callbackData });
}

// ── updateDirectDebit — change recurring amount / cancel (changeStatus=2) ────────
export interface UpdateDirectDebitInput {
  transactionId: string; transactionToken: string; asmachta: string;
  sum?: number | null;            // new recurring amount
  paymentNum?: number | null;
  chargeDay?: number | null;      // 1..31
  changeStatus?: 1 | 2;           // 1 = active, 2 = cancel
  updateCard?: 0 | 1;
}
export async function growUpdateDirectDebit(input: UpdateDirectDebitInput): Promise<GrowResponse> {
  const creds = growCreds();
  return growPost("updateDirectDebit", {
    userId: creds.userId,
    transactionId: input.transactionId, transactionToken: input.transactionToken, asmachta: input.asmachta,
    sum: input.sum ?? undefined, paymentNum: input.paymentNum ?? undefined,
    chargeDay: input.chargeDay ?? undefined, changeStatus: input.changeStatus ?? undefined,
    updateCard: input.updateCard ?? undefined,
  });
}
