"use client";
// ============================================================================
// 🏢 Office Intelligence Profile™ — premium terminal view (presentation only).
// Renders the EXISTING per-agency BIE composite (AgencyIntelligenceAgencyDTO).
// Nothing is computed here — every number comes straight from the engine. RTL.
// ============================================================================
import Link from "next/link";
import {
  TerminalSection, Metric, MetricGrid, BarMeter, StatusBadge, Pill, TerminalEmpty, SourceLine, val, pct01, type StatusTone,
} from "@/components/intelligence/terminal";
import { NeighborhoodLink } from "@/components/intelligence/EntityLinks";
import type { AgencyIntelligenceAgencyDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

const PRIORITY_TONE: Record<string, StatusTone> = { high: "warn", medium: "contender", low: "neutral" };
function statusFromOverall(overall: number | null): { label: string; tone: StatusTone } {
  if (overall == null) return { label: "ללא דירוג", tone: "neutral" };
  if (overall >= 80) return { label: "מוביל", tone: "leader" };
  if (overall >= 60) return { label: "סגן מוביל", tone: "runner" };
  if (overall >= 40) return { label: "מתמודד", tone: "contender" };
  return { label: "בעלייה", tone: "rising" };
}

export function OfficeIntelligenceProfileView({ dto }: { dto: AgencyIntelligenceAgencyDTO }) {
  const { card, competitive, territory, threat, signals, reports } = dto;
  const s = competitive.scores;
  const status = statusFromOverall(card.overall);
  const topTerritory = territory.territories.slice().sort((a, b) => (b.dominance ?? 0) - (a.dominance ?? 0))[0] ?? null;
  const brokers = dto.graph.nodes.filter((n) => n.nodeType === "broker" || n.nodeType === "agent").sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 8);
  const report = reports.latest;

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <header className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-brand-soft text-brand-strong grid h-14 w-14 place-items-center rounded-2xl text-2xl font-black">🏢</span>
            <div>
              <p className="text-brand text-[11px] font-black tracking-wide">OFFICE INTELLIGENCE™</p>
              <h1 className="text-ink text-2xl font-black sm:text-3xl">{card.displayName ?? card.name}</h1>
              <p className="text-muted mt-0.5 text-sm">{card.city ?? "—"}{topTerritory?.neighborhood ? ` · ${topTerritory.neighborhood}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge label={status.label} tone={status.tone} />
            <span className="text-muted text-[11px]">ביטחון {val(card.dataConfidence, "%")}</span>
          </div>
        </div>
      </header>

      {/* Office Summary */}
      <TerminalSection title="תקציר מודיעין" why={["מדדים מחושבים ממנוע ה-BIE", `ביטחון נתונים ${val(card.dataConfidence)}%`]} whySource="Agency Intelligence Engine">
        <MetricGrid>
          <Metric label="אינדקס ביצועים" value={val(card.overall)} accent />
          <Metric label="נתח שוק / מלאי" value={val(s.inventory)} />
          <Metric label="שליטה אזורית" value={val(topTerritory?.dominance)} />
          <Metric label="מומנטום" value={val(card.momentum)} />
          <Metric label="צמיחה" value={val(card.growth)} />
          <Metric label="עוצמת שוק" value={val(s.marketStrength)} />
          <Metric label="כיסוי" value={val(s.coverage)} />
          <Metric label="ביטחון נתונים" value={val(card.dataConfidence, "%")} />
        </MetricGrid>
        <SourceLine confidence={card.dataConfidence} lastCalculated={dto.sourceSummary.lastCalculated} missing={dto.sourceSummary.missingData} />
      </TerminalSection>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Winning DNA */}
        <TerminalSection title="Winning DNA" subtitle="התנהגות · תמחור · פעילות · פרופיל מלאי ושוק" why={report?.strengths.map((x) => x.label) ?? []} whySource="Agency Reports">
          <div className="flex flex-col gap-2.5">
            <BarMeter label="עוצמת שוק" value={s.marketStrength} />
            <BarMeter label="מלאי" value={s.inventory} />
            <BarMeter label="כיסוי" value={s.coverage} />
            <BarMeter label="יוקרה" value={s.luxury} />
            <BarMeter label="דיגיטל" value={s.digital} />
            <BarMeter label="מוניטין" value={s.reputation} />
            <BarMeter label="פרויקטים" value={s.projects} />
          </div>
          {report && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-ink mb-1 text-xs font-black">חוזקות</p>
                {report.strengths.length ? report.strengths.slice(0, 4).map((x, i) => <p key={i} className="text-muted text-[11px]">• {x.label}</p>) : <TerminalEmpty text="—" />}
              </div>
              <div>
                <p className="text-ink mb-1 text-xs font-black">חולשות</p>
                {report.weaknesses.length ? report.weaknesses.slice(0, 4).map((x, i) => <p key={i} className="text-muted text-[11px]">• {x.label}</p>) : <TerminalEmpty text="—" />}
              </div>
            </div>
          )}
        </TerminalSection>

        {/* Competition */}
        <TerminalSection title="תחרות" subtitle="איום · מומנטום · מובילי אותות" why={threat.drivers.map((d) => `${d.label}: ${val(d.value)}`)} whySource="Agency Threat">
          <MetricGrid>
            <Metric label="ציון איום" value={val(threat.threat)} accent />
            <Metric label="דירוג איום" value={threat.threatBand ?? "—"} />
            <Metric label="מומנטום" value={val(threat.momentum)} />
          </MetricGrid>
          <div className="mt-3 flex flex-col gap-1.5">
            {threat.topSignals.length ? threat.topSignals.slice(0, 4).map((sig) => (
              <div key={sig.id} className="border-line flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                <span className="text-ink truncate font-bold">{sig.title}</span>
                <Pill tone="contender">{sig.severity ?? "—"}</Pill>
              </div>
            )) : <TerminalEmpty text="אין אותות תחרות פעילים." />}
          </div>
        </TerminalSection>
      </div>

      {/* Top Brokers */}
      <TerminalSection title="מתווכים מובילים" subtitle="מתוך גרף הקשרים הקיים">
        {brokers.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {brokers.map((b) => (
              <Link key={b.id} href={`/broker-intelligence/${encodeURIComponent(b.id)}`} prefetch={false} className="border-line hover:border-brand-light rounded-xl border p-3 transition">
                <span className="text-ink block truncate text-sm font-black">{b.label}</span>
                <span className="text-muted text-[11px]">חשיבות {val(b.importance)}</span>
              </Link>
            ))}
          </div>
        ) : <TerminalEmpty text="אין מתווכים מקושרים עדיין." />}
      </TerminalSection>

      {/* Coverage */}
      <TerminalSection title="כיסוי וטריטוריה" subtitle="ערים · שכונות · רחובות">
        {territory.territories.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-muted border-line border-b">
                <tr><th className="py-2 font-bold">אזור</th><th className="font-bold">שליטה</th><th className="font-bold">נתח מלאי</th><th className="font-bold">מומנטום</th><th className="font-bold">מגמה</th></tr>
              </thead>
              <tbody>
                {territory.territories.slice(0, 12).map((t, i) => (
                  <tr key={i} className="border-line/60 border-b last:border-0">
                    <td className="text-ink py-2 font-bold">{t.neighborhood ? <NeighborhoodLink city={t.city} neighborhood={t.neighborhood} /> : (t.city ?? t.label)}</td>
                    <td className="tabular-nums">{val(t.dominance)}</td>
                    <td className="tabular-nums">{pct01(t.inventoryShare)}</td>
                    <td className="tabular-nums">{val(t.momentum)}</td>
                    <td className="text-muted">{t.trend ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <TerminalEmpty text="אין נתוני כיסוי עדיין." />}
      </TerminalSection>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* AI Coach */}
        <TerminalSection title="AI Coach" subtitle="המלצות קיימות בלבד — לא נוצרות חדשות">
          {report?.recommendations.length ? report.recommendations.slice(0, 6).map((r, i) => (
            <div key={i} className="border-line mb-2 rounded-xl border p-3 last:mb-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink text-sm font-black">{r.title}</span>
                <Pill tone={PRIORITY_TONE[r.priority] ?? "neutral"}>{r.priority}</Pill>
              </div>
              <p className="text-muted mt-1 text-[11px]">{r.reason}</p>
              <p className="text-muted/80 mt-1 text-[10px]">ביטחון {pct01(r.confidence)}{r.relatedTerritory ? ` · ${r.relatedTerritory}` : ""}</p>
            </div>
          )) : <TerminalEmpty text="אין המלצות AI Coach עדיין." />}
        </TerminalSection>

        {/* Market Activity */}
        <TerminalSection title="פעילות שוק" subtitle="אותות שנצפו">
          {signals.signals.length ? signals.signals.slice(0, 8).map((sig) => (
            <div key={sig.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-2 text-xs last:border-0">
              <span className="min-w-0">
                <span className="text-ink block truncate font-bold">{sig.title}</span>
                {sig.territoryLabel && <span className="text-muted text-[10px]">{sig.territoryLabel}</span>}
              </span>
              <span className="text-muted shrink-0 text-[10px]">{new Date(sig.detectedAt).toLocaleDateString("he-IL")}</span>
            </div>
          )) : <TerminalEmpty text="אין פעילות שוק שנצפתה." />}
        </TerminalSection>
      </div>

      {/* Historical trend */}
      <TerminalSection title="מגמה היסטורית" subtitle="ערכים מאוחסנים קיימים">
        {reports.history.length ? (
          <div className="flex flex-wrap gap-2">
            {reports.history.slice(0, 12).map((h, i) => (
              <div key={i} className="border-line rounded-lg border px-3 py-2 text-xs">
                <span className="text-ink block font-bold">{h.reportType}</span>
                <span className="text-muted text-[10px]">{h.periodEnd ? new Date(h.periodEnd).toLocaleDateString("he-IL") : "—"} · ביטחון {val(h.dataConfidence, "%")}</span>
              </div>
            ))}
          </div>
        ) : <TerminalEmpty text="אין היסטוריה מאוחסנת עדיין." />}
        <SourceLine confidence={card.dataConfidence} lastCalculated={dto.sourceSummary.lastCalculated} missing={dto.sourceSummary.missingData} />
      </TerminalSection>
    </div>
  );
}
