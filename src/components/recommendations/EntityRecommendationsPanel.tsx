"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import type { RecommendationView } from "@/lib/recommendations/service";
import {
  approveRecommendationAction, rejectRecommendationAction, createTaskFromRecommendationAction,
  generateBuyerRecommendationsAction, generateSellerRecommendationsAction, generatePropertyRecommendationsAction,
} from "@/lib/recommendations/actions";

const CONF_TONE: Record<string, string> = {
  verified: "text-success bg-success-soft", high: "text-success bg-success-soft",
  medium: "text-warning bg-warning-soft", low: "text-muted bg-surface", insufficient: "text-danger bg-danger-soft",
};
const CONF_LABEL: Record<string, string> = { verified: "מאומת", high: "גבוה", medium: "בינוני", low: "נמוך", insufficient: "חסר דאטה" };
const fmtMoney = (n: number) => (n >= 1000 ? `₪${Math.round(n / 1000).toLocaleString("he-IL")}K` : `₪${n.toLocaleString("he-IL")}`);

type EntityType = "buyer" | "seller" | "property";

/**
 * Drop-in recommendations panel for a buyer/seller/property detail page.
 * Server passes the current recommendations; the panel can regenerate them and
 * approve / create-task per item. Review-only — nothing is sent automatically.
 */
export function EntityRecommendationsPanel({ entityType, entityId, recommendations }: {
  entityType: EntityType; entityId: string; recommendations: RecommendationView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (id: string, fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => {
    setBusyId(id); setNote(null);
    startTransition(async () => {
      const r = await fn();
      setNote(r.error ?? r.message ?? null);
      setBusyId(null);
      router.refresh();
    });
  };

  const generate = () => act("gen", () =>
    entityType === "buyer" ? generateBuyerRecommendationsAction(entityId)
    : entityType === "seller" ? generateSellerRecommendationsAction(entityId)
    : generatePropertyRecommendationsAction(entityId));

  const open = recommendations.filter((r) => r.status === "new" || r.status === "reviewed");

  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-ink flex items-center gap-1.5 text-sm font-extrabold"><Icon name="Sparkles" size={16} className="text-brand" />המלצות AI</p>
        <div className="flex items-center gap-2">
          {pending && busyId === "gen" && <Spinner size={14} />}
          <Button size="sm" onClick={generate} disabled={pending}>צור המלצות</Button>
          <Link href="/recommendations" className="text-brand-strong text-[12px] font-bold">הכל ←</Link>
        </div>
      </div>

      {note && <p className="bg-surface text-ink mb-2 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold">{note}</p>}

      {open.length === 0 ? (
        <p className="text-muted text-sm">אין המלצות עדיין. לחץ ״צור המלצות״ כדי לחשב על בסיס ההתאמות והעסקאות.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {open.slice(0, 6).map((r) => (
            <div key={r.id} className="border-line rounded-[14px] border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", CONF_TONE[r.source_confidence] ?? "bg-surface text-muted")}>ביטחון: {CONF_LABEL[r.source_confidence] ?? r.source_confidence}</span>
                    {r.review_status === "needs_more_data" && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">דורש דאטה</span>}
                  </div>
                  <p className="text-ink text-sm font-bold">{r.title_hebrew}</p>
                  <p className="text-muted mt-0.5 text-[12px]">{r.reason_hebrew}</p>
                  {r.next_best_action_hebrew && <p className="text-brand-strong mt-1 text-[12px] font-semibold">→ {r.next_best_action_hebrew}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-brand-strong text-base font-black">{r.recommendation_score}</span>
                  {r.expected_revenue > 0 && <span className="text-success text-[11px] font-bold">{fmtMoney(r.expected_revenue)}</span>}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {pending && busyId === r.id && <Spinner size={13} />}
                <Button size="sm" onClick={() => act(r.id, () => approveRecommendationAction(r.id))} disabled={pending}>אשר</Button>
                <Button size="sm" variant="secondary" onClick={() => act(r.id, () => createTaskFromRecommendationAction(r.id))} disabled={pending}>משימה</Button>
                <Button size="sm" variant="danger" onClick={() => act(r.id, () => rejectRecommendationAction(r.id))} disabled={pending}>דחה</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
