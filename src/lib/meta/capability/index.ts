// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CAPABILITY surface. Phase 0.
// ============================================================================
export type {
  MetaCapability,
  MetaCapabilityKey,
  MetaCapabilityRequirement,
  MetaCapabilityState,
  MetaCapabilityDecision,
  MetaCapabilityDenyReason,
  MetaAccessMode,
  MetaKillSwitchDomain,
  MetaVerificationState,
} from "./types";
export {
  META_CAPABILITIES,
  getMetaCapability,
  metaCapabilitiesByClass,
  EXCLUDED_CAPABILITY_KEYS,
} from "./registry";
export { evaluateMetaCapability, evaluateMetaCapabilities } from "./evaluate";
