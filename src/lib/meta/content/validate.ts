// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · TARGET VALIDATION (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Validates each draft target INDEPENDENTLY against: the enabled content model,
// the ACTUAL granted capability (reusing the Phase-1 evaluator's decision),
// asset status + connection health, media count, and per-item media requirements.
// One invalid target never invalidates a valid sibling. A target is `publishable`
// only when everything passes — a degraded connection or a `variant_required`
// medium yields a warning that is NOT publishable. Facebook Groups / Extended
// kinds are rejected. Provider-neutral; consumes canonical requirements only.
// ============================================================================
import type { DraftState, DraftTargetState } from "./domain";
import { contentKind } from "./model";
import { resolveEffectiveContent } from "./variant";
import { validateMediaForTarget, type MediaFacts, type MediaValidationCode } from "../media/validate";
import type { MetaCapabilityDecision } from "../capability/types";

export type TargetReadiness = "ready" | "warning" | "invalid";

export interface TargetValidation {
  targetId: string;
  platform: string;
  contentKind: string;
  readiness: TargetReadiness;
  publishable: boolean;
  codes: readonly MediaValidationCode[];
}

export interface MediaFactsRecord extends MediaFacts { archivedAt: string | null }

export interface TargetValidationContext {
  /** The capability decision for the target's required capability (Phase-1 gate). */
  capabilityByTarget: (target: DraftTargetState) => MetaCapabilityDecision | null;
  /** Canonical asset status + connection health for the target's asset. */
  assetState: (assetId: string) => { status: string; connectionHealth: string } | null;
  /** Server-inspected media facts by canonical media id. */
  media: (mediaId: string) => MediaFactsRecord | null;
}

const code = (c: string, message: string, severity: "error" | "warning", remediation: string | null = null): MediaValidationCode => ({ code: c, message, severity, remediation });

/** Validate a single target independently. */
export function validateTarget(draft: DraftState, target: DraftTargetState, ctx: TargetValidationContext): TargetValidation {
  const codes: MediaValidationCode[] = [];
  const def = contentKind(target.contentKind);
  const eff = resolveEffectiveContent(draft, target);

  // 1) Content kind must be enabled (Extended kinds are disabled by design).
  if (!def) codes.push(code("unknown_content_kind", `Unknown content kind: ${target.contentKind}`, "error"));
  else if (!def.enabled) codes.push(code("content_kind_disabled", `${def.label} is not available in this phase`, "error"));

  // 2) Capability gate against ACTUAL granted state.
  const decision = ctx.capabilityByTarget(target);
  if (!decision || !decision.allowed) {
    codes.push(code("capability_denied", decision ? `Publishing not available: ${decision.reason}` : "Required publishing capability not available", "error", "Complete the connection / permissions / App Review"));
  }

  // 3) Asset status + connection health.
  const asset = ctx.assetState(target.assetId);
  if (!asset || asset.status !== "active") codes.push(code("asset_unavailable", "The target asset is not active (disconnected/tombstoned)", "error", "Reconnect or re-select the asset"));
  else if (asset.connectionHealth === "unhealthy") codes.push(code("connection_unhealthy", "The connection is unhealthy", "error", "Reconnect the Meta account"));
  else if (asset.connectionHealth === "degraded") codes.push(code("connection_degraded", "The connection is degraded (token expiring)", "warning", "Reconnect soon to avoid interruption"));

  // 4) Media count + per-item requirements.
  if (def) {
    const n = eff.mediaOrder.length;
    if (def.mediaRequired && n < def.minMedia) codes.push(code("too_few_media", `${def.label} needs at least ${def.minMedia} media item(s)`, "error"));
    if (def.maxMedia === 0 && n > 0) codes.push(code("media_not_allowed", `${def.label} does not carry media`, "error"));
    if (n > def.maxMedia && def.maxMedia > 0) codes.push(code("too_many_media", `${def.label} allows at most ${def.maxMedia} media item(s)`, "error"));
    for (const mediaId of eff.mediaOrder) {
      const m = ctx.media(mediaId);
      if (!m) { codes.push(code("media_missing", "A referenced media item is missing", "error")); continue; }
      if (m.archivedAt) { codes.push(code("media_archived", "A referenced media item is archived", "error", "Detach the archived media")); continue; }
      const mv = validateMediaForTarget(m, target.platform, def.mediaContentKind);
      for (const c of mv.codes) codes.push(c);
    }
    // 5) Caption length.
    if (def.maxCaption > 0 && eff.caption.length > def.maxCaption) codes.push(code("caption_too_long", `Caption exceeds ${def.maxCaption} characters for ${def.label}`, "error", "Shorten the caption"));
    if (def.maxCaption === 0 && eff.caption.trim().length > 0) codes.push(code("caption_not_supported", `${def.label} does not support a caption`, "warning"));
  }

  const hasError = codes.some((c) => c.severity === "error");
  const hasWarn = codes.some((c) => c.severity === "warning");
  const readiness: TargetReadiness = hasError ? "invalid" : hasWarn ? "warning" : "ready";
  return { targetId: target.id, platform: target.platform, contentKind: target.contentKind, readiness, publishable: readiness === "ready" && target.enabled, codes };
}

/** Validate every target independently; returns per-target + a rollup. */
export function validateDraft(draft: DraftState, ctx: TargetValidationContext): { targets: readonly TargetValidation[]; anyPublishable: boolean; allPublishable: boolean } {
  const targets = draft.targets.map((t) => validateTarget(draft, t, ctx));
  const enabled = targets.filter((_, i) => draft.targets[i].enabled);
  return {
    targets,
    anyPublishable: enabled.some((t) => t.publishable),
    allPublishable: enabled.length > 0 && enabled.every((t) => t.publishable),
  };
}
