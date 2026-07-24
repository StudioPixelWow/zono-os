// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH PUBLISHING (sealed). Phase 3A.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: the ONLY place Graph publish endpoints + payloads exist. Facebook
// Page (text/link/image/multi-image/video) and Instagram (image/carousel/video)
// immediate publishing. RULES: publish WRITES are never auto-retried (a single
// call each); only bounded status POLLING may retry a transient read; a write
// timeout after transmission is reported AMBIGUOUS (never silently retried); the
// Page/IG token is used server-side and never logged; NO raw payload escapes.
// The `fetchImpl` + `sleep` are injectable so QA drives the whole flow offline.
// ============================================================================
import { graphEndpoint } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import { isMetaProviderError, MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { ProviderPublishRequest, ProviderPublishResult, ProviderPublishError } from "../../publish/provider-types";

export interface PublishDeps {
  fetchImpl?: GraphFetch;
  sleep?: (ms: number) => Promise<void>;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const messageOf = (caption: string, hashtags: readonly string[]) => (hashtags.length ? `${caption}\n\n${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : caption).trim();

function safeError(e: unknown): ProviderPublishError {
  if (isMetaProviderError(e)) { const m = (e as MetaProviderError).meta; return { kind: m.kind, safeMessage: m.safeMessage, providerCodeCategory: m.providerCodeCategory, retryClass: m.retryClass }; }
  return { kind: "internal", safeMessage: "publish failed", providerCodeCategory: null, retryClass: "non_retryable" };
}
const errKind = (e: unknown): MetaProviderErrorKind => (isMetaProviderError(e) ? (e as MetaProviderError).meta.kind : "internal");

const ok = (over: Partial<ProviderPublishResult>): ProviderPublishResult => ({ ok: true, providerObjectId: null, providerContainerId: null, permalink: null, processingState: "done", ambiguous: false, error: null, warnings: [], ...over });
const fail = (e: unknown, ambiguous = false): ProviderPublishResult => ({ ok: false, providerObjectId: null, providerContainerId: null, permalink: null, processingState: ambiguous ? "ambiguous" : "done", ambiguous, error: safeError(e), warnings: [] });

/** A write POST that is NEVER auto-retried; a timeout after send → ambiguous. */
async function writePost<T>(url: string, deps: PublishDeps, correlationId: string): Promise<{ data: T | null; ambiguousError: MetaProviderError | null }> {
  try {
    const data = await graphJson<T>(url, { method: "POST", fetchImpl: deps.fetchImpl, correlationId });
    return { data, ambiguousError: null };
  } catch (e) {
    if (errKind(e) === "timeout" || errKind(e) === "network") return { data: null, ambiguousError: e as MetaProviderError };
    throw e;
  }
}

// ── Facebook ─────────────────────────────────────────────────────────────────
async function publishFacebook(req: ProviderPublishRequest, deps: PublishDeps): Promise<ProviderPublishResult> {
  const t = req.tokenPlain;
  const page = req.assetExternalId;
  const message = messageOf(req.caption, req.hashtags);
  try {
    if (req.contentKind === "fb_text" || req.contentKind === "fb_link") {
      const params: Record<string, string> = { message, access_token: t };
      if (req.contentKind === "fb_link" && req.media.length === 0 && /https?:\/\//.test(req.caption)) params.link = (req.caption.match(/https?:\/\/\S+/) ?? [""])[0];
      const w = await writePost<{ id?: string }>(graphEndpoint(`/${page}/feed`) + "?" + q(params), deps, req.correlationId);
      if (w.ambiguousError) return fail(w.ambiguousError, true);
      if (!w.data?.id) return fail(new Error("no id"));
      return ok({ providerObjectId: w.data.id });
    }
    if (req.contentKind === "fb_image") {
      const w = await writePost<{ id?: string; post_id?: string }>(graphEndpoint(`/${page}/photos`) + "?" + q({ url: req.media[0].url, caption: message, published: "true", access_token: t }), deps, req.correlationId);
      if (w.ambiguousError) return fail(w.ambiguousError, true);
      if (!w.data?.id) return fail(new Error("no id"));
      return ok({ providerObjectId: w.data.post_id ?? w.data.id });
    }
    if (req.contentKind === "fb_multi_image") {
      const mediaFbids: string[] = [];
      for (const m of req.media) {
        const w = await writePost<{ id?: string }>(graphEndpoint(`/${page}/photos`) + "?" + q({ url: m.url, published: "false", access_token: t }), deps, req.correlationId);
        if (w.ambiguousError) return fail(w.ambiguousError, true);
        if (!w.data?.id) return { ...fail(new Error("intermediate media failed")), warnings: [`created ${mediaFbids.length}/${req.media.length} media before failure`] };
        mediaFbids.push(w.data.id);
      }
      const attached = q(Object.fromEntries(mediaFbids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })])));
      const w = await writePost<{ id?: string }>(graphEndpoint(`/${page}/feed`) + "?" + q({ message, access_token: t }) + "&" + attached, deps, req.correlationId);
      if (w.ambiguousError) return { ...fail(w.ambiguousError, true), warnings: ["final feed post ambiguous after media creation"] };
      if (!w.data?.id) return fail(new Error("final post failed"));
      return ok({ providerObjectId: w.data.id });
    }
    if (req.contentKind === "fb_video") {
      const w = await writePost<{ id?: string }>(graphEndpoint(`/${page}/videos`) + "?" + q({ file_url: req.media[0].url, description: message, access_token: t }), deps, req.correlationId);
      if (w.ambiguousError) return fail(w.ambiguousError, true);
      if (!w.data?.id) return fail(new Error("no id"));
      return ok({ providerObjectId: w.data.id, processingState: "done" });
    }
    return fail(new Error(`unsupported fb content kind: ${req.contentKind}`));
  } catch (e) {
    return fail(e);
  }
}

// ── Instagram ────────────────────────────────────────────────────────────────
async function pollContainer(ig: string, containerId: string, token: string, req: ProviderPublishRequest, deps: PublishDeps): Promise<"FINISHED" | "IN_PROGRESS" | "ERROR"> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let elapsed = 0;
  for (let attempt = 0; attempt < req.pollMaxAttempts && elapsed < req.pollMaxMs; attempt++) {
    let status: string | undefined;
    try {
      const r = await graphJson<{ status_code?: string }>(graphEndpoint(`/${containerId}`) + "?" + q({ fields: "status_code", access_token: token }), { fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
      status = r.status_code;
    } catch { status = undefined; /* transient read → try again within bound */ }
    if (status === "FINISHED") return "FINISHED";
    if (status === "ERROR") return "ERROR";
    const backoff = Math.min(8_000, 1_000 * 2 ** attempt);
    await sleep(backoff);
    elapsed += backoff;
  }
  return "IN_PROGRESS";
}

async function createIgContainer(ig: string, token: string, params: Record<string, string>, deps: PublishDeps, correlationId: string): Promise<{ id: string | null; ambiguous: MetaProviderError | null }> {
  const w = await writePost<{ id?: string }>(graphEndpoint(`/${ig}/media`) + "?" + q({ ...params, access_token: token }), deps, correlationId);
  return { id: w.data?.id ?? null, ambiguous: w.ambiguousError };
}

async function publishInstagram(req: ProviderPublishRequest, deps: PublishDeps): Promise<ProviderPublishResult> {
  const t = req.tokenPlain;
  const ig = req.assetExternalId;
  const caption = messageOf(req.caption, req.hashtags);
  try {
    let containerId: string | null = null;
    if (req.contentKind === "ig_image") {
      const c = await createIgContainer(ig, t, { image_url: req.media[0].url, caption }, deps, req.correlationId);
      if (c.ambiguous) return fail(c.ambiguous, true);
      containerId = c.id;
    } else if (req.contentKind === "ig_video") {
      const c = await createIgContainer(ig, t, { media_type: "VIDEO", video_url: req.media[0].url, caption }, deps, req.correlationId);
      if (c.ambiguous) return fail(c.ambiguous, true);
      containerId = c.id;
    } else if (req.contentKind === "ig_carousel") {
      const children: string[] = [];
      for (const m of req.media) {
        const child = await createIgContainer(ig, t, m.kind === "video" ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" } : { image_url: m.url, is_carousel_item: "true" }, deps, req.correlationId);
        if (child.ambiguous) return fail(child.ambiguous, true);
        if (!child.id) return fail(new Error("carousel child failed"));
        children.push(child.id);
      }
      const c = await createIgContainer(ig, t, { media_type: "CAROUSEL", children: children.join(","), caption }, deps, req.correlationId);
      if (c.ambiguous) return fail(c.ambiguous, true);
      containerId = c.id;
    } else {
      return fail(new Error(`unsupported ig content kind: ${req.contentKind}`));
    }
    if (!containerId) return fail(new Error("container not created"));

    const state = await pollContainer(ig, containerId, t, req, deps);
    if (state === "ERROR") return { ...fail(new Error("container processing error")), providerContainerId: containerId };
    if (state === "IN_PROGRESS") return { ...fail(MetaProviderError.of("media_processing", "container still processing after the bounded window — manual check required")), providerContainerId: containerId, processingState: "processing" };

    const w = await writePost<{ id?: string }>(graphEndpoint(`/${ig}/media_publish`) + "?" + q({ creation_id: containerId, access_token: t }), deps, req.correlationId);
    if (w.ambiguousError) return { ...fail(w.ambiguousError, true), providerContainerId: containerId, warnings: ["final publish response lost after container ready"] };
    if (!w.data?.id) return { ...fail(new Error("publish returned no media id")), providerContainerId: containerId };
    return ok({ providerObjectId: w.data.id, providerContainerId: containerId });
  } catch (e) {
    return fail(e);
  }
}

/** Dispatch immediate publishing to the right platform flow. Sealed in graph/. */
export async function publishToProvider(req: ProviderPublishRequest, deps: PublishDeps = {}): Promise<ProviderPublishResult> {
  if (req.platform === "facebook") return publishFacebook(req, deps);
  if (req.platform === "instagram") return publishInstagram(req, deps);
  return fail(new Error(`unsupported platform: ${req.platform}`));
}

/** Build a PublishGateway bound to (optional) injected fetch/sleep for tests. */
export function createPublishGateway(deps: PublishDeps = {}): { publish(req: ProviderPublishRequest): Promise<ProviderPublishResult> } {
  return { publish: (req) => publishToProvider(req, deps) };
}
