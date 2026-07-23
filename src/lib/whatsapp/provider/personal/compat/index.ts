// ============================================================================
// 📘 C9 COMPAT — PUBLIC canonical-facing API (server-only).
// ----------------------------------------------------------------------------
// The adapter imports ONLY from here. Every function takes canonical inputs and
// returns canonical outputs (WaConnectionSnapshot fragments / WaSendResult /
// stable PersonalError). All Evolution specifics — endpoints, payloads, status
// strings, webhook shapes — are sealed inside this compat/ directory (C9).
// ============================================================================
import "server-only";
import type { WaSendInput, WaSendResult, WaSessionCtx } from "../../types";
import { evolutionConfig, isEvolutionConfigured } from "./config";
import { evoFetch } from "./client";
import { endpointsFor } from "./endpoints";
import { instanceName } from "./instance";
import { buildCreateInstance, buildPresence, buildSendText } from "./requests";
import { fromConnect, fromConnectionState, fromCreate, type CanonicalConnection } from "./responses";
import type { RawConnect, RawConnectionState, RawCreate, RawSendResult } from "./raw";
import { fromSend } from "./responses";
import type { PersonalError } from "./errors";

export type { CanonicalConnection } from "./responses";
export type { PersonalError, PersonalErrorCategory } from "./errors";
export { errorLabel } from "./errors";
export { normalizeWebhook, type NormalizedWebhook } from "./webhooks";
export { ctxFromInstance, instanceName } from "./instance";

export type CompatResult<T> = { ok: true; data: T } | { ok: false; error: PersonalError };

const UNAVAILABLE: PersonalError = { category: "unavailable", message: "not_configured" };
const nowIso = () => new Date().toISOString();

/** Is the personal transport backend configured for this deployment? */
export function personalConfigured(): boolean {
  return isEvolutionConfigured();
}

/** READ-ONLY worker liveness probe — a plain root GET, no instance/session
 *  created or touched. Used by SRE synthetic monitoring for infra readiness. */
export async function workerPing(): Promise<CompatResult<{ latencyMs: number }>> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: UNAVAILABLE };
  const start = Date.now();
  const res = await evoFetch<unknown>(cfg, "GET", "/");
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { latencyMs: Date.now() - start } };
}

/** Create/register the per-agent session and ask for a QR. `webhookUrl` +
 *  `webhookToken` are ZONO's own inbound route + bearer (passed in — compat does
 *  not read ZONO env). */
export async function createSession(ctx: WaSessionCtx, webhookUrl: string, webhookToken?: string | null): Promise<CompatResult<CanonicalConnection>> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: UNAVAILABLE };
  const ep = endpointsFor(cfg.targetVersion);
  const res = await evoFetch<RawCreate>(cfg, "POST", ep.createInstance(), buildCreateInstance(instanceName(ctx), webhookUrl, webhookToken));
  if (!res.ok) {
    // Instance may already exist — fall through to a fresh connect/QR fetch.
    if (res.error.category === "invalid" || res.error.category === "not_found") return connectSession(ctx);
    return { ok: false, error: res.error };
  }
  return { ok: true, data: fromCreate(res.data, nowIso()) };
}

/** Fetch a fresh QR / (re)start pairing for an existing instance. */
export async function connectSession(ctx: WaSessionCtx): Promise<CompatResult<CanonicalConnection>> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: UNAVAILABLE };
  const ep = endpointsFor(cfg.targetVersion);
  const res = await evoFetch<RawConnect>(cfg, "GET", ep.connect(instanceName(ctx)));
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: fromConnect(res.data, nowIso()) };
}

/** Read the live connection state (no QR). */
export async function getState(ctx: WaSessionCtx): Promise<CompatResult<CanonicalConnection>> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: UNAVAILABLE };
  const ep = endpointsFor(cfg.targetVersion);
  const res = await evoFetch<RawConnectionState>(cfg, "GET", ep.connectionState(instanceName(ctx)));
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: fromConnectionState(res.data) };
}

/** Graceful disconnect (logout) — keeps the instance so it can re-pair. */
export async function disconnectSession(ctx: WaSessionCtx): Promise<CompatResult<void>> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: UNAVAILABLE };
  const ep = endpointsFor(cfg.targetVersion);
  const res = await evoFetch<unknown>(cfg, "DELETE", ep.logout(instanceName(ctx)));
  if (!res.ok && res.error.category !== "not_found") return { ok: false, error: res.error };
  return { ok: true, data: undefined };
}

/** Hard delete/revoke the instance and its credentials in the worker. */
export async function deleteSession(ctx: WaSessionCtx): Promise<CompatResult<void>> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: UNAVAILABLE };
  const ep = endpointsFor(cfg.targetVersion);
  const res = await evoFetch<unknown>(cfg, "DELETE", ep.deleteInstance(instanceName(ctx)));
  if (!res.ok && res.error.category !== "not_found") return { ok: false, error: res.error };
  return { ok: true, data: undefined };
}

/** Send a text message via the personal transport. */
export async function sendText(ctx: WaSessionCtx, input: WaSendInput): Promise<WaSendResult> {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, error: "unavailable" };
  const ep = endpointsFor(cfg.targetVersion);
  const res = await evoFetch<RawSendResult>(cfg, "POST", ep.sendText(instanceName(ctx)), buildSendText(input));
  if (!res.ok) return { ok: false, error: res.error.category };
  return fromSend(res.data);
}

/** Best-effort typing/presence (safe no-op on failure). */
export async function sendPresence(ctx: WaSessionCtx, toPhone: string, on: boolean): Promise<void> {
  const cfg = evolutionConfig();
  if (!cfg) return;
  const ep = endpointsFor(cfg.targetVersion);
  await evoFetch<unknown>(cfg, "POST", ep.sendPresence(instanceName(ctx)), buildPresence(toPhone, on));
}
