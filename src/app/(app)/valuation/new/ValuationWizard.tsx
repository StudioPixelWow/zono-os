"use client";
// ============================================================================
// ZONO Price Intelligence — valuation wizard (RTL, premium glass).
// Steps: מיקום → פרטי נכס → מאפיינים → סריקת שוק (compute) → ניווט לתוצאה.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { createAndRunValuationAction } from "@/lib/valuation/actions";
import type { ValuationInput } from "@/lib/valuation/types";

const STEPS = ["מיקום", "פרטי נכס", "מאפיינים", "סריקת שוק"];

const SCAN_STATES = [
  "מאתר עסקאות דומות",
  "בודק מחירי מ״ר באזור",
  "משווה למודעות פעילות",
  "בודק נכסים שמכרת באזור",
  "מחשב התאמות לנכס",
  "בונה דוח מקצועי",
];

const PROPERTY_TYPES = ["דירה", "דירת גן", "פנטהאוז", "דופלקס", "בית פרטי", "קוטג'", "מיני פנטהאוז", "אחר"];
const CONDITIONS = [{ v: "new", l: "חדש מקבלן" }, { v: "renovated", l: "משופץ" }, { v: "good", l: "במצב טוב" }, { v: "needs_work", l: "דורש שיפוץ" }];
const VIEWS = [{ v: "open", l: "נוף פתוח" }, { v: "partial", l: "נוף חלקי" }, { v: "none", l: "ללא נוף" }];
const NOISE = [{ v: "quiet", l: "שקט" }, { v: "medium", l: "בינוני" }, { v: "busy", l: "כביש ראשי/רועש" }];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-ink mb-1.5 block text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="text-muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}
const inputCls = "border-line bg-card focus:border-brand focus:ring-brand/20 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2";

function Toggle({ label, icon, on, onClick }: { label: string; icon: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(
      "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition",
      on ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-card text-muted hover:border-brand/40",
    )}>
      <Icon name={icon} size={16} /> {label}
      <span className={cn("ms-auto h-4 w-4 rounded-full border", on ? "border-brand bg-brand" : "border-line")} />
    </button>
  );
}

