// ============================================================================
// ZONO Property Radar™ — daily market events public surface.
// The diff engine + alert builder are pure/client-safe; the daily engine +
// repository are server-only (not re-exported here to keep this client-safe).
// ============================================================================
export * from "./types";
export {
  detectPropertyChanges,
  isAlertWorthyDrop,
  isHotDeal,
  HOT_DEAL_PCT,
  HOT_DEAL_ABS,
  PRICE_DROP_ALERT_PCT,
  PRICE_DROP_ALERT_ABS,
} from "./diff";
export { buildMarketEventAlert } from "./alerts";
export type { BuiltMarketEventAlert, BuildMarketEventAlertInput } from "./alerts";
