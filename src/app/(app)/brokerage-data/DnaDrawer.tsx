"use client";
// ============================================================================
// 🧬 Brokerage DNA drawer — deterministic identity profile for an office/broker.
// Lazy-loads the DNA via a server action (RLS-scoped). Read-only, light theme.
// Phase 26.9.6 (deferred slice).
// ============================================================================
import { useEffect, useState } from "react";
import { getOfficeDnaAction, getBrokerDnaAction } from "@/lib/brokerage-data/actions";
import type { BrokerageDna, DnaSignal } from "@/lib/brokerage-data/dna";

export interface DnaTarget { type: "office" | "broker"; id: string; name: string }

function scoreTone(n: number): string {
  return n >= 80 ? "text-emerald-700" : n >= 55 ? "text-amber-700" : "text-rose-700";
}
function statusHe(s: string): string {
  const map: Record<string, string> = {
    active: "פעיל", verified: "מאומת", unverified: "לא מאומת", candidate: "מועמד",
    inactive: "לא פעיל", conflict: "קונפליקט", not_found_recently: "לא נמצא לאחרונה",
  };
  return map[s] ?? s;
}

function SignalRow({ s }: { s: DnaSignal }) {
  const dot = s.kind === "strength" ? "bg-emerald-500" : s.kind === "gap" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <div className="text-sm font-bold text-ink">{s.label}</div>
        {s.detail && <div className="truncate text-[11px] text-muted" dir="ltr">{s.detail}</div>}
      </div>
    </div>
  );
}

export function DnaDrawer({ target, onClose }: { target: DnaTarget | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [dna, setDna] = useState<BrokerageDna | null>(null);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setDna(null);
      const data = target.type === "office"
        ? await getOfficeDnaAction(target.id)
        : await getBrokerDnaAction(target.id);
      if (alive) { setDna(data); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [target]);

  if (!target) return null;

  const strengths = dna?.signals.filter((s) => s.kind === "strength") ?? [];
  const gaps = dna?.signals.filter((s) => s.kind === "gap") ?? [];
  const facts = dna?.signals.filter((s) => s.kind === "fact") ?? [];

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex justify-start">
      <button aria-label="סגור" className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-wide text-brand-strong">
              {target.type === "office" ? "DNA משרד" : "DNA מתווך"}
            </div>
            <h2 className="truncate text-lg font-black text-ink">{dna?.name ?? target.name}</h2>
            {dna?.subtitle && <div className="truncate text-xs text-muted">{dna.subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted hover:text-ink">✕</button>
        </div>

        {loading && <div className="p-6 text-center text-sm text-muted">טוען DNA…</div>}
        {!loading && !dna && <div className="p-6 text-center text-sm text-muted">לא ניתן לטעון את ה-DNA כעת.</div>}

        {!loading && dna && (
          <div className="flex flex-col gap-5 p-5">
            {/* Scores */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-line bg-surface p-3 text-center">
                <div className={`text-2xl font-black ${scoreTone(dna.dnaScore)}`}>{dna.dnaScore}</div>
                <div className="text-[11px] text-muted">ציון DNA</div>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-3 text-center">
                <div className={`text-2xl font-black ${scoreTone(dna.confidenceScore)}`}>{dna.confidenceScore}</div>
                <div className="text-[11px] text-muted">ביטחון זהות</div>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-3 text-center">
                <div className={`text-2xl font-black ${scoreTone(dna.completeness)}`}>{dna.completeness}</div>
                <div className="text-[11px] text-muted">שלמות נתונים</div>
              </div>
            </div>

            {/* Status + footprint */}
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-brand-soft px-2 py-0.5 font-bold text-brand-strong">{statusHe(dna.status)}</span>
              {dna.entityType === "office" && <span className="rounded-full bg-surface px-2 py-0.5 text-muted">{dna.footprint.agentCount} מתווכים</span>}
              <span className="rounded-full bg-surface px-2 py-0.5 text-muted">{dna.footprint.linkedListings} מודעות מקושרות</span>
              {dna.footprint.cities.length > 0 && <span className="rounded-full bg-surface px-2 py-0.5 text-muted">{dna.footprint.cities.length} ערים</span>}
              {dna.footprint.sources.length > 0 && <span className="rounded-full bg-surface px-2 py-0.5 text-muted">{dna.footprint.sources.length} מקורות</span>}
            </div>

            {strengths.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-black text-ink">חוזקות</h3>
                <div className="flex flex-col gap-2">{strengths.map((s, i) => <SignalRow key={i} s={s} />)}</div>
              </section>
            )}
            {gaps.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-black text-ink">פערים להשלמה</h3>
                <div className="flex flex-col gap-2">{gaps.map((s, i) => <SignalRow key={i} s={s} />)}</div>
              </section>
            )}
            {facts.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-black text-ink">עובדות</h3>
                <div className="flex flex-col gap-2">{facts.map((s, i) => <SignalRow key={i} s={s} />)}</div>
              </section>
            )}

            <p className="text-[11px] leading-relaxed text-muted">
              פרופיל ה-DNA נבנה באופן דטרמיניסטי מתוך הנתונים הקיימים במערכת בלבד (זהות, מתווכים, מודעות מקושרות). שום ערך אינו מומצא.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
