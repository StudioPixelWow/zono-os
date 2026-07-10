"use client";
// ============================================================================
// ⚡ ZONO — Command Center Quick-Create. One premium modal that powers the four
// global quick actions (new lead / deal / meeting / task). Opened via window
// events dispatched by the Command Center. Reuses the EXISTING create actions
// (createLeadAction / createDealAction / confirmBookingAction / createTaskAction)
// and ONE shared entity picker over globalSearchAction. RTL, mobile bottom-sheet,
// focus-first, ESC-to-close, keyboard-nav, double-submit guarded, success/error.
// ============================================================================
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { globalSearchAction } from "@/lib/search/actions";
import { createLeadAction, LEAD_SOURCE_OPTIONS, LEAD_INTENT_OPTIONS } from "@/lib/leads/actions";
import { createDealAction, DEAL_STAGE_OPTIONS } from "@/lib/deals/create-actions";
import { createTaskAction, TASK_PRIORITY_OPTIONS } from "@/lib/tasks/actions";
import { confirmBookingAction } from "@/lib/calendar-os/booking-actions";
import type { BookingKind } from "@/lib/calendar-os/booking";

type Kind = "lead" | "deal" | "meeting" | "task" | null;
const EVENTS: Record<Exclude<Kind, null>, string> = { lead: "zono:new-lead", deal: "zono:new-deal", meeting: "zono:new-meeting", task: "zono:new-task" };
const TITLES: Record<Exclude<Kind, null>, { title: string; icon: string }> = {
  lead: { title: "ליד חדש", icon: "MessageCircle" }, deal: { title: "עסקה חדשה", icon: "Briefcase" },
  meeting: { title: "פגישה חדשה", icon: "Calendar" }, task: { title: "משימה חדשה", icon: "ListChecks" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const SOURCE_HE: Record<string, string> = { website: "אתר / דף נחיתה", facebook: "Facebook", instagram: "Instagram", referral: "המלצה", open_house: "בית פתוח", sign_call: "שלט / טלפון", cold_outreach: "פנייה יזומה", portal: "פורטל (יד2/מדלן)", partner: "שותף", other: "אחר / ידני" };
const INTENT_HE: Record<string, string> = { buyer: "קונה", seller: "מוכר", both: "קונה+מוכר", investor: "משקיע", renter: "שוכר", unknown: "לא ידוע" };
const STAGE_HE: Record<string, string> = { new: "הזדמנות חדשה", qualified: "מוסמכת", negotiation: "משא ומתן", agreement: "הסכמה", contract: "חוזה", closing: "סגירה" };
const PRIO_HE: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה", urgent: "דחופה" };
const BOOKING_KINDS: { kind: BookingKind; label: string }[] = [
  { kind: "buyer_visit", label: "ביקור קונה" }, { kind: "seller_meeting", label: "פגישת מוכר" },
  { kind: "property_visit", label: "ביקור בנכס" }, { kind: "valuation", label: "הערכת שווי" },
  { kind: "office_meeting", label: "פגישת משרד" }, { kind: "open_house", label: "בית פתוח" },
];

interface Picked { kind: "property" | "buyer" | "seller"; id: string; label: string }
const TYPE_TO_KIND: Record<string, Picked["kind"]> = { properties: "property", buyers: "buyer", sellers: "seller" };

export function QuickCreate() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mk = (k: Exclude<Kind, null>) => () => setKind(k);
    const handlers = (Object.keys(EVENTS) as Exclude<Kind, null>[]).map((k) => [EVENTS[k], mk(k)] as const);
    handlers.forEach(([ev, fn]) => window.addEventListener(ev, fn));
    return () => handlers.forEach(([ev, fn]) => window.removeEventListener(ev, fn));
  }, []);

  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setKind(null); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => firstRef.current?.focus(), 60);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [kind]);

  const close = () => setKind(null);

  return (
    <AnimatePresence>
      {kind && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <motion.div dir="rtl" onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="bg-card border-line max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border p-5 shadow-[var(--shadow-lift)] sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name={TITLES[kind].icon} size={18} /></span>
                <h2 className="text-ink text-lg font-black">{TITLES[kind].title}</h2>
              </div>
              <button onClick={close} aria-label="סגור" className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
            </div>
            {kind === "lead" && <LeadForm firstRef={firstRef} router={router} onDone={close} />}
            {kind === "deal" && <DealForm firstRef={firstRef} router={router} onDone={close} />}
            {kind === "meeting" && <MeetingForm firstRef={firstRef} router={router} onDone={close} />}
            {kind === "task" && <TaskForm firstRef={firstRef} router={router} onDone={close} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type RouterT = ReturnType<typeof useRouter>;
type FirstRef = React.RefObject<HTMLInputElement | null>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-muted mb-1 block text-[12px] font-bold">{label}</span>{children}</label>;
}
const inputCls = "bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2.5 text-sm outline-none";
function Success({ label }: { label: string }) {
  return <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="bg-success-soft text-success grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Check" size={28} /></span><p className="text-ink text-sm font-black">{label}</p></div>;
}
function SaveBar({ pending, ok, label }: { pending: boolean; ok: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending || ok} className="btn-zono-primary zono-focus-ring sticky bottom-0 mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-black text-white disabled:opacity-60">
      {pending ? <Spinner size={16} /> : <Icon name="Check" size={16} />} {label}
    </button>
  );
}

// ── Shared entity picker (globalSearchAction; org-scoped) ─────────────────────
function EntityPicker({ label, allow, value, onPick }: { label: string; allow: Picked["kind"][]; value: Picked | null; onPick: (p: Picked | null) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback((query: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const groups = await globalSearchAction(query.trim());
        const out: Picked[] = [];
        for (const g of groups) { const k = TYPE_TO_KIND[g.type]; if (k && allow.includes(k)) for (const h of g.hits) out.push({ kind: k, id: h.id, label: h.title }); }
        setHits(out.slice(0, 8));
      } catch { setHits([]); } finally { setLoading(false); }
    }, 250);
  }, [allow]);

  if (value) {
    return (
      <Field label={label}>
        <div className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
          <span className="text-ink truncate text-sm font-bold">{value.label}</span>
          <button type="button" onClick={() => onPick(null)} className="text-muted hover:text-ink shrink-0" aria-label="נקה"><Icon name="X" size={15} /></button>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <div className="relative">
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); run(e.target.value); }} onFocus={() => setOpen(true)} placeholder="חפש…" className={inputCls} />
        {open && q.trim().length >= 2 && (
          <div className="bg-card border-line absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border shadow-[var(--shadow-lift)]">
            {loading ? <div className="text-muted p-3 text-center text-[12px]">מחפש…</div>
              : hits.length === 0 ? <div className="text-muted p-3 text-center text-[12px]">אין תוצאות</div>
              : hits.map((h) => (
                <button key={`${h.kind}-${h.id}`} type="button" onClick={() => { onPick(h); setOpen(false); setQ(""); }} className="hover:bg-brand-soft flex w-full items-center gap-2 px-3 py-2 text-right text-[13px]">
                  <span className="text-ink truncate font-bold">{h.label}</span>
                  <span className="text-muted mr-auto shrink-0 text-[10px]">{h.kind === "property" ? "נכס" : h.kind === "buyer" ? "קונה" : "מוכר"}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </Field>
  );
}

// ── LEAD ──────────────────────────────────────────────────────────────────────
function LeadForm({ firstRef, router, onDone }: { firstRef: FirstRef; router: RouterT; onDone: () => void }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [source, setSource] = useState<string>("website"); const [intent, setIntent] = useState("unknown");
  const [area, setArea] = useState(""); const [budget, setBudget] = useState(""); const [notes, setNotes] = useState("");
  const [prop, setProp] = useState<Picked | null>(null);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    start(async () => {
      const r = await createLeadAction({ fullName: name, phone, email, source, intent, area, budget, notes, propertyId: prop?.id ?? null });
      if (r.ok && r.id) { setOk(true); setTimeout(() => { onDone(); router.push(`/leads/${r.id}`); }, 700); }
      else setErr(r.error ?? "יצירת הליד נכשלה.");
    });
  };
  if (ok) return <Success label="הליד נוצר בהצלחה" />;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="שם *"><input ref={firstRef} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="שם מלא" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="טלפון"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputCls} placeholder="050…" /></Field>
        <Field label="אימייל"><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={inputCls} placeholder="name@…" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מקור *"><select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>{LEAD_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{SOURCE_HE[s] ?? s}</option>)}</select></Field>
        <Field label="כוונה"><select value={intent} onChange={(e) => setIntent(e.target.value)} className={inputCls}>{LEAD_INTENT_OPTIONS.map((s) => <option key={s} value={s}>{INTENT_HE[s] ?? s}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="אזור מועדף"><input value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} /></Field>
        <Field label="תקציב"><input value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} /></Field>
      </div>
      <EntityPicker label="נכס מעניין (אופציונלי)" allow={["property"]} value={prop} onPick={setProp} />
      <Field label="הערות"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
      {err && <p className="text-danger text-[12px] font-bold">{err}</p>}
      <SaveBar pending={pending} ok={ok} label="צור ליד" />
    </form>
  );
}

