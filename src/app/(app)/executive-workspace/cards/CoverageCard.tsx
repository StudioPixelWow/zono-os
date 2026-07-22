// 🏛️ Coverage card — reuses the existing Executive projection coverage:
// getExecutiveOS().journey.coverage (evidence coverage, a DATA-QUALITY measure)
// plus the org "coverage" score dimension. Both inherited; nothing recomputed.
// The type itself marks evidence coverage as affectsOrganizationScore:false.
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function CoverageCard() {
  const os = await loadExecutiveOS().catch(() => null);
  const cov = os?.journey?.coverage ?? null;
  const orgCoverage = os?.score.dimensions.find((d) => d.key === "coverage") ?? null;
  if (!os || (!cov && !orgCoverage)) {
    return (
      <CardShell title="כיסוי" subtitle="ראיות ומדדי כיסוי · לא מחושב מחדש" source="executive-os.journey.coverage">
        <CardUnavailable note="נתוני הכיסוי אינם זמינים כעת" />
      </CardShell>
    );
  }
  return (
    <CardShell title="כיסוי" subtitle="ראיות ומדדי כיסוי · לא מחושב מחדש" source="executive-os.journey.coverage">
      {cov ? (
        <div className="rounded-[14px] border border-[var(--line)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-ink text-[12px] font-black">{cov.label}</span>
            <span className="text-brand text-lg font-black">{cov.value == null ? "—" : `${cov.value}%`}</span>
          </div>
          <p className="text-muted mt-1 text-[11px]">
            רשומות קנוניות {cov.detail.canonicalRecords} · גיבוי {cov.detail.fallbackRecords} · שהייה נמדדה {cov.detail.dwellMeasured}/{cov.detail.dwellTotal}
          </p>
        </div>
      ) : null}
      {orgCoverage ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-3 py-2">
          <span className="text-ink text-[12px] font-bold">{orgCoverage.label} (ציון ארגון)</span>
          <span className="text-ink text-[13px] font-black">{orgCoverage.score ?? "—"}</span>
        </div>
      ) : null}
    </CardShell>
  );
}
