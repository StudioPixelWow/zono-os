// ============================================================================
// 📦 Office Inventory Attribution™ — public surface. Phase 26.5.
// Rolls up office listings (direct + broker-derived) with attribution +
// conflicts; safe backfill of broker→office links. Reuses the existing links
// table (no schema change). No discovery/AI/verification/valuation changes.
// ============================================================================
export { getOfficeInventory } from "./service";
export { backfillOfficeInventoryFromBrokers } from "./backfill";
export { attributeLink, stronger, type Attribution, type AttributionKind, type LinkFacts } from "./attribution";
export { runSelfCheck, type OISelfCheck, type OICheck } from "./qa";
export { OFFICE_INVENTORY_VERSION } from "./types";
export type { InventoryListing, CountBy, BrokerInventory, OfficeInventory, BackfillResult } from "./types";
