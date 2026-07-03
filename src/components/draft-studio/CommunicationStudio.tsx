"use client";
// ============================================================================
// ✉️ ZONO — Communication Studio (AI Draft Studio UI). 30.3. Part 9.
// Prepare communication for any entity — preview, copy, approve, reject,
// regenerate, with tone + language + channel + purpose selectors and versioning.
// APPROVAL-GATED: nothing is ever sent. Value constants imported from /types only.
// ============================================================================
import { useState } from "react";
import { cn } from "@/lib/utils";
import { generateDraftAction } from "@/lib/brokerage-data/actions";
import type { DraftBundle, Draft, DraftTarget, Channel, Purpose, Tone, Language, EntityKind } from "@/lib/draft-studio/types";
import { CHANNEL_HE, PURPOSE_HE, TONE_HE, ENTITY_HE } from "@/lib/draft-studio/types";

const CHANNELS: Channel[] = ["whatsapp", "sms", "email", "call", "in_person"];
const PURPOSES: Purpose[] = ["first_contact", "follow_up", "reminder", "negotiation", "thank_you", "document_request", "appointment_confirmation", "listing_update", "price_discussion", "meeting_summary"];
const TONES: Tone[] = ["professional", "friendly", "luxury", "urgent", "negotiation", "empathetic", "formal", "short", "long"];
const KINDS: EntityKind[] = ["buyer", "seller", "lead", "broker", "office", "property", "mission", "customer"];
type VerKey = "primary" | "short" | "long" | "alternative" | "altTone";
const VER_HE: Record<VerKey, string> = { primary: "ראשית", short: "קצר", long: "מפורט", alternative: "ניסוח חלופי", altTone: "טון אחר" };

