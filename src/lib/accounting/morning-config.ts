// ============================================================================
// ZONO — Morning / Green Invoice CONFIG (server-only). Reads credentials + policy
// knobs from env. Values are NEVER returned to any client/DTO and NEVER logged.
// Current API (verified against api.greeninvoice.co.il/api/v1):
//   production: https://api.greeninvoice.co.il/api/v1
//   sandbox:    https://sandbox.d.greeninvoice.co.il/api/v1
// Auth: POST /account/token { id, secret } → { token, expires } (JWT ~30 min).
// ============================================================================
import "server-only";

const PROD_BASE = "https://api.greeninvoice.co.il/api/v1";
const SANDBOX_BASE = "https://sandbox.d.greeninvoice.co.il/api/v1";

export interface MorningConfig {
  apiId: string;
  apiSecret: string;
  env: "sandbox" | "production";
  baseUrl: string;
  documentType: number | null;   // MORNING_DOCUMENT_TYPE (unset → policy default + blocker)
  vatType: number | null;        // MORNING_VAT_TYPE
  lang: string;                  // "he" default
  sendEmail: boolean;            // MORNING_SEND_EMAIL — let Morning email the doc (primary delivery)
  /** Only payments verified on/after this ISO timestamp are auto-issued. Prevents
   *  accidental mass backfill of historical payments on deploy. */
  invoicingStartAt: string | null;
  configured: boolean;           // apiId + apiSecret present
}

export function morningConfig(): MorningConfig {
  const apiId = process.env.MORNING_API_ID ?? "";
  const apiSecret = process.env.MORNING_API_SECRET ?? "";
  const env = (process.env.MORNING_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  const docTypeRaw = process.env.MORNING_DOCUMENT_TYPE;
  const vatRaw = process.env.MORNING_VAT_TYPE;
  return {
    apiId,
    apiSecret,
    env,
    baseUrl: env === "production" ? PROD_BASE : SANDBOX_BASE,
    documentType: docTypeRaw && /^\d+$/.test(docTypeRaw) ? parseInt(docTypeRaw, 10) : null,
    vatType: vatRaw && /^\d+$/.test(vatRaw) ? parseInt(vatRaw, 10) : null,
    lang: process.env.MORNING_LANG || "he",
    sendEmail: (process.env.MORNING_SEND_EMAIL ?? "true").toLowerCase() !== "false",
    invoicingStartAt: process.env.MORNING_INVOICING_START_AT || null,
    configured: !!apiId && !!apiSecret,
  };
}

/** Operator health — presence only, NEVER the secret values. */
export function morningConfigStatus(): { configured: boolean; env: string; hasId: boolean; hasSecret: boolean; docTypeSet: boolean } {
  const c = morningConfig();
  return { configured: c.configured, env: c.env, hasId: !!c.apiId, hasSecret: !!c.apiSecret, docTypeSet: c.documentType != null };
}
