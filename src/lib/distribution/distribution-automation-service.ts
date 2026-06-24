// ============================================================================
// ZONO — Distribution AUTOMATION service (server-only). Runs the rule engine on
// real records (manual trigger — no cron), persists new signals, creates REAL
// tasks for actionable ones, and assembles the Automation Center board. Nothing
// publishes to Facebook; nothing is fabricated.
// ============================================================================
import "server-only";
import { distributionAutomationRepository, type AutomationMeta } from "./distribution-automation-repository";
import { distributionAnalyticsRepository } from "./distribution-analytics-repository";
import { computeAnalytics } from "./analytics-scoring";
import {
  computeSignals, AUTOMATION_TYPES, type AutomationType, type RuleInput, type AutomationSignal,
} from "./automation-rules";
import type { DistAutomationRow } from "./db-types";

const TYPE_LABEL: Record<AutomationType, string> = {
  auto_repost_reminder: "תזכורת פרסום חוזר",
  comment_followup_reminder: "תזכורת מענה לתגובה",
  hot_lead_alert: "התראת ליד חם",
  stale_campaign_alert: "התראת קמפיין רדום",
  failed_post_alert: "התראת פוסט שנכשל",
  best_group_recommendation: "המלצת קבוצה מובילה",
  underperforming_campaign_recommendation: "המלצת שיפור קמפיין",
  whatsapp_followup_task: "משימת מעקב וואטסאפ",
};

export interface AutomationCard {
  id: string; type: AutomationType; title: string; reason: string; campaignId: string | null; campaignName: string | null;
  propertyId: string | null; priority: string; nextAction: string; category: string; handled: boolean; taskId: string | null;
  isEnabled: boolean; status: string; source: "user" | "generated";
}
export interface AutomationBoard {
  activeAutomations: AutomationCard[];
  suggestedAutomations: { type: AutomationType; title: string }[];
  alerts: AutomationCard[]; followUpTasks: AutomationCard[]; repostReminders: AutomationCard[];
  hotLeadAlerts: AutomationCard[]; recommendations: AutomationCard[];
  counts: { active: number; alerts: number; tasks: number; reposts: number; hotLeads: number; recommendations: number };
  enough: boolean;
}

async function buildRuleInput(): Promise<{ input: RuleInput; hasData: boolean }> {
  const d = await distributionAnalyticsRepository.fetchDatasets();
  const analytics = computeAnalytics({
    campaigns: d.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    groups: d.groups.map((g) => ({ id: g.id, name: g.name, city: g.city, members: g.members_count })),
    posts: d.posts.map((p) => ({ id: p.id, campaignId: p.campaign_id, groupId: p.group_id, variationId: p.variation_id, status: p.status, failureReason: p.failure_reason })),
    variations: d.variations.map((v) => ({ id: v.id, campaignId: v.campaign_id, angle: v.angle, cta: v.cta, headline: v.headline })),
    comments: d.comments.map((c) => ({ id: c.id, postId: c.post_id, groupId: c.group_id, category: c.category, sentiment: c.sentiment, leadIntentScore: c.lead_intent_score, isLead: c.is_lead, leadId: c.lead_id })),
    leads: d.leads.map((l) => ({ id: l.id, campaignId: l.campaign_id, postId: l.post_id, groupId: l.group_id, status: l.status, intentScore: l.intent_score })),
  });
  const input: RuleInput = {
    campaigns: d.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, propertyId: c.property_id })),
    posts: d.posts.map((p) => ({ id: p.id, campaignId: p.campaign_id, groupId: p.group_id, propertyId: p.property_id, status: p.status, publishedAt: p.published_at, failureReason: p.failure_reason, postTitle: p.post_title })),
    comments: d.comments.map((c) => ({ id: c.id, postId: c.post_id, isLead: c.is_lead, shouldCreateLead: c.should_create_lead, handled: c.handled, occurredAt: c.occurred_at, leadIntentScore: c.lead_intent_score })),
    leads: d.leads.map((l) => ({ id: l.id, campaignId: l.campaign_id, postId: l.post_id, propertyId: l.property_id, status: l.status, intentScore: l.intent_score, name: l.name, createdAt: l.created_at })),
    analytics,
  };
  return { input, hasData: d.posts.length > 0 || d.leads.length > 0 || d.campaigns.length > 0 };
}

