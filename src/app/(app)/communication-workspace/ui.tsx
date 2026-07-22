"use client";
// ============================================================================
// 💬 Communication Workspace — small client controls: search box (navigates via
// searchParams, preserving the rest) and an honest unavailable+retry state.
// Never fabricates conversations — an empty/failed provider reads as empty or
// unavailable, never as invented data.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { wsHref } from "@/lib/communication-workspace/filters";

export function SearchBox({ params }: { params: Record<string, string | undefined> }) {
  const router = useRouter();
  const [q, setQ] = useState(params.q ?? "");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); start(() => router.push(wsHref(params, { q: q.trim() || null }))); }}
      className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2"
    >
      <Search size={14} className="text-muted shrink-0" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש בשיחות…"
        className="text-ink w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--muted)]"
      />
      {pending ? <RefreshCw size={12} className="text-muted animate-spin" /> : null}
    </form>
  );
}

export function Unavailable({ note }: { note?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-amber-200 bg-amber-50/60 p-6 text-center">
      <AlertTriangle size={20} className="text-amber-500" />
      <p className="text-[12px] font-black text-amber-800">{note ?? "המידע אינו זמין כעת"}</p>
      <p className="text-[11px] text-amber-700/80">לא נטענו שיחות — לא מוצג מידע משוער.</p>
      <button
        type="button"
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-[11px] font-bold text-amber-800 disabled:opacity-60"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} />
        {pending ? "מרענן…" : "נסה שוב"}
      </button>
    </div>
  );
}
