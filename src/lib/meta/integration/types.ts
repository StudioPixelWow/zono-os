// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTEGRATION CENTER contract. Phase 0.
// ----------------------------------------------------------------------------
// The public descriptor a future Integration Center consumes. It exposes ONLY
// safe data — never a token, secret, raw scope string, or private content. No UI
// and no persistence are built here; this is the contract shape + a pure builder.
// ============================================================================
import type { MetaCapabilityDecision } from "../capability/types";
import type { MetaConnectionHealth, MetaConnectionStatus } from "../connection/types";

/** Health rollup for the whole integration. */
export type MetaIntegrationHealth = MetaConnectionHealth;

/** A canonical, non-secret notification event descriptor (see notify/). */
export type { MetaNotificationEvent } from "../notify/types";

/** The public, client-safe integration descriptor. */
export interface MetaIntegrationDescriptor {
  key: "meta";
  status: MetaConnectionStatus;
  health: MetaIntegrationHealth;
  connectedAssets: {
    businesses: number;
    pages: number;
    instagram: number;
  };
  /** Capability decisions (allow/deny + reasons) — no raw scopes. */
  capabilities: readonly MetaCapabilityDecision[];
  /** Canonical requirement keys still missing (e.g. "app_review"). */
  missingPermissions: readonly string[];
  /** Ordered human setup steps for the connection wizard. */
  requiredSetupSteps: readonly string[];
  lastVerifiedAt: string | null;
  reconnectRequired: boolean;
  /** Human-readable reasons the integration is degraded, if any. */
  degradedReasons: readonly string[];
}

/** Descriptor for an integration that has never been connected. */
export interface MetaIntegrationDescriptorInput {
  status: MetaConnectionStatus;
  health: MetaIntegrationHealth;
  assetCounts: { businesses: number; pages: number; instagram: number };
  capabilities: readonly MetaCapabilityDecision[];
  lastVerifiedAt: string | null;
  reconnectRequired: boolean;
}
