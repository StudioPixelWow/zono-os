// ============================================================================
// 🧭 ZONO — Facebook Comment Journey · service (server-only). PHASE 41.1.1.
// Completes the comment→lead journey by REUSING the 41.1 bridge + distribution
// repositories. Two responsibilities:
//   1. enrichPendingSuggestionWithPhone — when new imported comments/messages
//      arrive for a conversation and a phone appears, ENRICH the pending
//      suggestion (distribution_lead / comment metadata) + notify. NEVER creates
//      a CRM lead (that stays approval-gated in the bridge).
//   2. getCrmLeadFacebookTimeline — resolve the full Facebook source timeline
//      (post/comment/group/campaign/property/conversation) for a promoted CRM
//      lead, so everything is visible inside the CRM lead.
// No schema change: everything is stored in existing metadata jsonb columns.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { distributionCommentsRepository } from "./distribution-comments-repository";
import { distributionRepo } from "./repository";
import { pickPhone } from "./comment-lead-bridge-core";
import {
  buildPhonePatch, deriveLifecycleStatus, buildFacebookTimeline,
  PHONE_RECEIVED_NOTE, type LifecycleStatus, type TimelineLink,
} from "./comment-journey-core";
import type { DistCommentRow } from "./db-types";

type Meta = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const isCandidate = (c: DistCommentRow) => Boolean(c.is_lead || c.should_create_lead);

/** Same-author, same-post/group comments = one imported "conversation". */
function conversationSiblings(all: DistCommentRow[], c: DistCommentRow): DistCommentRow[] {
  const key = c.author_external_id ?? c.author_name ?? null;
  if (!key) return [c];
  return all.filter((x) =>
    (x.author_external_id ?? x.author_name) === key &&
    ((c.post_id && x.post_id === c.post_id) || (c.group_id && x.group_id === c.group_id) || x.id === c.id));
}

export interface PhoneEnrichResult {
  ok: boolean;
  phone: string | null;
  changed: boolean;
  edited: boolean;
  status: LifecycleStatus | null;
  conversationSize: number;
  note?: string;
}

/**
 * Detect a phone across a comment's conversation and ENRICH the pending
 * suggestion (no CRM lead). Idempotent: same phone → no-op (no duplicate
 * notification); different phone → treated as an edit (preserves first-seen at).
 */
export async function enrichPendingSuggestionWithPhone(
  commentId: string,
  opts: { extraTexts?: string[] } = {},
): Promise<PhoneEnrichResult> {
  const none: PhoneEnrichResult = { ok: true, phone: null, changed: false, edited: false, status: null, conversationSize: 0 };
  const comment = await distributionCommentsRepository.getById(commentId).catch(() => null);
  if (!comment) return { ...none, ok: false };

  const all = await distributionCommentsRepository.listRecent(300).catch(() => [] as DistCommentRow[]);
  const siblings = conversationSiblings(all, comment);
  const texts = [comment.comment_text, ...siblings.map((x) => x.comment_text), ...(opts.extraTexts ?? [])];
  const phone = pickPhone(texts);
  if (!phone) return { ...none, conversationSize: siblings.length };

  // Resolve the pending suggestion: the distribution_lead linked to this comment.
  const distLead = comment.lead_id ? await distributionRepo.getLeadById(comment.lead_id).catch(() => null) : null;
  const leadMeta: Meta = (distLead?.metadata as Meta | undefined) ?? {};
  // Already promoted to CRM? Then it's past "pending" — do not re-open / re-notify.
  if (s(leadMeta.crm_lead_id)) return { ...none, phone, conversationSize: siblings.length, note: "כבר קודם ל-CRM." };

  const existing: Meta = distLead ? leadMeta : ((comment.metadata as Meta | undefined) ?? {});
  const evidence = siblings.find((x) => x.comment_text && pickPhone([x.comment_text]) === phone)?.comment_text ?? comment.comment_text;
  const { changed, edited, patch } = buildPhonePatch(existing, phone, new Date().toISOString(), evidence);

  const status = deriveLifecycleStatus({
    phone, isLeadCandidate: isCandidate(comment),
    crmLeadId: s(leadMeta.crm_lead_id), workflowId: s(leadMeta.workflow_id), handled: comment.handled,
  });

  if (!changed) {
    // Keep the derived status fresh but do not notify again.
    await distributionCommentsRepository.updateMetadata(commentId, { status }).catch(() => {});
    return { ok: true, phone, changed: false, edited: false, status, conversationSize: siblings.length };
  }

  // Persist enrichment on BOTH the distribution_lead (source of truth) and the comment (mirror).
  if (distLead) {
    await distributionRepo.updateLead(distLead.id, { phone, metadata: { ...leadMeta, ...patch, status } }).catch(() => {});
  }
  await distributionCommentsRepository.updateMetadata(commentId, { ...patch, status }).catch(() => {});

  // Broker notification (best-effort) — Notification Center + surfaces reading it.
  await notifyPhoneReceived(comment).catch(() => {});

  return { ok: true, phone, changed: true, edited, status, conversationSize: siblings.length, note: PHONE_RECEIVED_NOTE };
}

