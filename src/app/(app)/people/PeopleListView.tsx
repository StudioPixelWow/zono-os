"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { PersonListItem, PersonRole } from "@/lib/people/service";

const ROLE_LABEL: Record<PersonRole, string> = { buyer: "קונה", seller: "מוכר", lead: "ליד" };
const ROLE_TONE: Record<PersonRole, string> = { buyer: "bg-brand-soft text-brand-strong", seller: "bg-success-soft text-success", lead: "bg-warning-soft text-warning" };

export function PeopleListView({ people, failed }: { people: PersonListItem[]; failed: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    const digits = s.replace(/\D/g, "");
    return people.filter((p) =>
      (p.name ?? "").toLowerCase().includes(s) ||
      (p.email ?? "").toLowerCase().includes(s) ||
      (digits && (p.phone ?? "").replace(/\D/g, "").includes(digits)));
  }, [q, people]);

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Users" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">אנשים</h1>
        </div>
        <p className="text-muted text-sm">זהות אחת לכל איש קשר — מאחדת את התפקידים (קונה / מוכר / ליד) לפי טלפון או אימייל, עם ציר זמן משותף.</p>
      </header>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל" className="bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none" />

      {failed ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-6 text-center text-sm font-semibold">טעינת אנשי הקשר נכשלה — נסה לרענן</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין אנשי קשר להצגה</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <Link key={p.key} href={`/people/${p.primary.type}/${p.primary.id}`}
              className="bg-card border-line hover:border-brand-light flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm transition">
              <div className="min-w-0">
                <p className="text-ink font-black">{p.name}</p>
                <p className="text-muted text-[12px]">{p.phone ?? "—"}{p.email ? ` · ${p.email}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.roles.map((r) => <span key={r} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_TONE[r]}`}>{ROLE_LABEL[r]}</span>)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
