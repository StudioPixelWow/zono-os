// ============================================================================
// ZONO — Office Intelligence repository (server-only, service-role, org-scoped).
// Aggregated queries only (no N+1): agent metrics from activity_events + tasks +
// radar touchpoints, plus goals / reports / coaching / snapshot persistence.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { clamp } from "./analytics";
import type { AgentMetrics, GoalType, OfficeSnapshotPayload } from "./types";
import type { GoalRow } from "./goals";

type Db = ReturnType<typeof createServiceRoleClient>;
const DAY = 86_400_000;
const startOfTodayIso = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };

function bump(map: Map<string, AgentMetrics>, id: string, name: string): AgentMetrics {
  let m = map.get(id);
  if (!m) {
    m = {
      agentId: id, name, activeListings: 0, listingsContacted: 0, privateListingsContacted: 0,
      exclusiveOpportunitiesHandled: 0, exclusivesSigned: 0, buyerMatchesCreated: 0, perfectMatchesHandled: 0,
      calls: 0, whatsapps: 0, meetings: 0, tasksCompleted: 0, overdueTasks: 0, avgResponseHours: null,
      conversionRate: 0, followUpDiscipline: 1, avgOpportunityScore: 0, avgExclusiveProbability: 0,
      estimatedPipeline: 0, estimatedCommission: 0, trendVsLastWeek: 0, ignoredHotOpportunities: 0, leaderboardScore: 0,
    };
    map.set(id, m);
  }
  return m;
}

