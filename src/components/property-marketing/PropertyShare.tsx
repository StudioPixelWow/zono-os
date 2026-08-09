"use client";
// Share + copy-link (spec §29) — native Web Share API when available, else copy.
import { useState } from "react";

export function PropertyShare({ title, className = "" }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no-op */ }
  };
  return (
    <button type="button" onClick={share} aria-label="שיתוף" className={`inline-flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-4 py-2.5 text-[13px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)] ${className}`}>
      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><circle cx={18} cy={5} r={3} /><circle cx={6} cy={12} r={3} /><circle cx={18} cy={19} r={3} /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
      {copied ? "הקישור הועתק ✓" : "שיתוף"}
    </button>
  );
}
