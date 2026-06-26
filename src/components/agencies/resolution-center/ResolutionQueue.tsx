"use client";
import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { AgencyEmptyState } from "@/components/agencies/competition-radar/AgencyEmptyState";
import { ResolutionCard, type CardHandlers } from "./ResolutionCard";
import { filterCandidates, queueCities } from "@/lib/agencies/resolution-center/resolutionCenterFormat";
import type { ResolutionCandidate, ResolutionFilters } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const STATUS_TABS: { key: NonNullable<ResolutionFilters["status"]>; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "pending", label: "ממתינים" },
  { key: "accepted", label: "אושרו" },
  { key: "rejected", label: "נדחו" },
  { key: "ignored", label: "התעלמות" },
  { key: "low_confidence", label: "ביטחון נמוך" },
  { key: "high_confidence", label: "ביטחון גבוה" },
];

const IN = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink";

/** Filterable, searchable review queue. */
export function ResolutionQueue({ candidates, handlers }: { candidates: ResolutionCandidate[]; handlers: CardHandlers }) {
  const [status, setStatus] = useState<NonNullable<ResolutionFilters["status"]>>("pending");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const cities = useMemo(() => queueCities(candidates), [candidates]);
  const rows = useMemo(() => filterCandidates(candidates, { status, query, city }), [candidates, status, query, city]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>תור אימות</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${IN} max-w-[200px]`} placeholder="חיפוש לפי שם/עיר/מקור…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {cities.length > 0 && (
            <select className={`${IN} max-w-[140px]`} value={city ?? ""} onChange={(e) => setCity(e.target.value || null)}>
              <option value="">כל הערים</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${status === t.key ? "bg-brand text-white" : "bg-line/60 text-muted hover:bg-line"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {rows.length === 0 ? (
          <div className="lg:col-span-2">
            <AgencyEmptyState title="אין מועמדים בתצוגה" text="כל זיהוי AI בעל ביטחון נמוך ייכנס לתור כאן לאישור אנושי. כרגע אין מועמדים שתואמים את הסינון." />
          </div>
        ) : rows.map((c) => <ResolutionCard key={c.id} candidate={c} handlers={handlers} />)}
      </div>
    </Card>
  );
}
