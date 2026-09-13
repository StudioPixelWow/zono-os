"use client";
// ============================================================================
// ZONO — Activation-step celebration (dashboard). Fires a confetti + ZI milestone
// popup whenever the office's ACTIVATION percentage grows — i.e. each time a real
// activation step is completed inside the dashboard (claim listings, connect a
// channel, add a property…). The baseline is remembered per org so it never fires
// for the standing state, only for genuine forward progress, and it animates the
// bar from the previous % to the new one. Reuses the shared StepCelebration.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { StepCelebration } from "@/components/onboarding/StepCelebration";

export function ActivationCelebration({ orgId, percent, completedCount, total }: {
  orgId: string; percent: number; completedCount: number; total: number;
}) {
  const key = `zono_activation_pct_${orgId}`;
  const [cel, setCel] = useState({ trigger: 0, from: 0, to: 0 });
  const seededBaseline = useRef(false);

  useEffect(() => {
    let last = 0; let hasLast = false;
    try { const v = window.localStorage.getItem(key); if (v != null) { last = Number(v) || 0; hasLast = true; } } catch { /* private mode */ }

    // Celebrate only genuine growth: a prior baseline exists and the % increased.
    if (percent > last && (hasLast || seededBaseline.current)) {
      setCel((c) => ({ trigger: c.trigger + 1, from: Math.max(0, Math.min(last, 100)), to: Math.min(percent, 100) }));
    }
    seededBaseline.current = true;
    try { window.localStorage.setItem(key, String(percent)); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent, key]);

  return (
    <StepCelebration
      trigger={cel.trigger}
      fromPct={cel.from}
      toPct={cel.to}
      label={total > 0 ? `הפעלה · ${completedCount}/${total} שלבים` : "ההפעלה שלך"}
    />
  );
}
