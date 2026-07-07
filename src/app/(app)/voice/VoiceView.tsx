"use client";
// ============================================================================
// 🎙️ ZONO — Voice AI view (mobile-first RTL). PHASE 53.0.
// Consent checkbox → paste transcript → structured memory + approval-gated
// suggestions. Amounts are quoted, never promised. Nothing auto-updates the CRM.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { processVoiceAction, applyVoiceSuggestionAction } from "@/lib/voice-ai/actions";
import { SOURCE_HE, SUGGESTION_HE, type VoiceMemory, type VoiceSource } from "@/lib/voice-ai/types";
import type { VoiceProviderInfo, RecentVoiceItem } from "@/lib/voice-ai/service";

const SOURCES: VoiceSource[] = ["voice_note", "call_recording", "meeting_audio", "manual_transcript"];
const SENT_HE: Record<string, string> = { positive: "חיובי", neutral: "ניטרלי", negative: "שלילי" };
const SENT_CLS: Record<string, string> = { positive: "bg-success-soft text-success", neutral: "bg-surface text-muted", negative: "bg-danger-soft text-danger" };

export function VoiceView({ provider, recent }: { provider: VoiceProviderInfo; recent: RecentVoiceItem[] }) {
  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState<VoiceSource>("meeting_audio");
  const [transcript, setTranscript] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [memory, setMemory] = useState<VoiceMemory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const process = () => {
    setErr(null); setMemory(null);
    start(async () => {
      const r = await processVoiceAction({ transcript, source, consentConfirmed: consent, entityType: entityType || null, entityId: entityId || null });
      if (r.error) setErr(r.error);
      else if (r.memory) setMemory(r.memory);
    });
  };

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · Voice AI</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🎙️ זיכרון קולי</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">הפוך הודעה קולית / הקלטת שיחה / אודיו פגישה לזיכרון מובנה: סיכום, ישויות, כוונות והצעות לאישור. ZONO אינו מקליט — הדבק תמלול.</p>
      </div>

      {/* Provider status */}
      <div className={cn("mt-4 rounded-xl px-3 py-2 text-[12px] font-semibold", provider.mode === "live" ? "bg-success-soft text-success" : "bg-surface text-muted border-line border")}>
        {provider.description}
      </div>

      {/* Consent (safety gate) */}
      <label className="bg-warning-soft mt-3 flex items-start gap-2 rounded-xl p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="text-warning text-[12px] font-semibold leading-relaxed">⚠️ אני מאשר/ת שכל המשתתפים יודעים ומסכימים להקלטה/תמלול. אין להקליט בסתר. הסיכומים הם מידע בלבד — ללא התחייבות משפטית/פיננסית, ושום עדכון CRM לא מתבצע ללא אישור.</span>
      </label>

      {/* Input */}
      <div className="bg-card border-line mt-3 rounded-[20px] border p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SOURCES.map((s) => (
            <button key={s} onClick={() => setSource(s)} className={cn("rounded-full px-3 py-1.5 text-[12px] font-bold transition", source === s ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{SOURCE_HE[s]}</button>
          ))}
        </div>
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} placeholder="הדבק כאן את התמלול (מהודעה קולית, שיחה או פגישה)…" className="bg-surface border-line text-ink focus:border-brand-light w-full rounded-xl border p-3 text-sm outline-none" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="קישור לישות (buyer/lead/property) — אופציונלי" className="bg-surface border-line text-ink h-9 rounded-xl border px-3 text-[12px] outline-none" />
          <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="מזהה הישות — אופציונלי" className="bg-surface border-line text-ink h-9 rounded-xl border px-3 text-[12px] outline-none" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={process} disabled={pending || !consent || !transcript.trim()} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>עבד תמלול</Button>
          {!consent && <span className="text-muted text-[11px]">סמן הסכמה כדי לעבד</span>}
        </div>
      </div>

      {err && <p className="bg-danger-soft text-danger mt-4 rounded-xl px-3 py-2 text-sm font-semibold">{err}</p>}

      {memory && <MemoryView memory={memory} entityType={entityType} entityId={entityId} />}

      {recent.length > 0 && !memory && (
        <div className="bg-card border-line mt-4 rounded-[20px] border p-4">
          <h3 className="text-ink mb-2 text-sm font-extrabold">זיכרונות קוליים אחרונים</h3>
          <div className="space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="bg-surface rounded-xl p-3">
                <p className="text-ink text-[13px] font-bold">{r.title}</p>
                {r.summary && <p className="text-muted line-clamp-2 text-[12px]">{r.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryView({ memory, entityType, entityId }: { memory: VoiceMemory; entityType: string; entityId: string }) {
  const e = memory.entities;
  const chips: { label: string; items: string[] }[] = [
    { label: "טלפונים", items: e.phones }, { label: "סכומים", items: e.amounts }, { label: "תאריכים", items: e.dates },
    { label: "מקומות", items: e.places }, { label: "אנשים", items: e.contacts },
  ].filter((c) => c.items.length);

  return (
    <div className="mt-4 space-y-3">
      <div className="bg-card border-line rounded-[20px] border p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-ink text-lg font-black">סיכום</h2>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SENT_CLS[memory.sentiment])}>{SENT_HE[memory.sentiment]}</span>
        </div>
        <p className="text-muted text-[13px] leading-relaxed">{memory.summary || "—"}</p>
        {memory.keyPoints.length > 0 && (
          <ul className="mt-2 space-y-1">{memory.keyPoints.map((k, i) => <li key={i} className="text-muted text-[12px]">• {k}</li>)}</ul>
        )}
        {chips.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {chips.map((c) => (
              <div key={c.label} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted text-[11px] font-bold">{c.label}:</span>
                {c.items.map((it, i) => <span key={i} className="bg-surface text-ink rounded-full px-2 py-0.5 text-[11px] font-bold">{it}</span>)}
              </div>
            ))}
          </div>
        )}
        {memory.disclaimers.map((d, i) => <p key={i} className="text-muted mt-2 text-[11px]">🔒 {d}</p>)}
      </div>

      {memory.suggestions.length > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <h3 className="text-ink mb-3 text-sm font-extrabold">הצעות לפעולה (דורשות אישור)</h3>
          <div className="space-y-2">
            {memory.suggestions.map((s) => <SuggestionRow key={s.id} kind={s.kind} label={s.label} detail={s.detail} inline={s.canApplyInline} href={s.targetHref} note={memory.summary} entityType={entityType} entityId={entityId} />)}
          </div>
        </div>
      )}
      <p className="text-muted text-[11px] leading-relaxed">🔒 {memory.consentLabel}</p>
    </div>
  );
}

