"use client";
// ============================================================================
// 🗺️ Neighborhood Intelligence™ — premium terminal view (presentation only).
// Renders the EXISTING territory intelligence (TerritoryIntelligenceDTO). Leader
// office, competition level and the per-agency dominance ranking — all already
// computed by the BIE. Nothing is recomputed. RTL.
// ============================================================================
import Link from "next/link";
import {
  TerminalSection, Metric, MetricGrid, StatusBadge, TerminalEmpty, SourceLine, val, pct01, type StatusTone,
} from "@/components/intelligence/terminal";
import type { TerritoryIntelligenceDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

const COMP_TONE: Record<string, StatusTone> = { high: "rising", moderate: "contender", low: "runner", none: "neutral" };
const COMP_HE: Record<string, string> = { high: "תחרות גבוהה", moderate: "תחרות בינונית", low: "תחרות נמוכה", none: "ללא תחרות" };

export function NeighborhoodProfileView({ dto, title }: { dto: TerritoryIntelligenceDTO; title: string }) {
  const ranked = dto.agencies.slice().sort((a, b) => (b.dominance ?? 0) - (a.dominance ?? 0));
  const leader = ranked.find((a) => a.agencyId === dto.leaderAgencyId) ?? ranked[0] ?? null;
  const comp = dto.competitionLevel ?? "none";

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="border-line bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-brand-soft text-brand-strong grid h-14 w-14 place-items-center rounded-2xl text-2xl font-black">🗺️</span>
            <div>
              <p className="text-brand text-[11px] font-black tracking-wide">NEIGHBORHOOD INTELLIGENCE™</p>
              <h1 className="text-ink text-2xl font-black sm:text-3xl">{title}</h1>
              <p className="text-muted mt-0.5 text-sm">{dto.territory.city ?? "—"}</p>
            </div>
          </div>
          <StatusBadge label={COMP_HE[comp]} tone={COMP_TONE[comp] ?? "neutral"} />
        </div>
      </header>

      <TerminalSection title="תקציר שכונה" why={[`רמת תחרות: ${COMP_HE[comp]}`, `${dto.agencies.length} משרדים פעילים`]} whySource="Territory Intelligence">
        <MetricGrid>
          <Metric label="משרד מוביל" value={leader?.agencyName ?? "—"} accent />
          <Metric label="שליטת מוביל" value={val(leader?.dominance)} />
          <Metric label="נתח מלאי מוביל" value={pct01(leader?.inventoryShare)} />
          <Metric label="משרדים פעילים" value={String(dto.agencies.length)} />
        </MetricGrid>
        <SourceLine confidence={dto.sourceSummary.confidence} lastCalculated={dto.sourceSummary.lastCalculated} missing={dto.sourceSummary.missingData} />
      </TerminalSection>

      <TerminalSection title="דירוג שליטה" subtitle="משרדים לפי שליטה אזורית · נתח מלאי · מומנטום">
        {ranked.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-muted border-line border-b">
                <tr><th className="py-2 font-bold">#</th><th className="font-bold">משרד</th><th className="font-bold">שליטה</th><th className="font-bold">נתח מלאי</th><th className="font-bold">מומנטום</th><th className="font-bold">מגמה</th></tr>
              </thead>
              <tbody>
                {ranked.slice(0, 15).map((a, i) => (
                  <tr key={a.agencyId} className="border-line/60 border-b last:border-0">
                    <td className="text-muted py-2 tabular-nums">{i + 1}</td>
                    <td className="text-ink font-bold">
                      <Link href={`/office-intelligence/${encodeURIComponent(a.agencyId)}`} prefetch={false} className="text-brand-strong hover:underline">{a.agencyName}</Link>
                      {a.agencyId === dto.leaderAgencyId && <span className="ms-1"><StatusBadge label="מוביל" tone="leader" /></span>}
                    </td>
                    <td className="tabular-nums">{val(a.dominance)}</td>
                    <td className="tabular-nums">{pct01(a.inventoryShare)}</td>
                    <td className="tabular-nums">{val(a.momentum)}</td>
                    <td className="text-muted">{a.trend ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <TerminalEmpty text="אין נתוני משרדים לשכונה זו עדיין." />}
      </TerminalSection>
    </div>
  );
}