export function createOfficeRepository(db: Db = createServiceRoleClient()) {
  return {
    /** Per-agent metrics for the org (today). Aggregated, capped, no N+1. */
    async getAgentMetrics(orgId: string): Promise<AgentMetrics[]> {
      const since = startOfTodayIso();
      const { data: users } = await db.from("users" as never).select("id, full_name, status").eq("org_id", orgId).limit(500);
      const map = new Map<string, AgentMetrics>();
      for (const u of ((users ?? []) as unknown as { id: string; full_name: string }[])) bump(map, u.id, u.full_name ?? "סוכן");

      const { data: acts } = await db.from("activity_events" as never)
        .select("actor_user_id, event_type, channel").eq("org_id", orgId).gte("occurred_at", since).limit(8000);
      for (const a of ((acts ?? []) as unknown as { actor_user_id: string | null; event_type: string; channel: string | null }[])) {
        if (!a.actor_user_id) continue;
        const m = bump(map, a.actor_user_id, "סוכן");
        const t = `${a.event_type} ${a.channel ?? ""}`.toLowerCase();
        if (t.includes("call") || t.includes("שיחה")) m.calls++;
        else if (t.includes("whatsapp") || t.includes("message") || t.includes("וואטסאפ")) m.whatsapps++;
        else if (t.includes("meeting") || t.includes("פגישה")) m.meetings++;
      }

      const { data: tasks } = await db.from("tasks" as never)
        .select("assignee_id, status, due_at").eq("org_id", orgId).limit(8000);
      const now = Date.now();
      for (const t of ((tasks ?? []) as unknown as { assignee_id: string | null; status: string; due_at: string | null }[])) {
        if (!t.assignee_id) continue;
        const m = bump(map, t.assignee_id, "סוכן");
        if (t.status === "done") m.tasksCompleted++;
        else if (["todo", "in_progress"].includes(t.status) && t.due_at && Date.parse(t.due_at) < now) m.overdueTasks++;
      }

      const { data: tps } = await db.from("radar_seller_touchpoints" as never)
        .select("created_by, channel").eq("org_id", orgId).gte("occurred_at", since).limit(8000);
      for (const tp of ((tps ?? []) as unknown as { created_by: string | null; channel: string }[])) {
        if (!tp.created_by) continue;
        const m = bump(map, tp.created_by, "סוכן");
        m.listingsContacted++;
        if (tp.channel === "call") m.calls++; else if (tp.channel === "whatsapp") m.whatsapps++; else if (tp.channel === "meeting") m.meetings++;
      }

      // Derived deterministic fields.
      for (const m of map.values()) {
        const outreach = m.calls + m.whatsapps;
        m.conversionRate = outreach > 0 ? Math.round((m.meetings / outreach) * 100) / 100 : 0;
        const taskTotal = m.tasksCompleted + m.overdueTasks;
        m.followUpDiscipline = taskTotal > 0 ? Math.round(clamp(m.tasksCompleted / taskTotal, 0, 1) * 100) / 100 : 1;
      }
      // Only agents with any signal (keep table meaningful), else all.
      const all = [...map.values()];
      const active = all.filter((m) => m.calls + m.whatsapps + m.meetings + m.tasksCompleted + m.overdueTasks + m.listingsContacted > 0);
      return (active.length ? active : all).slice(0, 500);
    },

    /** Market-share rows: office listings + monitored external listings per city. */
    async getMarketShareRows(orgId: string): Promise<{ city: string; officeListings: number; monitoredListings: number }[]> {
      const { data: cityRows } = await db.from("user_operating_localities" as never)
        .select("city_name").eq("organization_id", orgId).eq("is_active", true);
      const cities = [...new Set(((cityRows ?? []) as unknown as { city_name: string | null }[]).map((r) => (r.city_name ?? "").trim()).filter(Boolean))].slice(0, 12);
      const out: { city: string; officeListings: number; monitoredListings: number }[] = [];
      for (const city of cities) {
        const [{ count: office }, { count: monitored }] = await Promise.all([
          db.from("properties" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("city", city),
          db.from("market_property_sources" as never).select("id", { count: "exact", head: true }).eq("city", city).eq("source_status", "active"),
        ]);
        out.push({ city, officeListings: office ?? 0, monitoredListings: monitored ?? 0 });
      }
      return out;
    },

    async dealsInProgress(orgId: string): Promise<number> {
      const { count } = await db.from("deals" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).not("status", "in", "(won,lost,closed)" as never);
      return count ?? 0;
    },

    // ── Goals ──────────────────────────────────────────────────────────────
    async listGoals(orgId: string): Promise<GoalRow[]> {
      const { data } = await db.from("office_goals" as never).select("id, goal_type, period, target_value, current_value, starts_at, ends_at, owner_user_id, status").eq("org_id", orgId).eq("status", "active").limit(100);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id), goalType: String(r.goal_type) as GoalType, period: String(r.period) as GoalRow["period"],
        target: Number(r.target_value ?? 0), current: Number(r.current_value ?? 0),
        startsAt: (r.starts_at as string | null) ?? null, endsAt: (r.ends_at as string | null) ?? null, ownerName: null,
      }));
    },
    async upsertGoal(orgId: string, input: { id?: string; goalType: GoalType; period: string; target: number; startsAt: string | null; endsAt: string | null }): Promise<void> {
      if (input.id) {
        await db.from("office_goals" as never).update({ goal_type: input.goalType, period: input.period, target_value: input.target, starts_at: input.startsAt, ends_at: input.endsAt } as never).eq("id", input.id).eq("org_id", orgId);
      } else {
        await db.from("office_goals" as never).insert({ org_id: orgId, goal_type: input.goalType, period: input.period, target_value: input.target, starts_at: input.startsAt, ends_at: input.endsAt } as never);
      }
    },
    async archiveGoal(orgId: string, id: string): Promise<void> {
      await db.from("office_goals" as never).update({ status: "archived" } as never).eq("id", id).eq("org_id", orgId);
    },

    // ── Coaching persistence (best-effort) ──────────────────────────────────
    async replaceCoachingItems(orgId: string, items: { agentId: string | null; itemType: string; severity: string; title: string; message: string; recommendedAction: string }[]): Promise<void> {
      await db.from("office_coaching_items" as never).delete().eq("org_id", orgId).eq("status", "open");
      if (items.length === 0) return;
      await db.from("office_coaching_items" as never).insert(items.map((i) => ({ org_id: orgId, agent_id: i.agentId, item_type: i.itemType, severity: i.severity, title: i.title, message: i.message, recommended_action: i.recommendedAction })) as never);
    },

    // ── Snapshots ───────────────────────────────────────────────────────────
    async getLatestSnapshot(orgId: string, period: string, beforeDate: string): Promise<OfficeSnapshotPayload | null> {
      const { data } = await db.from("office_intelligence_snapshots" as never)
        .select("kpis, agent_metrics, risk_items, opportunities, forecasts, benchmarks")
        .eq("org_id", orgId).eq("period", period).lt("snapshot_date", beforeDate).order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
      const r = data as Record<string, unknown> | null;
      if (!r) return null;
      return {
        kpis: (r.kpis ?? {}) as OfficeSnapshotPayload["kpis"], agentMetrics: (r.agent_metrics ?? []) as AgentMetrics[],
        riskItems: (r.risk_items ?? []) as OfficeSnapshotPayload["riskItems"], opportunities: (r.opportunities ?? []) as OfficeSnapshotPayload["opportunities"],
        forecasts: (r.forecasts ?? {}) as OfficeSnapshotPayload["forecasts"], benchmarks: (r.benchmarks ?? []) as OfficeSnapshotPayload["benchmarks"],
      };
    },
    async saveSnapshot(orgId: string, period: string, payload: OfficeSnapshotPayload): Promise<void> {
      const today = new Date().toISOString().slice(0, 10);
      await db.from("office_intelligence_snapshots" as never).upsert({
        org_id: orgId, snapshot_date: today, period,
        kpis: payload.kpis as unknown as Record<string, unknown>, agent_metrics: payload.agentMetrics as unknown as Record<string, unknown>,
        risk_items: payload.riskItems as unknown as Record<string, unknown>, opportunities: payload.opportunities as unknown as Record<string, unknown>,
        forecasts: payload.forecasts as unknown as Record<string, unknown>, benchmarks: payload.benchmarks as unknown as Record<string, unknown>,
      } as never, { onConflict: "org_id,snapshot_date,period" });
    },

    // ── Reports ───────────────────────────────────────────────────────────
    async createReport(orgId: string, userId: string, input: { reportType: string; title: string; dateFrom: string | null; dateTo: string | null; payload: Record<string, unknown> }): Promise<string> {
      const { data } = await db.from("office_reports" as never).insert({
        org_id: orgId, report_type: input.reportType, title: input.title, status: "generated",
        date_from: input.dateFrom, date_to: input.dateTo, payload: input.payload, created_by: userId,
      } as never).select("id").single();
      return (data as { id: string } | null)?.id ?? "";
    },

    db,
  };
}

export const officeStartOfTodayIso = startOfTodayIso;
export const OFFICE_DAY_MS = DAY;
