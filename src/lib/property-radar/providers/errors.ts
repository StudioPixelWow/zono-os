// ============================================================================
// ZONO Property Radar™ — typed provider errors.
// A single base class (PropertyProviderError) carries providerName + retryable +
// optional cause, so the sync engine can branch on error type (retry, back off,
// mark source deleted, surface to UI) without string-matching messages.
// ============================================================================
import type { PropertyProviderName } from "../types";

export interface PropertyProviderErrorOptions {
  providerName: PropertyProviderName;
  message?: string;
  cause?: unknown;
  retryable?: boolean;
}

/** Base class for every provider failure. */
export class PropertyProviderError extends Error {
  readonly providerName: PropertyProviderName;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(opts: PropertyProviderErrorOptions) {
    super(opts.message ?? "Property provider error");
    this.name = "PropertyProviderError";
    this.providerName = opts.providerName;
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
    // Restore prototype chain (TS targeting ES5/ES2015 + extending Error).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Provider is implemented but its connector/credentials aren't configured. */
export class ProviderNotConfiguredError extends PropertyProviderError {
  constructor(providerName: PropertyProviderName, message?: string, cause?: unknown) {
    super({
      providerName,
      message:
        message ??
        `Provider not configured: ${providerName} — set the PROPERTY_RADAR_* / APIFY_* env vars`,
      cause,
      retryable: false,
    });
    this.name = "ProviderNotConfiguredError";
  }
}

/** Provider exists in the registry but is a placeholder with no implementation. */
export class ProviderNotImplementedError extends PropertyProviderError {
  constructor(providerName: PropertyProviderName, message?: string, cause?: unknown) {
    super({
      providerName,
      message: message ?? `Provider not implemented yet: ${providerName}`,
      cause,
      retryable: false,
    });
    this.name = "ProviderNotImplementedError";
  }
}

/** Provider rate-limited us — retry later with backoff. */
export class ProviderRateLimitError extends PropertyProviderError {
  constructor(providerName: PropertyProviderName, message?: string, cause?: unknown) {
    super({
      providerName,
      message: message ?? `Provider rate limited: ${providerName}`,
      cause,
      retryable: true,
    });
    this.name = "ProviderRateLimitError";
  }
}

/** Provider blocked access (captcha / IP block) — not retryable without action. */
export class ProviderBlockedError extends PropertyProviderError {
  constructor(providerName: PropertyProviderName, message?: string, cause?: unknown) {
    super({
      providerName,
      message: message ?? `Provider blocked the request: ${providerName}`,
      cause,
      retryable: false,
    });
    this.name = "ProviderBlockedError";
  }
}

/** A requested listing id does not exist (deleted or never existed). */
export class ProviderListingNotFoundError extends PropertyProviderError {
  readonly externalId: string;
  constructor(providerName: PropertyProviderName, externalId: string, cause?: unknown) {
    super({
      providerName,
      message: `Listing not found on ${providerName}: ${externalId}`,
      cause,
      retryable: false,
    });
    this.name = "ProviderListingNotFoundError";
    this.externalId = externalId;
  }
}

/** Provider returned a payload we can't parse / that failed validation. */
export class ProviderInvalidResponseError extends PropertyProviderError {
  constructor(providerName: PropertyProviderName, message?: string, cause?: unknown) {
    super({
      providerName,
      message: message ?? `Provider returned an invalid response: ${providerName}`,
      cause,
      retryable: true,
    });
    this.name = "ProviderInvalidResponseError";
  }
}
