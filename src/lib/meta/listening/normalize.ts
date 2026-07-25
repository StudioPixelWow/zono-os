// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING NORMALIZATION (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Folds a canonical (already-sealed) gateway mention into a canonical MentionRecord
// + a stable dedup key + a content fingerprint (edit detection). The Graph-specific
// shape is normalized BELOW this by the sealed gateway; this module speaks only the
// provider-neutral CanonicalMention contract. Bounded, safe text only — no raw
// payload, token, or scraped profile data. Deterministic + pure (drives QA).
// ============================================================================
import { MENTION_TEXT_MAX, isMentionKind, type MentionRecord, type MentionKind, type SafeAttachment, type EvidenceKind } from "./domain";
import type { MetaPlatform } from "../types";

/** The provider-neutral mention the sealed gateway emits (no Graph field names). */
export interface CanonicalMention {
  externalMentionId: string;
  mentionKind: string;                 // validated against taxonomy here
  sourceObjectRef: string | null;
  authorExternalId: string | null;
  authorDisplay: string | null;
  text: string;
  attachments: readonly { kind: string; hasMedia: boolean }[];
  permalink: string | null;
  providerCreatedAt: string | null;
}

const clip = (s: string, n: number) => { const c = (s ?? "").replace(/\s+/g, " ").trim(); return c.length > n ? c.slice(0, n - 1) + "…" : c; };
const safeText = (s: string | null | undefined) => clip(String(s ?? ""), MENTION_TEXT_MAX);
const safeAttachments = (a: readonly { kind: string; hasMedia: boolean }[]): SafeAttachment[] => (a ?? []).slice(0, 8).map((x) => ({ kind: String(x.kind ?? "unknown").slice(0, 32), hasMedia: !!x.hasMedia }));

/** FNV-1a — deterministic content fingerprint (edit detection; no crypto/ambient). */
export function contentFingerprint(m: Pick<MentionRecord, "externalMentionId" | "messageText" | "providerCreatedAt">): string {
  const s = `${m.externalMentionId}␟${m.messageText}␟${m.providerCreatedAt ?? ""}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Normalize a canonical gateway mention → a canonical MentionRecord (pure). */
export function normalizeMention(platform: MetaPlatform, m: CanonicalMention, evidenceKind: EvidenceKind): MentionRecord {
  const mentionKind: MentionKind = isMentionKind(m.mentionKind) ? m.mentionKind : "unknown_supported";
  return {
    platform, externalMentionId: String(m.externalMentionId), mentionKind,
    sourceObjectRef: m.sourceObjectRef ? String(m.sourceObjectRef) : null,
    authorExternalId: m.authorExternalId ? String(m.authorExternalId) : null,
    authorDisplaySafe: m.authorDisplay ? clip(m.authorDisplay, 120) : null,
    messageText: safeText(m.text), attachmentsSafe: safeAttachments(m.attachments),
    permalinkSafe: m.permalink && /^https?:\/\//.test(m.permalink) ? m.permalink : null,
    providerCreatedAt: m.providerCreatedAt ?? null, evidenceKind,
  };
}

/** Stable dedup key (org is applied at the store layer): platform + external id. */
export const mentionDedupKey = (platform: MetaPlatform, externalMentionId: string) => `${platform}|${externalMentionId}`;