export function ValuationWizard({ initialInput, propertyId }: { initialInput?: ValuationInput; propertyId: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<ValuationInput>(initialInput ?? {});
  const [scanIdx, setScanIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ValuationInput>(k: K, v: ValuationInput[K]) => setInput((s) => ({ ...s, [k]: v }));
  const num = (v: string): number | null => (v === "" ? null : Number(v.replace(/[^\d.]/g, "")) || null);

  const canCompute = !!input.city && !!input.builtSqm && Number(input.builtSqm) > 0;

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const runScan = () => {
    setError(null);
    if (!canCompute) { setError("יש להזין לפחות עיר ושטח בנוי."); setStep(1); return; }
    setStep(3);
    setScanIdx(0);
    const timer = setInterval(() => setScanIdx((i) => Math.min(SCAN_STATES.length - 1, i + 1)), 700);
    start(async () => {
      const r = await createAndRunValuationAction(input, propertyId);
      clearInterval(timer);
      if (r.ok) router.push(`/valuation/${r.data.id}`);
      else { setError(r.error); setStep(2); }
    });
  };

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-ink text-2xl font-black">הערכת שווי חכמה</h1>
        <p className="text-muted text-sm">מלא את פרטי הנכס — ZONO יסרוק את השוק ויחשב שווי מבוסס נתונים.</p>
      </header>

      {/* Step indicator */}
      <div className="mb-7 flex items-center gap-2">
        {STEPS.map((s, idx) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition",
              idx < step ? "bg-brand text-white" : idx === step ? "bg-brand text-white ring-4 ring-brand/20" : "bg-line/60 text-muted")}>
              {idx < step ? <Icon name="Check" size={14} /> : idx + 1}
            </div>
            <span className={cn("hidden text-xs font-bold sm:block", idx === step ? "text-ink" : "text-muted")}>{s}</span>
            {idx < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 rounded", idx < step ? "bg-brand" : "bg-line/60")} />}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">{error}</div>}

      <div className="border-line bg-card rounded-card border p-6 shadow-card">
        {/* Step 1: Location */}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="עיר *"><input className={inputCls} value={input.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="תל אביב" /></Field>
            <Field label="שכונה"><input className={inputCls} value={input.neighborhood ?? ""} onChange={(e) => set("neighborhood", e.target.value)} placeholder="לב העיר" /></Field>
            <Field label="רחוב"><input className={inputCls} value={input.street ?? ""} onChange={(e) => set("street", e.target.value)} placeholder="דרך השלום" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label='מס׳ בית'><input className={inputCls} value={input.houseNumber ?? ""} onChange={(e) => set("houseNumber", e.target.value)} placeholder="120" /></Field>
              <Field label='דירה'><input className={inputCls} value={input.apartmentNumber ?? ""} onChange={(e) => set("apartmentNumber", e.target.value)} placeholder="5" /></Field>
            </div>
          </div>
        )}

        {/* Step 2: Property details */}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="סוג נכס">
              <select className={inputCls} value={input.propertyType ?? ""} onChange={(e) => set("propertyType", e.target.value)}>
                <option value="">בחר…</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="חדרים"><input type="number" step="0.5" className={inputCls} value={input.rooms ?? ""} onChange={(e) => set("rooms", num(e.target.value))} placeholder="4" /></Field>
            <Field label='שטח בנוי (מ"ר) *'><input type="number" className={inputCls} value={input.builtSqm ?? ""} onChange={(e) => set("builtSqm", num(e.target.value))} placeholder="98" /></Field>
            <Field label='מרפסת (מ"ר)'><input type="number" className={inputCls} value={input.balconySqm ?? ""} onChange={(e) => set("balconySqm", num(e.target.value))} placeholder="12" /></Field>
            <Field label='גינה (מ"ר)'><input type="number" className={inputCls} value={input.gardenSqm ?? ""} onChange={(e) => set("gardenSqm", num(e.target.value))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="קומה"><input type="number" className={inputCls} value={input.floor ?? ""} onChange={(e) => set("floor", num(e.target.value))} placeholder="5" /></Field>
              <Field label='מתוך'><input type="number" className={inputCls} value={input.totalFloors ?? ""} onChange={(e) => set("totalFloors", num(e.target.value))} placeholder="8" /></Field>
            </div>
            <Field label="שנת בנייה"><input type="number" className={inputCls} value={input.buildingYear ?? ""} onChange={(e) => set("buildingYear", num(e.target.value))} placeholder="2005" /></Field>
          </div>
        )}

        {/* Step 3: Features */}
        {step === 2 && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Toggle label="מעלית" icon="ArrowUpDown" on={!!input.elevator} onClick={() => set("elevator", !input.elevator)} />
              <Toggle label='ממ"ד' icon="ShieldCheck" on={!!input.mamad} onClick={() => set("mamad", !input.mamad)} />
              <Toggle label="מחסן" icon="Warehouse" on={!!input.storage} onClick={() => set("storage", !input.storage)} />
              <Toggle label="משופץ" icon="Hammer" on={!!input.renovated} onClick={() => set("renovated", !input.renovated)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="חניות"><input type="number" className={inputCls} value={input.parkingCount ?? ""} onChange={(e) => set("parkingCount", num(e.target.value))} placeholder="1" /></Field>
              <Field label="מצב הנכס">
                <select className={inputCls} value={input.propertyCondition ?? ""} onChange={(e) => set("propertyCondition", e.target.value)}>
                  <option value="">בחר…</option>{CONDITIONS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </Field>
              <Field label="נוף">
                <select className={inputCls} value={input.viewQuality ?? ""} onChange={(e) => set("viewQuality", e.target.value)}>
                  <option value="">בחר…</option>{VIEWS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </Field>
              <Field label="חשיפת רעש">
                <select className={inputCls} value={input.noiseLevel ?? ""} onChange={(e) => set("noiseLevel", e.target.value)}>
                  <option value="">בחר…</option>{NOISE.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="הערות"><textarea className={cn(inputCls, "min-h-20 resize-y")} value={input.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="פרטים נוספים שישפיעו על ההערכה…" /></Field>
          </div>
        )}

        {/* Step 4: Market scan animation */}
        {step === 3 && (
          <div className="py-6">
            <div className="mb-6 flex flex-col items-center text-center">
              <span className="zono-gradient-glow mb-4 grid h-16 w-16 place-items-center rounded-3xl text-white">
                <Icon name="Sparkles" size={30} className={pending ? "animate-pulse" : ""} />
              </span>
              <p className="text-ink text-lg font-black">ZONO סורק את השוק…</p>
              <p className="text-muted text-sm">מנתח עסקאות, מודעות פעילות ונכסים שמכרת באזור.</p>
            </div>
            <div className="mx-auto max-w-md space-y-2.5">
              {SCAN_STATES.map((s, i) => (
                <div key={s} className={cn("flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
                  i < scanIdx ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                  i === scanIdx ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-card text-muted")}>
                  {i < scanIdx ? <Icon name="Check" size={16} /> : i === scanIdx ? <Icon name="Loader" size={16} className="animate-spin" /> : <span className="h-4 w-4 rounded-full border border-line" />}
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      {step < 3 && (
        <div className="mt-5 flex items-center justify-between">
          <button onClick={prev} disabled={step === 0} className="text-muted disabled:opacity-40 inline-flex items-center gap-1.5 px-2 py-2 text-sm font-bold">
            <Icon name="ChevronRight" size={16} /> חזרה
          </button>
          {step < 2 ? (
            <button onClick={next} className="btn-zono-primary zono-focus-ring inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-bold">
              המשך <Icon name="ChevronLeft" size={16} />
            </button>
          ) : (
            <button onClick={runScan} disabled={pending} className="btn-zono-primary zono-focus-ring inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-bold disabled:opacity-60">
              <Icon name="Sparkles" size={16} /> חשב שווי
            </button>
          )}
        </div>
      )}
    </main>
  );
}
