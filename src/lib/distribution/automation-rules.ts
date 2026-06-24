// ============================================================================
// ZONO — Distribution automation RULE ENGINE (pure, client + server safe,
// deterministic). Reads real records (mapped by the service) + the computed
// analytics and emits AutomationSignals — alerts, reminders, tasks and
// recommendations. No fabrication: every signal points at a real post / lead /
// campaign. Analytics-derived RECOMMENDATIONS are gated behind data sufficiency
// so we never invent insights from thin data.
// ============================================================================
import type { DistributionAnalytics } from "./analytics-scoring";

export type AutomationType =
  | "auto_repost_reminder"
  | "comment_followup_reminder"
  | "hot_lead_alert"
  | "stale_campaign_alert"
  | "failed_post_alert"
  | "best_group_recommendation"
  | "underperforming_campaign_recommendation"
  | "whatsapp_followup_task";

export const AUTOMATION_TYPES: AutomationType[] = [
  "auto_repost_reminder", "comment_followup_reminder", "hot_lead_alert", "stale_campaign_alert",
  "failed_post_alert", "best_group_recommendation", "underperforming_campaign_recommendation", "whatsapp_followup_task",
];

/** Categories the UI groups signals into. */
export type SignalCategory = "alert" | "task" | "repost" | "hot_lead" | "recommendation";

export interface AutomationConfig {
  repostAfterDays: number;       // published post with no comments → repost
  hotLeadScore: number;          // intent score → hot-lead alert
  leadUnhandledHours: number;    // new lead aging → follow-up task
  commentFollowupDays: number;   // lead comment aging → reply reminder
  staleCampaignDays: number;     // active campaign with no recent posts
  minGroupsCoverage: number;     // campaign group coverage target
}
export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  repostAfterDays: 3, hotLeadScore: 75, leadUnhandledHours: 24,
  commentFollowupDays: 2, staleCampaignDays: 7, minGroupsCoverage: 5,
};

// ── Inputs (mapped from DB rows by the service) ──────────────────────────────
export interface RCampaign { id: string; name: string; status: string; propertyId: string | null }
export interface RPost { id: string; campaignId: string | null; groupId: string | null; propertyId: string | null; status: string; publishedAt: string | null; failureReason: string | null; postTitle: string | null }
export interface RComment { id: string; postId: string | null; isLead: boolean; shouldCreateLead: boolean; handled: boolean; occurredAt: string; leadIntentScore: number }
export interface RLead { id: string; campaignId: string | null; postId: string | null; propertyId: string | null; status: string; intentScore: number; name: string | null; createdAt: string }

export interface RuleInput {
  campaigns: RCampaign[]; posts: RPost[]; comments: RComment[]; leads: RLead[];
  analytics: DistributionAnalytics;
}

