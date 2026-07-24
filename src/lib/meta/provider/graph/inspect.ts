// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH INSPECTION (sealed, READ-ONLY). Phase 3C.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: the ONLY place Graph *verification* reads exist. Read-only GETs to
// confirm a published object / container status / asset publishing health. RULES:
// inspection NEVER writes (no publish/edit/delete endpoint here); a single failed
// read is NEVER reported as proof of deletion — a definitive not-found returns a
// non-ambiguous "unknown/inaccessible" for the engine to confirm across attempts,
// while a transient failure returns `ambiguous` so nothing downstream concludes
// deletion; the Page/IG token is used server-side and never logged; NO raw Graph
// payload escapes. `fetchImpl` is injectable so QA drives the flow offline.
// ============================================================================
import { graphEndpoint } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import { isMetaProviderError, MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { ProviderInspectRequest, ProviderInspectResult, ProviderInspectError, ProviderObjectState, InspectionGateway } from "../../reconcile/provider-types";

export interface InspectDeps { fetchImpl?: GraphFetch }

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const errKind = (e: unknown): MetaProviderErrorKind => (isMetaProviderError(e) ? (e as MetaProviderError).meta.kind : "internal");
function safeError(e: unknown): ProviderInspectError {
  if (isMetaProviderError(e)) { const m = (e as MetaProviderError).meta; return { kind: m.kind, safeMessage: m.safeMessage, providerCodeCategory: m.providerCodeCategory, retryClass: m.retryClass }; }
  return { kind: "internal", safeMessage: "inspection failed", providerCodeCategory: null, retryClass: "non_retryable" };
}

/** Transient failures (never proof of deletion) → ambiguous inconclusive read. */
const TRANSIENT: ReadonlySet<MetaProviderErrorKind> = new Set(["timeout", "network", "rate_limited", "transient_provider", "unavailable"]);
/** Auth/permission failures → object may exist but we cannot see it. */
const PERMISSION: ReadonlySet<MetaProviderErrorKind> = new Set(["authentication", "authorization", "permission_missing", "token_expired", "token_revoked", "asset_disconnected"]);

const base = (over: Partial<ProviderInspectResult>): ProviderInspectResult => ({
  found: false, providerObjectId: null, providerContainerId: null, state: "unknown", visibility: null, permalink: null,
  providerCreatedTime: null, providerUpdatedTime: null, externalParentId: null, confidence: "low",
  evidenceKind: "provider_inspection", ambiguous: false, error: null, retryClass: "non_retryable", warnings: [], ...over,
});

/** Map a thrown error to a canonical, evidence-honest inconclusive result. */
function fromError(e: unknown): ProviderInspectResult {
  const kind = errKind(e);
  if (TRANSIENT.has(kind)) return base({ state: "ambiguous", ambiguous: true, confidence: "low", error: safeError(e), retryClass: "retryable" });
  if (PERMISSION.has(kind)) return base({ state: kind === "permission_missing" || kind === "authorization" ? "permission_lost" : "inaccessible", found: false, confidence: "medium", error: safeError(e), retryClass: "retry_after_reauth" });
  // A definitive client error (object id invalid / not found): NOT asserted as
  // deleted here — the engine confirms deletion across attempts. Report "unknown".
  return base({ state: "unknown", found: false, confidence: "medium", error: safeError(e), retryClass: "non_retryable" });
}

interface FbObject { id?: string; permalink_url?: string; is_published?: boolean; created_time?: string; updated_time?: string; parent_id?: string }
interface IgObject { id?: string; permalink?: string; timestamp?: string }
interface ContainerStatus { id?: string; status?: string; status_code?: string }

async function inspectFacebookObject(req: ProviderInspectRequest, deps: InspectDeps): Promise<ProviderInspectResult> {
  const id = req.externalObjectId;
  if (!id) return base({ state: "unknown", found: false, warnings: ["no external object id to inspect"] });
  const url = graphEndpoint(`/${id}`) + "?" + q({ fields: "id,permalink_url,is_published,created_time,updated_time,parent_id", access_token: req.tokenPlain });
  const data = await graphJson<FbObject>(url, { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
  if (!data?.id) return base({ state: "unknown", found: false });
  const published = data.is_published !== false;
  return base({ found: true, providerObjectId: data.id, state: published ? "published" : "hidden", visibility: published ? "published" : "unpublished", permalink: data.permalink_url ?? null, providerCreatedTime: data.created_time ?? null, providerUpdatedTime: data.updated_time ?? null, externalParentId: data.parent_id ?? null, confidence: "high", retryClass: "non_retryable" });
}

async function inspectInstagramObject(req: ProviderInspectRequest, deps: InspectDeps): Promise<ProviderInspectResult> {
  const id = req.externalObjectId;
  if (!id) return base({ state: "unknown", found: false, warnings: ["no external object id to inspect"] });
  const url = graphEndpoint(`/${id}`) + "?" + q({ fields: "id,permalink,timestamp", access_token: req.tokenPlain });
  const data = await graphJson<IgObject>(url, { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
  if (!data?.id) return base({ state: "unknown", found: false });
  return base({ found: true, providerObjectId: data.id, state: "published", visibility: "published", permalink: data.permalink ?? null, providerCreatedTime: data.timestamp ?? null, confidence: "high", retryClass: "non_retryable" });
}

async function inspectContainer(req: ProviderInspectRequest, deps: InspectDeps): Promise<ProviderInspectResult> {
  const id = req.externalContainerId;
  if (!id) return base({ state: "unknown", found: false, warnings: ["no container id to inspect"] });
  const url = graphEndpoint(`/${id}`) + "?" + q({ fields: "id,status,status_code", access_token: req.tokenPlain });
  const data = await graphJson<ContainerStatus>(url, { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
  const code = (data?.status_code ?? "").toUpperCase();
  let state: ProviderObjectState = "processing";
  if (code === "FINISHED") state = "published"; else if (code === "ERROR" || code === "EXPIRED") state = "unknown"; else if (code === "IN_PROGRESS") state = "processing";
  return base({ found: !!data?.id, providerContainerId: data?.id ?? id, state, confidence: state === "published" ? "high" : "medium", retryClass: state === "processing" ? "retryable" : "non_retryable" });
}

/** Read-only provider inspection. Returns a canonical, secret-free result. */
export async function inspectViaProvider(req: ProviderInspectRequest, deps: InspectDeps = {}): Promise<ProviderInspectResult> {
  try {
    if (req.kind === "container") return await inspectContainer(req, deps);
    if (req.kind === "asset_health") {
      // A minimal, read-only asset probe: confirm the token can read the asset.
      const url = graphEndpoint(`/${req.assetExternalId}`) + "?" + q({ fields: "id", access_token: req.tokenPlain });
      const data = await graphJson<{ id?: string }>(url, { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
      return base({ found: !!data?.id, state: data?.id ? "exists" : "inaccessible", confidence: data?.id ? "high" : "medium", retryClass: "non_retryable" });
    }
    return req.platform === "instagram" ? await inspectInstagramObject(req, deps) : await inspectFacebookObject(req, deps);
  } catch (e) {
    return fromError(e);
  }
}

/** Build the sealed inspection gateway (server wiring supplies a real fetch). */
export function createInspectionGateway(deps: InspectDeps = {}): InspectionGateway {
  return { inspect: (req) => inspectViaProvider(req, deps) };
}
