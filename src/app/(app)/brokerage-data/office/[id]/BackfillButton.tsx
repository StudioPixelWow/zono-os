"use client";
// Manual "attribute broker listings to office" button (Phase 26.5 · Part 7).
import { useState } from "react";
import { backfillOfficeInventoryAction } from "@/lib/brokerage-data/actions";
import type { BackfillResult } from "@/lib/brokerage-data/office-inventory";

export function BackfillButton() {
  const [pending, setPending] = useState(false);
  const [res, setRes] = useState<BackfillResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setPending(true); setErr(null);
    try { const r = await backfillOfficeInventoryAction(); if (r.ok) setRes(r.result ?? null); else setErr(r.error ?? "נכשל"); }
    catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); }
    finally { setPending(false); }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button onClick={run} disabled={pending} className="bg-brand-strong rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-60">{pending ? "משייך…" : "שייך נכסי סוכנים למשרד"}</button>
      {err && <span className="text-rose-700 text-[11px] font-bold">{err}</span>}
      {res && <span className="text-muted text-[11px]">עודכנו {res.linksUpdated.toLocaleString("he-IL")} קישורים · {res.conflicts} התנגשויות · {res.brokersWithOffice} מתווכים עם משרד</span>}
    </span>
  );
}
