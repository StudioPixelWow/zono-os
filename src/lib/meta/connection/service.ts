// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONNECTION SERVICE (server wiring). Phase 1.
// ----------------------------------------------------------------------------
// Wires the PURE connection engine to production adapters: the Supabase store,
// the AES-256-GCM cipher, the sealed Graph gateway (real fetch), the audit
// service, and the system clock. This is the server entrypoint used by the API
// routes; the engine holds all the logic and stays transport/DB-free. Secrets
// live only transiently and are encrypted before persistence.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { logAudit } from "@/lib/audit/service";
import { createGraphGateway } from "../provider/graph";
import { metaProviderRegistry, activeMetaProviderKey } from "../provider";
import { getMetaConnectionConfig, getMetaOperatorFlags, type MetaConnectionConfig } from "./config";
import { createSupabaseMetaStore } from "./store";
import { createSignedState, verifySignedState, metaStateSecret } from "./state";
import {
  completeConnection, inspectConnectionHealth, disconnectConnection, gateCapabilities,
  type ConnectionEngineResult, type HealthResult, type CapabilityGateFlags,
} from "./engine";
import type { MetaConnectionPorts } from "./ports";
import { toConnectionDescriptor } from "./read";
import type { MetaConnectionDescriptor } from "./types";
import type { MetaCapabilityDecision } from "../capability/types";

/** Build the production port bundle for a given config. */
function buildPorts(cfg: MetaConnectionConfig): MetaConnectionPorts {
  return {
    store: createSupabaseMetaStore(),
    cipher: { encrypt: encryptSecret, decrypt: decryptSecret },
    graph: createGraphGateway(cfg),
    audit: {
      log: (input) => logAudit({ action: input.action, category: "configuration", entityType: "meta_connection", entityId: input.entityId, summary: input.summary, metadata: input.metadata }),
    },
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
  };
}

/** Begin an OAuth connection: sign state + return the consent URL + nonce. */
export function startConnection(orgId: string, userId: string): { authorizeUrl: string; nonce: string } | { error: string } {
  const cfg = getMetaConnectionConfig();
  if (!cfg.ready) return { error: cfg.configured ? "not_enabled" : "not_configured" };
  const { state, nonce } = createSignedState(orgId, userId, metaStateSecret());
  const gateway = createGraphGateway(cfg);
  return { authorizeUrl: gateway.authorizeUrl(state), nonce };
}

/** Verify state + complete the OAuth handshake (server side of the callback). */
export async function completeCallback(args: {
  orgId: string; userId: string; code: string; state: string; cookieNonce: string; correlationId?: string;
}): Promise<ConnectionEngineResult> {
  const cfg = getMetaConnectionConfig();
  const payload = verifySignedState(args.state, args.cookieNonce, metaStateSecret());
  if (!payload || payload.orgId !== args.orgId || payload.userId !== args.userId) {
    throw new Error("bad_state");
  }
  const ports = buildPorts(cfg);
  return completeConnection(ports, {
    orgId: args.orgId,
    authorizingUserId: args.userId,
    code: args.code,
    mode: cfg.mode,
    correlationId: args.correlationId ?? null,
  });
}

/** Re-check a connection's token/permission health. */
export async function checkConnectionHealth(orgId: string, connectionId: string): Promise<HealthResult> {
  return inspectConnectionHealth(buildPorts(getMetaConnectionConfig()), orgId, connectionId);
}

/** Reconnect an existing connection from a fresh authorization code. */
export async function reconnectConnection(args: { orgId: string; userId: string; code: string; connectionId: string; correlationId?: string }): Promise<ConnectionEngineResult> {
  const cfg = getMetaConnectionConfig();
  return completeConnection(buildPorts(cfg), {
    orgId: args.orgId, authorizingUserId: args.userId, code: args.code, mode: cfg.mode,
    existingConnectionId: args.connectionId, correlationId: args.correlationId ?? null,
  });
}

/** Disconnect + revoke a connection. */
export async function disconnect(orgId: string, connectionId: string, reason = "user_disconnect"): Promise<MetaConnectionDescriptor> {
  return disconnectConnection(buildPorts(getMetaConnectionConfig()), orgId, connectionId, reason);
}

/** Safe read: the org's connection descriptors (no secrets). */
export async function listConnectionDescriptors(orgId: string): Promise<readonly MetaConnectionDescriptor[]> {
  const store = createSupabaseMetaStore();
  const rows = await store.listConnections(orgId);
  return rows.map(toConnectionDescriptor);
}

/** Gate a set of capabilities for a connection against actual granted state. */
export async function getConnectionCapabilities(orgId: string, connectionId: string, keys: readonly string[]): Promise<readonly MetaCapabilityDecision[]> {
  const store = createSupabaseMetaStore();
  const row = await store.getConnection(orgId, connectionId);
  if (!row) return [];
  const flags = operatorGateFlags();
  return gateCapabilities(row, flags, keys);
}

/** Assemble evaluator flags from operator config (Phase-1 defaults). */
function operatorGateFlags(): CapabilityGateFlags {
  const op = getMetaOperatorFlags();
  return {
    globalFeatureEnabled: op.globalFeatureEnabled,
    orgFeatureEnabled: true, // org-level flag resolved from the org record in a later phase
    providerAvailable: metaProviderRegistry.has(activeMetaProviderKey()),
    // App Review / Business Verification are external states; conservative defaults.
    businessVerification: "unknown",
    appReview: "unknown",
    webhookHealthy: false, // no webhook subscriptions until the webhook phase
    extendedEnabled: [],
    globalKillSwitch: op.globalKillSwitch,
    orgKillSwitch: false,
  };
}
