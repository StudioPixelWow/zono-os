// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING WINDOW + POLICY (PURE). Phase 6.
// ----------------------------------------------------------------------------
// The 24-hour standard messaging window, the 7-day Human Agent window, and Meta
// policy-tag validation — all deterministic + pure (drives QA). Outbound sending
// is permitted ONLY when: inside the 24h window (no tag), OR inside the 7d window
// WITH the HUMAN_AGENT tag, OR a SUPPORTED message tag applies. An unsupported tag
// is never accepted. This module decides ELIGIBILITY only — it never sends and never
// bypasses approval (the engine still requires an explicit human approval to send).
// ============================================================================
import { STANDARD_WINDOW_MS, HUMAN_AGENT_WINDOW_MS, isPolicyTag, type MessagingPolicyTag, type WindowState } from "./domain";

/** Time since the last inbound user message (ms), or null if never. */
export function timeSinceLastInboundMs(lastInboundAt: string | null, nowMs: number): number | null {
  if (!lastInboundAt) return null;
  const t = Date.parse(lastInboundAt);
  return Number.isFinite(t) ? nowMs - t : null;
}

export function isWithinStandardWindow(lastInboundAt: string | null, nowMs: number): boolean {
  const d = timeSinceLastInboundMs(lastInboundAt, nowMs);
  return d !== null && d <= STANDARD_WINDOW_MS;
}
export function isWithinHumanAgentWindow(lastInboundAt: string | null, nowMs: number): boolean {
  const d = timeSinceLastInboundMs(lastInboundAt, nowMs);
  return d !== null && d <= HUMAN_AGENT_WINDOW_MS;
}

export interface SendEligibility { ok: boolean; windowState: WindowState; reason: string | null; requiresTag: boolean }

/** Decide whether an outbound message is policy-eligible (window + supported tag). */
export function evaluateSendEligibility(input: { lastInboundAt: string | null; nowMs: number; tag: string | null }): SendEligibility {
  const tag = input.tag;
  if (isWithinStandardWindow(input.lastInboundAt, input.nowMs)) {
    // Inside 24h → no tag required (a tag, if present, must still be supported).
    if (tag && !isPolicyTag(tag)) return { ok: false, windowState: "within_24h", reason: "unsupported_policy_tag", requiresTag: false };
    return { ok: true, windowState: "within_24h", reason: null, requiresTag: false };
  }
  // Outside 24h → a SUPPORTED policy tag is required.
  if (!tag) return { ok: false, windowState: "expired", reason: "window_expired_tag_required", requiresTag: true };
  if (!isPolicyTag(tag)) return { ok: false, windowState: "expired", reason: "unsupported_policy_tag", requiresTag: true };
  const t = tag as MessagingPolicyTag;
  if (t === "HUMAN_AGENT") {
    return isWithinHumanAgentWindow(input.lastInboundAt, input.nowMs)
      ? { ok: true, windowState: "human_agent", reason: null, requiresTag: true }
      : { ok: false, windowState: "expired", reason: "human_agent_window_expired", requiresTag: true };
  }
  // Other supported message tags permit an out-of-window update for their purpose.
  return { ok: true, windowState: "tag_permitted", reason: null, requiresTag: true };
}
