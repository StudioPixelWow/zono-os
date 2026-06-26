import { Badge } from "@/components/ui/Badge";
import { AgencyComparisonCard } from "./AgencyComparisonCard";
import { fmtEvidenceConfidence } from "./_fmt";
import type { CandidateDetail } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

/** Full evidence viewer for an expanded candidate. */
export function EvidencePanel({ detail, loading }: { detail: CandidateDetail | null; loading: boolean }) {
  if (loading) return <div className="text-muted py-4 text-sm">טוען ראיות…</div>;
  if (!detail) return <div className="text-muted py-4 text-sm">אין ראיות זמינות עבור מועמד זה.</div>;
  return (
    <div className="space-y-3 pt-3">
      <AgencyComparisonCard detectedName={detail.detectedText} normalized={detail.normalizedText} agency={detail.matchedAgency} />

      <div>
        <div className="text-ink mb-1.5 text-xs font-bold">ראיות</div>
        {detail.evidence.length === 0 ? (
          <div className="text-muted text-xs">אין פריטי ראיה.</div>
        ) : (
          <div className="space-y-1.5">
            {detail.evidence.map((e, i) => (
              <div key={i} className="border-line/70 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs">
                <div className="min-w-0">
                  <span className="text-ink font-semibold">{e.source}</span>
                  <span className="text-muted"> · {e.reason}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.weight != null && <Badge tone="neutral" size="sm">משקל {Math.round(e.weight * 100)}</Badge>}
                  <Badge tone="brand" size="sm">{fmtEvidenceConfidence(e.confidence)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail.confidenceBreakdown.length > 0 && (
        <div>
          <div className="text-ink mb-1.5 text-xs font-bold">פירוק ביטחון</div>
          <div className="space-y-1.5">
            {detail.confidenceBreakdown.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-muted w-32 shrink-0 truncate text-[11px]">{b.label}</span>
                <div className="bg-line/60 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div className="bg-brand h-full" style={{ width: `${Math.max(0, Math.min(100, b.value))}%` }} />
                </div>
                <span className="text-ink w-10 text-left text-[11px] font-semibold">{b.value}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.timeline.length > 0 && (
        <div>
          <div className="text-ink mb-1.5 text-xs font-bold">ציר זמן</div>
          <ol className="space-y-1">
            {detail.timeline.map((t, i) => (
              <li key={i} className="text-muted text-[11px]"><span className="text-ink font-semibold">{t.title}</span> · {t.date}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
