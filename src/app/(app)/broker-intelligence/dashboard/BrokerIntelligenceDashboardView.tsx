"use client";
// ============================================================================
// 👤 Broker Intelligence Dashboard™ — leaderboards from existing broker data.
// Presentation only · RTL. Ranks the existing broker_profiles values (listings,
// confidence, verification). No recompute, no fabricated agency-level metric.
// ============================================================================
import Link from "next/link";
import { TerminalSection, Metric, MetricGrid, Pill, TerminalEmpty, val } from "@/components/intelligence/terminal";
import { WorkspaceLinks, type WorkspaceLink } from "@/components/workspace/WorkspaceHeader";
import { EmptyGuidance } from "@/components/intelligence/EmptyGuidance";
import type { ExplorerBroker } from "@/lib/intelligence-explorer/types";

function Row({ b, metric }: { b: ExplorerBroker; metric: string }) {
  return (
    <Link href={`/broker-intelligence/${encodeURIComponent(b.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-2 text-sm transition last:border-0">
      <span className="text-ink min-w-0 truncate font-bold">{b.name}<span className="text-muted font-normal"> · {[b.office, b.city].filter(Boolean).join(" · ") || "—"}</span></span>
      <span className="text-brand-strong shrink-0 tabular-nums font-black">{metric}</span>
    </Link>
  );
}
function Board({ title, subtitle, rows }: { title: string; subtitle: string; rows: { b: ExplorerBroker; metric: string }[] }) {
  return (
    <TerminalSection title={title} subtitle={subtitle}>
      {rows.length ? <div className="flex flex-col">{rows.map((r) => <Row key={r.b.id} b={r.b} metric={r.metric} />)}</div> : <TerminalEmpty text="אין נתונים עדיין." />}
    </TerminalSection>
  );
}

export function BrokerIntelligenceDashboardView({ brokers }: { brokers: ExplorerBroker[] }) {
  const byListings = [...brokers].sort((a, b) => b.listingsCount - a.listingsCount).slice(0, 8);
  const byConfidence = [...brokers].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
  const verified = brokers.filter((b) => b.verification === "human_verified").length;
  const avgConf = brokers.length ? Math.round(brokers.reduce((s, b) => s + b.confidence, 0) / brokers.length) : 0;
  const topBroker = byListings[0] ?? null;

  const ACCESS_LINKS: WorkspaceLink[] = [
    { href: "/intelligence-explorer", emoji: "🔎", label: "חיפוש סוכן", hint: "Intelligence Explorer" },
    { href: "/broker-intelligence", emoji: "👥", label: "כל הסוכנים", hint: "All brokers" },
    { href: topBroker ? `/broker-intelligence/${encodeURIComponent(topBroker.id)}` : "/intelligence-explorer", emoji: "👤", label: "פרופיל סוכן", hint: topBroker ? topBroker.name : "בחר סוכן" },
    { href: "/brokerage-data", emoji: "🏢", label: "דאטה משרדי תיווך", hint: "Brokerage Data Platform" },
  ];

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-2xl">👤</span>
        <div>
          <p className="text-brand text-[11px] font-black tracking-wide">BROKER INTELLIGENCE™</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">דשבורד מודיעין מתווכים</h1>
          <p className="text-muted mt-0.5 text-sm">מי החזק ביותר · מי בעל הביטחון הגבוה ביותר.</p>
        </div>
      </header>

      <WorkspaceLinks links={ACCESS_LINKS} />

      {brokers.length === 0 ? (
        <EmptyGuidance />
      ) : (
        <>
          <TerminalSection title="סקירה" subtitle="מדדים מנתוני המתווכים הקיימים">
            <MetricGrid>
              <Metric label="מתווכים" value={String(brokers.length)} accent />
              <Metric label="מאומתים" value={String(verified)} />
              <Metric label="ביטחון ממוצע" value={val(avgConf)} />
              <Metric label="סך מודעות" value={String(brokers.reduce((s, b) => s + b.listingsCount, 0))} />
            </MetricGrid>
          </TerminalSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <Board title="המובילים — לפי מלאי" subtitle="מספר מודעות מקושרות" rows={byListings.map((b) => ({ b, metric: `${b.listingsCount} מודעות` }))} />
            <Board title="ביטחון נתונים הגבוה ביותר" subtitle="confidence score" rows={byConfidence.map((b) => ({ b, metric: val(b.confidence) }))} />
          </div>
        </>
      )}

      <p className="text-muted text-[11px]">מדדי שליטה אזורית / מומנטום / Winning DNA הם ברמת המשרד — ראה <Link href="/office-intelligence/dashboard" className="text-brand-strong font-bold">דשבורד מודיעין משרדים</Link>. <Pill tone="neutral">נתונים קיימים בלבד</Pill></p>
    </div>
  );
}
