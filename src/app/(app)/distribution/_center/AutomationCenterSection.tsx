"use client";

// ============================================================================
// ZONO — מרכז אוטומציה (Phase 9). Consumes the real AutomationBoard assembled by
// the rule engine. On-demand (manual) runs only — no cron. Nothing fabricated:
// every card points at a real post / lead / campaign signal.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AutomationBoard, AutomationCard } from "@/lib/distribution/distribution-automation-service";
import type { AutomationType } from "@/lib/distribution/automation-rules";
import {
  runDistributionAutomationCheckAction,
  createDistributionAutomationAction,
  updateDistributionAutomationAction,
  disableDistributionAutomationAction,
  markAutomationHandledAction,
} from "@/lib/distribution/distribution-automation-actions";
import { Glass, SectionHeading, StatTile, EmptyState, Toggle, Icon } from "./shared";
import { cn } from "@/lib/utils";
import type { RunAction } from "./DistributionCenterView";

const TYPE_META: Record<AutomationType, { label: string; icon: string }> = {
  auto_repost_reminder: { label: "פרסום חוזר", icon: "RefreshCw" },
  comment_followup_reminder: { label: "מענה לתגובות", icon: "MessageCircle" },
  hot_lead_alert: { label: "ליד חם", icon: "Flame" },
  stale_campaign_alert: { label: "קמפיין רדום", icon: "AlertTriangle" },
  failed_post_alert: { label: "פוסט שנכשל", icon: "AlertTriangle" },
  best_group_recommendation: { label: "קבוצה מובילה", icon: "Users" },
  underperforming_campaign_recommendation: { label: "שיפור קמפיין", icon: "TrendingUp" },
  whatsapp_followup_task: { label: "מעקב וואטסאפ", icon: "ListChecks" },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  high: { label: "עדיפות גבוהה", cls: "bg-danger-soft text-danger" },
  medium: { label: "עדיפות בינונית", cls: "bg-warning-soft text-warning" },
  low: { label: "עדיפות נמוכה", cls: "bg-line/70 text-muted" },
};

function typeMeta(type: AutomationType) {
  return TYPE_META[type] ?? { label: type, icon: "Sparkles" };
}

