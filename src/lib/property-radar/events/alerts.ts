// ============================================================================
// ZONO Property Radar™ — daily-event alert builder (pure, client-safe, Hebrew).
// Turns a detected market event into an org alert payload — but ONLY for events
// worth interrupting an agent over (price drops above threshold, hot deals,
// back-on-market, newly-relevant). Everything else returns null (no alert spam).
// ============================================================================
import {
  buildPropertyWhatsappMessage,
  buildWhatsappUrl,
  normalizePhoneForWhatsapp,
} from "../utils";
import { isAlertWorthyDrop } from "./diff";
import type { DetectedMarketEvent, MarketEventType } from "./types";
import type { NormalizedListingMetadata } from "../providers/types";

export interface BuiltMarketEventAlert {
  alertType: string;
  eventType: MarketEventType;
  title: string;
  message: string;
  priority: "low" | "medium" | "high" | "urgent";
  opportunityScore: number;
  metadata: Record<string, unknown>;
}

export interface BuildMarketEventAlertInput {
  event: DetectedMarketEvent;
  source: NormalizedListingMetadata;
  marketPropertySourceId: string;
  buyerMatchCount: number;
  opportunityScore: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

function baseMetadata(input: BuildMarketEventAlertInput): Record<string, unknown> {
  const { source, event, buyerMatchCount, marketPropertySourceId } = input;
  const whatsappMessage = buildPropertyWhatsappMessage({
    contactName: source.contactName, city: source.city, neighborhood: source.neighborhood, agentName: null,
  });
  const normalized = normalizePhoneForWhatsapp(source.phone);
  return {
    city: source.city ?? null,
    neighborhood: source.neighborhood ?? null,
    street: source.street ?? null,
    addressText: source.addressText ?? null,
    price: source.price ?? null,
    rooms: source.rooms ?? null,
    floor: source.floor ?? null,
    sizeSqm: source.sizeSqm ?? null,
    propertyType: source.propertyType ?? null,
    imageUrl: source.imageUrl ?? null,
    phone: source.phone ?? null,
    provider: source.provider,
    externalId: source.externalId,
    externalUrl: source.externalUrl ?? null,
    eventType: event.eventType,
    priceDelta: event.priceDelta ?? null,
    priceDeltaPercent: event.priceDeltaPercent ?? null,
    opportunityScore: input.opportunityScore,
    buyerMatchCount,
    showBuyerMatches: buyerMatchCount > 0,
    marketPropertySourceId,
    whatsappMessage,
    whatsappUrl: buildWhatsappUrl(source.phone, whatsappMessage),
    callUrl: normalized ? `tel:+${normalized}` : null,
    source: "market_daily_event",
  };
}

/**
 * Build an org alert for a meaningful event — or null when it isn't alert-worthy.
 * Honors thresholds: price drop ≥2% OR ≥50k · hot deal ≥8% OR ≥150k ·
 * buyer_match_gained only when buyerCount > 0.
 */
export function buildMarketEventAlert(input: BuildMarketEventAlertInput): BuiltMarketEventAlert | null {
  const { event, buyerMatchCount } = input;
  const absDelta = Math.abs(event.priceDelta ?? 0);
  const pct = Math.abs(event.priceDeltaPercent ?? 0);
  const meta = baseMetadata(input);

  switch (event.eventType) {
    case "price_drop": {
      if (!isAlertWorthyDrop(absDelta, pct)) return null; // below threshold → no alert
      return {
        alertType: "market_price_drop",
        eventType: "price_drop",
        title: "ירידת מחיר בנכס מתאים",
        message: `הנכס ירד ב־${fmt(absDelta)} ₪ ועכשיו מתאים ל־${buyerMatchCount} קונים פעילים.`,
        priority: "high",
        opportunityScore: input.opportunityScore,
        metadata: meta,
      };
    }
    case "hot_deal":
      return {
        alertType: "market_hot_deal",
        eventType: "hot_deal",
        title: "עסקה חמה באזור שלך",
        message: "הנכס ירד משמעותית במחיר ונראה כהזדמנות שכדאי לבדוק מהר.",
        priority: event.severity === "urgent" ? "urgent" : "high",
        opportunityScore: input.opportunityScore,
        metadata: meta,
      };
    case "back_on_market":
      return {
        alertType: "market_back_on_market",
        eventType: "back_on_market",
        title: "נכס חזר לשוק",
        message: "נכס שהיה לא זמין חזר לשוק ועשוי להתאים לקונים שלך.",
        priority: "medium",
        opportunityScore: input.opportunityScore,
        metadata: meta,
      };
    case "buyer_match_gained": {
      if (buyerMatchCount <= 0) return null;
      return {
        alertType: "market_buyer_match_gained",
        eventType: "buyer_match_gained",
        title: "נכס הפך רלוונטי לקונים",
        message: `בעקבות שינוי במחיר/נתונים, הנכס מתאים עכשיו ל־${buyerMatchCount} קונים.`,
        priority: buyerMatchCount >= 3 ? "high" : "medium",
        opportunityScore: input.opportunityScore,
        metadata: meta,
      };
    }
    default:
      return null; // price_increase / metadata_changed / status_changed / lost / removed → no alert
  }
}
