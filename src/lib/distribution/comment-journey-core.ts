// ============================================================================
// 🧭 ZONO — Facebook Comment Journey · pure core. PHASE 41.1.1.
// Completes the comment→lead journey WITHOUT duplicating the 41.1 bridge:
//   • lifecycle status model (waiting_for_phone → … → closed/rejected)
//   • idempotent, edit-safe phone-enrichment patch (no CRM lead here)
//   • journey enrichment payload attached when the workflow starts (by REFERENCE)
//   • Facebook source timeline (post/comment/group/campaign/property/conversation)
// Pure, deterministic, evidence-only. All persistence lives in the service and
// reuses distribution_comments.metadata / distribution_leads.metadata (jsonb) —
// NO schema change, NO new engine.
// ============================================================================

// ── Lifecycle ────────────────────────────────────────────────────────────────
export type LifecycleStatus =
  | "waiting_for_phone"
  | "phone_received"
  | "waiting_crm_approval"
  | "crm_lead_created"
  | "journey_started"
  | "closed"
  | "rejected";

export const LIFECYCLE_ORDER: LifecycleStatus[] = [
  "waiting_for_phone", "phone_received", "waiting_crm_approval",
  "crm_lead_created", "journey_started", "closed", "rejected",
];

export const LIFECYCLE_HE: Record<LifecycleStatus, string> = {
  waiting_for_phone: "ממתין לטלפון",
  phone_received: "התקבל טלפון",
  waiting_crm_approval: "ממתין לאישור CRM",
  crm_lead_created: "ליד CRM נוצר",
  journey_started: "מסע ליד הופעל",
  closed: "טופל / נסגר",
  rejected: "נדחה",
};

/** The broker-facing notification text when a pending FB lead receives a phone. */
export const PHONE_RECEIVED_NOTE = "התקבל מספר טלפון - ממתין לקידום ל-CRM";

export interface LifecycleFacts {
  rejected?: boolean;
  handled?: boolean;
  isLeadCandidate?: boolean;      // is_lead || should_create_lead
  phone?: string | null;
  crmLeadId?: string | null;
  workflowId?: string | null;
}

/** Deterministically derive the lifecycle status from the row facts. */
export function deriveLifecycleStatus(f: LifecycleFacts): LifecycleStatus {
  if (f.rejected) return "rejected";
  if (f.workflowId) return "journey_started";
  if (f.crmLeadId) return "crm_lead_created";
  if (f.phone) return f.isLeadCandidate ? "waiting_crm_approval" : "phone_received";
  if (f.handled && !f.isLeadCandidate) return "closed";
  return "waiting_for_phone";
}

// ── Phone enrichment (idempotent + edit-safe) ────────────────────────────────
export interface PhoneMeta {
  phone?: string | null;
  phone_detected_at?: string | null;
  phone_edited_at?: string | null;
  phone_evidence?: string | null;
}

/**
 * Build a metadata patch for a newly-detected phone on a PENDING suggestion.
 * - First detection → sets phone + phone_detected_at.
 * - Later edit (different number) → sets phone + phone_edited_at, PRESERVES the
 *   original phone_detected_at (not in the patch → merge keeps it).
 * - Duplicate (same number) → { changed:false } → caller no-ops (no reset, no
 *   duplicate notification).
 */
export function buildPhonePatch(
  existing: Record<string, unknown> | null | undefined,
  phone: string,
  at: string,
  evidence?: string | null,
): { changed: boolean; edited: boolean; patch: PhoneMeta } {
  const prev = typeof existing?.phone === "string" && existing.phone ? (existing.phone as string) : null;
  if (prev === phone) return { changed: false, edited: false, patch: {} };
  const edited = prev != null;
  const patch: PhoneMeta = { phone, phone_evidence: evidence ?? null };
  if (edited) patch.phone_edited_at = at;
  else patch.phone_detected_at = at;
  return { changed: true, edited, patch };
}

