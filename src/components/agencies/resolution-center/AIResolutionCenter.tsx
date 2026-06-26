"use client";
import { useMemo, useState } from "react";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ResolutionHeader } from "./ResolutionHeader";
import { ResolutionQueue } from "./ResolutionQueue";
import { LearningPanel } from "./LearningPanel";
import { ResolutionHistory } from "./ResolutionHistory";
import { MergeDialog } from "./MergeDialog";
import { SplitDialog } from "./SplitDialog";
import { EditAgencyDialog } from "./EditAgencyDialog";
import type { CardHandlers } from "./ResolutionCard";
import {
  approveCandidateAction, rejectCandidateAction, ignoreCandidateAction,
} from "@/lib/agencies/resolution-center/resolutionCenterActions";
import { computeKpis } from "@/lib/agencies/resolution-center/resolutionCenterFormat";
import type {
  ResolutionCandidate, LearningStats, FeedbackRecord, AgencyLite,
} from "@/lib/agencies/resolution-center/resolutionCenterFormat";

export interface AIResolutionCenterProps {
  candidates: ResolutionCandidate[];
  learning: LearningStats;
  history: FeedbackRecord[];
}

type DialogKind = "merge" | "split" | "edit" | null;

/** Top-level AI Review Center (Phase 26.12). The learning center of ZONO Intelligence. */
export function AIResolutionCenter({ candidates, learning, history }: AIResolutionCenterProps) {
  const runner = useActionRunner();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogAgency, setDialogAgency] = useState<AgencyLite | null>(null);
  const kpis = useMemo(() => computeKpis(candidates, learning), [candidates, learning]);

  const wrap = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    new Promise<void>((resolve) => {
      runner.run(async () => { const r = await fn(); if (!r.ok) throw new Error(r.error); return label; }, { success: () => label });
      resolve();
    });

  const handlers: CardHandlers = {
    onApprove: (id) => wrap("המועמד אושר וקושר למשרד.", () => approveCandidateAction(id)),
    onReject: (id) => wrap("המועמד נדחה.", () => rejectCandidateAction(id)),
    onIgnore: (id) => wrap("המועמד סומן כהתעלמות.", () => ignoreCandidateAction(id)),
    onMerge: (a) => { setDialogAgency(a); setDialog("merge"); },
    onSplit: (a) => { setDialogAgency(a); setDialog("split"); },
    onEdit: (a) => { setDialogAgency(a); setDialog("edit"); },
  };

  const closeDialog = () => { setDialog(null); setDialogAgency(null); };
  const onDialogDone = (msg: string) => { closeDialog(); runner.run(async () => msg, { success: () => msg }); };

  return (
    <div className="space-y-5" dir="rtl">
      <ResolutionHeader kpis={kpis} onRefresh={() => runner.run(async () => "רוענן", { success: () => "רוענן" })} refreshing={runner.pending} />

      {(runner.note || runner.error) && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${runner.error ? "border-danger/40 bg-danger-soft/40 text-danger" : "border-success/40 bg-success-soft/40 text-success"}`}>
          {runner.error ?? runner.note}
        </div>
      )}

      <ResolutionQueue candidates={candidates} handlers={handlers} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><LearningPanel learning={learning} /></div>
        <ResolutionHistory history={history} />
      </div>

      <MergeDialog open={dialog === "merge"} duplicate={dialogAgency} onClose={closeDialog} onDone={onDialogDone} />
      <SplitDialog open={dialog === "split"} source={dialogAgency} onClose={closeDialog} onDone={onDialogDone} />
      <EditAgencyDialog open={dialog === "edit"} agency={dialogAgency} onClose={closeDialog} onDone={onDialogDone} />
    </div>
  );
}