function toCard(row: DistAutomationRow, campaignName: (id: string | null) => string | null): AutomationCard {
  const m = (row.metadata ?? {}) as unknown as AutomationMeta;
  return {
    id: row.id, type: row.automation_type as AutomationType, title: row.name, reason: m.reason ?? row.description ?? "",
    campaignId: row.campaign_id, campaignName: campaignName(row.campaign_id), propertyId: m.propertyId ?? null,
    priority: m.priority ?? "medium", nextAction: m.nextAction ?? "", category: m.category ?? "alert",
    handled: Boolean(m.handled), taskId: m.taskId ?? null, isEnabled: row.is_enabled, status: row.status,
    source: m.source === "user" ? "user" : "generated",
  };
}

export const distributionAutomationService = {
  /** MANUAL run of the rule engine → persist new signals + create real tasks. */
  async runChecks(): Promise<{ created: number; tasksCreated: number; enough: boolean }> {
    const { input, hasData } = await buildRuleInput();
    if (!hasData) return { created: 0, tasksCreated: 0, enough: false };
    const { signals } = computeSignals(input);
    const existing = await distributionAutomationRepository.existingSignatures();
    const fresh = signals.filter((s) => !existing.has(s.signature));
    if (!fresh.length) { await distributionAutomationRepository.stampRun(); return { created: 0, tasksCreated: 0, enough: input.analytics.sufficiency.enough }; }

    // Create real tasks for actionable signals, then persist signal rows with taskId.
    let tasksCreated = 0;
    const withTasks: (AutomationSignal & { taskId?: string | null })[] = [];
    for (const sig of fresh) {
      let taskId: string | null = null;
      if (sig.createsTask) {
        taskId = await distributionAutomationRepository.createTask({
          title: sig.title, description: `${sig.reason}\n${sig.nextAction}`,
          priority: sig.priority, propertyId: sig.propertyId,
          entityKind: sig.refKind ? `distribution_${sig.refKind}` : null, entityId: sig.refId,
          dueInHours: sig.type === "hot_lead_alert" ? 4 : 24,
        });
        if (taskId) tasksCreated++;
      }
      withTasks.push({ ...sig, taskId });
    }
    const inserted = await distributionAutomationRepository.insertGenerated(withTasks);
    await distributionAutomationRepository.stampRun();
    return { created: inserted.length, tasksCreated, enough: input.analytics.sufficiency.enough };
  },

  /** Assemble the Automation Center board from persisted rows (+ empty-state flag). */
  async board(): Promise<AutomationBoard> {
    const [rows, { input, hasData }] = await Promise.all([
      distributionAutomationRepository.listAll(),
      buildRuleInput(),
    ]);
    const nameById = new Map(input.campaigns.map((c) => [c.id, c.name]));
    const campaignName = (id: string | null) => (id ? nameById.get(id) ?? null : null);

    const cards = rows.map((r) => toCard(r, campaignName));
    const userRules = cards.filter((c) => c.source === "user");
    const generated = cards.filter((c) => c.source === "generated" && !c.handled);

    const activeTypes = new Set(userRules.map((r) => r.type));
    const suggestedAutomations = AUTOMATION_TYPES.filter((t) => !activeTypes.has(t)).map((t) => ({ type: t, title: TYPE_LABEL[t] }));

    const byCat = (cat: string) => generated.filter((c) => c.category === cat);
    const board: AutomationBoard = {
      activeAutomations: userRules,
      suggestedAutomations,
      alerts: byCat("alert"),
      followUpTasks: byCat("task"),
      repostReminders: byCat("repost"),
      hotLeadAlerts: byCat("hot_lead"),
      recommendations: byCat("recommendation"),
      counts: {
        active: userRules.filter((r) => r.isEnabled).length, alerts: byCat("alert").length, tasks: byCat("task").length,
        reposts: byCat("repost").length, hotLeads: byCat("hot_lead").length, recommendations: byCat("recommendation").length,
      },
      enough: hasData,
    };
    return board;
  },
};
