// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · INTEGRATION DESCRIPTOR builder. Phase 0.
// ----------------------------------------------------------------------------
// A PURE builder for the public Integration-Center descriptor. It derives the
// missing-permission list and setup steps deterministically from capability
// decisions, and guarantees no secret is present. No persistence, no UI.
// ============================================================================
import type { MetaIntegrationDescriptor, MetaIntegrationDescriptorInput } from "./types";

/** Deterministic setup steps derived from status + missing requirements. */
function deriveSetupSteps(input: MetaIntegrationDescriptorInput, missing: readonly string[]): string[] {
  const steps: string[] = [];
  if (input.status === "not_connected") steps.push("Connect a Meta Business account");
  if (input.reconnectRequired || input.status === "needs_reauth") steps.push("Reconnect the Meta account (authorization expired or revoked)");
  if (missing.includes("app_review")) steps.push("Complete Meta App Review for the required permissions");
  if (missing.includes("business_verification")) steps.push("Complete Meta Business Verification");
  if (missing.includes("webhook")) steps.push("Enable and verify webhook subscriptions");
  return steps;
}

/**
 * Build the public descriptor. Only capability decisions (allow/deny + reasons),
 * asset COUNTS, and safe status flags are surfaced — no token, no raw scope.
 */
export function buildMetaIntegrationDescriptor(input: MetaIntegrationDescriptorInput): MetaIntegrationDescriptor {
  const missingSet = new Set<string>();
  const degraded: string[] = [];
  for (const d of input.capabilities) {
    for (const m of d.missing) missingSet.add(m);
    if (d.degraded) degraded.push(`${d.key}: degraded`);
  }
  const missingPermissions = [...missingSet].sort();
  return {
    key: "meta",
    status: input.status,
    health: input.health,
    connectedAssets: { businesses: input.assetCounts.businesses, pages: input.assetCounts.pages, instagram: input.assetCounts.instagram },
    capabilities: input.capabilities,
    missingPermissions,
    requiredSetupSteps: deriveSetupSteps(input, missingPermissions),
    lastVerifiedAt: input.lastVerifiedAt,
    reconnectRequired: input.reconnectRequired,
    degradedReasons: degraded,
  };
}

/**
 * The public contract entrypoint. In Phase 0 there is no live connection store,
 * so callers pass the derived state in; later phases resolve it from persistence.
 * The signature is the stable Integration-Center seam.
 */
export function getMetaIntegrationDescriptor(input: MetaIntegrationDescriptorInput): MetaIntegrationDescriptor {
  return buildMetaIntegrationDescriptor(input);
}