// ── Journey enrichment (attached once when the workflow starts) ───────────────
export interface JourneyEnrichment {
  workflowId: string | null;
  commentId: string | null;
  phone: string | null;
  propertyId: string | null;
  campaignId: string | null;
  groupId: string | null;
  postId: string | null;
  classification: string | null;   // category
  suggestedReply: string | null;
  confidence: number | null;       // lead_intent_score 0..100
  evidence: string[];              // source snippets (comment text etc.)
  startedAt: string;
}

export function buildJourneyEnrichment(input: {
  workflowId: string | null;
  commentId: string | null;
  phone: string | null;
  propertyId: string | null;
  campaignId: string | null;
  groupId: string | null;
  postId: string | null;
  classification: string | null;
  suggestedReply: string | null;
  confidence: number | null;
  evidence?: (string | null | undefined)[];
  now: string;
}): JourneyEnrichment {
  return {
    workflowId: input.workflowId, commentId: input.commentId, phone: input.phone,
    propertyId: input.propertyId, campaignId: input.campaignId, groupId: input.groupId, postId: input.postId,
    classification: input.classification, suggestedReply: input.suggestedReply,
    confidence: input.confidence == null ? null : Math.max(0, Math.min(100, Math.round(input.confidence))),
    evidence: (input.evidence ?? []).filter((e): e is string => typeof e === "string" && e.trim().length > 0).slice(0, 5),
    startedAt: input.now,
  };
}

/** Journey-once guard: start the workflow only if none was ever started. */
export function shouldStartJourney(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return true;
  return !meta.workflow_id && !meta.journey;
}

// ── Facebook source timeline (visible inside the CRM lead) ────────────────────
export interface TimelineLink {
  kind: "post" | "comment" | "group" | "campaign" | "property" | "conversation";
  label: string;
  href: string | null;      // internal ZONO link, or external post/comment url
  detail: string | null;
}

export function buildFacebookTimeline(input: {
  postId: string | null; externalPostUrl: string | null; postTitle: string | null;
  commentId: string | null; externalCommentUrl: string | null; commentText: string | null;
  groupId: string | null; groupName: string | null;
  campaignId: string | null; campaignName: string | null;
  propertyId: string | null; propertyTitle: string | null;
  conversationSize: number;   // how many imported comments/messages in this thread
}): { links: TimelineLink[] } {
  const links: TimelineLink[] = [];
  if (input.postId || input.externalPostUrl)
    links.push({ kind: "post", label: "פוסט מקורי", href: input.externalPostUrl ?? (input.postId ? `/distribution` : null), detail: input.postTitle });
  if (input.commentId)
    links.push({ kind: "comment", label: "תגובה מקורית", href: input.externalCommentUrl ?? null, detail: input.commentText ? input.commentText.slice(0, 120) : null });
  if (input.groupId)
    links.push({ kind: "group", label: "קבוצה", href: `/distribution`, detail: input.groupName });
  if (input.campaignId)
    links.push({ kind: "campaign", label: "קמפיין", href: `/distribution`, detail: input.campaignName });
  if (input.propertyId)
    links.push({ kind: "property", label: "נכס", href: `/properties/${input.propertyId}`, detail: input.propertyTitle });
  if (input.conversationSize > 1)
    links.push({ kind: "conversation", label: "שיחה מיובאת", href: `/distribution`, detail: `${input.conversationSize} תגובות/הודעות` });
  return { links };
}

