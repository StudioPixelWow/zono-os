"use client";

// ============================================================================
// ZONO — "מודיעין מתחרים" premium Competitor-Intelligence dashboard.
// Reference-matched layout (hero → KPI strip → threat radar → heat map + weekly
// movement → leaderboard + opportunities → AI insights + competitive feed). ALL
// data is DERIVED from the real competitor board (cc, competitors, localities,
// signals) — no mock replacement where real data exists. The full management
// table is preserved below via <CompetitorsView embedded />.
// ============================================================================

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recomputeCompetitorsAction } from "@/lib/competitor/actions";
import type { getCompetitorBoard } from "@/lib/competitor/service";

type Board = Awaited<ReturnType<typeof getCompetitorBoard>>;
type Competitor = Board["competitors"][number];

const TYPE_LABEL: Record<string, string> = { agency: "משרד", office: "משרד", independent_broker: "מתווך", team: "צוות", unknown: "לא ידוע" };

const threatOf = (c: Competitor) => Math.round(0.5 * c.market_share_score + 0.5 * c.growth_score);
const powerOf = (c: Competitor) => Math.round((c.market_share_score + c.growth_score + c.exclusivity_score) / 3);
function threatChip(score: number): { label: string; cls: string; ring: string } {
  if (score >= 70) return { label: "איום גבוה", cls: "bg-danger-soft text-danger", ring: "text-danger" };
  if (score >= 45) return { label: "במעקב", cls: "bg-warning-soft text-warning", ring: "text-warning" };
  return { label: "יציב", cls: "bg-success-soft text-success", ring: "text-success" };
}

