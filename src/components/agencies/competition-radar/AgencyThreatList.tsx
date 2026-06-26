"use client";
import { useMemo, useState } from "react";
import { AgencyIntelCard } from "./AgencyIntelCard";
import {
  sortAgencies, filterAgenciesByCity, radarCities,
  type RadarAgencySummary, type RadarSort,
} from "@/lib/agencies/ui/competitionRadarFormat";

const SORTS: { key: RadarSort; label: string }[] = [
  { key: "threat", label: "איום" },
  { key: "overall", label: "כללי" },
  { key: "momentum", label: "מומנטום" },
  { key: "confidence", label: "ביטחון" },
];

/** Ranked competitor list with sort + city filter. Pure helpers do the work. */
export function AgencyThreatList({
  agencies, selectedId, onSelect,
}: { agencies: RadarAgencySummary[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<RadarSort>("threat");
  const [city, setCity] = useState<string | null>(null);
  const cities = useMemo(() => radarCities(agencies), [agencies]);
  const rows = useMemo(
    () => sortAgencies(filterAgenciesByCity(agencies, city), sort),
    [agencies, city, sort],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                sort === s.key ? "bg-brand text-white" : "bg-line/60 text-muted hover:bg-line"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {cities.length > 0 && (
          <select
            value={city ?? ""}
            onChange={(e) => setCity(e.target.value || null)}
            className="border-line bg-card text-ink rounded-lg border px-2 py-1 text-xs"
          >
            <option value="">כל הערים</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((a) => (
          <AgencyIntelCard key={a.id} agency={a} selected={a.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
