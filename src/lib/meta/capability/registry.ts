// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CAPABILITY REGISTRY. Phase 0.
// ----------------------------------------------------------------------------
// The deterministic, canonical registry of what Meta Workspace can do. It speaks
// CANONICAL capability keys ONLY — raw Meta permission strings are never stored
// here (they live in the Graph compat mapping). Each capability declares its
// requirement bundle + roadmap classification + kill-switch domain. MVP is the
// conservative launch set; Extended is off by default; Excluded is permanently
// denied (Facebook Groups).
// ============================================================================
import type { MetaCapability, MetaCapabilityKey } from "./types";
import type { MetaCapabilityClass } from "../types";

/** Terse constructor to keep the table readable and consistent. */
function cap(
  key: string,
  platform: MetaCapability["platform"],
  scopeGroup: MetaCapability["scopeGroup"],
  classification: MetaCapabilityClass,
  killSwitchDomain: MetaCapability["killSwitchDomain"],
  requirement: Partial<MetaCapability["requirement"]>,
  opts?: { defaultEnabled?: boolean; limitations?: readonly string[] },
): MetaCapability {
  return {
    key: key as MetaCapabilityKey,
    platform,
    scopeGroup,
    classification,
    defaultEnabled: opts?.defaultEnabled ?? classification === "mvp",
    killSwitchDomain,
    requirement: {
      minAccessMode: requirement.minAccessMode ?? "any",
      requiresBusinessVerification: requirement.requiresBusinessVerification ?? false,
      requiresAppReview: requirement.requiresAppReview ?? false,
      requiresWebhook: requirement.requiresWebhook ?? false,
      dependsOn: requirement.dependsOn ?? [],
    },
    limitations: opts?.limitations ?? [],
  };
}

const K = (s: string) => s as MetaCapabilityKey;

/** The canonical capability table (single source of truth). */
export const META_CAPABILITIES: readonly MetaCapability[] = [
  // ── MVP ──────────────────────────────────────────────────────────────
  cap("connection.manage", "cross", "connection", "mvp", "connection", { minAccessMode: "any" }),
  cap("assets.read", "cross", "assets", "mvp", "connection", { minAccessMode: "any", dependsOn: [K("connection.manage")] }),

  cap("facebook.content.read", "facebook", "content", "mvp", "publishing", { requiresAppReview: true, dependsOn: [K("assets.read")] }),
  cap("facebook.content.publish", "facebook", "content", "mvp", "publishing", {
    requiresAppReview: true,
    requiresBusinessVerification: true,
    dependsOn: [K("facebook.content.read")],
  }),
  cap("instagram.content.read", "instagram", "content", "mvp", "publishing", { requiresAppReview: true, dependsOn: [K("assets.read")] }),
  cap("instagram.content.publish", "instagram", "content", "mvp", "publishing", {
    requiresAppReview: true,
    requiresBusinessVerification: true,
    dependsOn: [K("instagram.content.read")],
  }, { limitations: ["IG publishing is capped at 25 posts per 24h per account (Meta hard limit)."] }),

  cap("facebook.comments.read", "facebook", "comments", "mvp", "comments", { requiresAppReview: true, requiresWebhook: true, dependsOn: [K("facebook.content.read")] }),
  cap("facebook.comments.reply", "facebook", "comments", "mvp", "comments", { requiresAppReview: true, dependsOn: [K("facebook.comments.read")] }),
  cap("instagram.comments.read", "instagram", "comments", "mvp", "comments", { requiresAppReview: true, requiresWebhook: true, dependsOn: [K("instagram.content.read")] }),
  cap("instagram.comments.reply", "instagram", "comments", "mvp", "comments", { requiresAppReview: true, dependsOn: [K("instagram.comments.read")] }),

  cap("webhook.health.read", "cross", "webhooks", "mvp", "webhooks", { dependsOn: [K("connection.manage")] }),
  cap("analytics.basic.read", "cross", "analytics", "mvp", "analytics", { requiresAppReview: true, dependsOn: [K("assets.read")] }),

  // ── Extended (declared, DISABLED by default) ─────────────────────────
  cap("facebook.reels.publish", "facebook", "content", "extended", "publishing", { requiresAppReview: true, requiresBusinessVerification: true, dependsOn: [K("facebook.content.publish")] }, { defaultEnabled: false }),
  cap("facebook.stories.publish", "facebook", "content", "extended", "publishing", { requiresAppReview: true, requiresBusinessVerification: true, dependsOn: [K("facebook.content.publish")] }, { defaultEnabled: false }),
  cap("instagram.reels.publish", "instagram", "content", "extended", "publishing", { requiresAppReview: true, requiresBusinessVerification: true, dependsOn: [K("instagram.content.publish")] }, { defaultEnabled: false }),
  cap("instagram.stories.publish", "instagram", "content", "extended", "publishing", { requiresAppReview: true, requiresBusinessVerification: true, dependsOn: [K("instagram.content.publish")] }, { defaultEnabled: false }),
  cap("facebook.messaging.read", "facebook", "messaging", "extended", "messaging", { requiresAppReview: true, requiresWebhook: true, dependsOn: [K("assets.read")] }, { defaultEnabled: false }),
  cap("facebook.messaging.reply", "facebook", "messaging", "extended", "messaging", { requiresAppReview: true, dependsOn: [K("facebook.messaging.read")] }, { defaultEnabled: false }),
  cap("instagram.messaging.read", "instagram", "messaging", "extended", "messaging", { requiresAppReview: true, requiresWebhook: true, dependsOn: [K("assets.read")] }, { defaultEnabled: false }),
  cap("instagram.messaging.reply", "instagram", "messaging", "extended", "messaging", { requiresAppReview: true, dependsOn: [K("instagram.messaging.read")] }, { defaultEnabled: false }),
  cap("analytics.advanced.read", "cross", "analytics", "extended", "analytics", { requiresAppReview: true, dependsOn: [K("analytics.basic.read")] }, { defaultEnabled: false }),
  cap("instagram.mentions.read", "instagram", "engagement", "extended", "comments", { requiresAppReview: true, requiresWebhook: true, dependsOn: [K("instagram.content.read")] }, { defaultEnabled: false }),
  cap("instagram.first_comment.publish", "instagram", "content", "extended", "publishing", { requiresAppReview: true, dependsOn: [K("instagram.content.publish")] }, { defaultEnabled: false }),

  // ── Excluded (permanently denied) ────────────────────────────────────
  cap("facebook.groups.read", "facebook", "content", "excluded", "all", {}, { defaultEnabled: false, limitations: ["Facebook Groups API is deprecated by Meta — permanently out of scope."] }),
  cap("facebook.groups.publish", "facebook", "content", "excluded", "all", {}, { defaultEnabled: false, limitations: ["Facebook Groups API is deprecated by Meta — permanently out of scope."] }),
];

/** Indexed lookup by canonical key. */
const BY_KEY: ReadonlyMap<string, MetaCapability> = new Map(META_CAPABILITIES.map((c) => [String(c.key), c]));

/** Resolve a capability definition by key (null if unknown). */
export function getMetaCapability(key: string): MetaCapability | null {
  return BY_KEY.get(key) ?? null;
}

/** All capabilities in a given classification. */
export function metaCapabilitiesByClass(classification: MetaCapabilityClass): readonly MetaCapability[] {
  return META_CAPABILITIES.filter((c) => c.classification === classification);
}

/** The set of Excluded capability keys (always denied). */
export const EXCLUDED_CAPABILITY_KEYS: ReadonlySet<string> = new Set(
  META_CAPABILITIES.filter((c) => c.classification === "excluded").map((c) => String(c.key)),
);
