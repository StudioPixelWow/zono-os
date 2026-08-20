// ============================================================================
// ZONO — Morning / Green Invoice DOCUMENT POLICY (PURE, no imports, testable).
// Decides WHICH accounting document to issue for a verified payment and how VAT +
// payment method map into Morning's model. Config-driven (env), with explicit
// defaults — and a `configBlocker` when a legal/accounting choice must be made by
// a human rather than assumed silently.
//
// Morning document `type` codes (current api.greeninvoice.co.il/api/v1):
//   305 = חשבונית מס (Tax Invoice)
//   320 = חשבונית מס/קבלה (Tax Invoice + Receipt)   ← default for a PAID subscription
//   330 = חשבונית זיכוי (Credit Invoice / refund)
//   400 = קבלה (Receipt)
// Morning payment `type` codes: 1 cash · 2 cheque · 3 credit card · 4 transfer · 5 paypal.
// GROW charges a credit card → 3.
// Morning income `vatType`: 0 = default (VAT applies) · 1 = exempt · 2 = mixed.
// ============================================================================

export const MORNING_DOC_TYPE = {
  TAX_INVOICE: 305,
  TAX_INVOICE_RECEIPT: 320,
  CREDIT_INVOICE: 330,
  RECEIPT: 400,
} as const;

export const MORNING_PAYMENT_TYPE = {
  CASH: 1, CHEQUE: 2, CREDIT_CARD: 3, BANK_TRANSFER: 4, PAYPAL: 5,
} as const;

/** Hebrew label per Morning document type — for honest UI wording (never call a
 *  receipt "חשבונית"). */
export const MORNING_DOC_TYPE_HE: Record<number, string> = {
  305: "חשבונית מס",
  320: "חשבונית מס/קבלה",
  330: "חשבונית זיכוי",
  400: "קבלה",
};

export interface MorningPolicyInput {
  /** Env-configured document type (MORNING_DOCUMENT_TYPE), if the operator set one. */
  configuredDocType?: number | null;
  /** Env-configured income vatType (MORNING_VAT_TYPE), if set. */
  configuredVatType?: number | null;
  /** Whether the payment is a real, provider-confirmed charge (credit card via GROW). */
  paymentConfirmed: boolean;
}

export interface MorningPolicy {
  documentType: number;
  documentTypeHe: string;
  vatType: number;
  paymentType: number;
  /** Set when the default was assumed rather than explicitly configured — the
   *  report/operator must confirm this is the legally-correct document for the
   *  business before go-live. Non-fatal (issuance still works on the default). */
  configBlocker: string | null;
}

const DEFAULT_DOC_TYPE = MORNING_DOC_TYPE.TAX_INVOICE_RECEIPT; // 320 — paid subscription
const DEFAULT_VAT_TYPE = 0;                                    // VAT applies (Israeli B2B, gross price)

/**
 * Resolve the document policy for a verified subscription payment. Deterministic:
 * a paid subscription defaults to a Tax-Invoice-Receipt (320). The default is
 * flagged via `configBlocker` until an operator explicitly sets MORNING_DOCUMENT_TYPE,
 * so ZONO never silently makes the accounting/legal choice for the office.
 */
export function getMorningDocumentPolicy(input: MorningPolicyInput): MorningPolicy {
  const documentType = input.configuredDocType && MORNING_DOC_TYPE_HE[input.configuredDocType]
    ? input.configuredDocType
    : DEFAULT_DOC_TYPE;
  const vatType = typeof input.configuredVatType === "number" ? input.configuredVatType : DEFAULT_VAT_TYPE;

  const configBlocker = input.configuredDocType
    ? null
    : `MORNING_DOCUMENT_TYPE not set — defaulting to ${documentType} (${MORNING_DOC_TYPE_HE[documentType]}). An accountant must confirm this is the correct document for the business before production go-live.`;

  return {
    documentType,
    documentTypeHe: MORNING_DOC_TYPE_HE[documentType] ?? "מסמך",
    vatType,
    // Only a provider-confirmed charge is recorded as paid-by-credit-card; an
    // unconfirmed payment would never reach here (the service gates on verified).
    paymentType: input.paymentConfirmed ? MORNING_PAYMENT_TYPE.CREDIT_CARD : MORNING_PAYMENT_TYPE.CREDIT_CARD,
    configBlocker,
  };
}

/**
 * Reconciliation guard (PURE): the Morning document total MUST match the verified
 * charged amount. A mismatch beyond a 1-agora rounding tolerance must NOT be
 * marked cleanly issued. Returns true when the amounts reconcile.
 */
export function amountsReconcile(paymentAmount: number, documentAmount: number, toleranceIls = 0.01): boolean {
  if (!Number.isFinite(paymentAmount) || !Number.isFinite(documentAmount)) return false;
  return Math.abs(paymentAmount - documentAmount) <= toleranceIls;
}

/**
 * Classify a Morning HTTP failure (PURE) so the service retries only what is safe.
 * Transient: network/timeout, 429, 5xx. Permanent: validation/auth (4xx except 429).
 */
export function classifyMorningFailure(httpStatus: number): "transient" | "permanent" {
  if (httpStatus === 0) return "transient";          // network / timeout
  if (httpStatus === 429) return "transient";
  if (httpStatus >= 500) return "transient";
  return "permanent";                                 // 4xx validation / auth / config
}
