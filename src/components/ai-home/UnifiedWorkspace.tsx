"use client";
// ============================================================================
// 🏠 ZONO — Unified AI Workspace™ (AI Home). 30.2. Parts 1–10.
// UX orchestration only — renders the OUTPUTS of the existing engines as one
// workspace: Today dashboard, Opportunity / Risk / Execution centers, a smart
// timeline, a context panel and an Ask ZONO dock. Everything approval-gated;
// nothing auto-executes. Value constants imported from pure /types submodules.
// ============================================================================
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getAiHomeAction, askZonoAction, approveInboxItemAction, rejectInboxItemAction } from "@/lib/brokerage-data/actions";
import type { AiHomeData, EntityRef, HomeChain, MissionRef } from "@/lib/ai-home/types";
import type { AskZonoResponse, ChatTurn } from "@/lib/ask-zono";
import { ENGINE_HE } from "@/lib/ask-zono/types";
import StartWorkflowButton from "@/components/workflow-builder/StartWorkflowButton";
import type { EntityKind } from "@/lib/workflow-builder/types";

const WF_KINDS = new Set(["buyer", "seller", "lead", "office", "property", "broker", "customer"]);
const asWfKind = (k: string): EntityKind | null => (WF_KINDS.has(k) ? (k as EntityKind) : null);
const toneHints = (t: EntityRef["tone"]): string[] => (t === "bad" || t === "warn" ? ["at_risk", "critical", "stale"] : t === "good" ? ["hot"] : []);

const fmt = (n: number) => n.toLocaleString("he-IL");
const toneCls = (t: EntityRef["tone"]) => t === "good" ? "text-emerald-700" : t === "bad" ? "text-rose-700" : t === "warn" ? "text-amber-700" : "text-muted";
const BAND_TONE: Record<string, string> = { high: "border-rose-400/50 bg-rose-50/40", medium: "border-amber-400/50 bg-amber-50/40", low: "border-slate-300 bg-slate-50/40" };

