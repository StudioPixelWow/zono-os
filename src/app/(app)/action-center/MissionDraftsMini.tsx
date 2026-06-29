"use client";
// ============================================================================
// 🎯 Action Center — "טיוטות משימה מ-AI" (read-only). Phase 27.4.
// Surfaces existing ai_mission_drafts. No execution, no approve/reject here —
// review happens in Mission Control. Pure display of evidence-backed drafts.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { TerminalSection, Pill, TerminalEmpty } from "@/components/intelligence/terminal";
import { listMissionDraftsAction } from "@/lib/ai-mission-planner/service";
import type { MissionDraft } from "@/lib/ai-mission-planner/types";

const STATUS_HE: Record<string, string> = { draft: "טיוטה", ready_for_review: "לבדיקה", approved: "אושר", rejected: "נדחה", converted: "הומר", expired: "פג" };

export function MissionDraftsMini() {
  const [drafts, setDrafts] = useState<MissionDraft[]>([]);
  const [, start] = useTransition();
  useEffect(() => { start(async () => { setDrafts(await listMissionDraftsAction()); }); }, []);

  const active = drafts.filter((d) => d.status === "ready_for_review" || d.status === "draft" || d.status === "approved").slice(0, 6);

  return (
    <TerminalSection title="טיוטות משימה מ-AI" subtitle="הצעות מבוססות ראיות — לבדיקה במרכז בקרת AI" action={<Link href="/mission-control" className="text-brand text-xs font-bold">פתח מתכנן ←</Link>}>
      {active.length ? (
        <div className="flex flex-col">
          {active.map((d) => (
            <div key={d.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
              <span className="text-ink min-w-0 truncate font-bold">{d.title}<span className="text-muted font-normal"> · {d.category} · {Math.round(d.confidence)}%</span></span>
              <Pill tone={d.priority === "urgent" || d.priority === "high" ? "rising" : "neutral"}>{STATUS_HE[d.status] ?? d.status}</Pill>
            </div>
          ))}
        </div>
      ) : <TerminalEmpty text="אין טיוטות משימה פעילות." />}
    </TerminalSection>
  );
}