export interface AutomationSignal {
  signature: string;            // stable dedupe key
  type: AutomationType;
  category: SignalCategory;
  title: string;
  reason: string;
  campaignId: string | null;
  propertyId: string | null;
  priority: "high" | "medium" | "low";
  nextAction: string;
  createsTask: boolean;
  refKind: "post" | "lead" | "comment" | "campaign" | "group" | null;
  refId: string | null;
  nextRunAt: string | null;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ageMs = (iso: string | null, now: number) => (iso ? now - new Date(iso).getTime() : 0);

/** Compute all automation signals from real data. */
export function computeSignals(input: RuleInput, cfg: AutomationConfig = DEFAULT_AUTOMATION_CONFIG, now: Date = new Date()): { signals: AutomationSignal[]; enough: boolean } {
  const t = now.getTime();
  const { campaigns, posts, comments, leads, analytics } = input;
  const commentsByPost = new Map<string, RComment[]>();
  for (const c of comments) if (c.postId) { const a = commentsByPost.get(c.postId) ?? []; a.push(c); commentsByPost.set(c.postId, a); }
  const signals: AutomationSignal[] = [];

  // 1. hot_lead_alert — high-intent new leads (factual; not gated).
  for (const l of leads) {
    if (l.intentScore >= cfg.hotLeadScore && l.status === "new") {
      signals.push({
        signature: `hot_lead:${l.id}`, type: "hot_lead_alert", category: "hot_lead",
        title: `ליד חם${l.name ? ` — ${l.name}` : ""}`, reason: `ציון כוונת רכישה ${l.intentScore} — דורש מענה מהיר.`,
        campaignId: l.campaignId, propertyId: l.propertyId, priority: "high",
        nextAction: "צור משימת מעקב והשב לליד", createsTask: true, refKind: "lead", refId: l.id, nextRunAt: null,
      });
    }
  }
  // 2. whatsapp_followup_task — new lead aging past the SLA.
  for (const l of leads) {
    if (l.status === "new" && ageMs(l.createdAt, t) > cfg.leadUnhandledHours * HOUR && l.intentScore < cfg.hotLeadScore) {
      signals.push({
        signature: `followup:${l.id}`, type: "whatsapp_followup_task", category: "task",
        title: `ליד שלא טופל${l.name ? ` — ${l.name}` : ""}`, reason: `נוצר לפני יותר מ-${cfg.leadUnhandledHours} שעות ועדיין לא טופל.`,
        campaignId: l.campaignId, propertyId: l.propertyId, priority: "medium",
        nextAction: "צור משימת מעקב וואטסאפ", createsTask: true, refKind: "lead", refId: l.id, nextRunAt: null,
      });
    }
  }
  // 3. failed_post_alert — failed posts → retry task.
  for (const p of posts) {
    if (p.status === "failed") {
      signals.push({
        signature: `failed:${p.id}`, type: "failed_post_alert", category: "task",
        title: `פוסט נכשל${p.postTitle ? ` — ${p.postTitle}` : ""}`, reason: p.failureReason || "הפרסום נכשל.",
        campaignId: p.campaignId, propertyId: p.propertyId, priority: "high",
        nextAction: "תזמן מחדש או פרסם ידנית", createsTask: true, refKind: "post", refId: p.id, nextRunAt: null,
      });
    }
  }
  // 4. auto_repost_reminder — published post, aged, with no comments.
  for (const p of posts) {
    if (p.status === "published" && ageMs(p.publishedAt, t) > cfg.repostAfterDays * DAY && (commentsByPost.get(p.id)?.length ?? 0) === 0) {
      signals.push({
        signature: `repost:${p.id}`, type: "auto_repost_reminder", category: "repost",
        title: `כדאי לפרסם מחדש${p.postTitle ? ` — ${p.postTitle}` : ""}`,
        reason: `פורסם לפני יותר מ-${cfg.repostAfterDays} ימים וללא תגובות — שווה פרסום חוזר.`,
        campaignId: p.campaignId, propertyId: p.propertyId, priority: "medium",
        nextAction: "צור פוסט חוזר לקבוצה", createsTask: true, refKind: "post", refId: p.id,
        nextRunAt: new Date(t + cfg.repostAfterDays * DAY).toISOString(),
      });
    }
  }
  // 5. comment_followup_reminder — lead-worthy comment, unhandled, aging.
  for (const c of comments) {
    if ((c.isLead || c.shouldCreateLead) && !c.handled && ageMs(c.occurredAt, t) > cfg.commentFollowupDays * DAY) {
      signals.push({
        signature: `comment:${c.id}`, type: "comment_followup_reminder", category: "task",
        title: "תגובה שדורשת מענה", reason: `תגובה עם כוונת רכישה שלא טופלה מעל ${cfg.commentFollowupDays} ימים.`,
        campaignId: null, propertyId: null, priority: "medium",
        nextAction: "השב לתגובה וצור ליד", createsTask: true, refKind: "comment", refId: c.id, nextRunAt: null,
      });
    }
  }
  // 6. stale_campaign_alert — active campaign with no recent published post.
  for (const c of campaigns) {
    if (c.status !== "active") continue;
    const cPosts = posts.filter((p) => p.campaignId === c.id && p.status === "published");
    const latest = cPosts.reduce((m, p) => Math.max(m, p.publishedAt ? new Date(p.publishedAt).getTime() : 0), 0);
    if (cPosts.length === 0 || t - latest > cfg.staleCampaignDays * DAY) {
      signals.push({
        signature: `stale:${c.id}`, type: "stale_campaign_alert", category: "alert",
        title: `קמפיין רדום — ${c.name}`, reason: cPosts.length === 0 ? "אין פוסטים שפורסמו בקמפיין." : `לא פורסם פוסט מעל ${cfg.staleCampaignDays} ימים.`,
        campaignId: c.id, propertyId: c.propertyId, priority: "medium",
        nextAction: "תזמן פוסטים חדשים", createsTask: false, refKind: "campaign", refId: c.id, nextRunAt: null,
      });
    }
  }

  // ── Analytics-derived RECOMMENDATIONS (gated behind data sufficiency) ──
  const enough = analytics.sufficiency.enough;
  if (enough) {
    // 7. underperforming_campaign_recommendation — low group coverage.
    for (const c of analytics.campaigns) {
      if (c.published >= 2 && c.groupsUsed < cfg.minGroupsCoverage) {
        signals.push({
          signature: `coverage:${c.id}`, type: "underperforming_campaign_recommendation", category: "recommendation",
          title: `הקמפיין "${c.name}" צריך עוד קבוצות`, reason: `מפוזר על ${c.groupsUsed} קבוצות בלבד — מומלץ להוסיף עוד ${cfg.minGroupsCoverage - c.groupsUsed} קבוצות רלוונטיות באזור.`,
          campaignId: c.id, propertyId: null, priority: "medium",
          nextAction: "הוסף קבוצות לקמפיין", createsTask: false, refKind: "campaign", refId: c.id, nextRunAt: null,
        });
      }
    }
    // 8. best_group_recommendation — surface the top lead-producing group.
    const best = analytics.groups.find((g) => g.leads > 0);
    if (best) {
      signals.push({
        signature: `bestgroup:${best.id}`, type: "best_group_recommendation", category: "recommendation",
        title: `קבוצה מובילה — ${best.name}`, reason: `${best.name} מייצרת לידים טובים יותר (${best.leads} לידים, ${best.conversionRate}% המרה) — תעדף אותה בקמפיינים הבאים.`,
        campaignId: null, propertyId: null, priority: "low",
        nextAction: "שבץ את הקבוצה בקמפיין הבא", createsTask: false, refKind: "group", refId: best.id, nextRunAt: null,
      });
    }
  }

  // hot leads first, then by priority.
  const rank = { high: 0, medium: 1, low: 2 };
  signals.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return { signals, enough };
}