// ── Pure self-check (offline) ────────────────────────────────────────────────
export interface JCheck { name: string; pass: boolean; detail: string }
export interface JSelfCheck { ok: boolean; total: number; passed: number; checks: JCheck[] }
export function runSelfCheck(): JSelfCheck {
  const checks: JCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });
  const T = "2026-07-04T10:00:00.000Z";

  // Lifecycle derivation
  add("status: default waiting_for_phone", deriveLifecycleStatus({}) === "waiting_for_phone");
  add("status: phone on candidate → waiting_crm_approval", deriveLifecycleStatus({ phone: "0501234567", isLeadCandidate: true }) === "waiting_crm_approval");
  add("status: phone on non-candidate → phone_received", deriveLifecycleStatus({ phone: "0501234567" }) === "phone_received");
  add("status: crmLeadId → crm_lead_created", deriveLifecycleStatus({ crmLeadId: "l1", phone: "0501234567" }) === "crm_lead_created");
  add("status: workflowId wins → journey_started", deriveLifecycleStatus({ crmLeadId: "l1", workflowId: "w1" }) === "journey_started");
  add("status: handled non-candidate → closed", deriveLifecycleStatus({ handled: true }) === "closed");
  add("status: rejected wins over all", deriveLifecycleStatus({ rejected: true, workflowId: "w1", phone: "x" }) === "rejected");

  // Phone added later (first detection)
  const first = buildPhonePatch(null, "0501234567", T, "צור קשר 0501234567");
  add("phone added later: changed + detected_at set", first.changed && !first.edited && first.patch.phone_detected_at === T && first.patch.phone === "0501234567");

  // Duplicate phone → no-op
  const dup = buildPhonePatch({ phone: "0501234567", phone_detected_at: T }, "0501234567", "2026-07-05T00:00:00Z");
  add("duplicate phone: no change (idempotent)", !dup.changed && Object.keys(dup.patch).length === 0);

  // Phone edited → new number, preserves detected_at (not in patch), sets edited_at
  const edit = buildPhonePatch({ phone: "0501234567", phone_detected_at: T }, "0527654321", "2026-07-06T00:00:00Z");
  add("phone edited: changed + edited flag + edited_at set + no detected_at overwrite",
    edit.changed && edit.edited && edit.patch.phone === "0527654321" && !!edit.patch.phone_edited_at && edit.patch.phone_detected_at === undefined);

  // Journey once
  add("journey once: fresh meta → start", shouldStartJourney({}) === true);
  add("journey once: workflow_id present → skip", shouldStartJourney({ workflow_id: "w1" }) === false);
  add("journey once: journey present → skip", shouldStartJourney({ journey: { workflowId: "w1" } }) === false);

  // Journey enrichment carries everything, clamps confidence, caps evidence
  const je = buildJourneyEnrichment({
    workflowId: "w1", commentId: "c1", phone: "0501234567", propertyId: "p1", campaignId: "cmp1",
    groupId: "g1", postId: "po1", classification: "buyer_interest", suggestedReply: "שלח טלפון",
    confidence: 142, evidence: ["מעוניין", "", null, "תקציב 2M", "a", "b", "c"], now: T,
  });
  add("journey enrichment: all refs + clamp confidence + evidence cap",
    je.workflowId === "w1" && je.propertyId === "p1" && je.campaignId === "cmp1" && je.groupId === "g1" &&
    je.classification === "buyer_interest" && je.confidence === 100 && je.evidence.length === 5 && !je.evidence.includes(""));

  // Timeline links: all 6 kinds when ids present
  const tl = buildFacebookTimeline({
    postId: "po1", externalPostUrl: "https://facebook.com/x", postTitle: "דירת 4 חד'",
    commentId: "c1", externalCommentUrl: "https://facebook.com/c", commentText: "מעוניין",
    groupId: "g1", groupName: "נדל\"ן חיפה", campaignId: "cmp1", campaignName: "קמפיין",
    propertyId: "p1", propertyTitle: "רחוב הרצל", conversationSize: 3,
  });
  const kinds = tl.links.map((l) => l.kind);
  add("timeline: post/comment/group/campaign/property/conversation all present",
    ["post", "comment", "group", "campaign", "property", "conversation"].every((k) => kinds.includes(k as TimelineLink["kind"])));
  add("timeline: property link is internal", tl.links.find((l) => l.kind === "property")?.href === "/properties/p1");

  // Timeline empty-safe
  const empty = buildFacebookTimeline({
    postId: null, externalPostUrl: null, postTitle: null, commentId: null, externalCommentUrl: null, commentText: null,
    groupId: null, groupName: null, campaignId: null, campaignName: null, propertyId: null, propertyTitle: null, conversationSize: 0,
  });
  add("timeline: empty-safe", empty.links.length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
