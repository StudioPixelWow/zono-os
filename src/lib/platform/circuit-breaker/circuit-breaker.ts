// ============================================================================
// ZONO — circuit breaker (pure state machine). Protects external providers
// (Apify, OpenAI, Anthropic, Email, WhatsApp, Maps). Closed → Open after N
// consecutive failures; Open → Half-Open after a cooldown; Half-Open → Closed
// after M probe successes (or back to Open on any failure). Deterministic given
// (snapshot, event, now).
// ============================================================================
import type { CircuitConfig, CircuitSnapshot, CircuitState } from "../types";

export const PROTECTED_PROVIDERS = ["apify", "openai", "anthropic", "email", "whatsapp", "maps"] as const;
export type ProtectedProvider = (typeof PROTECTED_PROVIDERS)[number];

export const DEFAULT_CIRCUIT: CircuitConfig = { failureThreshold: 5, cooldownMs: 30_000, halfOpenProbes: 2 };

export function initialCircuit(provider: string): CircuitSnapshot {
  return { provider, state: "closed", consecutiveFailures: 0, openedAt: null, probeSuccesses: 0 };
}

/** Is a request allowed right now? (transitions Open→Half-Open after cooldown). */
export function canRequest(snap: CircuitSnapshot, cfg: CircuitConfig = DEFAULT_CIRCUIT, now = Date.now()): { allowed: boolean; state: CircuitState } {
  if (snap.state === "open") {
    if (snap.openedAt != null && now - snap.openedAt >= cfg.cooldownMs) return { allowed: true, state: "half_open" };
    return { allowed: false, state: "open" };
  }
  return { allowed: true, state: snap.state };
}

/** Apply a success outcome. */
export function onSuccess(snap: CircuitSnapshot, cfg: CircuitConfig = DEFAULT_CIRCUIT, now = Date.now()): CircuitSnapshot {
  const effective = canRequest(snap, cfg, now).state;
  if (effective === "half_open") {
    const probeSuccesses = snap.probeSuccesses + 1;
    if (probeSuccesses >= cfg.halfOpenProbes) return { ...snap, state: "closed", consecutiveFailures: 0, openedAt: null, probeSuccesses: 0 };
    return { ...snap, state: "half_open", probeSuccesses, consecutiveFailures: 0 };
  }
  return { ...snap, state: "closed", consecutiveFailures: 0, openedAt: null, probeSuccesses: 0 };
}

/** Apply a failure outcome (opens the circuit at/over the threshold). */
export function onFailure(snap: CircuitSnapshot, cfg: CircuitConfig = DEFAULT_CIRCUIT, now = Date.now()): CircuitSnapshot {
  const effective = canRequest(snap, cfg, now).state;
  if (effective === "half_open") return { ...snap, state: "open", openedAt: now, probeSuccesses: 0 };
  const consecutiveFailures = snap.consecutiveFailures + 1;
  if (consecutiveFailures >= cfg.failureThreshold) return { ...snap, state: "open", consecutiveFailures, openedAt: now, probeSuccesses: 0 };
  return { ...snap, state: "closed", consecutiveFailures };
}

/** Health label for a circuit (for the health center). */
export function circuitHealth(snap: CircuitSnapshot): "healthy" | "warning" | "critical" {
  if (snap.state === "open") return "critical";
  if (snap.state === "half_open" || snap.consecutiveFailures > 0) return "warning";
  return "healthy";
}
