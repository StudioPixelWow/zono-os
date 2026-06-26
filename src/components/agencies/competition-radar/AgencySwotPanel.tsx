import { Card, CardTitle } from "@/components/ui/Card";
import { AgencyEmptyState } from "./AgencyEmptyState";
import type { RadarSwot } from "@/lib/agencies/ui/competitionRadarFormat";

const QUADRANTS: { key: keyof RadarSwot; title: string; cls: string }[] = [
  { key: "strengths", title: "חוזקות", cls: "border-success/30 bg-success-soft/30" },
  { key: "weaknesses", title: "חולשות", cls: "border-danger/30 bg-danger-soft/30" },
  { key: "opportunities", title: "הזדמנויות", cls: "border-brand/30 bg-brand-soft/30" },
  { key: "threats", title: "איומים", cls: "border-warning/30 bg-warning-soft/30" },
];

/** AI SWOT (Phase 26.7) for the competitor. Honest when not yet generated. */
export function AgencySwotPanel({ swot }: { swot: RadarSwot }) {
  const empty = QUADRANTS.every((q) => swot[q.key].length === 0);
  return (
    <Card>
      <CardTitle>ניתוח SWOT</CardTitle>
      <div className="mt-3">
        {empty ? (
          <AgencyEmptyState text="ניתוח ה‑SWOT ייווצר לאחר צבירת מספיק נתוני מודיעין." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUADRANTS.map((q) => (
              <div key={q.key} className={`rounded-lg border p-3 ${q.cls}`}>
                <div className="text-ink mb-1.5 text-xs font-bold">{q.title}</div>
                {swot[q.key].length === 0 ? (
                  <div className="text-muted text-[11px]">—</div>
                ) : (
                  <ul className="space-y-1">
                    {swot[q.key].map((item, i) => (
                      <li key={i} className="text-ink text-[12px] leading-snug">
                        <span className="font-semibold">{item.label}</span>
                        {item.detail ? <span className="text-muted"> · {item.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
