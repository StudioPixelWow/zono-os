// ============================================================================
// ZONO Price Intelligence — provider registry + evidence gatherer (server-only).
// Runs every comparable provider, aggregates the real evidence and reports each
// provider's connection status so the UI can be honest about what's wired.
// ============================================================================
import type { Comparable } from "../types";
import type { ProviderContext, ProviderResult } from "./types";
import { govmapProvider } from "./govmap-provider";
import { taxAuthorityProvider } from "./tax-authority-provider";
import { yad2Provider } from "./yad2-provider";
import { madlanProvider } from "./madlan-provider";
import { zonoInternalProvider } from "./zono-internal-provider";

export { getBrokerSoldProperties } from "./broker-sold-provider";
export type { ProviderResult, ProviderContext } from "./types";

const COMPARABLE_PROVIDERS = [
  govmapProvider,
  taxAuthorityProvider,
  yad2Provider,
  madlanProvider,
  zonoInternalProvider,
];

export interface EvidenceBundle {
  comparables: Comparable[];
  providers: ProviderResult[];
}

/** Run all comparable providers and merge their real evidence. */
export async function gatherEvidence(ctx: ProviderContext): Promise<EvidenceBundle> {
  const results = await Promise.all(
    COMPARABLE_PROVIDERS.map((p) => p(ctx).catch((e): ProviderResult => ({
      source: p.name, status: "error", comparables: [],
      message: e instanceof Error ? e.message : "provider error",
    }))),
  );
  const comparables = results.flatMap((r) => r.comparables);
  return { comparables, providers: results };
}
