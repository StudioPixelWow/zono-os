// ============================================================================
// ⚙️ Universal Context Engine™ — assembly core. Phase 27.2.
// ----------------------------------------------------------------------------
// User → Mission Control → THIS engine → permissions → repository → structured
// context package → (future) AI provider. No AI, no prompts, no reasoning, no
// execution. Deterministic: identical input + sources ⇒ identical package
// (cache key excludes the timestamp). The production data door (repository) is
// loaded lazily, so this module is safe to import anywhere for types/assembly.
// ============================================================================
import { runBuilder } from "./builders";
import { applyPermissions } from "./permissions";
import { compress } from "./compression";
import { buildExplain } from "./explain";
import { priorityFor } from "./priorities";
import { CONTEXT_ENGINE_VERSION } from "./types";
import type {
  ContextBlock, ContextIdentity, ContextPackage, ContextRequest, ContextSize, ContextSources,
} from "./types";

const EMPTY_IDENTITY: ContextIdentity = { orgId: null, orgName: null, userId: null, userName: null, isManager: false };

/** Deterministic cache key — Entity · Organization · User · Session · scope. */
export function buildCacheKey(req: ContextRequest, identity: ContextIdentity, size: ContextSize): string {
  const loc = [req.city ?? "", req.neighborhood ?? ""].join("|");
  return [
    "ctx", `v${CONTEXT_ENGINE_VERSION}`, req.type,
    `e=${req.entityId ?? ""}`, `o=${identity.orgId ?? ""}`,
    `u=${identity.userId ?? ""}`, `s=${req.sessionId ?? ""}`,
    `loc=${loc}`, `sz=${size}`,
  ].join(":");
}

function identityBlock(identity: ContextIdentity): ContextBlock {
  return {
    key: "identity", label: "זהות וארגון", priority: priorityFor("identity"),
    data: { orgId: identity.orgId, orgName: identity.orgName, userName: identity.userName, isManager: identity.isManager },
    evidence: [{ source: "auth.session", detail: `org: ${identity.orgName ?? "—"}` }],
    confidence: null, source: "auth.session",
  };
}

/**
 * Build a complete, permission-safe, size-compressed, explainable context
 * package. Pass `sources` to inject data (tests/alt providers); when omitted,
 * the production repository is loaded lazily (server runtime).
 */
export async function buildContextPackage(req: ContextRequest, sources?: ContextSources): Promise<ContextPackage> {
  const size: ContextSize = req.size ?? "medium";
  const src = sources ?? (await import("./repository")).defaultSources;

  const identity = (await src.identity(req).catch(() => null)) ?? EMPTY_IDENTITY;
  const built = await runBuilder(req.type, src, req);

  const rawBlocks: ContextBlock[] = [identityBlock(identity), ...built.blocks];
  const { blocks: permitted, permissions } = applyPermissions(rawBlocks, identity);
  const compressed = compress(permitted, size);

  const entities: string[] = [];
  if (identity.orgId) entities.push(`organization:${identity.orgId}`);
  if (req.entityId) entities.push(`${req.type}:${req.entityId}`);

  const explain = buildExplain({
    blocks: compressed,
    repositories: ["auth.session", ...built.repositories],
    entities,
    missing: built.missing,
    size,
  });

  return {
    request: req,
    identity,
    screen: req.screen ?? null,
    workflow: req.workflow ?? null,
    blocks: compressed,
    permissions,
    explain,
    cacheKey: buildCacheKey(req, identity, size),
  };
}
