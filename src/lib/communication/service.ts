/**
 * Communication & Relationship Intelligence service — server-only.
 * Manual logging (no real WhatsApp/Gmail/telephony yet), follow-up & commitment
 * tracking, deterministic profile recompute, and cross-brain coupling.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import { recalculateSellerIntelligence } from "@/lib/seller-intelligence/service";
import { recalculateBuyerIntelligence } from "@/lib/buyer-intelligence/service";
import {
  buildDraftActions, computeCommunicationProfile, detectCommitments, draftReply,
  type CommunicationSignals, type DraftActions,
} from "./engine";
import {
  commCommitmentRepository, commFollowupRepository, commProfileRepository, commThreadRepository,
  type CommCommitmentRow, type CommFollowupRow, type CommProfileRow,
} from "./repository";

const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const thresholdFor = (entityType: string) => (entityType === "seller" ? 14 : entityType === "buyer" ? 7 : 10);

export interface LogCommunicationInput {
  entityType: string;
  entityId: string;
  channel: string; // phone|whatsapp|email|meeting|note|system
  direction: string; // inbound|outbound
  title: string;
  body?: string | null;
  sentiment?: string | null; // positive|neutral|negative|urgent
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  commitmentText?: string | null;
  commitmentDueDate?: string | null;
  followupTitle?: string | null;
  followupDueAt?: string | null;
  followupReason?: string | null;
  createTask?: boolean;
}

const EVENT_FOR_CHANNEL: Record<string, string> = {
  phone: "communication.call_logged",
  whatsapp: "communication.whatsapp_logged",
  email: "communication.email_logged",
  meeting: "communication.meeting_logged",
  note: "communication.note_logged",
  system: "communication.note_logged",
};

/** Log a manual communication and fan out to threads/messages/events/intel. */
export async function logCommunication(input: LogCommunicationInput): Promise<{ messageThreadId: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  const orgId = profile.org_id;
  const nowIso = new Date().toISOString();
  const sentiment = input.sentiment ?? "neutral";

  // 1) thread + message
  const threadId = await commThreadRepository.findOrCreate({ orgId, entityType: input.entityType, entityId: input.entityId, channel: input.channel, title: input.title });
  await commThreadRepository.addMessage({
    org_id: orgId, thread_id: threadId, sender_user_id: user.id,
    direction: input.direction, channel: input.channel, subject: input.title, body: input.body ?? null,
    ai_summary: input.body ? `סיכום: ${input.body.slice(0, 140)}` : input.title, sentiment,
    sent_at: input.direction === "outbound" ? nowIso : null,
    received_at: input.direction === "inbound" ? nowIso : null,
  });

  // 2) activity event
  await logActivityEvent({
    eventType: EVENT_FOR_CHANNEL[input.channel] ?? "communication.note_logged",
    entityType: input.entityType, entityId: input.entityId,
    title: input.title, description: input.body ?? null,
    channel: input.channel, direction: input.direction, sentiment,
    relatedEntityType: input.relatedEntityType ?? null, relatedEntityId: input.relatedEntityId ?? null,
  });

  // 3) optional commitment
  if (input.commitmentText) {
    await commCommitmentRepository.insert({
      org_id: orgId, entity_type: input.entityType, entity_id: input.entityId,
      related_entity_type: input.relatedEntityType ?? null, related_entity_id: input.relatedEntityId ?? null,
      commitment_text: input.commitmentText, promised_by_user_id: user.id,
      promised_to_type: input.entityType, promised_to_id: input.entityId,
      due_date: input.commitmentDueDate ?? null, status: "open", impact_score: 50,
    });
    await logActivityEvent({ eventType: "communication.commitment_created", entityType: input.entityType, entityId: input.entityId, title: `התחייבות: ${input.commitmentText}` });
  }

  // 4) optional followup (+ optional task)
  if (input.followupTitle) {
    let taskId: string | null = null;
    if (input.createTask) {
      const { data } = await supabase.from("tasks").insert({
        org_id: orgId, created_by: user.id, assignee_id: user.id, title: input.followupTitle,
        description: input.followupReason ?? null, status: "todo", due_at: input.followupDueAt ?? null,
        entity_type: input.entityType, entity_id: input.entityId, intelligence_source: "communication",
      }).select("id").single();
      taskId = data?.id ?? null;
    }
    await commFollowupRepository.insert({
      org_id: orgId, entity_type: input.entityType, entity_id: input.entityId,
      related_entity_type: input.relatedEntityType ?? null, related_entity_id: input.relatedEntityId ?? null,
      followup_type: input.channel, title: input.followupTitle, reason: input.followupReason ?? null,
      priority: sentiment === "urgent" || sentiment === "negative" ? "high" : "medium",
      due_at: input.followupDueAt ?? null, status: "open", related_task_id: taskId,
    });
    await logActivityEvent({ eventType: "communication.followup_created", entityType: input.entityType, entityId: input.entityId, title: `פולואפ: ${input.followupTitle}` });
  }

  // 5) cross-brain coupling (existing engines consume this naturally)
  try {
    if (input.entityType === "seller") {
      const trust = sentiment === "positive" ? 6 : sentiment === "negative" ? -6 : sentiment === "urgent" ? -2 : 2;
      const engagement = input.direction === "inbound" ? 5 : 3;
      await supabase.from("seller_touchpoints").insert({
        org_id: orgId, seller_id: input.entityId, touchpoint_type: "communication",
        direction: input.direction, title: input.title, description: input.body ?? null,
        sentiment, trust_impact: trust, engagement_impact: engagement, created_by_user_id: user.id,
      } as never);
      await recalculateSellerIntelligence(input.entityId);
    } else if (input.entityType === "buyer") {
      await supabase.from("buyers").update({ last_contacted_at: nowIso }).eq("id", input.entityId);
      await recalculateBuyerIntelligence(input.entityId);
    }
  } catch (e) {
    console.error("[communication] cross-brain coupling failed:", e);
  }

  await recomputeCommunicationProfile(input.entityType, input.entityId);
  return { messageThreadId: threadId };
}

