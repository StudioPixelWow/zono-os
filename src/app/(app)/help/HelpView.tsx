"use client";
// ============================================================================
// ZONO — Help Center search + FAQ (Phase 21, section 5). Client-side filtered
// knowledge base. Static content; no business data.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

interface KbItem { q: string; a: string; tag: string; href?: string }

export function HelpView({ items }: { items: KbItem[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => i.q.toLowerCase().includes(s) || i.a.toLowerCase().includes(s) || i.tag.toLowerCase().includes(s));
  }, [q, items]);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-line flex items-center gap-2 rounded-2xl border px-3 py-2">
        <Icon name="Search" size={16} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בשאלות נפוצות…" className="text-ink w-full bg-transparent text-sm outline-none" />
      </div>

      {filtered.length === 0 && <p className="text-muted bg-card border-line rounded-2xl border p-6 text-center text-sm">לא נמצאו תוצאות. נסה/י מילים אחרות או שלח/י משוב.</p>}

      {filtered.map((i) => (
        <details key={i.q} className="bg-card border-line group rounded-2xl border p-4">
          <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-extrabold">
            <span>{i.q}</span>
            <Icon name="ChevronDown" size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <p className="text-muted mt-2 text-sm">{i.a}</p>
          {i.href && <Link href={i.href} className="text-brand-strong mt-2 inline-block text-xs font-bold">פתח/י →</Link>}
        </details>
      ))}
    </div>
  );
}
