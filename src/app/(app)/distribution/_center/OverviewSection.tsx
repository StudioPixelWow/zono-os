"use client";

import type { DistributionBoard, DailyWorkspace } from "@/lib/distribution/service";
import { Glass, StatTile, SectionHeading, ScoreBar, EmptyState, Icon, nfmt, compact, pct } from "./shared";

export function OverviewSection({
  board,
  daily,
  onBuild,
}: {
  board: DistributionBoard;
  daily: DailyWorkspace;
  onBuild: () => void;
}) {
  const totalGroups = board.communities.length;
  const approved = board.approved.length;
  const activeCampaigns = board.plans.length;
  const leadsGenerated = board.communities.reduce((s, c) => s + (c.intel?.leads_generated ?? 0), 0);
  const published = daily.items.filter((i) => i.status === "manual_published").length;
  const failed = daily.items.filter((i) => i.status === "failed").length;
  const done = published + failed;
  const successRate = done > 0 ? Math.round((published / done) * 100) : null;
  const avgPerf = board.communities.length
    ? Math.round(board.communities.reduce((s, c) => s + (c.intel?.community_health_score ?? 0), 0) / board.communities.length)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="סקירת הפצה" subtitle="תמונת מצב חיה של ערוצי ההפצה שלך בפייסבוק" icon="LayoutDashboard" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="קבוצות" value={nfmt(totalGroups)} hint={`${approved} מאושרות להפצה`} icon="Users" tone="brand" />
        <StatTile label="קמפיינים פעילים" value={nfmt(activeCampaigns)} hint="תוכניות הפצה לנכסים" icon="Megaphone" tone="accent" />
        <StatTile label="לידים שנוצרו" value={compact(leadsGenerated)} hint="מצטבר מכל הקהילות" icon="UserPlus" tone="success" />
        <StatTile label="פוסטים שפורסמו" value={nfmt(published)} hint="במחזור ההפצה הנוכחי" icon="Send" tone="brand" />
        <StatTile label="שיעור הצלחה" value={successRate == null ? "—" : pct(successRate)} hint={successRate == null ? "אין עדיין נתוני פרסום" : `${published}/${done} פורסמו`} icon="TrendingUp" tone={successRate != null && successRate >= 70 ? "success" : "warning"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Top distribution plans */}
        <Glass className="flex flex-col gap-3 p-5">
          <SectionHeading title="תוכניות הפצה מובילות" subtitle="נכסים מדורגים לפי פוטנציאל הפצה" icon="Rocket"
            action={<button type="button" onClick={onBuild} className="text-brand-strong text-sm font-bold">בנה קמפיין ←</button>} />
          {board.plans.length === 0 ? (
            <EmptyState icon="Rocket" title="אין עדיין תוכניות הפצה" body="הרץ חישוב מודיעין הפצה או בנה קמפיין כדי לדרג נכסים לקהילות המתאימות." />
          ) : (
            <div className="flex flex-col gap-2">
              {board.plans.slice(0, 6).map((p, i) => (
                <div key={p.propertyId} className="bg-card/60 border-line flex items-center gap-3 rounded-2xl border p-3">
                  <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-extrabold">{p.title}</p>
                    <p className="text-muted text-[11px]">{p.communities} קהילות · חשיפה ~{compact(p.reach)} · {nfmt(p.leads)} לידים צפויים</p>
                  </div>
                  <ScoreBar value={p.score} />
                </div>
              ))}
            </div>
          )}
        </Glass>

        {/* Opportunities feed */}
        <Glass className="flex flex-col gap-3 p-5">
          <SectionHeading title="הזדמנויות AI" subtitle="איתותים חיים מנוע ההפצה" icon="Sparkles" />
          {board.opportunities.length === 0 ? (
            <EmptyState icon="Sparkles" title="אין כרגע איתותים" body="ZONO יציף כאן הזדמנויות הפצה ברגע שהמודיעין יזהה קהילות ROI גבוה, פערים גיאוגרפיים או נכסים חמים." />
          ) : (
            <div className="flex flex-col gap-2">
              {board.opportunities.slice(0, 6).map((o) => (
                <div key={o.id} className="bg-card/60 border-line flex items-start gap-2.5 rounded-2xl border p-3">
                  <span className="bg-brand-soft text-brand grid h-7 w-7 shrink-0 place-items-center rounded-lg">
                    <Icon name={o.signal_type === "risky_community" ? "ShieldAlert" : o.signal_type === "inactive_community" ? "Moon" : o.signal_type === "missing_community" ? "MapPin" : "TrendingUp"} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-[13px] font-bold">{o.title}</p>
                    {o.description && <p className="text-muted line-clamp-1 text-[11px]">{o.description}</p>}
                  </div>
                  <span className="text-brand-strong shrink-0 text-xs font-black tabular-nums">{Math.round(o.impact_score)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-line mt-1 grid grid-cols-2 gap-2 border-t pt-3 text-center">
            <div><p className="text-brand-strong text-xl font-black tabular-nums">{avgPerf}</p><p className="text-muted text-[11px] font-bold">ציון ביצועים ממוצע</p></div>
            <div><p className="text-brand-strong text-xl font-black tabular-nums">{nfmt(approved)}</p><p className="text-muted text-[11px] font-bold">קבוצות מאושרות</p></div>
          </div>
        </Glass>
      </div>
    </div>
  );
}