/** Recompute the communication intelligence profile for one entity. */
export async function recomputeCommunicationProfile(entityType: string, entityId: string): Promise<void> {
  const { profile } = await getSessionContext();
  if (!profile) return;
  const supabase = await createClient();
  const orgId = profile.org_id;

  const [eventsRes, commitments, followups] = await Promise.all([
    supabase.from("activity_events").select("event_type,direction,sentiment,occurred_at")
      .eq("entity_type", entityType).eq("entity_id", entityId).like("event_type", "communication.%")
      .order("occurred_at", { ascending: true }).limit(500),
    commCommitmentRepository.listByEntity(entityType, entityId),
    commFollowupRepository.listByEntity(entityType, entityId),
  ]);

  const events = (eventsRes.data ?? []).filter((e) => e.direction === "inbound" || e.direction === "outbound" || (e.event_type ?? "").includes("logged"));
  const inbound = events.filter((e) => e.direction === "inbound");
  const outbound = events.filter((e) => e.direction === "outbound");
  const lastContactAt = events.length ? events[events.length - 1].occurred_at : null;
  const lastInboundAt = inbound.length ? inbound[inbound.length - 1].occurred_at : null;
  const lastOutboundAt = outbound.length ? outbound[outbound.length - 1].occurred_at : null;
  const unanswered = lastInboundAt
    ? outbound.filter((e) => e.occurred_at > lastInboundAt!).length
    : Math.min(outbound.length, 5);

  const now = Date.now();
  const isOverdue = (d: string | null) => d != null && new Date(d).getTime() < now;
  const openCommitments = commitments.filter((c) => c.status === "open");
  const overdueCommitments = openCommitments.filter((c) => isOverdue(c.due_date)).length;
  const brokenCommitments = commitments.filter((c) => c.status === "broken").length;
  const fulfilledCommitments = commitments.filter((c) => c.status === "fulfilled").length;
  const missedFollowups = followups.filter((f) => f.status === "open" && isOverdue(f.due_at)).length;

  const signals: CommunicationSignals = {
    daysSinceContact: daysSince(lastContactAt),
    daysSinceInbound: daysSince(lastInboundAt),
    unansweredMessages: unanswered,
    missedFollowups,
    openCommitments: openCommitments.length,
    overdueCommitments,
    brokenCommitments,
    fulfilledCommitments,
    recentSentiments: events.map((e) => e.sentiment).filter((s): s is string => !!s),
    totalMessages: events.length,
    inboundMessages: inbound.length,
    outboundMessages: outbound.length,
    contactThresholdDays: thresholdFor(entityType),
  };

  const computed = computeCommunicationProfile(signals, entityLabel(entityType));
  await commProfileRepository.upsert({
    org_id: orgId, entity_type: entityType, entity_id: entityId,
    relationship_type: entityType,
    communication_health_score: computed.communication_health_score,
    responsiveness_score: computed.responsiveness_score,
    sentiment_score: computed.sentiment_score,
    followup_risk_score: computed.followup_risk_score,
    trust_impact_score: computed.trust_impact_score,
    engagement_impact_score: computed.engagement_impact_score,
    momentum_impact_score: computed.momentum_impact_score,
    last_contact_at: lastContactAt, last_inbound_at: lastInboundAt, last_outbound_at: lastOutboundAt,
    days_since_contact: signals.daysSinceContact,
    unanswered_messages_count: unanswered, missed_followups_count: missedFollowups,
    open_commitments_count: openCommitments.length,
    next_best_action: computed.next_best_action,
    ai_summary: computed.ai_summary, ai_risk_summary: computed.ai_risk_summary,
    ai_recommendation_summary: computed.ai_recommendation_summary,
  });
}

function entityLabel(t: string): string {
  return t === "seller" ? "מוכר" : t === "buyer" ? "קונה" : t === "property" ? "נכס" : t === "match" ? "התאמה" : t === "deal" ? "עסקה" : t === "lead" ? "ליד" : "ישות";
}

// ── Command-center read model ────────────────────────────────────────────────
export interface CommunicationHealth {
  profile: CommProfileRow | null;
  followups: CommFollowupRow[];
  commitments: CommCommitmentRow[];
  recent: { eventType: string; title: string; channel: string | null; direction: string | null; sentiment: string | null; at: string }[];
  drafts: DraftActions;
  suggestedReply: string;
  detectedCommitments: string[];
}

