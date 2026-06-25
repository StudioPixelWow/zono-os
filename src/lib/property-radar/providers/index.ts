// ============================================================================
// ZONO Property Radar™ — providers public surface.
// Re-exports the provider contracts, errors, validation, registry and concrete
// providers so consumers import from one place:
//   import { getPropertyProvider, ProviderNotImplementedError } from "@/lib/property-radar/providers";
// ============================================================================

// Contracts / shapes
export type {
  NormalizedListingMetadata,
  NormalizedListingDetails,
  PropertyProvider,
  PropertyProviderScanOptions,
  PropertyProviderScanResult,
  PropertyRadarArea,
} from "./types";
export type { ProviderCapabilities } from "../connectors/types";

// Errors
export {
  PropertyProviderError,
  ProviderNotImplementedError,
  ProviderNotConfiguredError,
  ProviderRateLimitError,
  ProviderBlockedError,
  ProviderListingNotFoundError,
  ProviderInvalidResponseError,
} from "./errors";
export type { PropertyProviderErrorOptions } from "./errors";

// Validation
export { validateNormalizedListingMetadata } from "./validation";
export type { ListingValidationResult } from "./validation";

// Registry
export {
  getPropertyProvider,
  getImplementedProviderNames,
  getAllProviderNames,
} from "./registry";

// Concrete providers (mostly used via the registry, exported for direct testing)
export { MockPropertyProvider } from "./mock-provider";
export { Yad2PropertyProvider } from "./yad2-provider";
export { MadlanPropertyProvider } from "./madlan-provider";
