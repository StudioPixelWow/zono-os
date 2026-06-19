"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { createSellerAction } from "@/lib/sellers/actions";

const field = "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-ink text-sm font-bold";

const MOTIVATION_OPTIONS = [
  { value: "", label: "—" },
  { value: "urgent", label: "דחוף" },
  { value: "motivated", label: "מוטיבציה גבוהה" },
  { value: "exploring", label: "בודק שוק" },
];

export default function NewSellerPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [motivation, setMotivation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await createSellerAction({ fullName, phone: phone || null, email: email || null, motivation: motivation || null });
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/sellers" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
          <Icon name="ChevronRight" size={16} />
          חזרה למוכרים
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">מוכר חדש</h1>
      </div>

      <div className="bg-card border-line flex flex-col gap-4 rounded-[24px] border p-6">
        <label className="block">
          <span className={label}>שם מלא *</span>
          <input className={cn(field, "mt-1")} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>טלפון</span>
            <input className={cn(field, "mt-1")} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>אימייל</span>
            <input className={cn(field, "mt-1")} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className={label}>מוטיבציה</span>
          <select className={cn(field, "mt-1")} value={motivation} onChange={(e) => setMotivation(e.target.value)}>
            {MOTIVATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={submit} disabled={pending || !fullName.trim()}>
            {pending ? "יוצר…" : "צור מוכר"}
          </Button>
          <Link href="/sellers" className="text-muted hover:text-ink self-center text-sm font-semibold">ביטול</Link>
        </div>
        <p className="text-muted text-xs">לאחר היצירה, ZONO יפעיל אוטומטית מודיעין מוכר (אמון, מעורבות, סיכון נטישה).</p>
      </div>
    </div>
  );
}
