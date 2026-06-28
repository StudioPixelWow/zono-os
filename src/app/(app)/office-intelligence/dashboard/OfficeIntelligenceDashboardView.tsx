"use client";
// ============================================================================
// 🏢 Office Intelligence Dashboard™ — leaderboards from existing agency scores.
// Presentation only · RTL. Ranks existing agency intelligence cards (overall /
// growth / momentum / threat). No recompute, no fabricated values (— for null).
// ============================================================================
import Link from "next/link";
import { TerminalSection, Metric, MetricGrid, TerminalEmpty, val } from "@/components/intelligence/terminal";
import type { ExplorerOffice } from "@/lib/intelligence-explorer/types";

function Row({ o, metric }: { o: ExplorerOffice; metric: string }) {
  return (
    <Link href={`/office-intelligence/${encodeURIComponent(o.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-2 text-sm transition last:border-0">
      <span className="text-ink min-w-0 truncate font-bold">{o.name}<span className="text-muted font-normal"> · {o.city ?? "—"}</span></span>
      <span className="text-brand-strong shrink-0 tabular-nums font-black">{metric}</span>
    </Link>
  );
}
function Board({ title, subtitle, rows }: { title: string; subtitle: string; rows: { o: ExplorerOffice; metric: string }[] }) {
  return (
    <TerminalSection title={title} subtitle={subtitle}>
      {rows.length ? <div className="flex flex-col">{rows.map((r) => <Row key={r.o.id} o={r.o} metric={r.metric} />)}</div> : <TerminalEmpty text="אין נתונים עדיין." />}
    </TerminalSection>
  );
}
const top = (offices: ExplorerOffice[], key: keyof ExplorerOffice) => [...offices].sort((a, b) => (Number(b[key] ?? -1)) - (Number(a[key] ?? -1))).slice(0, 8);

export function OfficeIntelligenceDashboardView({ offices }: { offices: ExplorerOffice[] }) {
  const scored = offices.filter((o) => o.overall != null).length;
  const avg = offices.length ? Math.round(offices.reduce((s, o) => s + (o.overall ?? 0), 0) / offices.length) : 0;

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-2xl">🏢</span>
        <div>
          <p className="text-brand text-[11px] font-black tracking-wide">OFFICE INTELLIGENCE™</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">דשבורד מודיעין משרדים</h1>
          <p className="text-muted mt-0.5 text-sm">מי שולט · מי צומח · מי באיום.</p>
        </div>
      </header>

      <TerminalSection title="סקירה" subtitle="מדדים ממנוע ה-BIE">
        <MetricGrid>
          <Metric label="משרדים" value={String(offices.length)} accent />
          <Metric label="עם ציון" value={String(scored)} />
          <Metric label="ביצועים ממוצע" value={val(avg)} />
        </MetricGrid>
      </TerminalSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <Board title="המשרדים המובילים" subtitle="אינדקס ביצועים" rows={top(offices, "overall").map((o) => ({ o, metric: val(o.overall) }))} />
        <Board title="הצומחים ביותר" subtitle="צמיחה" rows={top(offices, "growth").map((o) => ({ o, metric: val(o.growth) }))} />
        <Board title="המומנטום החזק ביותר" subtitle="מומנטום" rows={top(offices, "momentum").map((o) => ({ o, metric: val(o.momentum) }))} />
        <Board title="שינויי איום" subtitle="ציון איום תחרותי" rows={top(offices, "threat").map((o) => ({ o, metric: val(o.threat) }))} />
      </div>
    </div>
  );
}