export default function CommunicationStudio({ initialTarget }: { initialTarget?: DraftTarget }) {
  const [kind, setKind] = useState<EntityKind>(initialTarget?.entityKind ?? "buyer");
  const [entityId, setEntityId] = useState(initialTarget?.entityId ?? "");
  const [name, setName] = useState(initialTarget?.name ?? "");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [purpose, setPurpose] = useState<Purpose>("follow_up");
  const [tone, setTone] = useState<Tone>("professional");
  const [language, setLanguage] = useState<Language>("he");

  const [bundle, setBundle] = useState<DraftBundle | null>(null);
  const [ver, setVer] = useState<VerKey>("primary");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, "approved" | "rejected">>({});
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!entityId.trim() || !name.trim()) { setErr("יש להזין מזהה ושם ישות."); return; }
    setPending(true); setErr(null); setCopied(false);
    try {
      const r = await generateDraftAction({ entityKind: kind, entityId: entityId.trim(), name: name.trim() }, { channel, purpose, tone, language });
      if (r.ok && r.result) { setBundle(r.result); setVer("primary"); } else setErr(r.error ?? "נכשל");
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); }
  };

  const current: Draft | null = bundle ? (ver === "primary" ? bundle.primary : bundle.versions[ver]) : null;
  const copy = async () => { if (!current) return; try { await navigator.clipboard.writeText((current.subject ? `${current.subject}\n\n` : "") + current.body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">✉️ סטודיו התקשורת של ZONO</h1>
        <p className="text-muted text-[13px]">מכין תקשורת לכל ישות — טיוטה בלבד. שום דבר לא נשלח אוטומטית; כל טיוטה מחייבת אישור והעתקה ידנית.</p>
      </header>

      {/* Target + request selectors */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">סוג ישות</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as EntityKind)} className="rounded-lg border border-line bg-surface px-2 py-1.5">{KINDS.map((k) => <option key={k} value={k}>{ENTITY_HE[k]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">מזהה ישות</span>
            <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="ID" className="rounded-lg border border-line bg-surface px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">שם</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הישות" className="rounded-lg border border-line bg-surface px-2 py-1.5" />
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Selector label="ערוץ" value={channel} set={(v) => setChannel(v as Channel)} opts={CHANNELS.map((c) => [c, CHANNEL_HE[c]])} />
          <Selector label="מטרה" value={purpose} set={(v) => setPurpose(v as Purpose)} opts={PURPOSES.map((p) => [p, PURPOSE_HE[p]])} />
          <Selector label="טון" value={tone} set={(v) => setTone(v as Tone)} opts={TONES.map((t) => [t, TONE_HE[t]])} />
          <Selector label="שפה" value={language} set={(v) => setLanguage(v as Language)} opts={[["he", "עברית"], ["en", "English"]]} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={generate} disabled={pending} className="rounded-xl bg-sky-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "מכין טיוטה…" : bundle ? "צור מחדש" : "צור טיוטה"}</button>
          {err && <span className="text-[12px] font-semibold text-rose-700">{err}</span>}
        </div>
      </section>

      {bundle && current && (
        <section className="rounded-2xl border-2 border-sky-600/40 bg-sky-50/20 p-4">
          {/* Version tabs */}
          <div className="mb-3 flex flex-wrap gap-1">
            {(["primary", "short", "long", "alternative", "altTone"] as VerKey[]).map((k) => (
              <button key={k} onClick={() => setVer(k)} className={cn("rounded-full px-3 py-1 text-[11px] font-bold", ver === k ? "bg-sky-700 text-white" : "border border-sky-300 text-sky-800")}>{VER_HE[k]}</button>
            ))}
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-muted">{CHANNEL_HE[current.channel]} · {PURPOSE_HE[current.purpose]} · {TONE_HE[current.tone]} · {current.language === "he" ? "עברית" : "English"}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">ממתין לאישור · לא נשלח</span>
            </div>
            {current.subject && <p className="text-ink mb-1 font-bold">נושא: {current.subject}</p>}
            <pre className="text-ink whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">{current.body}</pre>
          </div>

          {/* Explainability */}
          <div className="mt-3 rounded-xl border border-indigo-300/50 bg-indigo-50/30 p-3 text-[12px]">
            <p className="text-indigo-800 font-bold">🧠 למה הטיוטה הזו · ביטחון {current.explain.confidence}%</p>
            <p className="text-muted mt-1"><b>למה:</b> {current.explain.why}</p>
            <p className="text-muted"><b>מטרה:</b> {current.explain.goal} · <b>תוצאה צפויה:</b> {current.explain.expectedOutcome}</p>
            <p className="text-muted"><b>ראיות:</b> {current.explain.evidence.join(" · ")}</p>
          </div>

          {/* Quick actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={copy} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-bold">{copied ? "הועתק ✓" : "העתק"}</button>
            <button onClick={() => setStatus((s) => ({ ...s, [current.id]: "approved" }))} className={cn("rounded-lg px-3 py-1.5 text-[12px] font-bold text-white", status[current.id] === "approved" ? "bg-emerald-700" : "bg-emerald-600")}>{status[current.id] === "approved" ? "אושר ✓" : "אשר"}</button>
            <button onClick={() => setStatus((s) => ({ ...s, [current.id]: "rejected" }))} className={cn("rounded-lg border px-3 py-1.5 text-[12px] font-bold", status[current.id] === "rejected" ? "border-rose-500 bg-rose-100 text-rose-800" : "border-rose-300 text-rose-700")}>{status[current.id] === "rejected" ? "נדחה" : "דחה"}</button>
            <button onClick={generate} disabled={pending} className="rounded-lg border border-sky-400 px-3 py-1.5 text-[12px] font-bold text-sky-800 disabled:opacity-60">רענן ניסוח</button>
            <span className="text-muted mr-auto text-[11px]">{bundle.notes.join(" · ")}</span>
          </div>
          {status[current.id] === "approved" && <p className="mt-2 text-[11px] font-semibold text-emerald-700">הטיוטה סומנה כמאושרת — העתק ושלח ידנית מהערוץ שלך. ZONO אינו שולח.</p>}
        </section>
      )}
    </div>
  );
}

function Selector({ label, value, set, opts }: { label: string; value: string; set: (v: string) => void; opts: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5">{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );
}
