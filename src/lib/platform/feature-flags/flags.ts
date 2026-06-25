// ============================================================================
// ZONO — feature flags (pure evaluation). Per environment / organization / role
// / user, with a deterministic percentage rollout (stable hash of flag+org+user,
// so a given subject is consistently in or out). Enables gradual rollout.
// ============================================================================
import type { FeatureFlag, FlagContext } from "../types";

/** Deterministic 0..99 bucket from a string (FNV-1a). Stable across runs. */
export function rolloutBucket(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 100;
}

/** Evaluate a flag for a context. All targeting filters must pass; then rollout. */
export function evaluateFlag(flag: FeatureFlag, ctx: FlagContext): boolean {
  if (!flag.enabled) return false;
  if (flag.environments.length && !flag.environments.includes(ctx.environment)) return false;
  if (flag.orgIds.length && (!ctx.orgId || !flag.orgIds.includes(ctx.orgId))) return false;
  if (flag.roles.length && (!ctx.roleKey || !flag.roles.includes(ctx.roleKey))) return false;
  if (flag.userIds.length && (!ctx.userId || !flag.userIds.includes(ctx.userId))) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return false;
  return rolloutBucket(`${flag.key}:${ctx.orgId ?? ""}:${ctx.userId ?? ctx.orgId ?? ""}`) < flag.rolloutPercent;
}

export function defaultFlag(key: string, over: Partial<FeatureFlag> = {}): FeatureFlag {
  return { key, enabled: false, environments: [], orgIds: [], roles: [], userIds: [], rolloutPercent: 0, ...over };
}

/** Evaluate a set of flags into a key→bool map. */
export function evaluateAll(flags: FeatureFlag[], ctx: FlagContext): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of flags) out[f.key] = evaluateFlag(f, ctx);
  return out;
}
