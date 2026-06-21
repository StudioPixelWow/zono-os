"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { MODULE_CATEGORIES, MODULES } from "@/lib/navigation/registry";

export default function ModuleDirectoryPage() {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const match = (m: (typeof MODULES)[number]) => !term || m.label.toLowerCase().includes(term) || (m.description ?? "").toLowerCase().includes(term) || m.route.includes(term);
  const filtered = MODULES.filter(match);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">Directory · Modules</p>
        <h1 className="text-ink mt-1 text-2xl font-black">מדריך מודולים</h1>
        <p className="text-muted mt-1 text-sm">כל המודולים במערכת ZONO. מה קיים, מה חדש, ולאן לעבור. טיפ: לחיפוש מהיר בכל מקום — CMD/CTRL + K.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="סנן מודולים…" className="border-line bg-card mt-3 w-full max-w-sm rounded-xl border px-3 py-2 text-sm" />
      </div>

      {MODULE_CATEGORIES.map((category) => {
        const items = filtered.filter((m) => m.category === category);
        if (!items.length) return null;
        return (
          <div key={category}>
            <p className="text-ink mb-2 text-sm font-extrabold">{category} <span className="text-muted text-[11px] font-bold">· {items.length}</span></p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((m) => (
                <Link key={m.id} href={m.route} className="bg-card border-line hover:border-brand/30 flex items-center gap-3 rounded-[16px] border p-3 transition-colors">
                  <span className="bg-brand-soft text-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={m.icon} size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm font-bold">{m.label}</span>
                    <span className="text-muted block truncate text-[11px]">{m.description ?? m.route}</span>
                  </span>
                  {m.roleMin !== "agent" && m.roleMin !== "viewer" && <span className="bg-surface text-muted rounded-md px-1.5 py-0.5 text-[9px] font-bold">{m.roleMin === "manager" ? "מנהל" : "בעלים"}</span>}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <p className="text-muted text-sm">לא נמצאו מודולים תואמים.</p>}
    </div>
  );
}