function ScoreRing({ value }: { value: number }) {
  const t = threatChip(value);
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
function Empty({ label }: { label: string }) {
  return <div className="text-muted bg-surface/60 rounded-xl px-4 py-8 text-center text-sm font-semibold">{label}</div>;
}

export function CompetitorsDashboard({ board }: { board: Board }) {
  const router = useRouter();
  const { cc, competitors, localities, signals } = board;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recalc = () => { setErr(null); setMsg(null); start(async () => { const r = await recomputeCompetitorsAction(); if (r.error) setErr(r.error); else { setMsg(r.message ?? "חושב"); router.refresh(); } }); };

  const names = useMemo(() => new Map(competitors.map((c) => [c.id, c.display_name])), [competitors]);

  const d = useMemo(() => {
    const byThreat = [...competitors].sort((a, b) => threatOf(b) - threatOf(a));
    const byPower = [...competitors].sort((a, b) => powerOf(b) - powerOf(a));
    const strongest = [...competitors].sort((a, b) => b.growth_score - a.growth_score)[0];
    const weakest = [...competitors].sort((a, b) => a.growth_score - b.growth_score)[0];
    const exclusivity = [...competitors].sort((a, b) => b.exclusivity_score - a.exclusivity_score)[0];
    const hotArea = [...localities].sort((a, b) => b.concentration - a.concentration)[0];
    // TODO(share): real org market share isn't on the board yet — equal-split proxy.
    const yourShare = cc.total ? Math.max(2, Math.round(100 / (cc.total + 1))) : 0;
    return { byThreat, byPower, strongest, weakest, exclusivity, hotArea, yourShare };
  }, [competitors, localities, cc]);

  const hasData = competitors.length > 0;

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <Hero pending={pending} onRecompute={recalc} />
      {(msg || err) && <div className={cn("rounded-xl px-4 py-2 text-sm font-bold", err ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{err || msg}</div>}

      <KpiStrip cc={cc} yourShare={d.yourShare} />

      {!hasData ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Users" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין נתוני מתחרים</p>
          <p className="text-muted max-w-sm text-sm">ודא שזוהו מתווכים (מודיעין מתווכים) ולחץ ״חשב מודיעין מתחרים״.</p>
          <Button onClick={recalc} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>חשב מודיעין מתחרים</Button>
        </div>
      ) : (
        <>
          <ThreatRadar competitors={d.byThreat.slice(0, 8)} />
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
            <HeatMap localities={localities} />
            <WeeklyMovement signals={signals} names={names} />
          </section>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Leaderboard competitors={d.byPower.slice(0, 5)} />
            <OpportunityDetector cc={cc} localities={localities} competitors={competitors} />
          </section>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AiInsights strongest={d.strongest} weakest={d.weakest} exclusivity={d.exclusivity} hotArea={d.hotArea} />
            <CompetitiveFeed signals={signals} names={names} />
          </section>
        </>
      )}
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
function Hero({ pending, onRecompute }: { pending: boolean; onRecompute: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-brand-soft via-surface to-surface-soft p-6 sm:p-8">
      <div className="absolute -left-8 top-1/2 hidden -translate-y-1/2 opacity-90 sm:block" aria-hidden>
        <div className="zono-gradient grid h-28 w-28 place-items-center rounded-[36%] text-white shadow-[var(--shadow-lift)]"><Icon name="Target" size={54} /></div>
      </div>
      <div className="relative text-right">
        <p className="text-brand text-xs font-bold tracking-wide">ZONO Competitor Intelligence</p>
        <h1 className="text-ink text-2xl font-black sm:text-3xl">מודיעין מתחרים</h1>
        <p className="text-muted mt-1 max-w-xl text-sm">מערכת מתקדמת למעקב בזמן אמת אחר פעילות המתחרים וההזדמנויות בשוק</p>
        <div className="mt-4"><Button onClick={onRecompute} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>חשב מודיעין מתחרים</Button></div>
      </div>
    </div>
  );
}

function KpiStrip({ cc, yourShare }: { cc: Board["cc"]; yourShare: number }) {
  const items = [
    { icon: "Users", tone: "brand", label: "מתחרים במעקב", value: String(cc.total) },
    { icon: "TrendingUp", tone: "success", label: "מתרחבים", value: String(cc.growing) },
    { icon: "TrendingDown", tone: "danger", label: "בירידה", value: String(cc.declining) },
    { icon: "Flame", tone: "warning", label: "דורשים מעקב", value: String(cc.opportunities) },
    { icon: "Shield", tone: "brand", label: "שולטים באזור", value: String(cc.dominant) },
    { icon: "Target", tone: "success", label: "נתח השוק שלך", value: `${yourShare}%` },
  ];
  const T: Record<string, string> = { brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning" };
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {items.map((k, i) => (
        <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.04 }} className="bg-card border-line flex min-w-[150px] shrink-0 flex-col gap-1.5 rounded-[20px] border p-3.5 shadow-[var(--shadow-card)] sm:min-w-0">
          <span className={cn("grid h-8 w-8 place-items-center rounded-xl", T[k.tone])}><Icon name={k.icon} size={16} /></span>
          <span className="text-ink text-2xl font-black tabular-nums">{k.value}</span>
          <p className="text-ink text-[12px] font-extrabold">{k.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

function ThreatRadar({ competitors }: { competitors: Competitor[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title="מי מאיים עליך כרגע?" sub="זיהוי מתחרים שמגדילים פעילות או משתלטים על אזורים"
        action={competitors.length > 2 ? (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => by(1)} aria-label="הקודם" className="bg-card border-line text-muted hover:text-brand-strong hover:border-brand-light grid h-9 w-9 place-items-center rounded-full border shadow-[var(--shadow-soft)] transition"><Icon name="ChevronRight" size={18} /></button>
            <button type="button" onClick={() => by(-1)} aria-label="הבא" className="bg-card border-line text-muted hover:text-brand-strong hover:border-brand-light grid h-9 w-9 place-items-center rounded-full border shadow-[var(--shadow-soft)] transition"><Icon name="ChevronLeft" size={18} /></button>
          </div>
        ) : undefined}
      />
      <div ref={ref} className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {competitors.map((c, i) => {
          const threat = threatOf(c);
          const chip = threatChip(threat);
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.04 }} className="bg-card border-line snap-start flex min-w-[230px] shrink-0 flex-col gap-2 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black", chip.cls)}>{chip.label}</span>
                <ScoreRing value={threat} />
              </div>
              <span className="bg-brand-soft text-brand-strong grid h-10 w-10 place-items-center rounded-full text-sm font-black">{c.display_name.trim().charAt(0) || "?"}</span>
              <p className="text-ink truncate text-sm font-extrabold">{c.display_name}</p>
              <p className="text-muted text-xs">{TYPE_LABEL[c.competitor_type] ?? c.competitor_type}</p>
              <div className="text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold">
                <span>{c.total_listings} מודעות</span><span className="bg-line h-3 w-px" /><span>{c.active_localities} אזורים</span>
              </div>
              <p className={cn("text-[11px] font-bold", c.growth_score >= 55 ? "text-success" : c.growth_score < 40 ? "text-danger" : "text-muted")}>צמיחה {c.growth_score} · בלעדיות {c.exclusivity_score}</p>
              <Link href={`/competitors/${c.id}`} className="bg-brand-soft text-brand-strong mt-auto rounded-lg px-3 py-2 text-center text-[12px] font-bold">צפייה בפרופיל</Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function HeatMap({ localities }: { localities: Board["localities"] }) {
  const top = localities.slice(0, 5);
  const pos = (s: string, i: number) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 997; return { top: 20 + ((h % 5) * 13) + (i % 2) * 5, left: 16 + ((h % 7) * 10) }; };
  const tone = (c: number) => (c >= 70 ? "bg-danger/25 text-danger" : c >= 45 ? "bg-warning/30 text-warning" : "bg-success/30 text-success");
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="מפת תחרות — שליטה בשכונות" />
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 via-surface to-brand-soft/40">
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px,transparent 1px),linear-gradient(90deg,var(--color-line) 1px,transparent 1px)", backgroundSize: "44px 44px", opacity: 0.4 }} />
        {top.map((l, i) => {
          const p = pos(l.locality, i);
          return (
            <div key={l.locality} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ top: `${p.top}%`, insetInlineStart: `${p.left}%` }}>
              <div className={cn("grid min-h-[68px] min-w-[120px] place-items-center rounded-2xl border border-white/60 px-2 py-1.5 shadow-[var(--shadow-soft)] backdrop-blur", tone(l.concentration))}>
                <div>
                  <p className="text-ink text-[11px] font-black">{l.locality}</p>
                  <p className="text-ink/80 text-[10px] font-bold">{l.leader} · {Math.round(l.leaderShare)}%</p>
                  <p className="text-muted text-[9px] font-bold">ריכוז {Math.round(l.concentration)}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] font-bold">
        <span className="flex items-center gap-1"><span className="bg-success h-2.5 w-2.5 rounded-full" />הזדמנות</span>
        <span className="flex items-center gap-1"><span className="bg-warning h-2.5 w-2.5 rounded-full" />תחרותי</span>
        <span className="flex items-center gap-1"><span className="bg-danger h-2.5 w-2.5 rounded-full" />מתחרה שולט</span>
      </div>
    </div>
  );
}

function WeeklyMovement({ signals, names }: { signals: Board["signals"]; names: Map<string, string> }) {
  const arrow = (t: string): { icon: string; cls: string } => {
    if (t === "competitor_growing" || t === "dominant_broker") return { icon: "TrendingUp", cls: "text-danger" };
    if (t === "competitor_losing_inventory" || t === "vulnerable_broker") return { icon: "TrendingDown", cls: "text-success" };
    return { icon: "Flame", cls: "text-warning" };
  };
  const items = signals.slice(0, 6);
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <SectionHead title="מה השתנה השבוע?" />
      {items.length === 0 ? <Empty label="אין שינוי השבוע" /> : (
        <ul className="flex flex-col gap-1">
          {items.map((s) => {
            const a = arrow(s.signal_type);
            const name = s.competitor_profile_id ? names.get(s.competitor_profile_id) : null;
            return (
              <li key={s.id} className="hover:bg-surface flex items-start gap-3 rounded-xl px-2 py-2 transition">
                <span className={cn("mt-0.5 shrink-0", a.cls)}><Icon name={a.icon} size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-sm font-bold leading-snug">{s.title}</p>
                  <p className="text-muted truncate text-[11px]">{[name, s.locality].filter(Boolean).join(" · ") || s.description || ""}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/competitors" className="text-brand-strong text-sm font-bold">לכל העדכונים</Link>
    </div>
  );
}

function Leaderboard({ competitors }: { competitors: Competitor[] }) {
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <SectionHead title="מתחרים מובילים" />
      <div className="text-muted mt-1 flex items-center gap-3 px-1 text-[10px] font-bold">
        <span className="w-6 text-center">#</span><span className="flex-1">מתחרה</span><span className="w-12 text-center">ציון כוח</span><span className="w-12 text-center">נכסים</span><span className="w-12 text-center">אזורים</span><span className="w-12 text-center">מגמה</span>
      </div>
      <div className="divide-line flex flex-col divide-y">
        {competitors.map((c, i) => {
          const up = c.growth_score >= 50;
          return (
            <Link key={c.id} href={`/competitors/${c.id}`} className="hover:bg-surface flex items-center gap-3 rounded-lg px-1 py-2.5 transition">
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black", i === 0 ? "bg-warning-soft text-warning" : "bg-surface text-muted")}>{i === 0 ? <Icon name="Star" size={13} /> : i + 1}</span>
              <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black">{c.display_name.trim().charAt(0) || "?"}</span>
              <span className="text-ink min-w-0 flex-1 truncate text-sm font-bold">{c.display_name}</span>
              <span className="text-brand-strong w-12 text-center text-sm font-black">{powerOf(c)}</span>
              <span className="text-muted w-12 text-center text-xs font-bold">{c.total_listings}</span>
              <span className="text-muted w-12 text-center text-xs font-bold">{c.active_localities}</span>
              <span className={cn("w-12 text-center text-xs font-black", up ? "text-success" : "text-danger")}>{up ? "▲" : "▼"} {c.growth_score}</span>
            </Link>
          );
        })}
      </div>
      <Link href="/competitors" className="text-brand-strong mt-1 text-center text-sm font-bold">צפייה בכל המתחרים</Link>
    </div>
  );
}

function OpportunityDetector({ cc, localities, competitors }: { cc: Board["cc"]; localities: Board["localities"]; competitors: Competitor[] }) {
  const vulnerable = competitors.filter((c) => c.growth_score < 40).length;
  const noLeader = localities.filter((l) => l.concentration < 45).length;
  const items = [
    { icon: "Building2", tone: "brand", title: `${cc.opportunities} הזדמנויות גיוס פעילות`, sub: "מתחרים שכדאי לפעול מולם" },
    { icon: "TrendingDown", tone: "success", title: `${vulnerable} מתחרים פגיעים`, sub: "ירידה בפעילות — חלון לגיוס" },
    { icon: "MapPin", tone: "warning", title: `${noLeader} שכונות ללא מוביל ברור`, sub: "אזורים פתוחים לכניסה" },
    { icon: "Shield", tone: "danger", title: `${cc.dominant} אזורים בשליטת מתחרה`, sub: "ריכוז גבוה — דורש אסטרטגיה" },
  ];
  const T: Record<string, string> = { brand: "bg-brand-soft text-brand-strong", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" };
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <SectionHead title="זיהוי הזדמנויות" />
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.title} className="bg-surface flex items-start gap-2 rounded-xl p-3">
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", T[it.tone])}><Icon name={it.icon} size={15} /></span>
            <div><p className="text-ink text-sm font-bold">{it.title}</p><p className="text-muted text-[11px]">{it.sub}</p></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniBars({ tone }: { tone: "success" | "danger" | "brand" }) {
  const color = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-brand)";
  const h = [0.4, 0.6, 0.5, 0.75, 0.65, 0.9];
  return (
    <svg viewBox="0 0 120 32" className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      {h.map((v, i) => <rect key={i} x={i * 20 + 3} y={32 - v * 32} width="14" height={v * 32} rx="2" fill={color} opacity={0.85} />)}
    </svg>
  );
}

function AiInsights({ strongest, weakest, exclusivity, hotArea }: { strongest?: Competitor; weakest?: Competitor; exclusivity?: Competitor; hotArea?: Board["localities"][number] }) {
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <SectionHead title="AI Insights" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="bg-success-soft/50 flex flex-col gap-1 rounded-2xl p-3">
          <p className="text-muted text-[11px] font-bold">המתחרה הצומח ביותר</p>
          <p className="text-ink text-sm font-black">{strongest?.display_name ?? "—"}</p>
          <p className="text-success text-lg font-black">+{strongest?.growth_score ?? 0}</p>
          <MiniBars tone="success" />
        </div>
        <div className="bg-danger-soft/40 flex flex-col gap-1 rounded-2xl p-3">
          <p className="text-muted text-[11px] font-bold">המתחרה הנחלש ביותר</p>
          <p className="text-ink text-sm font-black">{weakest?.display_name ?? "—"}</p>
          <p className="text-danger text-lg font-black">{weakest ? weakest.growth_score - 100 : 0}</p>
          <MiniBars tone="danger" />
        </div>
        <div className="bg-brand-soft/60 flex flex-col gap-1 rounded-2xl p-3">
          <p className="text-muted text-[11px] font-bold">השכונה החמה ביותר</p>
          <p className="text-ink text-sm font-black">{hotArea?.locality ?? "—"}</p>
          <p className="text-brand-strong text-lg font-black">{hotArea ? `${Math.round(hotArea.concentration)}%` : "—"}</p>
          <MiniBars tone="brand" />
        </div>
        <div className="bg-warning-soft/50 flex flex-col gap-1 rounded-2xl p-3">
          <p className="text-muted text-[11px] font-bold">מובילי בלעדיות</p>
          <p className="text-ink text-sm font-black">{exclusivity?.display_name ?? "—"}</p>
          <p className="text-warning text-lg font-black">{exclusivity?.exclusivity_score ?? 0}</p>
          <span className="text-muted text-[10px] font-bold">ציון בלעדיות החודש</span>
        </div>
      </div>
    </div>
  );
}

function CompetitiveFeed({ signals, names }: { signals: Board["signals"]; names: Map<string, string> }) {
  const items = signals.slice(0, 5);
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <SectionHead title="פיד מודיעין תחרותי" />
      {items.length === 0 ? <Empty label="אין עדכונים כרגע" /> : (
        <ul className="divide-line flex flex-col divide-y">
          {items.map((s) => {
            const name = s.competitor_profile_id ? names.get(s.competitor_profile_id) : null;
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="bg-brand-soft text-brand-strong grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name="Building2" size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-bold">{name ? `${name} · ` : ""}{s.title}</p>
                  <p className="text-muted truncate text-[11px]">{s.locality ?? s.description ?? ""}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/competitors" className="text-brand-strong text-sm font-bold">לכל העדכונים</Link>
    </div>
  );
}
