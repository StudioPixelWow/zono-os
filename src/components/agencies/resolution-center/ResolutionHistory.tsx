import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtDate } from "./_fmt";
import { ACTION_LABEL } from "@/lib/agencies/resolution-center/resolutionCenterFormat";
import type { FeedbackRecord, ResolutionAction } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const TONE: Record<ResolutionAction, "success" | "danger" | "brand" | "warning" | "neutral"> = {
  approve: "success", merge: "brand", reject: "danger", edit: "warning", split: "brand", ignore: "neutral",
};

/** Chronological history of human decisions (the audit trail, newest first). */
export function ResolutionHistory({ history }: { history: FeedbackRecord[] }) {
  return (
    <Card>
      <CardTitle>היסטוריית החלטות</CardTitle>
      <div className="mt-3">
        {history.length === 0 ? (
          <div className="text-muted text-sm">עדיין לא בוצעו החלטות. כל אישור, דחייה, מיזוג או עריכה יופיעו כאן.</div>
        ) : (
          <ol className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="border-line/70 flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-ink text-sm font-semibold">{h.agencyName ?? h.detectedText ?? h.finalResult ?? "החלטה"}</div>
                  {h.reason && <div className="text-muted text-[11px]">{h.reason}</div>}
                  <div className="text-muted/80 text-[11px]">{fmtDate(h.reviewedAt)}</div>
                </div>
                <Badge tone={TONE[h.action]} size="sm">{ACTION_LABEL[h.action]}</Badge>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
