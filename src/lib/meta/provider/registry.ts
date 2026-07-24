// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PROVIDER REGISTRY. Phase 0.
// ----------------------------------------------------------------------------
// THE swap point. Every consumer resolves the active MetaProvider here. The
// registry is deterministic: it rejects duplicate registration, rejects unknown
// resolution, and NEVER silently falls back to a different provider. It exposes
// no token or provider secret. Test providers register through the same path.
// ============================================================================
import type { MetaProvider } from "./types";
import { MetaProviderError } from "./errors";

/** An isolated registry instance (avoids cross-test global leakage). */
export class MetaProviderRegistry {
  private readonly providers = new Map<string, MetaProvider>();

  /** Register a provider by its stable key. Duplicate keys are rejected. */
  register(provider: MetaProvider): void {
    const key = provider.key?.trim();
    if (!key) throw MetaProviderError.of("invalid_request", "provider key is required");
    if (this.providers.has(key)) throw MetaProviderError.of("conflict", `provider already registered: ${key}`);
    this.providers.set(key, provider);
  }

  /** Resolve a provider by key. Unknown keys throw — never a silent fallback. */
  resolve(key: string): MetaProvider {
    const p = this.providers.get(key?.trim());
    if (!p) throw MetaProviderError.of("unavailable", `no provider registered for key: ${key}`);
    return p;
  }

  /** True when a provider is registered under `key`. */
  has(key: string): boolean {
    return this.providers.has(key?.trim());
  }

  /** The registered provider keys (no secrets, deterministic order). */
  keys(): readonly string[] {
    return [...this.providers.keys()].sort();
  }

  /** Remove a provider (primarily for test isolation). */
  unregister(key: string): void {
    this.providers.delete(key?.trim());
  }
}

/**
 * The default deployment registry. The active provider key is chosen from the
 * environment; there is NO implicit fallback to another provider — an unknown or
 * unset key surfaces as an explicit error at resolve time.
 */
export const metaProviderRegistry = new MetaProviderRegistry();

/** The provider key selected for this deployment (default: "graph"). */
export function activeMetaProviderKey(): string {
  return process.env.META_PROVIDER?.trim().toLowerCase() || "graph";
}