// ── Generated signal card ────────────────────────────────────────────────────
function SignalCard({ card, runAction, pending }: { card: AutomationCard; runAction: RunAction; pending: boolean }) {
  const tm = typeMeta(card.type);
  const pm = PRIORITY_META[card.priority] ?? PRIORITY_META.medium;
  return (
    <Glass className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="zono-ai-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white">
            <Icon name={tm.icon} size={18} />
          </span>
          <div>
            <p className="text-ink text-sm font-extrabold">{card.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="bg-brand-soft text-brand-strong inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">{tm.label}</span>
              <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", pm.cls)}>{pm.label}</span>
              {card.taskId && (
                <span className="bg-success-soft text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold">
                  <Icon name="Check" size={11} /> נוצרה משימה
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {card.reason && <p className="text-muted text-[13px] font-medium leading-relaxed">{card.reason}</p>}

      <div className="border-line text-muted flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2.5 text-[11px] font-semibold">
        {card.campaignName && (
          <span className="inline-flex items-center gap-1"><Icon name="Megaphone" size={12} /> {card.campaignName}</span>
        )}
        {card.nextAction && (
          <span className="text-brand-strong inline-flex items-center gap-1"><Icon name="ArrowUpRight" size={12} /> {card.nextAction}</span>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => runAction(() => markAutomationHandledAction({ id: card.id }), "סומן כטופל")}
          className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition disabled:opacity-50"
        >
          <Icon name="BadgeCheck" size={16} /> סמן כטופל
        </button>
      </div>
    </Glass>
  );
}

// ── A signals panel (Glass + heading + empty state) ──────────────────────────
function SignalsPanel({
  title, subtitle, icon, cards, emptyBody, runAction, pending,
}: {
  title: string; subtitle: string; icon: string; cards: AutomationCard[];
  emptyBody: string; runAction: RunAction; pending: boolean;
}) {
  return (
    <Glass className="flex flex-col gap-4 p-5">
      <SectionHeading title={title} subtitle={subtitle} icon={icon} />
      {cards.length === 0 ? (
        <EmptyState icon={icon} title="אין פריטים כרגע" body={emptyBody} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((c) => <SignalCard key={c.id} card={c} runAction={runAction} pending={pending} />)}
        </div>
      )}
    </Glass>
  );
}

export function AutomationCenterSection({
  board,
  runAction,
  pending,
}: {
  board: AutomationBoard;
  runAction: RunAction;
  pending: boolean;
}) {
  const router = useRouter();
  const [checking, startCheck] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function runCheck() {
    startCheck(async () => {
      const res = await runDistributionAutomationCheckAction();
      if (res.error) setToast(res.error);
      else setToast(`בדיקת אוטומציות הושלמה — נוצרו ${res.created ?? 0} סיגנלים ו-${res.tasksCreated ?? 0} משימות`);
      router.refresh();
      setTimeout(() => setToast(null), 5000);
    });
  }

  const busy = pending || checking;

  const hasAnything =
    board.activeAutomations.length > 0 ||
    board.suggestedAutomations.length > 0 ||
    board.alerts.length > 0 ||
    board.followUpTasks.length > 0 ||
    board.repostReminders.length > 0 ||
    board.hotLeadAlerts.length > 0 ||
    board.recommendations.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="מרכז אוטומציה"
        subtitle="מנוע הכללים של ההפצה — התראות, תזכורות, משימות והמלצות מתוך הנתונים האמיתיים"
        icon="Sparkles"
        action={
          <button
            type="button"
            disabled={busy}
            onClick={runCheck}
            className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <Icon name="RefreshCw" size={16} /> הפעל בדיקת אוטומציות
          </button>
        }
      />

      <Glass className="zono-glass-dark flex items-start gap-2.5 rounded-2xl p-4">
        <Icon name="ShieldCheck" size={18} className="text-brand-strong mt-0.5 shrink-0" />
        <p className="text-ink text-[13px] font-semibold leading-relaxed">
          האוטומציות פועלות לפי דרישה (הפעלה ידנית) — לא לפי לוח זמנים. הפעלת הבדיקה מריצה את מנוע הכללים על הנתונים האמיתיים, יוצרת משימות אמיתיות לסיגנלים שדורשים פעולה, ולא מפרסמת דבר ללא אישורך.
        </p>
      </Glass>

      {toast && <div className="zono-glass text-ink rounded-2xl px-4 py-3 text-sm font-semibold">{toast}</div>}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="אוטומציות פעילות" value={String(board.counts.active)} icon="Sparkles" tone="brand" />
        <StatTile label="התראות" value={String(board.counts.alerts)} icon="AlertTriangle" tone="danger" />
        <StatTile label="משימות מעקב" value={String(board.counts.tasks)} icon="ListChecks" tone="warning" />
        <StatTile label="פרסום חוזר" value={String(board.counts.reposts)} icon="RefreshCw" tone="accent" />
        <StatTile label="לידים חמים" value={String(board.counts.hotLeads)} icon="Flame" tone="danger" />
        <StatTile label="המלצות" value={String(board.counts.recommendations)} icon="TrendingUp" tone="success" />
      </div>

      {!board.enough && !hasAnything ? (
        <EmptyState
          icon="Sparkles"
          title="עדיין אין מספיק נתונים להפעלת אוטומציות חכמות"
          body="פרסם פוסטים וייבא תגובות תחילה — לאחר מכן הפעל את בדיקת האוטומציות כדי לקבל התראות, תזכורות והמלצות מבוססות נתונים אמיתיים."
        />
      ) : (
        <>
          {/* Active user automations */}
          <Glass className="flex flex-col gap-4 p-5">
            <SectionHeading title="אוטומציות פעילות" subtitle="כללי אוטומציה שהפעלת" icon="Sparkles" />
            {board.activeAutomations.length === 0 ? (
              <EmptyState icon="Sparkles" title="אין אוטומציות פעילות" body="הפעל אוטומציה מהרשימה המוצעת למטה כדי להתחיל." />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {board.activeAutomations.map((a) => {
                  const tm = typeMeta(a.type);
                  return (
                    <Glass key={a.id} className="flex items-start justify-between gap-3 p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="zono-ai-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white">
                          <Icon name={tm.icon} size={18} />
                        </span>
                        <div>
                          <p className="text-ink text-sm font-extrabold">{a.title}</p>
                          <span className="bg-brand-soft text-brand-strong mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">{tm.label}</span>
                        </div>
                      </div>
                      <Toggle
                        on={a.isEnabled}
                        disabled={busy}
                        onChange={() =>
                          a.isEnabled
                            ? runAction(() => disableDistributionAutomationAction({ id: a.id }), "האוטומציה הושבתה")
                            : runAction(() => updateDistributionAutomationAction({ id: a.id, enabled: true }), "האוטומציה הופעלה")
                        }
                      />
                    </Glass>
                  );
                })}
              </div>
            )}
          </Glass>

          {/* Suggested automations */}
          <Glass className="flex flex-col gap-4 p-5">
            <SectionHeading title="אוטומציות מוצעות" subtitle="הפעל כללי אוטומציה נוספים" icon="Plus" />
            {board.suggestedAutomations.length === 0 ? (
              <EmptyState icon="BadgeCheck" title="כל האוטומציות פעילות" body="הפעלת את כל סוגי האוטומציה הזמינים." />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {board.suggestedAutomations.map((s) => {
                  const tm = typeMeta(s.type);
                  return (
                    <Glass key={s.type} className="flex flex-col gap-3 p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-brand-soft text-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                          <Icon name={tm.icon} size={18} />
                        </span>
                        <p className="text-ink text-sm font-extrabold">{s.title}</p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction(() => createDistributionAutomationAction({ automationType: s.type, name: s.title }), "האוטומציה הופעלה")}
                        className="btn-zono-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        <Icon name="Plus" size={16} /> הפעל
                      </button>
                    </Glass>
                  );
                })}
              </div>
            )}
          </Glass>

          {/* Signal panels */}
          <SignalsPanel
            title="התראות" subtitle="קמפיינים רדומים ופוסטים שנכשלו" icon="AlertTriangle"
            cards={board.alerts} emptyBody="אין התראות פתוחות כרגע." runAction={runAction} pending={busy}
          />
          <SignalsPanel
            title="לידים חמים" subtitle="לידים עם כוונת רכישה גבוהה" icon="Flame"
            cards={board.hotLeadAlerts} emptyBody="אין לידים חמים שדורשים מענה כרגע." runAction={runAction} pending={busy}
          />
          <SignalsPanel
            title="משימות מעקב" subtitle="לידים ותגובות שדורשים מעקב" icon="ListChecks"
            cards={board.followUpTasks} emptyBody="אין משימות מעקב פתוחות כרגע." runAction={runAction} pending={busy}
          />
          <SignalsPanel
            title="תזכורות פרסום חוזר" subtitle="פוסטים ששווה לפרסם מחדש" icon="RefreshCw"
            cards={board.repostReminders} emptyBody="אין תזכורות פרסום חוזר כרגע." runAction={runAction} pending={busy}
          />
          <SignalsPanel
            title="המלצות ביצועים" subtitle="המלצות מבוססות אנליטיקה" icon="TrendingUp"
            cards={board.recommendations} emptyBody="אין המלצות זמינות — הפעל בדיקה לאחר צבירת נתונים." runAction={runAction} pending={busy}
          />
        </>
      )}
    </div>
  );
}
