"use client";
// ============================================================================
// 🧠 Context Panel™ — Intelligence Everywhere (presentation only · RTL).
// A reusable inline intelligence panel any screen can drop next to an entity:
//   <ContextPanel city={...} neighborhood={...} />
// It lazy-loads EXISTING intelligence (territory + nearby opportunities) for the
// entity's location and surfaces Market Context, Competition, Nearby
// Opportunities, Recent Listings and links into the full profiles. Reuses
// existing repositories via a server action — computes nothing, fabricates
// nothing (absent → —). Explainability via the existing WhyButton.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Metric, MetricGrid, StatusBadge, Pill, TerminalEmpty, SourceLine, val, pct01, type StatusTone } from "@/components/intelligence/terminal";
import { NeighborhoodLink, OfficeLink } from "@/components/intelligence/EntityLinks";
import { WhyButton } from "@/components/explainability/WhyButton";
import { getEntityContextAction, type EntityContextDTO } from "@/lib/intelligence-explorer/context-actions";

const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);
const COMP_TONE: Record<string, StatusTone> = { high: "rising", moderate: "contender", low: "runner", none: "neutral" };
const COMP_HE: Record<string, string> = { high: "תחרות גבוהה", moderate: "תחרות בינונית", low: "תחרות נמוכה", none: "ללא תחרות" };

export function ContextPanel({ city, neighborhood, title = "מודיעין סביב הנכס", className }: { city?: string | null; neighborhood?: string | null; title?: string; className?: string }) {
  const [data, setData] = useState<EntityContextDTO | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => { setData(await getEntityContextAction(city ?? null, neighborhood ?? null)); });
  }, [city, neighborhood]);

  const t = data?.territory ?? null;
  const ranked = (t?.agencies ?? []).slice().sort((a, b) => (b.dominance ?? 0) - (a.dominance ?? 0));
  const leader = ranked.find((a) => a.agencyId === t?.leaderAgencyId) ?? ranked[0] ?? null;
  const comp = t?.competitionLevel ?? "none";

  return (
    <aside dir="rtl" className={`border-line bg-card rounded-2xl border p-5 ${className ?? ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-xl text-base">🧠</span>
        <h2 className="text-ink text-base font-black">{title}</h2>
        {data && <WhyButton reasons={[`רמת תחרות: ${COMP_HE[comp]}`, `${data.counts.total} מודעות באזור`, `${data.counts.opportunities} הזדמנויות פוטנציאל גבוה`]} source="Territory Intelligence" />}
      </div>

      {!data && pending ? <TerminalEmpty text="טוען מודיעין אזור…" /> : !data ? <TerminalEmpty text="אין מודיעין זמין." /> : (
        <div className="flex flex-col gap-4">
          {/* Market context */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-ink text-xs font-black">{neighborhood || city || "אזור"}</span>
              <StatusBadge label={COMP_HE[comp]} tone={COMP_TONE[comp] ?? "neutral"} />
            </div>
            <MetricGrid>
              <Metric label="משרד מוביל" value={leader?.agencyName ?? "—"} accent />
              <Metric label="שליטה אזורית" value={val(leader?.dominance)} />
              <Metric label="נתח מלאי מוביל" value={pct01(leader?.inventoryShare)} />
              <Metric label="מודעות באזור" value={String(data.counts.total)} />
            </MetricGrid>
            {leader && <p className="text-muted mt-2 text-[11px]">משרד מוביל: <OfficeLink id={leader.agencyId} name={leader.agencyName} /></p>}
            {t && <SourceLine confidence={t.sourceSummary.confidence} lastCalculated={t.sourceSummary.lastCalculated} missing={t.sourceSummary.missingData} />}
          </div>

          {/* Nearby opportunities */}
          <div>
            <p className="text-ink mb-1.5 flex items-center gap-2 text-xs font-black">הזדמנויות סמוכות <Pill tone="rising">{data.counts.opportunities}</Pill></p>
            {data.opportunities.length ? (
              <div className="flex flex-col">
                {data.opportunities.map((l) => (
                  <Link key={l.id} href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-1.5 text-xs transition last:border-0">
                    <span className="text-ink min-w-0 truncate font-bold">{l.title}<span className="text-muted font-normal"> · {ils(l.price)}</span></span>
                    <Pill tone="rising">{val(l.opportunityScore)}</Pill>
                  </Link>
                ))}
              </div>
            ) : <TerminalEmpty text="אין הזדמנויות בעלות פוטנציאל גבוה באזור." />}
          </div>

          {/* Recent listings */}
          <div>
            <p className="text-ink mb-1.5 flex items-center gap-2 text-xs font-black">מודעות אחרונות <Pill tone="neutral">{data.counts.recent}</Pill></p>
            {data.newListings.length ? (
              <div className="flex flex-col">
                {data.newListings.slice(0, 5).map((l) => (
                  <Link key={l.id} href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-1.5 text-xs transition last:border-0">
                    <span className="text-ink min-w-0 truncate font-bold">{l.title}</span>
                    <span className="text-muted shrink-0">{ils(l.price)}{l.hasAgent === false ? " · ללא מתווך" : ""}</span>
                  </Link>
                ))}
              </div>
            ) : <TerminalEmpty text="אין מודעות חדשות באזור." />}
          </div>

          {/* Links into full intelligence */}
          <div className="flex flex-wrap gap-1.5">
            {(city || neighborhood) && <span className="border-line bg-surface rounded-lg border px-2 py-1 text-[11px] font-bold"><NeighborhoodLink city={city} neighborhood={neighborhood || city || ""} /></span>}
            <Link href="/market-intelligence/map" className="border-line bg-surface text-ink rounded-lg border px-2 py-1 text-[11px] font-bold">🗺️ מפה</Link>
            <Link href="/action-center" className="border-line bg-surface text-ink rounded-lg border px-2 py-1 text-[11px] font-bold">⚡ פעולות</Link>
          </div>
        </div>
      )}
    </aside>
  );
}
