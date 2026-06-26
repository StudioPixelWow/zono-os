"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidencePanel } from "./EvidencePanel";
import { fmtDate } from "./_fmt";
import { getCandidateDetailAction } from "@/lib/agencies/resolution-center/resolutionCenterActions";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/agencies/resolution-center/resolutionCenterFormat";
import type { ResolutionCandidate, CandidateDetail, AgencyLite } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

export interface CardHandlers {
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onIgnore: (id: string) => Promise<void>;
  onMerge: (agency: AgencyLite) => void;
  onSplit: (agency: AgencyLite) => void;
  onEdit: (agency: AgencyLite) => void;
}

/** One candidate in the review queue — collapsed summary + expandable evidence + actions. */
export function ResolutionCard({ candidate, handlers }: { candidate: ResolutionCandidate; handlers: CardHandlers }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const expand = async () => {
    const next = !open; setOpen(next);
    if (next && !detail) {
      setLoading(true);
      const res = await getCandidateDetailAction(candidate.id);
      if (res.ok) setDetail(res.data);
      setLoading(false);
    }
  };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const agency = detail?.matchedAgency ?? null;
  const isPending = candidate.status === "pending" || candidate.status === "needs_review";

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button onClick={expand} className="min-w-0 flex-1 text-right">
          <div className="text-ink truncate text-sm font-bold">{candidate.detectedName}</div>
          <div className="text-muted truncate text-xs">
            {candidate.suggestedAgencyName ? `→ ${candidate.suggestedAgencyName}` : "אין משרד מוצע"}
            {candidate.city ? ` · ${candidate.city}` : ""}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ConfidenceBadge value={candidate.confidence} />
          <Badge tone={STATUS_TONE[candidate.status]} size="sm">{STATUS_LABEL[candidate.status]}</Badge>
        </div>
      </div>
      <div className="text-muted/80 mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
        {candidate.source && <span>מקור: {candidate.source}</span>}
        {candidate.detectionMethod && <span>· שיטה: {candidate.detectionMethod}</span>}
        <span>· {fmtDate(candidate.createdAt)}</span>
        <button onClick={expand} className="text-brand-strong font-semibold">{open ? "הסתר ראיות" : "הצג ראיות"}</button>
      </div>

      {open && <EvidencePanel detail={detail} loading={loading} />}

      {isPending && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" loading={busy === "approve"} onClick={() => run("approve", () => handlers.onApprove(candidate.id))}>אישור</Button>
          <Button size="sm" variant="danger" loading={busy === "reject"} onClick={() => run("reject", () => handlers.onReject(candidate.id))}>דחייה</Button>
          <Button size="sm" variant="ghost" loading={busy === "ignore"} onClick={() => run("ignore", () => handlers.onIgnore(candidate.id))}>התעלם</Button>
          <Button size="sm" variant="secondary" disabled={!agency} onClick={() => agency && handlers.onMerge(agency)}>מיזוג</Button>
          <Button size="sm" variant="secondary" disabled={!agency} onClick={() => agency && handlers.onSplit(agency)}>פיצול</Button>
          <Button size="sm" variant="secondary" disabled={!agency} onClick={() => agency && handlers.onEdit(agency)}>עריכה</Button>
          {!agency && open && !loading && <span className="text-muted self-center text-[11px]">מיזוג/פיצול/עריכה זמינים כשיש משרד מותאם</span>}
        </div>
      )}
    </Card>
  );
}
