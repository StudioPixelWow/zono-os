// ============================================================================
// 📣 ZONO — External Listing Alerts · server actions (approval-gated). 41.2.
// Creates the two broker alerts for a new external listing as WhatsApp DRAFTS
// (never auto-sent) by REUSING getExternalListingDetail (listing + buyer matches)
// + the existing createDraftAction. No auto-send, no new engine, no schema.
// ============================================================================
"use server";
import { getExternalListingDetail } from "./service";
import { createDraftAction } from "@/lib/whatsapp/actions";
import { buildAcquisitionDraft, buildBuyerMatchDraft, type AlertListing, type AlertBuyerMatch } from "./alerts";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };

function toAlertListing(listing: Row, reason: string | null): AlertListing {
  return {
    id: s(listing.id) ?? "", source: s(listing.source) ?? s(listing.listing_source_type),
    city: s(listing.city), neighborhood: s(listing.neighborhood), street: s(listing.street),
    price: num(listing.price), rooms: num(listing.rooms), sqm: num(listing.sqm) ?? num(listing.area_sqm), reason,
  };
}

/** (A) Acquisition alert → approval-gated WhatsApp draft. */
export async function createAcquisitionAlertDraftAction(listingId: string): Promise<{ ok: boolean; message?: string }> {
  if (!listingId) return { ok: false, message: "לא צוין נכס." };
  const detail = await getExternalListingDetail(listingId).catch(() => null);
  if (!detail) return { ok: false, message: "הנכס לא נמצא." };
  const body = buildAcquisitionDraft(toAlertListing(detail.listing as unknown as Row, detail.whyItMatters[0] ?? null));
  const r = await createDraftAction({ body, kind: "acquisition_alert" });
  return { ok: !("error" in r && r.error), message: ("message" in r && r.message) ? r.message : ("error" in r && r.error) ? r.error : "טיוטת גיוס נוצרה (דורשת אישור)" };
}

/** (B) Buyer-match alert → approval-gated WhatsApp draft (only when matches exist). */
export async function createBuyerMatchAlertDraftAction(listingId: string): Promise<{ ok: boolean; message?: string }> {
  if (!listingId) return { ok: false, message: "לא צוין נכס." };
  const detail = await getExternalListingDetail(listingId).catch(() => null);
  if (!detail) return { ok: false, message: "הנכס לא נמצא." };
  if (!detail.buyerMatches.length) return { ok: false, message: "אין קונים מתאימים לנכס זה." };
  const matches: AlertBuyerMatch[] = detail.buyerMatches.map((m) => ({ name: (m as unknown as Row).name ? String((m as unknown as Row).name) : "קונה", reasons: m.reasons ?? [], closingProbability: m.closingProbability, commissionOpportunity: m.commissionOpportunity }));
  const body = buildBuyerMatchDraft(toAlertListing(detail.listing as unknown as Row, detail.whyItMatters[0] ?? null), matches);
  const r = await createDraftAction({ body, kind: "buyer_match_alert" });
  return { ok: !("error" in r && r.error), message: ("message" in r && r.message) ? r.message : ("error" in r && r.error) ? r.error : "טיוטת התאמת קונים נוצרה (דורשת אישור)" };
}