export default function UnifiedWorkspace() {
  const [data, setData] = useState<AiHomeData | null>(null);
  const [pending, setPending] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ kind: string; id: string; name: string; detail: string; score: number | null } | null>(null);

  const load = async () => {
    setPending(true); setErr(null);
    try { const r = await getAiHomeAction(); if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); }
    catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); }
  };
  // Initial load — the first setState happens AFTER an await, so it is not a
  // synchronous setState inside the effect body.
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const r = await getAiHomeAction(); if (!alive) return; if (r.ok) setData(r.result ?? null); else setErr(r.error ?? "נכשל"); }
      catch (e) { if (alive) setErr(e instanceof Error ? e.message : "שגיאה"); }
      finally { if (alive) setPending(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (pending && !data) return <div className="p-8 text-center text-muted">טוען את מרחב העבודה…</div>;
  if (err && !data) return <div className="p-8 text-center text-rose-700">{err}</div>;
  if (!data) return null;

  const d = data;
  return (
    <div dir="rtl" className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      {/* Part 1 — AI Home header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">🏠 מרחב העבודה של ZONO</h1>
          <p className="text-muted text-[13px]">כל מה שקרה, מה חשוב, מה דורש טיפול ואילו הזדמנויות פתוחות — במקום אחד. הכול לאישור בלבד, ללא ביצוע אוטומטי.</p>
        </div>
        <button onClick={load} disabled={pending} className="rounded-xl border border-line px-4 py-1.5 text-sm font-bold disabled:opacity-60">{pending ? "מרענן…" : "רענן"}</button>
      </header>

      {d.emptyState && <p className="rounded-2xl border border-amber-300 bg-amber-50/50 p-4 text-[13px] font-semibold text-amber-800">{d.notes.join(" · ")}</p>}

      {/* Part 2 — Today dashboard */}
      <section className="rounded-3xl border-2 border-sky-600/40 bg-sky-50/20 p-5">
        <h2 className="mb-3 text-lg font-black text-sky-800">📅 היום</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="ציון עסקי" value={fmt(d.today.businessScore)} tone={d.today.businessScore >= 62 ? "good" : d.today.businessScore < 45 ? "bad" : "warn"} />
          <Kpi label="ביצוע" value={fmt(d.today.executionScore)} />
          <Kpi label="ממתין לאישור" value={fmt(d.today.approvalsWaiting)} tone={d.today.approvalsWaiting ? "warn" : "neutral"} />
          <Kpi label="משימות היום" value={fmt(d.today.missionsToday)} />
          <Kpi label="מעקבים דחופים" value={fmt(d.today.urgentFollowUps)} tone={d.today.urgentFollowUps ? "warn" : "neutral"} />
          <Kpi label="ביטחון AI" value={`${d.today.aiConfidence}%`} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MiniList title="עדיפויות היום" items={d.today.priorities.map((p) => p.title)} empty="אין עדיפויות." tone="sky" />
          <MiniList title="סיכונים קריטיים" items={d.today.criticalRisks.map((r) => r.title)} empty="אין סיכונים." tone="rose" />
          <MiniList title="הזדמנויות מובילות" items={d.today.topOpportunities.map((o) => o.title)} empty="אין הזדמנויות." tone="emerald" />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <EntityList title="קונים חמים" items={d.today.hotBuyers} onSelect={setCtx} />
          <EntityList title="מוכרים בסיכון" items={d.today.hotSellers} onSelect={setCtx} />
          <EntityList title="נכסים קריטיים" items={d.today.criticalListings} onSelect={setCtx} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Part 3 — Opportunity center */}
        <section className="rounded-3xl border-2 border-emerald-600/40 bg-emerald-50/20 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-emerald-800">💰 מרכז הזדמנויות</h2>
            <span className="text-muted text-[11px]">{fmt(d.opportunities.totals.total)} · עסקאות {fmt(d.opportunities.totals.potentialDeals)}</span>
          </div>
          {d.opportunities.groups.length === 0 && <p className="text-muted text-[12px]">אין הזדמנויות פתוחות.</p>}
          {d.opportunities.groups.map((g) => (
            <div key={g.band} className="mb-3 last:mb-0">
              <p className="text-ink mb-1 text-[12px] font-bold">{g.label} ({g.chains.length})</p>
              <div className="flex flex-col gap-1.5">
                {g.chains.slice(0, 6).map((c) => <ChainCard key={c.id} c={c} onSelect={setCtx} />)}
              </div>
            </div>
          ))}
        </section>

        {/* Part 4 — Risk center */}
        <section className="rounded-3xl border-2 border-rose-600/40 bg-rose-50/20 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-rose-800">⚠️ מרכז סיכונים</h2>
            <span className="text-muted text-[11px]">מדד סיכון {d.risks.score}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <EntityList title="מוכרים קריטיים" items={d.risks.criticalSellers} onSelect={setCtx} />
            <EntityList title="נכסים קריטיים" items={d.risks.criticalListings} onSelect={setCtx} />
            <MiniList title="מתווכים בירידה" items={d.risks.decliningBrokers} empty="אין." tone="rose" />
            <MiniList title="איכות נתונים" items={d.risks.dataQualityIssues} empty="תקין." tone="amber" />
          </div>
        </section>

        {/* Part 5 — Execution center */}
        <section className="rounded-3xl border-2 border-violet-600/40 bg-violet-50/20 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-violet-800">✅ מרכז ביצוע</h2>
            <span className="text-muted text-[11px]">אישורים {fmt(d.execution.totals.approvals)} · ממתין {fmt(d.execution.totals.waiting)} · הושלם {fmt(d.execution.totals.completed)}</span>
          </div>
          {d.execution.approvals.length > 0 && (
            <div className="mb-3">
              <p className="text-ink mb-1 text-[12px] font-bold">ממתין לאישור</p>
              <div className="flex flex-col gap-1.5">
                {d.execution.approvals.slice(0, 6).map((i) => <ApprovalCard key={i.id} item={i} onDone={load} />)}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <MissionList title="פעולות היום" items={d.execution.todaysActions} />
            <MissionList title="הושלמו לאחרונה" items={d.execution.recentlyCompleted} />
          </div>
        </section>

        {/* Part 6 — AI insights */}
        <section className="rounded-3xl border-2 border-indigo-600/40 bg-indigo-50/20 p-5">
          <h2 className="mb-2 text-lg font-black text-indigo-800">🧠 תובנות AI</h2>
          <p className="text-muted text-[12px]">{d.insights.briefingSummary}</p>
          <MiniList title="פעולות מוצעות" items={d.insights.suggestedActions} empty="אין." tone="indigo" />
        </section>
      </div>

      {/* Part 7 — Smart timeline */}
      <section className="rounded-3xl border-2 border-slate-400/40 bg-slate-50/30 p-5">
        <h2 className="mb-3 text-lg font-black text-ink">🕒 ציר זמן חכם</h2>
        {d.timeline.length === 0 && <p className="text-muted text-[12px]">אין אירועים.</p>}
        <ol className="flex flex-col gap-1.5">
          {d.timeline.slice(0, 20).map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <span className="text-muted mt-0.5 shrink-0 text-[10px]">{new Date(e.at).toLocaleDateString("he-IL")}</span>
              <span className={cn("font-semibold", e.tone === "good" ? "text-emerald-700" : e.tone === "bad" ? "text-rose-700" : "text-ink")}>{e.title}</span>
              {e.detail && <span className="text-muted">— {e.detail}</span>}
              <span className="text-muted mr-auto shrink-0 text-[10px]">{e.source === "agent" ? "סוכן" : "זיכרון"}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Part 8 — Context panel (drawer) */}
      {ctx && <ContextDrawer ref_={ctx} onClose={() => setCtx(null)} />}

      {/* Part 6/9 — Ask ZONO dock */}
      <AskZonoDock questions={d.insights.suggestedQuestions} />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" | "neutral" }) {
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2">
      <div className={cn("text-lg font-black", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-ink")}>{value}</div>
      <div className="text-muted text-[10px]">{label}</div>
    </div>
  );
}
function MiniList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: string }) {
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2">
      <p className={cn("mb-1 text-[12px] font-bold", `text-${tone}-800`)}>{title}</p>
      {items.length === 0 ? <p className="text-muted text-[11px]">{empty}</p> : <ul className="flex flex-col gap-0.5">{items.slice(0, 6).map((t, i) => <li key={i} className="text-muted text-[11px]">• {t}</li>)}</ul>}
    </div>
  );
}
function EntityList({ title, items, onSelect }: { title: string; items: EntityRef[]; onSelect: (r: { kind: string; id: string; name: string; detail: string; score: number | null }) => void }) {
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2">
      <p className="text-ink mb-1 text-[12px] font-bold">{title}</p>
      {items.length === 0 ? <p className="text-muted text-[11px]">אין.</p> : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, 5).map((e) => {
            const wfKind = asWfKind(e.kind);
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-1">
                <button onClick={() => onSelect(e)} className="text-right text-[11px] hover:underline">
                  <span className={cn("font-bold", toneCls(e.tone))}>{e.name}</span> <span className="text-muted">· {e.detail}</span>
                </button>
                {wfKind && <StartWorkflowButton entityType={wfKind} entityId={e.id} entityName={e.name} hints={toneHints(e.tone)} compact sourceTitle={e.detail} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
function ChainCard({ c, onSelect }: { c: HomeChain; onSelect: (r: { kind: string; id: string; name: string; detail: string; score: number | null }) => void }) {
  return (
    <button onClick={() => onSelect({ kind: "opportunity", id: c.id, name: c.title, detail: c.links.join(" → "), score: c.score })} className={cn("rounded-lg border px-2 py-1.5 text-right text-[11px]", BAND_TONE[c.score >= 70 ? "high" : c.score >= 45 ? "medium" : "low"])}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink font-bold">{c.type === "potential_deal" ? "💰 " : c.type === "defend_market" ? "🛡️ " : "🔁 "}{c.title}</span>
        <span className="text-muted shrink-0 text-[10px]">ציון {c.score} · {c.confidence}%{c.approvals.length ? ` · אישור` : ""}</span>
      </div>
      <div className="text-muted text-[10px]">{c.links.join(" → ")}</div>
    </button>
  );
}
function MissionList({ title, items }: { title: string; items: MissionRef[] }) {
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2">
      <p className="text-ink mb-1 text-[12px] font-bold">{title}</p>
      {items.length === 0 ? <p className="text-muted text-[11px]">אין.</p> : <ul className="flex flex-col gap-0.5">{items.slice(0, 6).map((m) => <li key={m.id} className="text-muted text-[11px]">• {m.title} <span className="text-[10px]">({m.entity})</span></li>)}</ul>}
    </div>
  );
}
function ApprovalCard({ item, onDone }: { item: AiHomeData["execution"]["approvals"][number]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (kind: "approve" | "reject") => {
    setBusy(true);
    try { if (kind === "approve") await approveInboxItemAction(item.id); else await rejectInboxItemAction(item.id, "נדחה ממרחב העבודה"); await onDone(); }
    finally { setBusy(false); }
  };
  return (
    <div className="border-line bg-surface rounded-lg border px-2 py-1.5 text-[11px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-ink font-bold">{item.recommendation}</span>
          <span className="text-muted"> · {item.entity} · {item.agentName} · {item.confidence}%</span>
          <div className="text-muted text-[10px]">{item.reason}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => act("approve")} disabled={busy} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-50">אשר</button>
          <button onClick={() => act("reject")} disabled={busy} className="rounded border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-700 disabled:opacity-50">דחה</button>
        </div>
      </div>
    </div>
  );
}

function ContextDrawer({ ref_, onClose }: { ref_: { kind: string; id: string; name: string; detail: string; score: number | null }; onClose: () => void }) {
  const KIND_HE: Record<string, string> = { buyer: "קונה", seller: "מוכר", property: "נכס", lead: "ליד", office: "משרד", opportunity: "הזדמנות" };
  return (
    <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm overflow-y-auto border-r border-line bg-surface p-5 shadow-2xl" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-lg font-black">{ref_.name}</h3>
        <button onClick={onClose} className="text-muted rounded-lg border border-line px-2 py-0.5 text-sm">סגור</button>
      </div>
      <p className="text-muted mt-1 text-[12px]">{KIND_HE[ref_.kind] ?? ref_.kind}{ref_.score != null ? ` · ציון ${ref_.score}` : ""}</p>
      <div className="mt-3 rounded-xl border border-line bg-slate-50/40 p-3 text-[12px]">
        <p className="text-ink font-bold">סיכום AI</p>
        <p className="text-muted mt-1">{ref_.detail || "אין פרטים נוספים."}</p>
      </div>
      {asWfKind(ref_.kind) && (
        <div className="mt-3">
          <StartWorkflowButton entityType={asWfKind(ref_.kind)!} entityId={ref_.id} entityName={ref_.name} sourceTitle={ref_.detail} label="התחל Workflow לישות" />
        </div>
      )}
      <p className="text-muted mt-3 text-[11px]">פרטי הישות מוצגים מתוך הלוחות — לניתוח מלא פתחו את כרטיס הישות המתאים או שאלו את Ask ZONO. אין ביצוע אוטומטי.</p>
    </div>
  );
}

// Part 6/9 — Ask ZONO dock (session-only chat over the same action).
function AskZonoDock({ questions }: { questions: string[] }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; text: string; resp?: AskZonoResponse; at: string }[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const ask = async (q: string) => {
    const query = q.trim(); if (!query || pending) return;
    setInput(""); const now = new Date().toISOString();
    const history: ChatTurn[] = msgs.map((m) => ({ role: m.role, text: m.text, intent: m.resp?.understanding.intent, at: m.at }));
    setMsgs((p) => [...p, { role: "user", text: query, at: now }]); setPending(true);
    try { const r = await askZonoAction(query, history); if (r.ok && r.result) setMsgs((p) => [...p, { role: "assistant", text: r.result!.answer.executiveAnswer, resp: r.result, at: new Date().toISOString() }]); }
    finally { setPending(false); }
  };

  return (
    <>
      <button onClick={() => setOpen((v) => !v)} className="fixed bottom-5 left-5 z-40 rounded-full bg-sky-700 px-5 py-3 text-sm font-black text-white shadow-xl">💬 Ask ZONO</button>
      {open && (
        <div dir="rtl" className="fixed bottom-20 left-5 z-40 flex max-h-[70vh] w-[min(420px,92vw)] flex-col rounded-2xl border-2 border-sky-600/40 bg-surface p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sky-800 font-black">Ask ZONO</span>
            <button onClick={() => setOpen(false)} className="text-muted text-sm">✕</button>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {questions.slice(0, 4).map((q) => <button key={q} onClick={() => ask(q)} className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">{q}</button>)}
          </div>
          <div className="flex-1 overflow-y-auto">
            {msgs.map((m, i) => (
              <div key={i} className={cn("mb-2 rounded-lg px-2 py-1.5 text-[11px]", m.role === "user" ? "bg-sky-100/70" : "border border-line bg-slate-50/40")}>
                {m.role === "user" ? <span className="text-ink font-bold">{m.text}</span> : (
                  <div>
                    <p className="text-ink font-bold">{m.text}</p>
                    {m.resp && <p className="text-muted mt-0.5 text-[10px]">ביטחון {m.resp.answer.confidence}% · {m.resp.answer.explain.sourceEngines.map((e) => ENGINE_HE[e]).join(", ")}</p>}
                    {m.resp && m.resp.answer.followUps.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{m.resp.answer.followUps.slice(0, 3).map((f) => <button key={f} onClick={() => ask(f)} className="rounded-full border border-sky-300 px-1.5 py-0.5 text-[9px] text-sky-700">{f}</button>)}</div>}
                    {m.resp && (() => {
                      const a = m.resp!.answer.actions.find((x) => x.entityType && x.entityId && asWfKind(x.entityType));
                      return a ? <div className="mt-1"><StartWorkflowButton entityType={asWfKind(a.entityType!)!} entityId={a.entityId!} entityName={a.title} compact sourceTitle="הצעת Ask ZONO" /></div> : null;
                    })()}
                  </div>
                )}
              </div>
            ))}
            {pending && <p className="text-muted text-[10px]">חושב…</p>}
          </div>
          <div className="mt-2 flex gap-1">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(input); }} placeholder="שאל…" className="border-line bg-surface flex-1 rounded-lg border px-2 py-1.5 text-[11px]" />
            <button onClick={() => ask(input)} disabled={pending || !input.trim()} className="rounded-lg bg-sky-700 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">שאל</button>
          </div>
        </div>
      )}
    </>
  );
}
