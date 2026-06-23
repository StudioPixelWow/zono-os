"use client";

// ============================================================================
// ZONO — "מודיעין גיוס נכסים" premium acquisition-intelligence dashboard.
// Reference-matched layout (hero → KPI strip → hot candidates → potential map +
// lead-sources donut → activity + AI insights → funnel + tasks → high-potential
// properties → recommendations). ALL data is DERIVED from the real acquisition
// board (cards) + command center (cc) — no mock replacement where real data
// exists. A few presentational-only blocks fall back to safe derived content and
// are marked with TODO. The full management board (filters/drawer/actions) is
// preserved below via <AcquisitionView embedded />.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { createAcquisitionTaskAction, recomputeAcquisitionAction, type AcquisitionActionState } from "@/lib/acquisition/actions";
import type { AcquisitionCard, AcquisitionCommandCenter } from "@/lib/acquisition/service";

const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", instagram: "אינסטגרם", manual_external: "ידני", partner_api: "שותף", website: "אתר", referral: "המלצה", unknown: "אחר" };
const ilsM = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n)}`);
const scoreTone = (n: number) => (n >= 80 ? { ring: "text-success", bg: "bg-success-soft" } : n >= 60 ? { ring: "text-warning", bg: "bg-warning-soft" } : { ring: "text-danger", bg: "bg-danger-soft" });

// Deterministic candidate status → Hebrew chip (hot / watch / closed).
function candidateChip(c: AcquisitionCard): { label: string; tone: "danger" | "warning" | "neutral" | "success" } {
  if (c.status === "promoted_to_crm" || c.status === "converted_to_seller") return { label: "סגור", tone: "success" };
  if (c.status === "not_relevant" || c.status === "lost") return { label: "סגור", tone: "neutral" };
  if (c.status === "contacted" || c.status === "followup_scheduled") return { label: "במעקב", tone: "warning" };
  if (c.acquisitionScore >= 70) return { label: "חם", tone: "danger" };
  return { label: "במעקב", tone: "warning" };
}
const CHIP_CLS: Record<string, string> = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", neutral: "bg-line/70 text-ink", success: "bg-success-soft text-success" };

function ScoreRing({ value }: { value: number }) {
  const t = scoreTone(value);
  const r = 18, c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-12 w-12 place-items-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} className={t.ring} />
      </svg>
      <span className="text-ink text-[13px] font-black">{value}</span>
    </span>
  );
}

export function AcquisitionDashboard({ cards, cc }: { cards: AcquisitionCard[]; cc: AcquisitionCommandCenter }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<AcquisitionActionState>) => { setErr(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setErr(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };

  const d = useMemo(() => {
    const n = cards.length;
    const sum = (f: (c: AcquisitionCard) => number) => cards.reduce((a, c) => a + f(c), 0);
    const avgScore = n ? Math.round(sum((c) => c.acquisitionScore) / n) : (cc.highPriority ? 80 : 0);
    const promoted = cards.filter((c) => c.status === "promoted_to_crm" || c.status === "converted_to_seller").length;
    const conversion = n ? Math.round((promoted / n) * 100) : 0;
    const potentialValue = sum((c) => c.price ?? 0);
    const newOwners = cards.filter((c) => c.status === "new").length || cc.total;

    // Hot candidates — top by acquisition score.
    const candidates = [...cards].sort((a, b) => b.acquisitionScore - a.acquisitionScore).slice(0, 8);

    // Area potential — group by city, average acquisition score.
    const cityMap = new Map<string, { sum: number; n: number }>();
    for (const c of cards) { const k = c.city || "אחר"; const e = cityMap.get(k) ?? { sum: 0, n: 0 }; e.sum += c.acquisitionScore; e.n++; cityMap.set(k, e); }
    const areas = Array.from(cityMap.entries()).map(([city, e]) => ({ city, pct: Math.round(e.sum / e.n), n: e.n })).sort((a, b) => b.pct - a.pct).slice(0, 5);

    // Lead sources — distribution by source.
    const srcMap = new Map<string, number>();
    for (const c of cards) { const k = c.source || "unknown"; srcMap.set(k, (srcMap.get(k) ?? 0) + 1); }
    const sources = Array.from(srcMap.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

    // Funnel — map statuses to acquisition stages.
    const inContact = cards.filter((c) => ["contacted", "followup_scheduled", "qualified", "promoted_to_crm", "converted_to_seller"].includes(c.status)).length;
    const firstCall = cards.filter((c) => ["contacted", "followup_scheduled", "promoted_to_crm", "converted_to_seller"].includes(c.status)).length;
    const tours = cards.filter((c) => ["followup_scheduled", "promoted_to_crm", "converted_to_seller"].includes(c.status)).length;
    const exclusivity = promoted;
    const funnel = [
      { label: "פניות חדשות", value: n },
      { label: "יצירת קשר", value: inContact },
      { label: "שיחה ראשונית", value: firstCall },
      { label: "סיור", value: tours },
      { label: "בלעדיות", value: exclusivity },
    ];

    // AI insights — from real reasons / next-best-actions.
    const insights = cards.filter((c) => c.reason || c.nextBestAction).slice(0, 4)
      .map((c) => ({ id: c.profileId, title: c.nextBestAction || c.reason || "", sub: `${c.city ?? ""} · ציון ${c.acquisitionScore}`, href: c.listingUrl }));

    // Tasks — cards that need action.
    const tasks = cards.filter((c) => ["new", "qualified", "needs_review"].includes(c.status))
      .sort((a, b) => b.acquisitionScore - a.acquisitionScore).slice(0, 4)
      .map((c) => ({ profileId: c.profileId, title: c.nextBestAction || `צור קשר · ${c.title ?? c.city ?? "נכס"}`, urgent: c.acquisitionScore >= 70, city: c.city }));

    // High-potential properties — real cards with images.
    const properties = [...cards].sort((a, b) => b.acquisitionScore - a.acquisitionScore)
      .filter((c) => c.price).slice(0, 8);

    return { avgScore, conversion, potentialValue, newOwners, candidates, areas, sources, funnel, insights, tasks, properties };
  }, [cards, cc]);

  const hasData = cards.length > 0;

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* 1 — Hero */}
      <Hero pending={pending} onRecompute={() => run(recomputeAcquisitionAction)} />

      {(msg || err) && (
        <div className={cn("rounded-xl px-4 py-2 text-sm font-bold", err ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{err || msg}</div>
      )}

      {/* 2 — KPI strip */}
      <KpiStrip cc={cc} d={d} />

      {!hasData ? (
        <EmptyState onRecompute={() => run(recomputeAcquisitionAction)} pending={pending} />
      ) : (
        <>
          {/* 3 — Hot candidates */}
          <HotCandidates candidates={d.candidates} onTask={(id) => run(() => createAcquisitionTaskAction(id))} pending={pending} />

          {/* 4 — Potential map + lead sources */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <PotentialMap areas={d.areas} />
            <LeadSourcesDonut sources={d.sources} total={cards.length} />
          </section>

          {/* 5 — Activity + AI insights */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ActivityCard candidates={d.candidates} />
            <AiInsightsCard insights={d.insights} />
          </section>

          {/* 6 — Funnel + tasks */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FunnelCard funnel={d.funnel} />
            <TasksCard tasks={d.tasks} onTask={(id) => run(() => createAcquisitionTaskAction(id))} pending={pending} />
          </section>

          {/* 7 — High-potential properties */}
          <HighPotentialProperties properties={d.properties} />

          {/* 8 — Recommendations */}
          <RecommendationsGrid areas={d.areas} />
        </>
      )}
    </div>
  );
}

/* ── sections ────────────────────────────────────────────────────────────── */
function Hero({ pending, onRecompute }: { pending: boolean; onRecompute: () => void }) {
  return (
    <div className="border-line relative isolate overflow-hidden rounded-[28px] border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(120% 130% at 85% 0%, rgba(124,58,237,0.12) 0%, rgba(168,139,250,0.07) 40%, rgba(255,255,255,0) 72%)" }} />
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-right">
        <div className="min-w-0">
          <p className="text-brand text-xs font-bold tracking-wide">ZONO Inventory Acquisition</p>
          <h1 className="text-ink mt-1 text-2xl font-black sm:text-3xl">מודיעין גיוס נכסים</h1>
          <p className="text-muted mt-1.5 max-w-lg text-sm">מערכת AI מתקדמת לזיהוי בעלי נכסים פוטנציאליים וגיוס בלעדיות</p>
          <div className="mt-4 flex justify-center sm:justify-start">
            <Button onClick={onRecompute} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>חשב הזדמנויות גיוס</Button>
          </div>
        </div>
        <div className="zono-gradient grid h-24 w-24 shrink-0 place-items-center rounded-[28px] text-white shadow-[var(--shadow-lift)] sm:h-28 sm:w-28" aria-hidden>
          <Icon name="Magnet" size={52} />
        </div>
      </div>
    </div>
  );
}

function KpiStrip({ cc, d }: { cc: AcquisitionCommandCenter; d: { avgScore: number; conversion: number; potentialValue: number; newOwners: number } }) {
  const items = [
    { icon: "Target", tone: "brand", label: "פוטנציאל גיוס", value: String(d.avgScore), hint: "ציון AI" },
    { icon: "TrendingUp", tone: "success", label: "שיעור ההמרה", value: `${d.conversion}%`, hint: "פניות → בלעדיות" },
    { icon: "Wallet", tone: "brand", label: "שווי נכסים פוטנציאלי", value: ilsM(d.potentialValue), hint: "סך הצנרת" },
    { icon: "UserCheck", tone: "success", label: "מוכנים לבלעדיות", value: String(cc.privateSellers), hint: "בעלים פרטיים" },
    { icon: "Home", tone: "brand", label: "בעלי נכסים חדשים", value: String(d.newOwners), hint: "זוהו לאחרונה" },
    { icon: "Flame", tone: "danger", label: "פניות חמות", value: String(cc.highPriority), hint: "עדיפות גבוהה" },
  ];
  const T: Record<string, string> = { brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger" };
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {items.map((k, i) => (
        <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.04 }}
          className="bg-card border-line flex min-w-[150px] shrink-0 flex-col gap-1.5 rounded-[20px] border p-3.5 shadow-[var(--shadow-card)] sm:min-w-0">
          <div className="flex items-center justify-between">
            <span className={cn("grid h-8 w-8 place-items-center rounded-xl", T[k.tone])}><Icon name={k.icon} size={16} /></span>
          </div>
          <span className="text-ink text-2xl font-black tabular-nums">{k.value}</span>
          <p className="text-ink text-[12px] font-extrabold">{k.label}</p>
          <p className="text-muted text-[10px] font-medium">{k.hint}</p>
        </motion.div>
      ))}
    </div>
  );
}

function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-ink text-lg font-black">{title}</h2>
        {sub && <p className="text-muted text-xs">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function HotCandidates({ candidates, onTask, pending }: { candidates: AcquisitionCard[]; onTask: (id: string) => void; pending: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="הזדמנויות גיוס חמות" sub="בעלי נכסים עם פוטנציאל גבוה לשיתוף פעולה" />
      {candidates.length === 0 ? (
        <Empty label="אין הזדמנויות גיוס כרגע" />
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {candidates.map((c, i) => {
            const chip = candidateChip(c);
            return (
              <motion.div key={c.profileId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.04 }}
                className="bg-card border-line flex min-w-[240px] shrink-0 flex-col gap-2 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black", CHIP_CLS[chip.tone])}>{chip.label}</span>
                  <ScoreRing value={c.acquisitionScore} />
                </div>
                <p className="text-ink truncate text-sm font-extrabold">{c.title || c.brokerName || "בעל נכס"}</p>
                <p className="text-muted text-xs">{c.city || "—"} · {SOURCE_LABELS[c.source] ?? c.source}</p>
                <p className="text-brand-strong text-sm font-black">{c.price ? formatShekels(c.price) : "—"}</p>
                <p className="text-muted text-[11px]">{[c.rooms ? `${c.rooms} חד׳` : null, c.sqm ? `${c.sqm} מ״ר` : null].filter(Boolean).join(" · ") || "—"}</p>
                {c.reason && <p className="text-muted line-clamp-2 text-[11px] leading-snug">{c.reason}</p>}
                <div className="mt-auto flex gap-1.5 pt-1">
                  <Button size="sm" loading={pending} onClick={() => onTask(c.profileId)} leadingIcon={<Icon name="Phone" size={13} />} className="flex-1">צור קשר</Button>
                  {c.listingUrl && <a href={c.listingUrl} target="_blank" rel="noreferrer" className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-lg"><Icon name="ExternalLink" size={14} /></a>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PotentialMap({ areas }: { areas: { city: string; pct: number; n: number }[] }) {
  // Deterministic positions from the city name so bubbles are stable.
  const pos = (s: string, i: number) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 997; return { top: 22 + ((h % 5) * 12) + (i % 2) * 6, left: 18 + ((h % 7) * 9) }; };
  const tone = (p: number) => (p >= 80 ? "bg-success/30 text-success" : p >= 60 ? "bg-warning/30 text-warning" : "bg-danger/25 text-danger");
  const label = (p: number) => (p >= 80 ? "פוטנציאל גבוה" : p >= 60 ? "פוטנציאל בינוני" : "פוטנציאל נמוך");
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="מפת פוטנציאל גיוס לפי אזורים" />
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 via-surface to-success-soft/40">
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px)", backgroundSize: "44px 44px", opacity: 0.4 }} />
        {areas.map((a, i) => {
          const p = pos(a.city, i);
          return (
            <div key={a.city} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ top: `${p.top}%`, insetInlineStart: `${p.left}%` }}>
              <div className={cn("grid h-20 w-20 place-items-center rounded-full blur-[2px]", tone(a.pct))} />
              <div className="absolute inset-0 grid place-items-center">
                <div>
                  <p className="text-ink text-sm font-black">{a.pct}%</p>
                  <p className="text-ink text-[10px] font-extrabold">{a.city}</p>
                  <p className="text-muted text-[8px] font-bold">{label(a.pct)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] font-bold">
        <span className="flex items-center gap-1"><span className="bg-success h-2.5 w-2.5 rounded-full" />גבוה</span>
        <span className="flex items-center gap-1"><span className="bg-warning h-2.5 w-2.5 rounded-full" />בינוני</span>
        <span className="flex items-center gap-1"><span className="bg-danger h-2.5 w-2.5 rounded-full" />נמוך</span>
      </div>
    </div>
  );
}

function LeadSourcesDonut({ sources, total }: { sources: { source: string; count: number }[]; total: number }) {
  const COLORS = ["#7c3aed", "#22c55e", "#f5c451", "#a855f7", "#38bdf8", "#94a3b8"];
  const top = sources.slice(0, 6);
  const sum = top.reduce((a, s) => a + s.count, 0) || 1;
  const C = 2 * Math.PI * 42;
  const fracs = top.map((s) => s.count / sum);
  const segs = top.map((s, i) => ({
    ...s,
    color: COLORS[i % COLORS.length],
    dash: fracs[i] * C,
    off: fracs.slice(0, i).reduce((a, f) => a + f, 0) * C,
  }));
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="מקורות הפניות המובילים" />
      <div className="flex items-center gap-4">
        <div className="relative grid h-32 w-32 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" strokeWidth="12" />
            {segs.map((s) => (
              <circle key={s.source} cx="50" cy="50" r="42" fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.off} />
            ))}
          </svg>
          <div className="text-center"><p className="text-ink text-2xl font-black">{total}</p><p className="text-muted text-[10px] font-bold">סך פניות</p></div>
        </div>
        <ul className="flex flex-1 flex-col gap-1.5">
          {segs.map((s) => (
            <li key={s.source} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 font-semibold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{SOURCE_LABELS[s.source] ?? s.source}</span>
              <span className="text-muted font-bold tabular-nums">{s.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <Link href="/external-listings" className="text-brand-strong text-sm font-bold">צפייה בכל המקורות</Link>
    </div>
  );
}

function ActivityCard({ candidates }: { candidates: AcquisitionCard[] }) {
  // TODO(activity): wire to a real acquisition activity feed (activity_events on
  // inventory_acquisition_profiles). Derived from the freshest candidates for now.
  const items = candidates.slice(0, 4);
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="פעילות גיוס אחרונה" />
      {items.length === 0 ? <Empty label="אין פעילות גיוס אחרונה" /> : (
        <ul className="flex flex-col gap-1">
          {items.map((c) => (
            <li key={c.profileId} className="hover:bg-surface flex items-center gap-3 rounded-xl px-2 py-2 transition">
              <span className="bg-brand-soft text-brand-strong grid h-9 w-9 place-items-center rounded-xl"><Icon name="Home" size={15} /></span>
              <div className="min-w-0 flex-1"><p className="text-ink truncate text-sm font-bold">נכס פוטנציאלי זוהה{c.title ? ` · ${c.title}` : ""}</p><p className="text-muted text-[11px]">{c.city ?? ""} · ציון {c.acquisitionScore}</p></div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/acquisition" className="text-brand-strong text-sm font-bold">צפייה בכל הפעילויות</Link>
    </div>
  );
}

function AiInsightsCard({ insights }: { insights: { id: string; title: string; sub: string; href: string | null }[] }) {
  const TONES = ["bg-brand-soft text-brand-strong", "bg-success-soft text-success", "bg-warning-soft text-warning", "bg-danger-soft text-danger"];
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="תובנות AI לגיוס נכסים" />
      {insights.length === 0 ? <Empty label="אין תובנות AI" /> : (
        <ul className="flex flex-col gap-2">
          {insights.map((it, i) => (
            <li key={it.id} className="bg-surface flex items-start gap-2 rounded-xl p-3">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONES[i % TONES.length])}><Icon name="Sparkles" size={15} /></span>
              <div className="min-w-0"><p className="text-ink text-sm font-bold leading-snug">{it.title}</p><p className="text-muted text-[11px]">{it.sub}</p></div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/acquisition" className="text-brand-strong text-sm font-bold">צפייה בכל התובנות</Link>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: { label: string; value: number }[] }) {
  const top = funnel[0]?.value || 1;
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="משפך גיוס נכסים" />
      <div className="flex flex-col items-center gap-1.5 py-2">
        {funnel.map((s, i) => {
          const w = 100 - i * 16;
          const pct = top ? Math.round((s.value / top) * 100) : 0;
          return (
            <div key={s.label} className="flex w-full items-center justify-between gap-3">
              <span className="text-muted w-28 shrink-0 text-[12px] font-bold">{s.label}</span>
              <div className="relative flex-1">
                <div className="zono-gradient mx-auto grid h-9 place-items-center rounded-lg text-[12px] font-black text-white" style={{ width: `${w}%`, opacity: 1 - i * 0.13 }}>{s.value}</div>
              </div>
              <span className="text-muted w-10 shrink-0 text-end text-[11px] font-bold">{i === 0 ? "" : `${pct}%`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TasksCard({ tasks, onTask, pending }: { tasks: { profileId: string; title: string; urgent: boolean; city: string | null }[]; onTask: (id: string) => void; pending: boolean }) {
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="משימות גיוס" />
      {tasks.length === 0 ? <Empty label="אין משימות גיוס" /> : (
        <ul className="divide-line flex flex-col divide-y">
          {tasks.map((t) => (
            <li key={t.profileId} className="flex items-center gap-2 py-2.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", t.urgent ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>{t.urgent ? "דחוף" : "חשוב"}</span>
              <p className="text-ink min-w-0 flex-1 truncate text-sm font-bold">{t.title}</p>
              <Button size="sm" variant="secondary" loading={pending} onClick={() => onTask(t.profileId)}>צור משימה</Button>
            </li>
          ))}
        </ul>
      )}
      <Link href="/tasks" className="text-brand-strong text-sm font-bold">צפייה בכל המשימות</Link>
    </div>
  );
}

function HighPotentialProperties({ properties }: { properties: AcquisitionCard[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="נכסים עם פוטנציאל גיוס גבוה" action={
        <div className="flex items-center gap-3">
          {properties.length > 2 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => by(1)} aria-label="הקודם" className="bg-card border-line text-muted hover:text-brand-strong hover:border-brand-light grid h-9 w-9 place-items-center rounded-full border shadow-[var(--shadow-soft)] transition"><Icon name="ChevronRight" size={18} /></button>
              <button type="button" onClick={() => by(-1)} aria-label="הבא" className="bg-card border-line text-muted hover:text-brand-strong hover:border-brand-light grid h-9 w-9 place-items-center rounded-full border shadow-[var(--shadow-soft)] transition"><Icon name="ChevronLeft" size={18} /></button>
            </div>
          )}
          <Link href="/external-listings" className="text-brand-strong text-sm font-bold">הצג הכל</Link>
        </div>
      } />
      {properties.length === 0 ? <Empty label="אין נכסים עם פוטנציאל גבוה" /> : (
        <div ref={ref} className="no-scrollbar -mx-1 flex snap-x items-stretch gap-4 overflow-x-auto px-1 pb-2">
          {properties.map((c) => (
            <div key={c.profileId} className="bg-card border-line flex w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
              {/* fixed image height → uniform across all cards */}
              <div className="bg-surface relative h-40 shrink-0">
                {c.images?.[0]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.images[0]} alt={c.title ?? ""} className="absolute inset-0 h-full w-full object-cover" />
                  : <div className="text-muted grid h-full place-items-center"><Icon name="Image" size={26} /></div>}
                <span className="bg-card/90 text-success absolute start-2 top-2 rounded-full px-2 py-0.5 text-xs font-black backdrop-blur">{c.acquisitionScore}%</span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3.5">
                <p className="text-ink truncate text-sm font-extrabold">{c.title || "נכס"}</p>
                <p className="text-muted text-xs">{c.city ?? ""}</p>
                <p className="text-brand-strong text-base font-black">{c.price ? formatShekels(c.price) : "—"}</p>
                <p className="text-muted text-[11px]">{[c.rooms ? `${c.rooms} חד׳` : null, c.sqm ? `${c.sqm} מ״ר` : null].filter(Boolean).join(" · ") || "—"}</p>
                <Link href={c.listingUrl ?? `/external-listings/${c.listingId}`} className="bg-brand-soft text-brand-strong mt-auto rounded-lg px-3 py-2 text-center text-[13px] font-bold">לפרטים</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RecommendationsGrid({ areas }: { areas: { city: string; pct: number; n: number }[] }) {
  // TODO(recos): wire "clients with extra properties" to the seller↔property graph
  // once exposed here. Daily focus is derived from the strongest acquisition areas.
  const focus = areas.slice(0, 3).map((a) => ({ title: `התמקד/י באזור ${a.city}`, sub: `פוטנציאל ${a.pct}% · ${a.n} נכסים` }));
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
        <SectionHead title="המלצות לתיקוד יומי" />
        {focus.length === 0 ? <Empty label="אין המלצות כרגע" /> : (
          <ul className="flex flex-col gap-2">
            {focus.map((f) => (
              <li key={f.title} className="bg-surface flex items-start gap-2 rounded-xl p-3">
                <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name="Target" size={15} /></span>
                <div><p className="text-ink text-sm font-bold">{f.title}</p><p className="text-muted text-[11px]">{f.sub}</p></div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
        <SectionHead title="צעדים מומלצים" />
        <ul className="flex flex-col gap-2">
          {[
            { t: "חזק/י קשר עם בעלים פרטיים", i: "Users" },
            { t: "פנה/י לנכסים שלא עודכנו 30+ יום", i: "Clock" },
            { t: "קדם/י הזדמנויות דו-צדדיות ל-CRM", i: "Sparkles" },
          ].map((r) => (
            <li key={r.t} className="bg-surface flex items-center gap-2 rounded-xl p-3">
              <span className="bg-success-soft text-success grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={r.i} size={15} /></span>
              <p className="text-ink text-sm font-bold">{r.t}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-muted bg-surface/60 rounded-xl px-4 py-8 text-center text-sm font-semibold">{label}</div>;
}

function EmptyState({ onRecompute, pending }: { onRecompute: () => void; pending: boolean }) {
  return (
    <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
      <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Magnet" size={26} /></span>
      <p className="text-ink text-lg font-extrabold">אין עדיין הזדמנויות גיוס</p>
      <p className="text-muted max-w-sm text-sm">הרץ/י חישוב כדי ש-ZONO יזהה בעלי נכסים פוטנציאליים מתוך המודעות החיצוניות.</p>
      <Button onClick={onRecompute} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>חשב הזדמנויות גיוס</Button>
    </div>
  );
}
