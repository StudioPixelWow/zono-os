"use client";
// ============================================================================
// 📝 Buyer note composer — the buyer Notes tab was read-only (the notes table
// had no writer). This adds a real compose box that persists via addBuyerNoteAction.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { addBuyerNoteAction } from "@/lib/buyers/actions";

export function BuyerNoteComposer({ buyerId }: { buyerId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!body.trim()) return;
    setErr(null);
    start(async () => {
      const r = await addBuyerNoteAction(buyerId, body);
      if (r.error) setErr(r.error);
      else { setBody(""); router.refresh(); }
    });
  };

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="הוסף הערה על הקונה…"
          className="bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2 text-sm outline-none"
        />
        <button type="button" onClick={submit} disabled={pending || !body.trim()}
          className="btn-zono-primary inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-black text-white disabled:opacity-60">
          {pending ? <Spinner size={14} /> : <Icon name="Plus" size={14} />} הוסף
        </button>
      </div>
      {err && <p className="text-danger text-[11px] font-bold">{err}</p>}
    </div>
  );
}
