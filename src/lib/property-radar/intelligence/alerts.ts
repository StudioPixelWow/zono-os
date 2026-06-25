// ============================================================================
// ZONO Property Radar™ — alert rules + alert builder (pure, client-safe).
// Decides whether a scored listing deserves an alert and assembles the alert
// payload (title, message, priority, rich metadata incl. WhatsApp / call links).
// No I/O — the engine handles dedup + persistence.
// ============================================================================
import type { NormalizedListingMetadata } from "../providers/types";
import {
  buildPropertyWhatsappMessage,
  buildWhatsappUrl,
  normalizePhoneForWhatsapp,
} from "../utils";
import type {
  BuiltPropertyAlert,
  CreatePropertyAlertInput,
  OpportunityScoreResult,
  PropertyAlertPriorityValue,
  RadarSettingsLite,
} from "./types";

/**
 * Alert gate:
 *   • private listing AND private alerts enabled → yes
 *   • total score ≥ min popup score            → yes
 *   • buyer matches > 0 AND total score ≥ 60   → yes
 */
export function shouldCreatePropertyAlert(
  score: OpportunityScoreResult,
  source: NormalizedListingMetadata,
  settings: RadarSettingsLite,
): boolean {
  if (source.listingType === "private" && settings.privatePropertyAlertsEnabled) return true;
  if (score.totalScore >= settings.minPopupOpportunityScore) return true;
  if (score.buyerMatchCount > 0 && score.totalScore >= 60) return true;
  return false;
}

function priorityFor(total: number, isPrivate: boolean): PropertyAlertPriorityValue {
  if (total >= 85) return "urgent";
  if (total >= 70) return "high";
  if (isPrivate || total >= 50) return "medium";
  return "low";
}

function callUrlFor(phone: string | null | undefined): string | null {
  const normalized = normalizePhoneForWhatsapp(phone);
  return normalized ? `tel:+${normalized}` : null;
}

/**
 * Builds the alert payload for a scored listing. Pure — returns the row to
 * insert; it does not touch the database.
 */
export function createPropertyOpportunityAlert(
  input: CreatePropertyAlertInput,
): BuiltPropertyAlert {
  const { source, score } = input;
  const isPrivate = source.listingType === "private";

  // Choose alert type + copy.
  let alertType: string;
  let title: string;
  let message: string;
  if (input.priceDropped) {
    alertType = "price_drop";
    title = "ירידת מחיר בנכס שאתה עוקב אחריו";
    message = "המחיר עודכן כלפי מטה — בדוק אם זו הזדמנות.";
  } else if (isPrivate) {
    alertType = "new_private_property";
    title = "נקלט נכס פרטי חדש!";
    message = "פנה מהר לפני שייחטף!";
  } else if (score.buyerMatchCount > 0) {
    alertType = "buyer_match";
    title = "נכס חדש שמתאים לקונים שלך";
    message = score.recommendation;
  } else {
    alertType = "high_opportunity";
    title = "הזדמנות חדשה באזור שלך";
    message = score.recommendation;
  }

  const agentName = input.agentName ?? null;
  const whatsappMessage = buildPropertyWhatsappMessage({
    contactName: source.contactName,
    city: source.city,
    neighborhood: source.neighborhood,
    agentName,
  });
  const whatsappUrl = buildWhatsappUrl(source.phone, whatsappMessage);
  const callUrl = callUrlFor(source.phone);

  const metadata: Record<string, unknown> = {
    city: source.city ?? null,
    neighborhood: source.neighborhood ?? null,
    street: source.street ?? null,
    addressText: source.addressText ?? null,
    price: source.price ?? null,
    rooms: source.rooms ?? null,
    floor: source.floor ?? null,
    sizeSqm: source.sizeSqm ?? null,
    propertyType: source.propertyType ?? null,
    publishedAt: source.publishedAt ?? null,
    imageUrl: source.imageUrl ?? null,
    phone: source.phone ?? null,
    contactName: source.contactName ?? null,
    provider: source.provider,
    externalId: source.externalId,
    externalUrl: source.externalUrl ?? null,
    listingType: source.listingType ?? null,
    reasons: score.reasons,
    recommendation: score.recommendation,
    opportunityScore: score.totalScore,
    breakdown: score.breakdown,
    buyerMatchCount: score.buyerMatchCount,
    whatsappMessage,
    whatsappUrl,
    callUrl,
    isUpdate: Boolean(input.isUpdate),
    priceDropped: Boolean(input.priceDropped),
  };

  return {
    alertType,
    title,
    message,
    priority: priorityFor(score.totalScore, isPrivate),
    opportunityScore: score.totalScore,
    metadata,
  };
}
