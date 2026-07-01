// ============================================================================
// 🏷️ Brokerage Brand & Branch Identity Engine™ — public surface. 26.4.19.
// Brand → Office/Branch → Broker hierarchy (read-only). Branches of a brand are
// independent offices, never merged. Duplicates are flagged on strong identity
// only (phone/website/address/coordinates) and never auto-merged. No changes to
// discovery / AI / verification rules / schema.
// ============================================================================
export { getBrandHierarchy } from "./service";
export { resolveBrandBranch, identityOf, sharedIdentitySignals } from "./resolver";
export { runSelfCheck, type BISelfCheck, type BICheck } from "./qa";
export { BRAND_IDENTITY_VERSION } from "./types";
export type {
  BrandResolution, OfficeIdentity, BrokerRef, BranchOffice, BrandNode, PossibleDuplicate, BrandHierarchy,
} from "./types";
