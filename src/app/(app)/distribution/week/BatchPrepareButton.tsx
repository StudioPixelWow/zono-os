"use client";
// ZONO — portfolio "הכן תוכניות ל-N נכסים": prepares an individual draft per
// property, then reveals them for review. Never auto-approves — each plan still
// needs its own explicit approval.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareManyPlansAction } from "@/lib/marketing-autopilot/plan-actions";

export function BatchPrepareButton({ propertyIds, label }: { propertyIds: string[]; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!propertyIds.length) return null;

  async function prepare() {
    setBusy(true); setErr(null);
    const r = await prepareManyPlansAction(propertyIds);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "ההכנה נכשלה"); return; }
    start(() => router.refresh());
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={prepare} disabled={busy || pending} className="bg-brand rounded-xl px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{busy || pending ? "מכין…" : label}</button>
      {err && <p className="text-danger text-xs font-bold">{err}</p>}
    </div>
  );
}