// ── DEAL ──────────────────────────────────────────────────────────────────────
function DealForm({ firstRef, router, onDone }: { firstRef: FirstRef; router: RouterT; onDone: () => void }) {
  const [title, setTitle] = useState(""); const [stage, setStage] = useState<string>("new");
  const [prop, setProp] = useState<Picked | null>(null); const [buyer, setBuyer] = useState<Picked | null>(null); const [seller, setSeller] = useState<Picked | null>(null);
  const [value, setValue] = useState(""); const [commission, setCommission] = useState(""); const [close, setClose] = useState("");
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    start(async () => {
      const r = await createDealAction({
        title: title || (prop?.label ? `עסקה · ${prop.label}` : undefined), stage,
        propertyId: prop?.id ?? null, buyerId: buyer?.id ?? null, sellerId: seller?.id ?? null,
        value: value ? Number(value) : null, commission: commission ? Number(commission) : null, expectedClose: close || null,
      });
      if (r.ok) { setOk(true); setTimeout(() => { onDone(); router.push("/deals"); }, 700); }
      else setErr(r.error ?? "יצירת העסקה נכשלה.");
    });
  };
  if (ok) return <Success label="העסקה נוצרה בהצלחה" />;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="כותרת"><input ref={firstRef} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="למשל: עסקה · רחוב הרצל 5" /></Field>
      <EntityPicker label="נכס" allow={["property"]} value={prop} onPick={setProp} />
      <div className="grid grid-cols-2 gap-3">
        <EntityPicker label="קונה" allow={["buyer"]} value={buyer} onPick={setBuyer} />
        <EntityPicker label="מוכר" allow={["seller"]} value={seller} onPick={setSeller} />
      </div>
      <Field label="שלב *"><select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>{DEAL_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{STAGE_HE[s] ?? s}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שווי צפוי (₪)"><input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className={inputCls} /></Field>
        <Field label="עמלה צפויה (₪)"><input value={commission} onChange={(e) => setCommission(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className={inputCls} /></Field>
      </div>
      <Field label="תאריך סגירה צפוי"><input type="date" value={close} onChange={(e) => setClose(e.target.value)} className={inputCls} /></Field>
      {err && <p className="text-danger text-[12px] font-bold">{err}</p>}
      <SaveBar pending={pending} ok={ok} label="צור עסקה" />
    </form>
  );
}

// ── MEETING (reuses confirmBookingAction) ─────────────────────────────────────
function MeetingForm({ firstRef, router, onDone }: { firstRef: FirstRef; router: RouterT; onDone: () => void }) {
  const [title, setTitle] = useState(""); const [bkind, setBkind] = useState<BookingKind>("buyer_visit");
  const [date, setDate] = useState(todayStr()); const [time, setTime] = useState("10:00"); const [duration, setDuration] = useState(60);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!title.trim()) { setErr("יש להזין כותרת."); return; }
    const [y, m, dd] = date.split("-").map(Number); const [hh, mm] = time.split(":").map(Number);
    const s = new Date(y, m - 1, dd, hh, mm); const en = new Date(s.getTime() + duration * 60000);
    start(async () => {
      const r = await confirmBookingAction({ kind: bkind, slotStart: s.toISOString(), slotEnd: en.toISOString(), title: title.trim() });
      if (r.ok) { setOk(true); setTimeout(() => { onDone(); router.push(`/calendar`); }, 700); }
      else setErr(r.error ?? "יצירת הפגישה נכשלה.");
    });
  };
  if (ok) return <Success label="הפגישה נוצרה ונוספה ליומן" />;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="כותרת *"><input ref={firstRef} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="למשל: ביקור בנכס" /></Field>
      <Field label="סוג פגישה *">
        <div className="flex flex-wrap gap-1.5">{BOOKING_KINDS.map((k) => <button key={k.kind} type="button" onClick={() => setBkind(k.kind)} className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${bkind === k.kind ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{k.label}</button>)}</div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך *"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="שעה *"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
      </div>
      <Field label="משך *"><div className="flex gap-1.5">{[30, 45, 60, 90, 120].map((d) => <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${duration === d ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{d} ד׳</button>)}</div></Field>
      {err && <p className="text-danger text-[12px] font-bold">{err}</p>}
      <SaveBar pending={pending} ok={ok} label="צור פגישה" />
    </form>
  );
}

