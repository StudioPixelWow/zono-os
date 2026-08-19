"use client";
// ZONO — "הכן לי את השיווק לשבוע": turns the deterministic recommendation into a
// prepared DRAFT plan (one per property) and reveals the workboard. Idempotent —
// re-clicking reuses the open draft.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { preparePlanAction } from "@/lib/marketing-autopilot/plan-actions";

export function PreparePlanButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function prepare() {
    setBusy(true); setErr(null);
    const r = await preparePlanAction(propertyId);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "ההכנה נכשלה"); return; }
    start(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button onClick={prepare} disabled={busy || pending} className="bg-brand rounded-xl px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy || pending ? "מכין…" : "הכן לי את השיווק לשבוע"}
      </button>
      {err && <p className="text-danger text-xs font-bold">{err}</p>}
    </div>
  );
}
