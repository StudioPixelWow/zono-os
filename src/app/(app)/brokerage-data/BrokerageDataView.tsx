"use client";
// ============================================================================
// ZONO Core Data — Brokerage Data command center (RTL). 7 tabs. Owner sees the
// full national data + management tabs; office/agent users see city-scoped
// offices/agents/links only (RLS already returns nothing for owner-only tables).
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import type { BrokerageCommandCenter } from "@/lib/brokerage-data/service";
import {
  resolveBrokerageNowAction, startBrokerageDataRefreshAction, getBrokerageRefreshStatusAction,
  reviewMatchAction, resolveConflictAction, decideLinkAction,
} from "@/lib/brokerage-data/actions";

type Tab = "overview" | "offices" | "agents" | "links" | "conflicts" | "matches" | "sources";

const STATUS_HE: Record<string, string> = {
  active: "פעיל", verified: "מאומת", unverified: "לא מאומת", candidate: "מועמד",
  inactive: "לא פעיל", not_found_recently: "לא נמצא לאחרונה", conflict: "קונפליקט",
  auto_linked: "קושר אוטומטית", pending_review: "לבדיקה", confirmed: "אושר", rejected: "נדחה",
};
const statusHe = (s: string) => STATUS_HE[s] ?? s;

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className={`text-2xl font-black ${tone ?? "text-ink"}`}>{value.toLocaleString("he-IL")}</div>
      <div className="mt-1 text-xs font-bold text-muted">{label}</div>
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${active ? "bg-brand-strong text-ink" : "border border-line bg-surface text-muted hover:text-ink"}`}>{children}</button>
  );
}
function Badge({ children, tone = "white" }: { children: React.ReactNode; tone?: "white" | "green" | "amber" | "red" }) {
  const c = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "red" ? "bg-rose-50 text-rose-700" : "bg-surface text-muted";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}
function confTone(n: number): "green" | "amber" | "red" { return n >= 95 ? "green" : n >= 70 ? "amber" : "red"; }

export function BrokerageDataView({ cc }: { cc: BrokerageCommandCenter }) {
  const router = useRouter();
  const owner = cc.access.isOwner;
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setMsg(null); setErr(null);
    start(async () => { const r = await fn(); if (r?.error) setErr(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } });
  };

  // Start a brokerage scan, then poll the run until it reaches a terminal status.
  // (The current processor is synchronous, so it usually returns completed already;
  // polling is a safety net if a future async worker leaves it running.)
  const startScan = (params: Record<string, unknown>) => {
    setMsg(null); setErr(null);
    start(async () => {
      const r = await startBrokerageDataRefreshAction(params);
      if (!r.ok || !r.runId) { setErr(r.error ?? "הסריקה לא התחילה. בדוק חיבור או נסה שוב."); return; }
      if (r.message) setMsg(r.message);
      router.refresh();
      if (r.status === "completed" || r.status === "failed" || r.status === "partial") return;
      // Poll up to ~30s for an async run to finish.
      const deadline = Date.now() + 30_000;
      for (;;) {
        await new Promise((res) => setTimeout(res, 4000));
        const s = await getBrokerageRefreshStatusAction(r.runId);
        if (s && (s.status === "completed" || s.status === "failed" || s.status === "partial")) {
          setMsg(s.status === "failed" ? "הסריקה נכשלה. נסה שוב בעוד רגע." : `הסריקה הסתיימה ✓ (${s.updatedRecords} עדכונים).`);
          router.refresh();
          return;
        }
        if (Date.now() > deadline) { setMsg("הסריקה ממתינה לעיבוד. אם זה נמשך, בדוק את הגדרות ה-worker."); return; }
      }
    });
  };

  const [agentFilter, setAgentFilter] = useState<"all" | "resolved" | "unresolved" | "review" | "high">("all");

  const q = search.trim().toLowerCase();
  const offices = useMemo(() => cc.offices.filter((o) => !q || o.name.toLowerCase().includes(q) || (o.city ?? "").toLowerCase().includes(q)), [cc.offices, q]);

  // Office name lookup + per-broker linked-listing counts (from observed links only).
  const officeNameById = useMemo(() => { const m = new Map<string, string>(); for (const o of cc.offices) m.set(o.id, o.name); return m; }, [cc.offices]);
  const listingsByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cc.links) if (l.agentId) m.set(l.agentId, (m.get(l.agentId) ?? 0) + 1);
    return m;
  }, [cc.links]);

  const agents = useMemo(() => cc.agents.filter((a) => {
    if (q && !(a.fullName.toLowerCase().includes(q) || (a.city ?? "").toLowerCase().includes(q))) return false;
    if (agentFilter === "resolved") return !!a.officeId;
    if (agentFilter === "unresolved") return !a.officeId;
    if (agentFilter === "review") return a.confidenceScore < 70 || a.status === "unverified";
    if (agentFilter === "high") return a.confidenceScore >= 90;
    return true;
  }), [cc.agents, q, agentFilter]);

  const tabs: { id: Tab; label: string; owner?: boolean }[] = [
    { id: "overview", label: "סקירה" },
    { id: "offices", label: `משרדים (${cc.stats.offices})` },
    { id: "agents", label: `סוכנים (${cc.stats.agents})` },
    { id: "links", label: `קישורים (${cc.stats.linkedListings})` },
    { id: "conflicts", label: `קונפליקטים (${cc.stats.openConflicts})`, owner: true },
    { id: "matches", label: `התאמות (${cc.stats.pendingMatches})`, owner: true },
    { id: "sources", label: "רענון ומקורות", owner: true },
  ];

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="pointer-events-none absolute -top-24 -start-24 h-56 w-56 rounded-full bg-brand-soft/50 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black tracking-wide text-brand">BROKERAGE INTELLIGENCE</p>
            <h1 className="text-2xl font-black text-ink sm:text-3xl">מודיעין משרדי תיווך</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">בניית גרף מודיעין מלא של משרדי תיווך, סוכנים, טריטוריות וקשרי שוק. כל סריקת מודעות חיצונית עוברת זיהוי זהויות מול שכבת הליבה הזו — מידע ציבורי/עסקי בלבד, ללא מחיקה אוטומטית.</p>
            <div className="mt-2">
              {owner
                ? <Badge tone="green">בעלים — גישה לאומית מלאה</Badge>
                : <Badge tone="amber">גישה מוגבלת לערי ההתמחות{cc.access.allowedCities.length ? `: ${cc.access.allowedCities.slice(0, 4).join(", ")}` : ""}</Badge>}
            </div>
          </div>
          {owner && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run(resolveBrokerageNowAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>זהה עכשיו</Button>
              <Button size="sm" variant="ghost" onClick={() => startScan({ runType: "full_country" })} disabled={pending}>בקש רענון לאומי</Button>
            </div>
          )}
        </div>
        {(msg || err) && <p className={`relative mt-3 text-sm font-bold ${err ? "text-rose-700" : "text-emerald-700"}`}>{err ?? msg}</p>}
      </section>

      {/* First-run onboarding — shown only when the brokerage graph is still empty. */}
      {cc.stats.offices === 0 && cc.stats.agents === 0 && cc.runs.length === 0 && (
        <section dir="rtl" className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 text-center sm:p-6">
          <span className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-2xl">🏢</span>
          <h2 className="text-lg font-black text-ink sm:text-xl">עדיין לא זוהו משרדי תיווך</h2>
          <p className="mx-auto mt-1.5 max-w-xl text-sm text-muted">
            הפעל סריקה ראשונית כדי לבנות את גרף המודיעין של השוק. הסריקה תאסוף מודעות, תזהה משרדים וסוכנים, ותקשר ביניהם — ממידע ציבורי בלבד.
          </p>
          <p className="text-muted mt-1.5 text-xs">⏱ משך משוער: 1–3 דקות · מתעדכן אוטומטית ברקע</p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <Button className="!min-w-[320px]" onClick={() => startScan({ runType: "full_country" })} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>🚀 התחל סריקת מודיעין ראשונית</Button>
            <Button variant="ghost" onClick={() => run(resolveBrokerageNowAction)} disabled={pending}>⚙ זהה מתוך נתונים קיימים</Button>
          </div>
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-surface p-4 text-right">
            <p className="mb-2 text-xs font-black text-ink">מה יקרה אחרי הסריקה:</p>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              <li>✓ משרדי תיווך יזוהו וימופו</li>
              <li>✓ סוכנים יותאמו למשרדים</li>
              <li>✓ טריטוריות ואזורי שליטה יחושבו</li>
              <li>✓ גרף תחרות וקשרים ייבנה</li>
              <li>✓ דשבורדי מודיעין שוק ייפתחו</li>
            </ul>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.filter((t) => !t.owner || owner).map((t) => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>)}
      </div>

      {(tab === "offices" || tab === "agents") && (
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם או עיר…" className="w-full max-w-md rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink" />
      )}

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="משרדים" value={cc.stats.offices} />
          <Stat label="סוכנים" value={cc.stats.agents} />
          <Stat label="משרדים מאומתים" value={cc.stats.verifiedOffices} tone="text-emerald-700" />
          <Stat label="סוכנים מאומתים" value={cc.stats.verifiedAgents} tone="text-emerald-700" />
          <Stat label="מועמדים לאימות" value={cc.stats.candidates} tone="text-amber-700" />
          <Stat label="מודעות מקושרות" value={cc.stats.linkedListings} tone="text-violet-700" />
          {owner && <Stat label="קונפליקטים פתוחים" value={cc.stats.openConflicts} tone="text-rose-700" />}
          {owner && <Stat label="התאמות לבדיקה" value={cc.stats.pendingMatches} tone="text-amber-700" />}
        </div>
      )}

      {/* ── Offices ── */}
      {tab === "offices" && (
        <div className="grid gap-3 md:grid-cols-2">
          {offices.length === 0 && <Empty text="אין משרדים להצגה בערי ההתמחות שלך." />}
          {offices.map((o) => (
            <div key={o.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-black text-ink">{o.name}</div>
                  <div className="text-xs text-muted">{[o.city, o.brandNetwork].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge tone={confTone(o.confidenceScore)}>{Math.round(o.confidenceScore)}%</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <Badge>{statusHe(o.status)}</Badge>
                {o.primaryPhone && <span dir="ltr">{o.primaryPhone}</span>}
                {o.googleRating != null && <span>★ {o.googleRating}{o.googleReviewsCount ? ` (${o.googleReviewsCount})` : ""}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agents ── */}
      {tab === "agents" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "הכל"],
              ["resolved", "משויכים למשרד"],
              ["unresolved", "ללא משרד"],
              ["review", "לבדיקה"],
              ["high", "ביטחון גבוה ≥90%"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAgentFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                  agentFilter === key
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {agents.length === 0 && <Empty text="אין סוכנים להצגה בסינון הנוכחי." />}
            {agents.map((a) => {
              const officeName = a.officeId ? officeNameById.get(a.officeId) ?? null : null;
              const listings = listingsByAgent.get(a.id) ?? 0;
              return (
                <div key={a.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-ink">{a.fullName}</div>
                      <div className="text-xs text-muted">{[a.city, a.roleTitle].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <Badge tone={confTone(a.confidenceScore)}>{Math.round(a.confidenceScore)}%</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    {officeName
                      ? <Badge tone="green">🏢 {officeName}</Badge>
                      : <Badge tone="amber">משרד טרם זוהה</Badge>}
                    {listings > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700">{listings} מודעות מקושרות</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <Badge>{statusHe(a.status)}</Badge>
                    {a.primaryPhone && <span dir="ltr">{a.primaryPhone}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Links ── */}
      {tab === "links" && (
        <div className="grid gap-3 md:grid-cols-2">
          {cc.links.length === 0 && <Empty text="עדיין אין קישורים. הרץ סנכרון נכסים חיצוניים או 'זהה עכשיו'." />}
          {cc.links.map((l) => (
            <div key={l.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-black text-ink">{l.matchedName || l.matchedPhone || "מודעה חיצונית"}</div>
                  <div className="text-xs text-muted">{[l.city, l.matchedSource].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge tone={confTone(l.confidenceScore)}>{Math.round(l.confidenceScore)}%</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <Badge tone={l.status === "confirmed" ? "green" : l.status === "rejected" ? "red" : "amber"}>{statusHe(l.status)}</Badge>
                {l.matchReasons.slice(0, 3).map((r, i) => <span key={i}>· {r}</span>)}
              </div>
              {owner && l.status !== "confirmed" && l.status !== "rejected" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => run(() => decideLinkAction(l.id, "confirmed"))} disabled={pending}>אשר קישור</Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => decideLinkAction(l.id, "rejected"))} disabled={pending}>דחה</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Conflicts (owner) ── */}
      {tab === "conflicts" && owner && (
        <div className="grid gap-3">
          {cc.conflicts.length === 0 && <Empty text="אין קונפליקטים פתוחים." />}
          {cc.conflicts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="text-sm font-black text-ink">{c.conflictType}{c.fieldName ? ` · ${c.fieldName}` : ""}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted">
                <div className="rounded-lg bg-surface p-2">A: {c.valueA ?? "—"}{c.confidenceA != null ? ` (${Math.round(c.confidenceA)}%)` : ""}</div>
                <div className="rounded-lg bg-surface p-2">B: {c.valueB ?? "—"}{c.confidenceB != null ? ` (${Math.round(c.confidenceB)}%)` : ""}</div>
              </div>
              {c.aiRecommendation && <p className="mt-2 text-xs text-violet-700">המלצת AI: {c.aiRecommendation}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => run(() => resolveConflictAction(c.id, "resolved"))} disabled={pending}>פתור</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => resolveConflictAction(c.id, "ignored"))} disabled={pending}>התעלם</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Identity matches (owner) ── */}
      {tab === "matches" && owner && (
        <div className="grid gap-3 md:grid-cols-2">
          {cc.matches.length === 0 && <Empty text="אין התאמות הממתינות לבדיקה." />}
          {cc.matches.map((m) => (
            <div key={m.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-black text-ink">{m.matchType}</div>
                <Badge tone={confTone(m.confidenceScore)}>{Math.round(m.confidenceScore)}%</Badge>
              </div>
              <div className="mt-1 text-xs text-muted">{m.matchReasons.slice(0, 4).join(" · ") || "—"}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => run(() => reviewMatchAction(m.id, "approve"))} disabled={pending}>אשר</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => reviewMatchAction(m.id, "reject"))} disabled={pending}>דחה</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Refresh runs + sources (owner) ── */}
      {tab === "sources" && owner && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-black text-ink">מקורות נתונים</h3>
            <div className="grid gap-2">
              {cc.sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <span className="font-bold text-ink">{s.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted"><Badge tone={s.isActive ? "green" : "red"}>{s.isActive ? "פעיל" : "כבוי"}</Badge>אמינות {s.reliabilityScore}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-black text-ink">היסטוריית רענון</h3>
            <div className="grid gap-2">
              {cc.runs.length === 0 && <Empty text="עדיין לא בוצעו רענונים." />}
              {cc.runs.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{r.runType}</span>
                    <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">חדשים: {r.newOffices}/{r.newAgents} · עודכנו: {r.updatedRecords} · קונפליקטים: {r.conflictsCreated}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted/70">מידע ציבורי/עסקי בלבד · אין מחיקה אוטומטית · כל שינוי מתועד עם מקור ורמת ביטחון.</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">{text}</div>;
}
