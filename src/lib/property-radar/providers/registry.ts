// ============================================================================
// ZONO Property Radar™ — provider registry.
// Single entry point the sync engine uses to obtain a provider by name. 'mock' is
// fully functional (dev/test only); 'yad2' / 'madlan' resolve to placeholders
// that throw ProviderNotImplementedError until their real impls land.
// ============================================================================
import type { PropertyProviderName } from "../types";
import type { PropertyProvider } from "./types";
import { MockPropertyProvider } from "./mock-provider";
import { Yad2PropertyProvider } from "./yad2-provider";
import { MadlanPropertyProvider } from "./madlan-provider";
import { PropertyProviderError } from "./errors";

// Lazily-instantiated singletons — providers are stateless and reusable.
const INSTANCES: Partial<Record<PropertyProviderName, PropertyProvider>> = {};

const FACTORIES: Record<PropertyProviderName, () => PropertyProvider> = {
  mock: () => new MockPropertyProvider(),
  yad2: () => new Yad2PropertyProvider(),
  madlan: () => new MadlanPropertyProvider(),
};

export function getPropertyProvider(providerName: PropertyProviderName): PropertyProvider {
  const factory = FACTORIES[providerName];
  if (!factory) {
    throw new PropertyProviderError({
      providerName,
      message: `Unknown property provider: ${providerName}`,
      retryable: false,
    });
  }
  return (INSTANCES[providerName] ??= factory());
}

/** Names of providers that are actually implemented (excludes placeholders). */
export function getImplementedProviderNames(): PropertyProviderName[] {
  return ["mock"];
}

/** All registered provider names (implemented + placeholders). */
export function getAllProviderNames(): PropertyProviderName[] {
  return Object.keys(FACTORIES) as PropertyProviderName[];
}
