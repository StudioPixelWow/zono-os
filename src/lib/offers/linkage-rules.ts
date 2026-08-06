// ============================================================================
// ZONO — Offers · linkage & conversion rules (PURE; no I/O; unit-tested)
// ----------------------------------------------------------------------------
// The deterministic core of offer↔entity linkage and offer→deal conversion.
// Kept database-free so the guarantees (required links, seller derivation,
// idempotent conversion) are provable without a running Postgres. The service
// imports these — single source of truth for the decisions.
// ============================================================================

/** The generic offer form requires BOTH a buyer and a property to be chosen. */
export function requireBuyerAndProperty(input: { buyerId?: string | null; propertyId?: string | null }): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!input.buyerId) missing.push("buyer");
  if (!input.propertyId) missing.push("property");
  return { ok: missing.length === 0, missing };
}

/**
 * Derive the seller for an offer: prefer an explicitly supplied seller, else fall
 * back to the property's owner (seller_id), else null. Empty strings are treated
 * as "not supplied".
 */
export function deriveSellerId(propertySellerId: string | null, inputSellerId?: string | null): string | null {
  return (inputSellerId || null) ?? (propertySellerId || null) ?? null;
}

/**
 * Idempotency, encoded purely: given an offer's status + deal link, decide what
 * conversion should do.
 *  - accepted + already has a deal → "return-existing" (no second deal)
 *  - accepted + no deal            → "create"
 *  - any other status              → "invalid"
 */
export function conversionDecision(offer: { status: string; deal_id: string | null }): "return-existing" | "create" | "invalid" {
  if (offer.status !== "accepted") return "invalid";
  return offer.deal_id ? "return-existing" : "create";
}
