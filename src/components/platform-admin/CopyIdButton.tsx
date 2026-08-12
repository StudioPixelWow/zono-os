"use client";
// Small copy-to-clipboard control for the organization id (P5.2). Purely a
// convenience; no data access.
import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

export function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable — no-op */ }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={cn("border-line inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors", copied ? "bg-success-soft text-success" : "text-muted hover:bg-surface")}
      title="העתק מזהה ארגון"
      dir="ltr"
    >
      <Icon name={copied ? "Check" : "Copy"} size={12} />
      {id.slice(0, 8)}
    </button>
  );
}