function SuggestionRow({ kind, label, detail, inline, href, note, entityType, entityId }: { kind: string; label: string; detail: string; inline: boolean; href: string | null; note: string; entityType: string; entityId: string }) {
  const [state, setState] = useState<{ msg?: string; err?: string; busy?: boolean }>({});
  const apply = () => {
    setState({ busy: true });
    void applyVoiceSuggestionAction({ kind, entityType, entityId, note }).then((r) => setState(r.ok ? { msg: r.message ?? "נשמר ✓" } : { err: r.error ?? "נכשל" }));
  };
  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-[13px] font-bold">{label} <span className="bg-brand-soft text-brand rounded-full px-1.5 py-0.5 text-[10px] font-bold">{SUGGESTION_HE[kind as keyof typeof SUGGESTION_HE] ?? kind}</span></p>
          <p className="text-muted mt-0.5 text-[12px]">{detail}</p>
        </div>
        <span className="bg-warning-soft text-warning shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">דורש אישור</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {inline
          ? <Button size="sm" disabled={state.busy || !!state.msg || !entityId} loading={state.busy} onClick={apply}>אשר ושמור הערה</Button>
          : href ? <Link href={href} className="bg-brand-soft text-brand inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-bold">פתח במסך היעד ↗</Link> : null}
        {inline && !entityId && <span className="text-muted text-[11px]">קשר ישות (סוג + מזהה) כדי לשמור</span>}
      </div>
      {state.msg && <p className="text-success mt-1.5 text-[11px] font-bold">{state.msg}</p>}
      {state.err && <p className="text-danger mt-1.5 text-[11px] font-bold">{state.err}</p>}
    </div>
  );
}
