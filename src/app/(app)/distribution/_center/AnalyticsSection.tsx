"use client";

// ============================================================================
// ZONO — Distribution Analytics (Phase 8). Renders ONLY real computed analytics
// from the DistributionAnalytics payload. No mock data, no static charts — every
// number is sourced from the payload, with honest empty / "needs more data"
// states. CSS/flex bars only (no chart library).
// ============================================================================
import type { DistributionAnalytics, Recommendation } from "@/lib/distribution/analytics-scoring";
import {
  recalculateGroupScoresAction,
  recalculateCampaignScoresAction,
  recalculateVariationScoresAction,
} from "@/lib/distribution/distribution-analytics-actions";
import { cn } from "@/lib/utils";
import type { RunAction } from "./DistributionCenterView";
import {
  Glass, StatTile, SectionHeading, EmptyState, Icon, ScoreBar,
  nfmt, compact, pct,
} from "./shared";

const NEEDS_DATA = "נדרשים עוד נתונים אמיתיים לתובנות מהימנות";

// Recommendation tone → styles (using Icon-registry icons only).
const REC_TONE: Record<Recommendation["type"], { wrap: string; icon: string; bar: string }> = {
  win: { wrap: "bg-success-soft text-success", icon: "BadgeCheck", bar: "border-success/40" },
  warn: { wrap: "bg-warning-soft text-warning", icon: "AlertTriangle", bar: "border-warning/40" },
  action: { wrap: "bg-brand-soft text-brand-strong", icon: "Target", bar: "border-brand/40" },
  info: { wrap: "bg-line/60 text-muted", icon: "Sparkles", bar: "border-line" },
};

function Caption({ text }: { text: string }) {
  return (
    <div className="text-muted flex items-center gap-1.5 text-xs font-semibold">
      <Icon name="AlertTriangle" size={13} /> {text}
    </div>
  );
}

function Panel({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeading title={title} subtitle={subtitle} icon={icon} />
      {children}
    </div>
  );
}