// ── TASK ──────────────────────────────────────────────────────────────────────
function TaskForm({ firstRef, router, onDone }: { firstRef: FirstRef; router: RouterT; onDone: () => void }) {
  const [title, setTitle] = useState(""); const [noDate, setNoDate] = useState(false); const [due, setDue] = useState(todayStr());
  const [priority, setPriority] = useState("medium"); const [notes, setNotes] = useState("");
  const [ent, setEnt] = useState<Picked | null>(null);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!title.trim()) { setErr("יש להזין כותרת."); return; }
    const dueAt = noDate ? null : new Date(`${due}T09:00`).toISOString();
    start(async () => {
      const r = await createTaskAction({ title, dueAt, priority, notes, entity: ent ? { kind: ent.kind, id: ent.id } : null });
      if (r.ok) { setOk(true); setTimeout(() => { onDone(); router.refresh(); }, 700); }
      else setErr(r.error ?? "יצירת המשימה נכשלה.");
    });
  };
  if (ok) return <Success label="המשימה נוצרה בהצלחה" />;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="כותרת *"><input ref={firstRef} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="מה צריך לעשות?" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך יעד">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={noDate} className={`${inputCls} disabled:opacity-50`} />
          <label className="text-muted mt-1 flex items-center gap-1.5 text-[11px] font-bold"><input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} className="h-3.5 w-3.5" /> ללא תאריך</label>
        </Field>
        <Field label="עדיפות *"><select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>{TASK_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIO_HE[p] ?? p}</option>)}</select></Field>
      </div>
      <EntityPicker label="ישות מקושרת (אופציונלי)" allow={["property", "buyer", "seller"]} value={ent} onPick={setEnt} />
      <Field label="הערות"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
      {err && <p className="text-danger text-[12px] font-bold">{err}</p>}
      <SaveBar pending={pending} ok={ok} label="צור משימה" />
    </form>
  );
}
