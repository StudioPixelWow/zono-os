"use client";
// ============================================================================
// 🔁 ZONO — Broker Intelligence · Recommendation lifecycle controls (client).
// Phase 3. Lets the broker act on a recommendation — Accept / Snooze / Completed
// / Done-elsewhere / Dismiss / Reject — and persists that decision through the
// shared server action. Nothing disappears silently: after the write we refresh
// so the (now filtered) queue re-renders across the surface. Snapshot fields go
// with the event so the Phase-4 learning loop has real outcomes to learn from.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import {
  recordRecommendationLifecycleAction,
  type LifecycleActionInput,
} from "@/lib/broker-intelligence/actions";
import type { LifecycleAction, LifecycleState } from "@/lib/broker-intelligence/lifecycle";

interface Props {
  /** Stable identity + snapshot the action persists. */
  identity: Omit<LifecycleActionInput, "action" | "snoozeUntil">;
  /** Current lifecycle state (to show "accepted"/"snoozed" status), if any. */
  lifecycle?: LifecycleState | null;
}

const SNOOZE_PRESETS: { label: string; hours: number }[] = [
  { label: "מחר", hours: 24 },
  { label: "בעוד 3 ימים", hours: 72 },
  { label: "שבוע הבא", hours: 168 },
];

const STATE_LABEL: Partial<Record<LifecycleAction, string>> = {
  accepted: "בטיפול",
  snoozed: "נדחה זמנית",
};

export function RecommendationLifecycleControls({ identity, lifecycle }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  function act(action: LifecycleAction, snoozeUntil?: string) {
    setSnoozeOpen(false);
    startTransition(async () => {
      await recordRecommendationLifecycleAction({ ...identity, action, snoozeUntil: snoozeUntil ?? null });
      router.refresh();
    });
  }

  // "accepted" stays on the queue as in-progress → offer to complete/undo, not re-accept.
  const isAccepted = lifecycle?.action === "accepted";

  return (
    <div className="border-line mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
      {isAccepted && (
        <span className="bg-brand-soft text-brand inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold">
          <Icon name="Clock" size={11} /> {STATE_LABEL.accepted}
        </span>
      )}

      {!isAccepted && (
        <Pill onClick={() => act("accepted")} disabled={pending} icon="Check" tone="brand">מטפל עכשיו</Pill>
      )}
      <Pill onClick={() => act("completed")} disabled={pending} icon="BadgeCheck" tone="ok">בוצע</Pill>
      <Pill onClick={() => act("done_elsewhere")} disabled={pending} icon="ExternalLink" tone="muted">טופל מחוץ למערכת</Pill>

      {/* Snooze with presets */}
      <div className="relative">
        <Pill onClick={() => setSnoozeOpen((v) => !v)} disabled={pending} icon="Clock" tone="muted">דחה</Pill>
        {snoozeOpen && (
          <div className="border-line bg-card absolute z-10 mt-1 flex flex-col gap-0.5 rounded-xl border p-1 shadow-[var(--shadow-card)]">
            {SNOOZE_PRESETS.map((p) => (
              <button
                key={p.hours}
                type="button"
                disabled={pending}
                onClick={() => act("snoozed", new Date(Date.now() + p.hours * 3600_000).toISOString())}
                className="text-ink hover:bg-surface whitespace-nowrap rounded-lg px-2.5 py-1.5 text-right text-[12px] font-semibold"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Pill onClick={() => act("dismissed")} disabled={pending} icon="X" tone="muted">לא רלוונטי</Pill>
      <Pill onClick={() => act("rejected")} disabled={pending} icon="Minus" tone="danger">המלצה שגויה</Pill>
    </div>
  );
}

const TONE: Record<string, string> = {
  brand: "bg-brand-soft text-brand hover:opacity-80",
  ok: "bg-success-soft text-success hover:opacity-80",
  danger: "bg-danger-soft text-danger hover:opacity-80",
  muted: "bg-surface text-muted hover:text-ink",
};

function Pill({ onClick, disabled, icon, tone, children }: { onClick: () => void; disabled?: boolean; icon: string; tone: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition disabled:opacity-50 ${TONE[tone] ?? TONE.muted}`}
    >
      <Icon name={icon} size={11} /> {children}
    </button>
  );
}