export function AnalyticsSection({
  analytics,
  runAction,
  pending,
}: {
  analytics: DistributionAnalytics;
  runAction: RunAction;
  pending: boolean;
}) {
  const { summary, campaigns, groups, cities, variations, ctas, funnel, failed, recommendations, sufficiency } = analytics;
  const enough = sufficiency.enough;

  // Funnel maximum for proportional bars.
  const funnelStages = [
    { label: "פורסם", value: funnel.published, icon: "Send", tone: "bg-brand" },
    { label: "תגובות", value: funnel.comments, icon: "MessageCircle", tone: "bg-sky-500" },
    { label: "לידים", value: funnel.leads, icon: "UserPlus", tone: "bg-warning" },
    { label: "לידים חמים", value: funnel.hotLeads, icon: "Flame", tone: "bg-danger" },
    { label: "הומרו", value: funnel.converted, icon: "Handshake", tone: "bg-success" },
  ];
  const funnelMax = Math.max(1, ...funnelStages.map((s) => s.value));

  const topVariations = variations.slice(0, 10);

  return (
    <div className="flex flex-col gap-7">
      <SectionHeading
        title="אנליטיקה"
        subtitle="ביצועי הפצה אמיתיים — קמפיינים, קבוצות, ערים, וריאציות, משפך לידים והמלצות"
        icon="BarChart3"
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending}
              onClick={() => runAction(recalculateGroupScoresAction, "ניקוד הקבוצות חושב מחדש")}
              className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-60">
              <Icon name="Calculator" size={14} /> חשב ניקוד קבוצות
            </button>
            <button type="button" disabled={pending}
              onClick={() => runAction(recalculateCampaignScoresAction, "ניקוד הקמפיינים חושב מחדש")}
              className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-60">
              <Icon name="Calculator" size={14} /> חשב ניקוד קמפיינים
            </button>
            <button type="button" disabled={pending}
              onClick={() => runAction(recalculateVariationScoresAction, "ניקוד הוריאציות חושב מחדש")}
              className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-60">
              <Icon name="Calculator" size={14} /> חשב ניקוד וריאציות
            </button>
          </div>
        }
      />

      {/* Needs-more-data banner */}
      {!enough && (
        <Glass className="border-warning/30 flex items-start gap-3 border p-4">
          <span className="bg-warning-soft text-warning grid h-10 w-10 shrink-0 place-items-center rounded-xl">
            <Icon name="AlertTriangle" size={19} />
          </span>
          <div>
            <p className="text-ink text-sm font-extrabold">נדרשים עוד נתונים אמיתיים</p>
            <p className="text-muted mt-0.5 text-sm">{sufficiency.note || "אין מספיק נתונים אמיתיים עדיין."}</p>
            <p className="text-muted mt-1 text-xs font-semibold">
              {nfmt(sufficiency.publishedPosts)} פוסטים שפורסמו · {nfmt(sufficiency.comments)} תגובות
            </p>
          </div>
        </Glass>
      )}

      {/* 1 — Executive summary (real raw counts; always shown) */}
      <Panel title="סיכום מנהלים" subtitle="מדדי מפתח מצטברים" icon="BarChart3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="קמפיינים" value={nfmt(summary.totalCampaigns)} icon="Megaphone" tone="brand" />
          <StatTile label="קבוצות בשימוש" value={nfmt(summary.totalGroupsUsed)} icon="Users" tone="brand" />
          <StatTile label="פורסמו" value={nfmt(summary.publishedPosts)} hint="פוסטים" icon="Send" tone="success" />
          <StatTile label="מתוזמנים" value={nfmt(summary.scheduledPosts)} hint="בתור" icon="Clock" tone="accent" />
          <StatTile label="נכשלו" value={nfmt(summary.failedPosts)} hint="פרסומים" icon="AlertTriangle" tone={summary.failedPosts > 0 ? "danger" : "success"} />
          <StatTile label="תגובות" value={compact(summary.importedComments)} hint="יובאו" icon="MessageCircle" tone="warning" />
          <StatTile label="לידים" value={nfmt(summary.detectedLeads)} hint="זוהו" icon="UserPlus" tone="brand" />
          <StatTile label="לידים חמים" value={nfmt(summary.hotLeads)} hint="כוונה גבוהה" icon="Flame" tone="danger" />
          <StatTile label="המרה" value={pct(summary.conversionRate)} hint="תגובות ← לידים" icon="TrendingUp" tone={summary.conversionRate >= 5 ? "success" : "warning"} />
          <StatTile label="כוונה ממוצעת" value={nfmt(summary.avgLeadIntentScore)} hint="ניקוד ליד" icon="Target" tone="brand" />
          <StatTile label="הצלחת פרסום" value={pct(summary.publishingSuccessRate)} hint="פורסם / נשלח" icon="BadgeCheck" tone={summary.publishingSuccessRate >= 80 ? "success" : "warning"} />
        </div>
      </Panel>

      {/* 2 — Campaign leaderboard */}
      <Panel title="טבלת קמפיינים" subtitle="דירוג לפי ביצועים" icon="Megaphone">
        {!enough && <Caption text={NEEDS_DATA} />}
        {campaigns.length === 0 ? (
          <EmptyState icon="Megaphone" title="אין עדיין קמפיינים מדורגים" body="לאחר שקמפיינים יפרסמו פוסטים ויאספו תגובות — הם יופיעו כאן מדורגים לפי ביצועים." />
        ) : (
          <Glass className="flex flex-col divide-y divide-line/60 p-0">
            {campaigns.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-muted w-6 shrink-0 text-sm font-black tabular-nums">{i + 1}</span>
                <div className="min-w-[140px] flex-1">
                  <p className="text-ink truncate text-sm font-extrabold">{c.name}</p>
                  <p className="text-muted text-[11px] font-medium">{nfmt(c.published)} פורסמו · {nfmt(c.groupsUsed)} קבוצות</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <Metric label="לידים" value={pct(c.leadRate)} />
                  <Metric label="תגובות" value={pct(c.commentRate)} />
                  <Metric label="לידים" value={nfmt(c.leads)} />
                </div>
                <ScoreBar value={c.score} width="w-20" />
              </div>
            ))}
          </Glass>
        )}
      </Panel>

      {/* 3 — Group leaderboard */}
      <Panel title="טבלת קבוצות" subtitle="דירוג לפי ביצועים" icon="Users">
        {!enough && <Caption text={NEEDS_DATA} />}
        {groups.length === 0 ? (
          <EmptyState icon="Users" title="אין עדיין קבוצות מדורגות" body="לאחר פרסום בקבוצות ואיסוף תגובות — הקבוצות יופיעו כאן מדורגות." />
        ) : (
          <Glass className="flex flex-col divide-y divide-line/60 p-0">
            {groups.map((g, i) => (
              <div key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-muted w-6 shrink-0 text-sm font-black tabular-nums">{i + 1}</span>
                <div className="min-w-[140px] flex-1">
                  <p className="text-ink truncate text-sm font-extrabold">{g.name}</p>
                  <p className="text-muted text-[11px] font-medium">
                    {g.city ?? "—"}{g.failed > 0 ? ` · ${nfmt(g.failed)} נכשלו` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <Metric label="תגובות" value={nfmt(g.comments)} />
                  <Metric label="לידים" value={nfmt(g.leads)} />
                  <Metric label="המרה" value={pct(g.conversionRate)} />
                  <Metric label="כוונה" value={nfmt(g.avgIntent)} />
                </div>
                <ScoreBar value={g.score} width="w-20" />
              </div>
            ))}
          </Glass>
        )}
      </Panel>

      {/* 4 — City performance */}
      <Panel title="ביצועים לפי עיר" subtitle="שיעור לידים לפי אזור" icon="MapPin">
        {!enough && <Caption text={NEEDS_DATA} />}
        {cities.length === 0 ? (
          <EmptyState icon="MapPin" title="אין עדיין נתוני ערים" body="כשקבוצות עם עיר מוגדרת יאספו תגובות ולידים — הביצועים יופיעו כאן לפי עיר." />
        ) : (
          <Glass className="flex flex-col divide-y divide-line/60 p-0">
            {cities.map((c) => (
              <div key={c.city} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[120px] flex-1">
                  <p className="text-ink text-sm font-extrabold">{c.city}</p>
                  <p className="text-muted text-[11px] font-medium">{nfmt(c.groups)} קבוצות</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <Metric label="תגובות" value={nfmt(c.comments)} />
                  <Metric label="לידים" value={nfmt(c.leads)} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-line/70 h-1.5 w-20 overflow-hidden rounded-full">
                    <div className="bg-brand h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, c.leadRate))}%` }} />
                  </div>
                  <span className="text-brand-strong text-xs font-bold tabular-nums">{pct(c.leadRate)}</span>
                </div>
              </div>
            ))}
          </Glass>
        )}
      </Panel>

      {/* 5 — Variation performance */}
      <Panel title="ביצועי וריאציות" subtitle="עד 10 הוריאציות המובילות" icon="Sparkles">
        {!enough && <Caption text={NEEDS_DATA} />}
        {topVariations.length === 0 ? (
          <EmptyState icon="Sparkles" title="אין עדיין וריאציות מדורגות" body="לאחר שווריאציות AI ישמשו בפוסטים ויאספו תגובות — הן יופיעו כאן מדורגות." />
        ) : (
          <Glass className="flex flex-col divide-y divide-line/60 p-0">
            {topVariations.map((v, i) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-muted w-6 shrink-0 text-sm font-black tabular-nums">{i + 1}</span>
                <div className="min-w-[140px] flex-1">
                  <p className="text-ink truncate text-sm font-extrabold">{v.angle ?? "—"}</p>
                  <p className="text-muted text-[11px] font-medium">{nfmt(v.usedCount)} שימושים{v.cta ? ` · ${v.cta}` : ""}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <Metric label="תגובות" value={nfmt(v.comments)} />
                  <Metric label="לידים" value={nfmt(v.leads)} />
                  <Metric label="המרה" value={pct(v.conversionRate)} />
                </div>
                <ScoreBar value={v.score} width="w-20" />
              </div>
            ))}
          </Glass>
        )}
      </Panel>

      {/* 6 — CTA performance */}
      <Panel title="ביצועי CTA" subtitle="שיעור תגובות לפי קריאה לפעולה" icon="Target">
        {!enough && <Caption text={NEEDS_DATA} />}
        {ctas.length === 0 ? (
          <EmptyState icon="Target" title="אין עדיין נתוני CTA" body="כשפוסטים עם קריאות לפעולה שונות יאספו תגובות — נשווה כאן את הביצועים." />
        ) : (
          <Glass className="flex flex-col divide-y divide-line/60 p-0">
            {ctas.map((c) => (
              <div key={c.cta} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[120px] flex-1">
                  <p className="text-ink text-sm font-extrabold">{c.cta}</p>
                  <p className="text-muted text-[11px] font-medium">{nfmt(c.posts)} פוסטים</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <Metric label="תגובות" value={nfmt(c.comments)} />
                  <Metric label="לידים" value={nfmt(c.leads)} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-line/70 h-1.5 w-20 overflow-hidden rounded-full">
                    <div className="bg-warning h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, c.commentRate))}%` }} />
                  </div>
                  <span className="text-warning text-xs font-bold tabular-nums">{pct(c.commentRate)}</span>
                </div>
              </div>
            ))}
          </Glass>
        )}
      </Panel>

      {/* 7 — Lead funnel (real raw counts; always shown) */}
      <Panel title="משפך לידים" subtitle="פורסם ← תגובות ← לידים ← חמים ← הומרו" icon="TrendingUp">
        <Glass className="flex flex-col gap-3 p-5">
          {funnelStages.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-muted flex w-24 shrink-0 items-center gap-1.5 text-xs font-bold">
                <Icon name={s.icon} size={14} /> {s.label}
              </span>
              <div className="bg-line/60 h-6 flex-1 overflow-hidden rounded-lg">
                <div className={cn("flex h-full items-center justify-end rounded-lg px-2", s.tone)}
                  style={{ width: `${Math.max(4, (s.value / funnelMax) * 100)}%` }}>
                  <span className="text-[11px] font-black tabular-nums text-white">{nfmt(s.value)}</span>
                </div>
              </div>
            </div>
          ))}
        </Glass>
      </Panel>

      {/* 8 — Failed posts analysis */}
      <Panel title="ניתוח כשלים" subtitle="פוסטים שנכשלו — לפי סיבה וקבוצה" icon="AlertTriangle">
        {failed.totalFailed === 0 ? (
          <EmptyState icon="BadgeCheck" title="אין פוסטים שנכשלו" body="כל הפרסומים עברו בהצלחה — אין כשלים לניתוח." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <Glass className="flex flex-col gap-2 p-4">
              <p className="text-ink text-sm font-extrabold">לפי סיבה ({nfmt(failed.totalFailed)} סה״כ)</p>
              <div className="flex flex-col divide-y divide-line/50">
                {failed.byReason.map((r) => (
                  <div key={r.reason} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-muted truncate text-xs">{r.reason}</span>
                    <span className="text-danger shrink-0 text-sm font-black tabular-nums">{nfmt(r.count)}</span>
                  </div>
                ))}
              </div>
            </Glass>
            <Glass className="flex flex-col gap-2 p-4">
              <p className="text-ink text-sm font-extrabold">לפי קבוצה</p>
              <div className="flex flex-col divide-y divide-line/50">
                {failed.byGroup.map((g) => (
                  <div key={g.groupName} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-muted truncate text-xs">{g.groupName}</span>
                    <span className="text-danger shrink-0 text-sm font-black tabular-nums">{nfmt(g.count)}</span>
                  </div>
                ))}
              </div>
            </Glass>
          </div>
        )}
      </Panel>

      {/* 9 — Recommendations */}
      <Panel title="המלצות" subtitle="תובנות מבוססות נתונים" icon="Sparkles">
        {recommendations.length === 0 ? (
          <EmptyState icon="Sparkles" title="אין עדיין המלצות" body="כשייצברו מספיק נתונים אמיתיים — ZONO יפיק כאן תובנות והמלצות פעולה." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.map((r) => {
              const t = REC_TONE[r.type];
              return (
                <Glass key={r.id} className={cn("flex items-start gap-3 border p-4", t.bar)}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", t.wrap)}>
                    <Icon name={t.icon} size={17} />
                  </span>
                  <p className="text-ink text-sm font-semibold leading-relaxed">{r.text}</p>
                </Glass>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-ink font-bold tabular-nums">{value}</p>
      <p className="text-muted text-[10px] font-medium">{label}</p>
    </div>
  );
}
