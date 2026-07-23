// ============================================================================
// 📘 C9 COMPAT — per-agent INSTANCE naming (server-only).
// ----------------------------------------------------------------------------
// Evolution isolates sessions by "instance name". ZONO maps each (org,user) to a
// deterministic, collision-free instance id and back. This is the ONLY mapping
// between ZONO's (org,user) scope and Evolution's instance vocabulary — used by
// the adapter for requests and by the webhook normalizer to resolve ownership.
// Pure string mapping (no I/O, no secrets) — intentionally NOT server-only so it
// stays unit-testable and usable by the pure webhook normalizer.
// ============================================================================
import type { WaSessionCtx } from "../../types";

const PREFIX = "zono";
const SEP = "__";

/** Deterministic Evolution instance name for a (org,user). Non-secret; safe to
 *  appear in Evolution URLs. Uses a separator that cannot occur in a UUID so the
 *  reverse split is unambiguous. */
export function instanceName(ctx: WaSessionCtx): string {
  return `${PREFIX}${SEP}${ctx.orgId}${SEP}${ctx.userId}`;
}

/** Reverse an Evolution instance name back to (org,user). Returns null on any
 *  unrecognized shape — used to reject webhooks for foreign/unknown instances. */
export function ctxFromInstance(name: string | null | undefined): WaSessionCtx | null {
  if (!name) return null;
  const parts = name.split(SEP);
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, orgId, userId] = parts;
  if (!orgId || !userId) return null;
  return { orgId, userId };
}