/** Insert the "phone received — waiting for CRM promotion" notification (best-effort). */
async function notifyPhoneReceived(comment: DistCommentRow): Promise<void> {
  const sc = await getSessionContext();
  const orgId = sc.profile?.org_id ?? sc.organization?.id ?? null;
  if (!orgId) return;
  const db = await createClient();
  let userId = sc.user?.id ?? null;
  if (!userId) {
    const { data } = await db.from("users").select("id").eq("org_id", orgId).limit(1).maybeSingle();
    userId = (data as { id?: string } | null)?.id ?? null;
  }
  if (!userId) return;
  const who = comment.author_name ?? "מתעניין";
  await db.from("notifications").insert({
    org_id: orgId, user_id: userId, level: "info", category: "new_lead",
    title: PHONE_RECEIVED_NOTE, body: `${who}: ${(comment.comment_text ?? "").slice(0, 140)}`,
    href: "/distribution",
  }).select("id").maybeSingle();
}

/** Pending FB suggestions that received a phone but are NOT yet promoted to CRM. */
export interface PhoneReceivedPending {
  count: number;
  items: { distributionLeadId: string; name: string | null; phone: string; commentId: string | null; status: LifecycleStatus }[];
}
export async function getPhoneReceivedPending(): Promise<PhoneReceivedPending> {
  const leads = await distributionRepo.listLeads({ limit: 200 }).catch(() => []);
  const items: PhoneReceivedPending["items"] = [];
  for (const l of leads) {
    const meta = (l.metadata as Meta | undefined) ?? {};
    const phone = l.phone ?? s(meta.phone);
    if (!phone) continue;
    if (s(meta.crm_lead_id)) continue;            // already promoted
    if (l.status === "converted") continue;
    const status = (s(meta.status) as LifecycleStatus | null) ?? deriveLifecycleStatus({ phone, isLeadCandidate: true });
    items.push({ distributionLeadId: l.id, name: l.name, phone, commentId: l.comment_id, status });
  }
  return { count: items.length, items };
}

// ── CRM lead → Facebook source timeline (visible inside the CRM lead) ─────────
export interface CrmLeadFacebookTimeline {
  found: boolean;
  distributionLeadId: string | null;
  status: LifecycleStatus | null;
  phone: string | null;
  links: TimelineLink[];
  journey: Record<string, unknown> | null;
}

export async function getCrmLeadFacebookTimeline(crmLeadId: string): Promise<CrmLeadFacebookTimeline> {
  const empty: CrmLeadFacebookTimeline = { found: false, distributionLeadId: null, status: null, phone: null, links: [], journey: null };
  if (!crmLeadId) return empty;
  const distLead = await distributionRepo.getLeadByCrmLeadId(crmLeadId).catch(() => null);
  if (!distLead) return empty;
  const meta = (distLead.metadata as Meta | undefined) ?? {};

  const comment = distLead.comment_id ? await distributionCommentsRepository.getById(distLead.comment_id).catch(() => null) : null;
  const [posts, groups, all] = await Promise.all([
    distributionRepo.listPosts({ limit: 500 }).catch(() => []),
    distributionRepo.listGroups({ limit: 500 }).catch(() => []),
    distributionCommentsRepository.listRecent(300).catch(() => [] as DistCommentRow[]),
  ]);
  const post = distLead.post_id ? posts.find((p) => p.id === distLead.post_id) ?? null : null;
  const group = distLead.group_id ? groups.find((g) => g.id === distLead.group_id) ?? null
    : (post?.group_id ? groups.find((g) => g.id === post.group_id) ?? null : null);
  const conversationSize = comment ? conversationSiblings(all, comment).length : 0;

  const { links } = buildFacebookTimeline({
    postId: distLead.post_id ?? post?.id ?? null, externalPostUrl: post?.external_post_url ?? null, postTitle: post?.post_title ?? null,
    commentId: distLead.comment_id ?? comment?.id ?? null, externalCommentUrl: comment?.external_comment_id ?? null, commentText: comment?.comment_text ?? null,
    groupId: distLead.group_id ?? group?.id ?? null, groupName: group?.name ?? null,
    campaignId: distLead.campaign_id ?? post?.campaign_id ?? null, campaignName: null,
    propertyId: distLead.property_id ?? post?.property_id ?? null, propertyTitle: null,
    conversationSize,
  });

  const status = deriveLifecycleStatus({
    phone: distLead.phone ?? s(meta.phone), isLeadCandidate: comment ? isCandidate(comment) : true,
    crmLeadId: crmLeadId, workflowId: s(meta.workflow_id),
  });

  return {
    found: true, distributionLeadId: distLead.id, status, phone: distLead.phone ?? s(meta.phone),
    links, journey: (meta.journey as Record<string, unknown> | undefined) ?? null,
  };
}