export async function getCommunicationHealth(entityType: string, entityId: string): Promise<CommunicationHealth> {
  const supabase = await createClient();
  const [profile, followups, commitments, recentRes] = await Promise.all([
    commProfileRepository.get(entityType, entityId),
    commFollowupRepository.listByEntity(entityType, entityId),
    commCommitmentRepository.listByEntity(entityType, entityId),
    supabase.from("activity_events").select("event_type,title,channel,direction,sentiment,occurred_at,description")
      .eq("entity_type", entityType).eq("entity_id", entityId).like("event_type", "communication.%")
      .order("occurred_at", { ascending: false }).limit(10),
  ]);
  const recentRows = recentRes.data ?? [];
  const label = entityLabel(entityType);
  const lastInbound = recentRows.find((r) => r.direction === "inbound");
  const drafts = buildDraftActions(label, profile?.next_best_action ?? "המשך קשר שוטף", profile?.sentiment_score ?? 55);
  const suggestedReply = draftReply(lastInbound?.channel ?? "whatsapp", lastInbound ? "inbound" : "outbound", lastInbound?.sentiment ?? "neutral", label);
  const detectedCommitments = detectCommitments(recentRows[0]?.description ?? null);
  return {
    profile,
    followups: followups.filter((f) => f.status === "open"),
    commitments: commitments.filter((c) => c.status === "open"),
    recent: recentRows.map((r) => ({ eventType: r.event_type, title: r.title, channel: r.channel, direction: r.direction, sentiment: r.sentiment, at: r.occurred_at })),
    drafts, suggestedReply, detectedCommitments,
  };
}

export async function completeFollowup(id: string, entityType?: string, entityId?: string): Promise<void> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  await commFollowupRepository.complete(id);
  // Recompute so health/risk + decision-brain reflect the change immediately.
  if (entityType && entityId) await recomputeCommunicationProfile(entityType, entityId);
}

export async function setCommitmentStatus(id: string, status: "fulfilled" | "broken", entityType?: string, entityId?: string): Promise<void> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  await commCommitmentRepository.setStatus(id, status);
  if (entityType && entityId) await recomputeCommunicationProfile(entityType, entityId);
}

// ── Org-wide reads (dashboard + decision brain) ──────────────────────────────
export interface CommOrgSignals {
  followupsDueToday: { id: string; title: string; entityType: string; entityId: string; dueAt: string | null }[];
  overdueCommitments: { id: string; text: string; entityType: string; entityId: string; dueDate: string | null }[];
  noResponse: { entityType: string; entityId: string; unanswered: number; days: number | null }[];
  negativeSentiment: { entityType: string; entityId: string; sentiment: number }[];
  recent: { eventType: string; title: string; entityType: string; entityId: string; at: string; sentiment: string | null }[];
}

export async function getCommunicationOrgSignals(): Promise<CommOrgSignals> {
  const supabase = await createClient();
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const [followupsRes, commitmentsRes, profilesRes, recentRes] = await Promise.all([
    supabase.from("communication_followups").select("id,title,entity_type,entity_id,due_at").eq("status", "open").not("due_at", "is", null).lte("due_at", endOfToday).order("due_at", { ascending: true }).limit(50),
    supabase.from("communication_commitments").select("id,commitment_text,entity_type,entity_id,due_date").eq("status", "open").not("due_date", "is", null).lt("due_date", now.toISOString()).order("due_date", { ascending: true }).limit(50),
    supabase.from("communication_intelligence_profiles").select("entity_type,entity_id,unanswered_messages_count,days_since_contact,sentiment_score").limit(500),
    supabase.from("activity_events").select("event_type,title,entity_type,entity_id,occurred_at,sentiment").like("event_type", "communication.%").order("occurred_at", { ascending: false }).limit(12),
  ]);

  const profiles = profilesRes.data ?? [];
  return {
    followupsDueToday: (followupsRes.data ?? []).map((f) => ({ id: f.id, title: f.title, entityType: f.entity_type, entityId: f.entity_id, dueAt: f.due_at })),
    overdueCommitments: (commitmentsRes.data ?? []).map((c) => ({ id: c.id, text: c.commitment_text, entityType: c.entity_type, entityId: c.entity_id, dueDate: c.due_date })),
    noResponse: profiles.filter((p) => (p.unanswered_messages_count ?? 0) > 0).map((p) => ({ entityType: p.entity_type, entityId: p.entity_id, unanswered: p.unanswered_messages_count, days: p.days_since_contact })).slice(0, 20),
    negativeSentiment: profiles.filter((p) => (p.sentiment_score ?? 55) < 40).map((p) => ({ entityType: p.entity_type, entityId: p.entity_id, sentiment: p.sentiment_score })).slice(0, 20),
    recent: (recentRes.data ?? []).map((r) => ({ eventType: r.event_type, title: r.title, entityType: r.entity_type, entityId: r.entity_id, at: r.occurred_at, sentiment: r.sentiment })),
  };
}
