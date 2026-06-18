"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { MultiLocalityPicker } from "./MultiLocalityPicker";
import {
  DEAL_KIND_OPTIONS,
  SOURCE_OPTIONS,
  TEMPERATURE_OPTIONS,
} from "@/lib/buyers/labels";
import { PROPERTY_TYPE_OPTIONS } from "@/lib/properties/labels";
import type { BuyerActionState } from "@/lib/buyers/actions";
import type { BuyerDealKind, BuyerInput } from "@/lib/buyers/types";
import type {
  BuyerTemperature,
  LeadSource,
  PropertyType,
} from "@/lib/supabase/types";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-ink text-sm font-bold";
const hint = "text-muted text-xs";

function num(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function CheckChip({
  checked,
  onClick,
  text,
}: {
  checked: boolean;
  onClick: () => void;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
        checked
          ? "bg-brand-soft border-brand-light text-brand-strong"
          : "bg-surface border-line text-muted hover:text-ink",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-md border text-[11px]",
          checked ? "bg-brand border-brand text-white" : "border-line",
        )}
      >
        {checked ? "✓" : ""}
      </span>
      {text}
    </button>
  );
}

export function BuyerForm({
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  initial?: Partial<BuyerInput>;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (input: BuyerInput) => Promise<BuyerActionState>;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [areas, setAreas] = useState<string[]>(initial?.preferredAreas ?? []);
  const [budgetMin, setBudgetMin] = useState(initial?.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(initial?.budgetMax?.toString() ?? "");
  const [roomsMin, setRoomsMin] = useState(initial?.roomsMin?.toString() ?? "");
  const [roomsMax, setRoomsMax] = useState(initial?.roomsMax?.toString() ?? "");
  const [types, setTypes] = useState<PropertyType[]>(initial?.preferredTypes ?? []);
  const [dealKind, setDealKind] = useState<BuyerDealKind | "">(initial?.dealKind ?? "");
  const [temperature, setTemperature] = useState<BuyerTemperature | "">(
    initial?.temperature ?? "",
  );
  const [source, setSource] = useState<LeadSource | "">(initial?.source ?? "");
  const [elevator, setElevator] = useState(initial?.mustHaveElevator ?? false);
  const [parking, setParking] = useState(initial?.mustHaveParking ?? false);
  const [safeRoom, setSafeRoom] = useState(initial?.mustHaveSafeRoom ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleType = (t: PropertyType) =>
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = () => {
    setError(null);
    const input: BuyerInput = {
      fullName,
      phone: phone || null,
      email: email || null,
      preferredAreas: areas,
      budgetMin: num(budgetMin),
      budgetMax: num(budgetMax),
      roomsMin: num(roomsMin),
      roomsMax: num(roomsMax),
      preferredTypes: types,
      dealKind: dealKind || null,
      temperature: temperature || null,
      source: source || null,
      mustHaveElevator: elevator,
      mustHaveParking: parking,
      mustHaveSafeRoom: safeRoom,
      notes: notes || null,
    };
    start(async () => {
      const r = await onSubmit(input);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="bg-card border-line flex flex-col gap-6 rounded-[24px] border p-6">
      {/* Contact */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className={label}>שם מלא *</span>
          <input className={`${field} mt-1`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>טלפון</span>
          <input className={`${field} mt-1`} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>אימייל</span>
          <input className={`${field} mt-1`} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      {/* Localities */}
      <div>
        <span className={label}>ערים מועדפות</span>
        <div className="mt-1">
          <MultiLocalityPicker value={areas} onChange={setAreas} />
        </div>
      </div>

      {/* Budget + rooms */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="block">
          <span className={label}>תקציב מינ׳</span>
          <input className={`${field} mt-1`} type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>תקציב מקס׳</span>
          <input className={`${field} mt-1`} type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>חדרים מינ׳</span>
          <input className={`${field} mt-1`} type="number" step="0.5" value={roomsMin} onChange={(e) => setRoomsMin(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>חדרים מקס׳</span>
          <input className={`${field} mt-1`} type="number" step="0.5" value={roomsMax} onChange={(e) => setRoomsMax(e.target.value)} />
        </label>
      </div>

      {/* Property types */}
      <div>
        <span className={label}>סוגי נכס מועדפים</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggleType(o.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                types.includes(o.value)
                  ? "bg-brand-soft border-brand-light text-brand-strong"
                  : "bg-surface border-line text-muted hover:text-ink",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deal kind + status + source */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={label}>סוג עסקה</span>
          <select className={`${field} mt-1`} value={dealKind} onChange={(e) => setDealKind(e.target.value as BuyerDealKind | "")}>
            <option value="">—</option>
            {DEAL_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>סטטוס (חום)</span>
          <select className={`${field} mt-1`} value={temperature} onChange={(e) => setTemperature(e.target.value as BuyerTemperature | "")}>
            <option value="">—</option>
            {TEMPERATURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>מקור</span>
          <select className={`${field} mt-1`} value={source} onChange={(e) => setSource(e.target.value as LeadSource | "")}>
            <option value="">—</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Must-haves */}
      <div>
        <span className={label}>דרישות חובה</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <CheckChip checked={elevator} onClick={() => setElevator((v) => !v)} text="מעלית" />
          <CheckChip checked={parking} onClick={() => setParking((v) => !v)} text="חניה" />
          <CheckChip checked={safeRoom} onClick={() => setSafeRoom((v) => !v)} text="ממ״ד" />
        </div>
      </div>

      {/* Notes */}
      <label className="block">
        <span className={label}>הערות</span>
        <textarea
          className={cn(field, "mt-1 h-24 py-2")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <span className={hint}>מידע חופשי על הקונה והעדפותיו.</span>
      </label>

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !fullName.trim()}>
          {submitLabel}
        </Button>
        <Link href={cancelHref} className="text-muted hover:text-ink self-center text-sm font-semibold">
          ביטול
        </Link>
      </div>
    </div>
  );
}
