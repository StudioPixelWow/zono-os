"use client";
// ============================================================================
// 🗂️ National Brokerage Registry™ UI (Phase 26.11, RTL). Owner-only.
// Sections: registry overview · office candidates · pending verification ·
// verified offices · duplicate suggestions · unresolved brokers · broker→office
// matches. Filters: city · brand · status · confidence · source. Clearly
// distinguishes CANDIDATE (suggested, unverified) from VERIFIED (evidence-backed).
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getOfficeRegistrySnapshotAction, runNationalOfficeRegistryAction } from "@/lib/brokerage-data/actions";
import type { OfficeRegistrySnapshot, RegistryRunResult } from "@/lib/brokerage-data/office-registry";

const STATUS_HE: Record<string, string> = {
  candidate_pending_verification: "מועמד — ממתין לאימות",
  needs_review: "דורש בדיקה",
  verified: "מאומת",
  rejected: "נדחה",
  active: "פעיל",
};
const SOURCE_HE: Record<string, string> = {
  zono_listings: "מודעות ZONO", known_brands: "מותגים ידועים", public_source: "מקור ציבורי", ai: "הצעת AI", manual: "ידני",
};
const fmt = (n: number) => n.toLocaleString("he-IL");

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  const c = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-ink";
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2.5">
      <div className={`text-lg font-black tabular-nums ${c}`}>{fmt(value)}</div>
      <div className="text-muted mt-0.5 text-[11px] leading-tight">{label}</div>
    </div>
  );
}
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "violet" | "blue" }) {
  const c = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700"
    : tone === "violet" ? "bg-violet-50 text-violet-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-surface text-muted";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-card rounded-2xl border p-4">
      <h3 className="text-ink text-sm font-black">{title}</h3>
      {subtitle && <p className="text-muted mt-0.5 mb-2 text-[11px]">{subtitle}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="border-line bg-surface text-muted rounded-xl border border-dashed p-4 text-center text-xs">{text}</div>;
}

export function RegistryView() {
  const router = useRouter();
  const [snap, setSnap] = useState<OfficeRegistrySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RegistryRunResult | null>(null);

  const [city, setCity] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [minConf, setMinConf] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await getOfficeRegistrySnapshotAction();
      if (active) { setSnap(data); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const runRegistry = () => {
    setMsg(null); setErr(null); setLastResult(null);
    start(async () => {
      const r = await runNationalOfficeRegistryAction();
      if (!r.ok) { setErr(r.error ?? "המרשם נכשל."); return; }
      setLastResult(r.result ?? null);
      setMsg(r.result?.message ?? "המרשם הסתיים ✓");
      const data = await getOfficeRegistrySnapshotAction();
      setSnap(data);
      router.refresh();
    });
  };

  const candidates = useMemo(() => {
    const list = snap?.candidates ?? [];
    return list.filter((c) =>
      // Hide rejected (incl. person-name) candidates unless the user explicitly
      // filters for that status — they are not real office candidates.
      (status ? c.status === status : c.status !== "rejected") &&
      (!city || c.city === city) && (!brand || c.brandNetwork === brand) &&
      (!source || c.suggestedBy === source) && c.confidence >= minConf);
  }, [snap, city, brand, status, source, minConf]);

  // The header + run button render UNCONDITIONALLY (no permission/loading/null
  // gate) so the primary action is always visible in Brokerage Data.
  // Verified section: ONLY genuinely active offices — a rejected/person-name
  // office (e.g. "נדב רייזר") must never appear here as "מאומת".
  const verifiedOffices = (snap?.offices ?? []).filter((o) => o.status === "active" && (!city || o.city === city) && (!brand || o.brandNetwork === brand) && o.confidence >= minConf);
  const needsReview = (snap?.candidates ?? []).filter((x) => x.status === "needs_review");
  const rm = lastResult?.metrics;

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* ── Always-visible header + primary run button ── */}
      <section className="border-brand/40 bg-brand-soft/40 flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-brand-strong text-lg font-black">🗂️ מרשם משרדי תיווך לאומי</h2>
          <p className="text-muted mt-1 max-w-2xl text-[11px] leading-relaxed">
            בונה מאגר מובנה של מועמדי משרדים לפי עיר/מותג מראיות. AI מציע מועמדים בלבד — אימות מתבצע על בסיס ראיות בלבד, ורק אז נוצר משרד מאומת. אין משרדים/טלפונים/אתרים מומצאים.
          </p>
          {snap?.lastRun && (
            <p className="text-muted mt-1.5 text-[11px]">
              ריצה אחרונה: <Pill tone={snap.lastRun.status === "completed" ? "green" : snap.lastRun.status === "failed" ? "amber" : "blue"}>{STATUS_HE[snap.lastRun.status] ?? snap.lastRun.status}</Pill>
              {snap.lastRun.finishedAt ? ` · ${new Date(snap.lastRun.finishedAt).toLocaleString("he-IL")}` : ""} · {snap.lastRun.candidatesCreated} מועמדים · {snap.lastRun.candidatesVerified} אומתו · {snap.lastRun.officesCreated} משרדים
            </p>
          )}
        </div>
        <Button onClick={runRegistry} disabled={pending} className="!min-w-[220px] shrink-0">
          {pending ? "⏳ מריץ מרשם לאומי…" : "🚀 הפעל מרשם לאומי"}
        </Button>
      </section>

      {/* Progress while running */}
      {pending && (
        <div className="border-brand/30 bg-brand-soft/30 text-brand-strong flex items-center gap-3 rounded-2xl border p-4 text-sm font-bold">
          <span className="border-brand-strong/30 border-t-brand-strong h-4 w-4 animate-spin rounded-full border-2" />
          מגלה מועמדים · מאמת ראיות · מקשר מתווכים למשרדים…
        </div>
      )}
      {(msg || err) && <p className={`text-sm font-bold ${err ? "text-rose-700" : "text-emerald-700"}`}>{err ?? msg}</p>}

      {/* Post-run summary (from the run result itself) */}
      {rm && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="מועמדים נוצרו" value={rm.officeCandidatesCreated} />
            <Stat label="מועמדים אומתו" value={rm.candidatesVerified} tone="green" />
            <Stat label="משרדים נוצרו" value={rm.officesCreated} tone="green" />
            <Stat label="מתווכים שויכו" value={rm.brokersResolved} />
            <Stat label="ממתינים לאישור" value={rm.brokersPendingReview} tone="amber" />
            <Stat label="מתווכים ללא משרד" value={rm.brokersUnresolved} />
          </div>
          {/* Diagnostics — always explain WHY (especially when candidates = 0). */}
          <div className="border-line bg-surface grid grid-cols-2 gap-2 rounded-2xl border p-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="מתווכים שעובדו" value={rm.agentsProcessed} />
            <Stat label="עם ראיה ציבורית" value={rm.agentsWithPublicEvidence} />
            <Stat label="עם שם משרד שזוהה" value={rm.agentsWithOfficeHint} tone={rm.agentsWithOfficeHint === 0 ? "amber" : undefined} />
            <Stat label="ללא ראיה ציבורית" value={rm.noPublicEvidence} tone="amber" />
            <Stat label="בקשות AI" value={rm.aiRequests} />
            <Stat label="מועמדי AI" value={rm.aiCandidatesCreated} />
          </div>
          {!rm.aiConfigured && <p className="text-amber-700 text-[11px] font-bold">⚠ OpenAI אינו מוגדר (OPENAI_API_KEY) — שלב הסקת ה‑AI דילג. מקורות אינטרנט ציבוריים (Google/Facebook/LinkedIn/Yad2/Madlan) אינם מחוברים.</p>}
        </div>
      )}

      {loading && <Empty text="טוען מרשם…" />}

      {snap && <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="מועמדים לאימות" value={snap.counts.candidatesPending} />
        <Stat label="דורשים בדיקה" value={snap.counts.needsReview} tone="amber" />
        <Stat label="משרדים מאומתים" value={snap.counts.verified} tone="green" />
        <Stat label="סך משרדים" value={snap.counts.offices} tone="green" />
        <Stat label="כפילויות" value={snap.counts.duplicates} tone="amber" />
        <Stat label="מתווכים ללא משרד" value={snap.counts.unresolved} />
        <Stat label="הצעות AI" value={snap.counts.aiCandidates} />
      </div>

      {/* Filters */}
      <div className="border-line bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-3">
        <select value={city} onChange={(e) => setCity(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
          <option value="">כל הערים</option>{snap.cities.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
          <option value="">כל המותגים</option>{snap.brands.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_HE).filter(([k]) => k !== "active").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
          <option value="">כל המקורות</option>{Object.entries(SOURCE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-xs font-bold">
          <option value={0}>כל רמות הביטחון</option><option value={70}>≥ 70%</option><option value={90}>≥ 90%</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="מועמדי משרדים" subtitle="הצעות לבדיקה — לא מאומתות">
          {candidates.length === 0 ? <Empty text="אין מועמדים בסינון הנוכחי." /> : (
            <div className="flex flex-col gap-2">
              {candidates.slice(0, 60).map((x) => (
                <div key={x.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-ink truncate text-sm font-bold">{x.officeName}</div>
                    <div className="text-muted truncate text-[11px]">{[x.brandNetwork, x.city, SOURCE_HE[x.suggestedBy] ?? x.suggestedBy].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone={x.status === "verified" ? "green" : x.status === "needs_review" ? "amber" : x.suggestedBy === "ai" ? "violet" : "blue"}>{STATUS_HE[x.status] ?? x.status}</Pill>
                    <span className="text-muted text-[11px] tabular-nums">{Math.round(x.confidence)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="משרדים מאומתים" subtitle="נוצרו מראיות בלבד">
          {verifiedOffices.length === 0 ? <Empty text="עדיין אין משרדים מאומתים. הפעל את המרשם לאחר סריקה." /> : (
            <div className="flex flex-col gap-2">
              {verifiedOffices.slice(0, 60).map((o) => (
                <div key={o.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-ink truncate text-sm font-bold">{o.name}</div>
                    <div className="text-muted truncate text-[11px]">{[o.brandNetwork, o.city, `${o.brokerCount} מתווכים`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone="green">מאומת</Pill>
                    <span className="text-muted text-[11px] tabular-nums">{Math.round(o.confidence)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="ממתינים לאימות" subtitle="ראיה חלקית — דורש בדיקה ידנית">
          {needsReview.length === 0 ? <Empty text="אין מועמדים הדורשים בדיקה." /> : (
            <div className="flex flex-col gap-2">
              {needsReview.slice(0, 40).map((x) => (
                <div key={x.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <span className="text-ink truncate text-sm font-bold">{x.officeName}<span className="text-muted font-normal"> · {[x.brandNetwork, x.city].filter(Boolean).join(" · ")}</span></span>
                  <Pill tone="amber">דורש בדיקה</Pill>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="הצעות מיזוג כפילויות" subtitle="ללא מיזוג אוטומטי — לאישור ידני">
          {snap.mergeSuggestions.length === 0 ? <Empty text="לא זוהו כפילויות." /> : (
            <div className="flex flex-col gap-2">
              {snap.mergeSuggestions.slice(0, 40).map((mm) => (
                <div key={mm.id} className="border-line bg-surface rounded-xl border px-3 py-2 text-sm">
                  <div className="text-ink font-bold">{mm.primaryName} ⇄ {mm.duplicateName}</div>
                  <div className="text-muted mt-0.5 flex items-center gap-2 text-[11px]"><Pill tone="amber">{mm.reason}</Pill><span className="tabular-nums">{Math.round(mm.confidence)}%</span></div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="התאמות מתווך → משרד" subtitle="ממתינות לאישור (70–94%)">
          {snap.brokerOfficeMatches.length === 0 ? <Empty text="אין התאמות ממתינות." /> : (
            <div className="flex flex-col gap-2">
              {snap.brokerOfficeMatches.slice(0, 40).map((mm) => (
                <div key={mm.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                  <span className="text-ink truncate font-bold">{mm.brokerName}<span className="text-muted font-normal"> → {mm.officeName}</span></span>
                  <span className="text-muted shrink-0 text-[11px] tabular-nums">{Math.round(mm.confidence)}%</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="מתווכים ללא משרד" subtitle="טרם נמצאה ראיה לשיוך משרד">
          {snap.unresolvedBrokers.length === 0 ? <Empty text="כל המתווכים שויכו." /> : (
            <div className="flex flex-col gap-2">
              {snap.unresolvedBrokers.slice(0, 40).map((b) => (
                <div key={b.id} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                  <span className="text-ink truncate font-bold">{b.fullName}</span>
                  <span className="text-muted shrink-0 text-[11px]">{b.city ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      </>}
    </div>
  );
}
