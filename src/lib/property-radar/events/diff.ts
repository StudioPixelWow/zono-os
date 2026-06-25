// ============================================================================
// ZONO Property Radar™ — market change diff (pure, deterministic, client-safe).
// Compares a previously-cached source against freshly-scanned metadata and emits
// structured market events. No I/O — the engine persists + acts on the result.
// ============================================================================
import { createListingContentHash } from "../utils";
import type {
  DetectedMarketEvent,
  MarketEventSeverity,
  MarketPropertySource,
  NormalizedListingMetadata,
  PropertyChangeDiff,
} from "./types";

// Thresholds (configurable defaults).
export const HOT_DEAL_PCT = 8; // ≥ 8% drop
export const HOT_DEAL_ABS = 150_000; // …or ≥ 150,000 ₪
export const PRICE_DROP_ALERT_PCT = 2; // alert-worthy drop ≥ 2%
export const PRICE_DROP_ALERT_ABS = 50_000; // …or ≥ 50,000 ₪

const MISSING_STATUSES = ["missing", "deleted"];

function priceDropSeverity(absDelta: number, pct: number): MarketEventSeverity {
  if (absDelta >= HOT_DEAL_ABS || pct >= HOT_DEAL_PCT) return "high";
  if (pct >= PRICE_DROP_ALERT_PCT || absDelta >= PRICE_DROP_ALERT_ABS) return "medium";
  return "low";
}

/** Is a price drop large enough to be alert-worthy (≥2% OR ≥50k)? */
export function isAlertWorthyDrop(absDelta: number, pct: number): boolean {
  return pct >= PRICE_DROP_ALERT_PCT || absDelta >= PRICE_DROP_ALERT_ABS;
}

/** Is a price drop a "hot deal" (≥8% OR ≥150k)? */
export function isHotDeal(absDelta: number, pct: number): boolean {
  return pct >= HOT_DEAL_PCT || absDelta >= HOT_DEAL_ABS;
}

/**
 * Detect meaningful changes between a cached source and fresh metadata.
 * Emits: price_drop / price_increase / hot_deal / back_on_market / metadata_changed.
 * (removed is detected separately by the engine's missing sweep.)
 */
export function detectPropertyChanges(
  previousSource: MarketPropertySource,
  nextMetadata: NormalizedListingMetadata,
): PropertyChangeDiff {
  const nextHash = createListingContentHash(nextMetadata);
  const prevHash = previousSource.content_hash ?? null;
  const events: DetectedMarketEvent[] = [];
  let priceDropped = false;

  // Back on market — was missing/deleted and now appears in the scan again.
  if (MISSING_STATUSES.includes(previousSource.source_status)) {
    events.push({
      eventType: "back_on_market",
      severity: "medium",
      previousValue: { source_status: previousSource.source_status },
      nextValue: { source_status: "active" },
    });
  }

  const prevPrice = previousSource.price;
  const nextPrice = nextMetadata.price ?? null;
  let priceChanged = false;
  if (prevPrice != null && nextPrice != null && nextPrice !== prevPrice && prevPrice > 0) {
    priceChanged = true;
    const delta = nextPrice - prevPrice; // negative = drop
    const absDelta = Math.abs(delta);
    const pct = Math.round((absDelta / prevPrice) * 1000) / 10; // 1-decimal %
    if (delta < 0) {
      priceDropped = true;
      events.push({
        eventType: "price_drop",
        severity: priceDropSeverity(absDelta, pct),
        previousValue: { price: prevPrice },
        nextValue: { price: nextPrice },
        priceDelta: delta,
        priceDeltaPercent: -pct,
      });
      if (isHotDeal(absDelta, pct)) {
        events.push({
          eventType: "hot_deal",
          severity: pct >= 12 || absDelta >= 300_000 ? "urgent" : "high",
          previousValue: { price: prevPrice },
          nextValue: { price: nextPrice },
          priceDelta: delta,
          priceDeltaPercent: -pct,
        });
      }
    } else {
      events.push({
        eventType: "price_increase",
        severity: "low",
        previousValue: { price: prevPrice },
        nextValue: { price: nextPrice },
        priceDelta: delta,
        priceDeltaPercent: pct,
      });
    }
  }

  // Metadata changed — hash differs but NOT explained by a price change alone.
  if (prevHash && nextHash !== prevHash && !priceChanged) {
    events.push({
      eventType: "metadata_changed",
      severity: "low",
      previousValue: { content_hash: prevHash },
      nextValue: { content_hash: nextHash },
    });
  }

  const hashChanged = nextHash !== prevHash;
  return {
    changed: events.length > 0 || hashChanged,
    events,
    nextHash,
    priceDropped,
    needsFullFetch: hashChanged,
  };
}
