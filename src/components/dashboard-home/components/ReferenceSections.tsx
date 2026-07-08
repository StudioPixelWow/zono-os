"use client";

// ============================================================================
// ZONO — Home reference sections (structural redesign to the approved mockup).
// Sections 4–8: Opportunity Map · Activity + AI Radar · AI Command Center ·
// AI Deal Forecast · ZONO Never Sleeps. Built from the real DashboardHomeData.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { DashboardHomeData } from "@/lib/dashboard-home/types";
import { whatsappNumber } from "@/components/listings/ContactButtons";
import { type Translate, ilsC, EmptyState, EmptyStateDark } from "./shared";
import { ZonoMap, type ZonoMapPoint } from "@/components/maps/ZonoMap";
import { getNeighborhoodHeatAction } from "@/lib/market/actions";
import type { NeighborhoodHeat } from "@/lib/market/neighborhood-heat";

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 9 — EXCLUSIVE EXTERNAL DEALS  ("עסקאות שאסור לפספס")
   Private-seller external listings, with call + smart-WhatsApp quick actions.
   ──────────────────────────────────────────────────────────────────────── */
export interface ExclusiveDeal {
  id: string; title: string; city: string | null; neighborhood: string | null;
  price: number | null; rooms: number | null; sqm: number | null;
  image: string | null; listingUrl: string | null;
  contactName: string | null; contactPhone: string | null;
}

function smartWhatsappText(d: ExclusiveDeal, agentName: string): string {
  const who = d.contactName ? ` ${d.contactName}` : "";
  const what = d.title ? ` – ${d.title}` : "";
  const where = d.city ? ` ב${d.city}` : "";
  return `שלום${who}, ראיתי את המודעה שלך${what}${where}. אני ${agentName}, יועץ/ת נדל״ן באזור עם קונים רלוונטיים כרגע. אשמח לעזור למכור במהירות ובמחיר הטוב ביותר — אפשר לתאם שיחה קצרה?`;
}

export function ExclusiveDealsSection({ deals, agentName }: { deals: ExclusiveDeal[]; agentName: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(300, ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-ink text-xl font-black sm:text-2xl">עסקאות שאסור לפספס</h2>
          <p className="text-muted text-xs font-medium">נכסים ממקורות חיצוניים — מוכר פרטי בלבד, מוכנים לפנייה</p>
        </div>
        <div className="flex items-center gap-2">
          {deals.length > 2 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => by(1)} aria-label="הקודם" className="bg-card border-line text-muted hover:text-brand-strong grid h-9 w-9 place-items-center rounded-full border transition"><Icon name="ChevronRight" size={18} /></button>
              <button type="button" onClick={() => by(-1)} aria-label="הבא" className="bg-card border-line text-muted hover:text-brand-strong grid h-9 w-9 place-items-center rounded-full border transition"><Icon name="ChevronLeft" size={18} /></button>
            </div>
          )}
          <Link href="/acquisition" className="text-brand-strong text-sm font-bold">לכל ההזדמנויות</Link>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="bg-card border-line text-muted rounded-[24px] border p-10 text-center text-sm">אין כרגע עסקאות מוכר פרטי במקורות החיצוניים. הרץ סנכרון במודיעין גיוס נכסים כדי לאתר הזדמנויות.</div>
      ) : (
        <div ref={ref} className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
          {deals.map((d) => {
            const wa = whatsappNumber(d.contactPhone);
            return (
              <div key={d.id} className="bg-card border-line flex min-w-[280px] max-w-[300px] shrink-0 flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
                <div className="bg-surface relative aspect-[4/3] w-full overflow-hidden">
                  {d.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={d.image} alt={d.title} className="absolute inset-0 h-full w-full object-cover" />
                    : <div className="text-muted absolute inset-0 grid place-items-center"><Icon name="Building2" size={30} /></div>}
                  <span className="bg-brand text-white absolute start-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-black">מוכר פרטי</span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <p className="text-brand-strong text-lg font-black">{d.price ? ilsC(d.price) : "ללא מחיר"}</p>
                  <p className="text-ink truncate text-sm font-extrabold">{d.title}</p>
                  <p className="text-muted text-xs">{[d.rooms ? `${d.rooms} חד׳` : "", d.sqm ? `${d.sqm} מ״ר` : "", [d.neighborhood, d.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}</p>
                  {(d.contactName || d.contactPhone) && (
                    <div className="bg-surface/70 mt-1 flex items-center justify-between gap-2 rounded-xl px-2.5 py-2">
                      <div className="min-w-0">
                        {d.contactName && <p className="text-ink truncate text-[12px] font-bold">{d.contactName}</p>}
                        {d.contactPhone && <p className="text-muted text-[11px] font-medium" dir="ltr">{d.contactPhone}</p>}
                      </div>
                    </div>
                  )}
                  <div className="mt-auto flex items-center gap-1.5 pt-2">
                    {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(smartWhatsappText(d, agentName))}`} target="_blank" rel="noopener noreferrer" className="bg-success/10 text-success hover:bg-success/20 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold transition"><Icon name="MessageCircle" size={15} /> וואטסאפ חכם</a>}
                    {d.contactPhone && <a href={`tel:${d.contactPhone}`} className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 grid h-9 w-10 place-items-center rounded-xl transition" aria-label="התקשר"><Icon name="Phone" size={16} /></a>}
                    {d.id && <Link href={`/external-listings/${d.id}`} className="bg-surface text-muted hover:text-brand-strong grid h-9 w-10 place-items-center rounded-xl transition" aria-label="פרטי הנכס"><Icon name="ArrowLeft" size={16} /></Link>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 10 — COMPETITOR THREATS  ("מי מאיים עליך כרגע?")
   ──────────────────────────────────────────────────────────────────────── */
export interface CompetitorThreat {
  id: string; name: string; type: string; threat: number;
  marketShare: number; growth: number; listings: number; localities: number;
}
const COMP_TYPE: Record<string, string> = { agency: "סוכנות", office: "משרד תיווך", independent_broker: "מתווך עצמאי", broker: "מתווך" };
function threatChip(s: number): { label: string; cls: string; ring: string } {
  if (s >= 70) return { label: "איום גבוה", cls: "bg-danger-soft text-danger", ring: "text-danger" };
  if (s >= 45) return { label: "במעקב", cls: "bg-warning-soft text-warning", ring: "text-warning" };
  return { label: "יציב", cls: "bg-success-soft text-success", ring: "text-success" };
}

export function CompetitorThreatsSection({ threats }: { threats: CompetitorThreat[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-danger-soft text-danger grid h-9 w-9 place-items-center rounded-xl"><Icon name="Swords" size={17} /></span>
          <div>
            <h2 className="text-ink text-xl font-black sm:text-2xl">מי מאיים עליך כרגע?</h2>
            <p className="text-muted text-xs font-medium">מתחרים שמגדילים פעילות או משתלטים על אזורים</p>
          </div>
        </div>
        <Link href="/competitors" className="text-brand-strong text-sm font-bold">למודיעין המתחרים</Link>
      </div>

      {threats.length === 0 ? (
        <div className="bg-card border-line text-muted rounded-[24px] border p-10 text-center text-sm">אין עדיין נתוני מתחרים. הרץ חישוב במודיעין מתחרים כדי לזהות איומים באזור שלך.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {threats.map((c) => {
            const chip = threatChip(c.threat);
            return (
              <Link key={c.id} href={`/competitors/${c.id}`} className="bg-card border-line hover:border-brand-light flex flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-ink/90 text-card grid h-10 w-10 place-items-center rounded-xl text-sm font-black">{c.name.trim().charAt(0) || "?"}</span>
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-extrabold">{c.name}</p>
                      <p className="text-muted text-[11px]">{COMP_TYPE[c.type] ?? "מתחרה"}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${chip.cls}`}>{chip.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative grid h-12 w-12 place-items-center">
                    <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90"><circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-line)" strokeWidth="5" /><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" className={chip.ring} strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 20} strokeDashoffset={2 * Math.PI * 20 * (1 - c.threat / 100)} /></svg>
                    <span className={`text-xs font-black tabular-nums ${chip.ring}`}>{c.threat}</span>
                  </div>
                  <div className="grid flex-1 grid-cols-3 gap-1 text-center">
                    <div><p className="text-ink text-sm font-black tabular-nums">{c.listings}</p><p className="text-muted text-[10px] font-bold">נכסים</p></div>
                    <div><p className="text-ink text-sm font-black tabular-nums">{c.localities}</p><p className="text-muted text-[10px] font-bold">אזורים</p></div>
                    <div><p className="text-success text-sm font-black tabular-nums">+{c.growth}%</p><p className="text-muted text-[10px] font-bold">צמיחה</p></div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 4 — OPPORTUNITY MAP  (full-width dark centerpiece, ~660px)
   ──────────────────────────────────────────────────────────────────────── */
const BUBBLE_TONE: Record<string, string> = {
  opportunity: "rgba(168,139,250,0.95)", positive: "rgba(124,58,237,0.95)",
  agent: "rgba(139,92,246,0.95)", negative: "rgba(99,102,241,0.85)", neutral: "rgba(148,163,184,0.8)",
};

const HEAT_DOT: Record<string, string> = {
  danger: "bg-red-500", warning: "bg-amber-500", brand: "bg-violet-500", success: "bg-emerald-500",
};

/**
 * Real neighborhood demand heat map: REAL centroids (israel_neighborhoods) +
 * REAL org market activity per neighborhood (external listings + transactions).
 * Renders the ZONO map where coordinates exist; a ranked neighborhood list
 * alongside; and an honest fallback to area-insight cards when no neighborhood
 * data is available. No fake coordinates, no invented prices.
 */
export function OpportunityMapSection({ t, data }: { t: Translate; data: DashboardHomeData }) {
  void t;
  const [heat, setHeat] = useState<NeighborhoodHeat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getNeighborhoodHeatAction(data.cityName || null)
      .then((h) => { if (alive) setHeat(h); })
      .catch(() => { if (alive) setHeat(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [data.cityName]);

  const points = heat?.points ?? [];
  const mapPoints: ZonoMapPoint[] = points
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id, lat: p.lat as number, lng: p.lng as number, title: p.name, tone: p.tone,
      details: [
        `${p.listings} מודעות · ${p.transactions} עסקאות`,
        p.avgPrice ? `מחיר ממוצע: ${ilsC(p.avgPrice)}` : "אין נתוני מחיר",
      ],
    }));
  const topList = points.filter((p) => p.activity > 0).slice(0, 8);

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-ink text-xl font-black sm:text-2xl">מפת ביקוש לפי שכונות</h2>
        <p className="text-muted text-xs">צפיפות מודעות ועסקאות אמיתיות בכל שכונה — נתוני מיקום אמיתיים.</p>
      </div>
      {(heat?.city || data.cityName) && <span className="bg-card border-line text-muted shrink-0 rounded-xl border px-3 py-1.5 text-sm font-bold">{heat?.city || data.cityName}</span>}
    </div>
  );

  // Honest fallback: no neighborhood centroids/activity → ranked area-insight cards.
  if (!loading && points.length === 0) {
    const zones = [...data.heatZones].sort((a, b) => b.radius - a.radius).slice(0, 8);
    return (
      <section className="flex flex-col gap-4">
        {header}
        {zones.length === 0 ? <EmptyState className="min-h-[220px] justify-center" /> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map((z, i) => {
              const accent = BUBBLE_TONE[z.tone] ?? BUBBLE_TONE.neutral;
              return (
                <div key={z.id} className="bg-card border-line relative overflow-hidden rounded-2xl border p-4 shadow-[var(--shadow-card)]">
                  <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: accent }} />
                  <div className="flex items-center justify-between gap-2"><span className="text-ink truncate text-sm font-black">{i + 1}. {z.name}</span><span className="text-muted text-[11px] font-bold">פוטנציאל</span></div>
                  <p className="text-ink mt-1 text-2xl font-black">{Math.abs(z.deltaPct)}%</p>
                  <p className="text-muted text-xs font-semibold" dir="ltr">{ilsC(z.avgPrice)}</p>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-muted text-[11px]">מפת שכונות אמיתית תוצג כאשר קיימות שכונות מזוהות ופעילות שוק לעיר זו.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {header}
      {loading ? (
        <div className="bg-card border-line h-80 animate-pulse rounded-card border" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {mapPoints.length > 0
            ? <ZonoMap points={mapPoints} heightClass="h-80 lg:h-full" emptyMessage="אין שכונות עם קואורדינטות אמיתיות להצגה." clusterThreshold={120} />
            : <div className="border-line bg-card text-muted grid h-80 place-items-center rounded-card border text-center text-sm">נמצאה פעילות שוק אך עדיין ללא קואורדינטות שכונה. ההשלמה תתבצע עם זיהוי המיקומים.</div>}
          <div className="border-line bg-card rounded-card border p-4 shadow-[var(--shadow-card)]">
            <p className="text-ink mb-3 text-sm font-black">שכונות מובילות בביקוש</p>
            {topList.length === 0 ? <p className="text-muted text-sm">אין עדיין פעילות שוק מתועדת בשכונות העיר.</p> : (
              <ul className="space-y-2.5">
                {topList.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", HEAT_DOT[p.tone])} />
                    <span className="text-muted w-4 text-xs font-bold tabular-nums">{i + 1}</span>
                    <span className="text-ink flex-1 truncate text-sm font-bold">{p.name}</span>
                    <span className="text-muted text-xs">{p.listings + p.transactions} פעילות{p.avgPrice ? ` · ${ilsC(p.avgPrice)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="text-muted text-[11px]">צבע השכונה מבטא עצמת פעילות (מודעות + עסקאות) אמיתית. מיקומים מ‑israel_neighborhoods; מחירים מנתוני השוק שלך.</p>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 5 — ACTIVITY TIMELINE  +  AI OPPORTUNITY RADAR
   ──────────────────────────────────────────────────────────────────────── */
const RADAR_ICON: Record<string, string> = { hot_buyers: "Users", potential_sellers: "Home", likely_listings: "Sparkles", deals_at_risk: "AlertTriangle" };

export function ActivityRadarSection({ t, data }: { t: Translate; data: DashboardHomeData }) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Left — activity timeline */}
      <div className="bg-card border-line rounded-[24px] border p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-ink text-base font-black">פעילות אחרונה</h3>
          <Link href="/command" className="text-brand-strong text-sm font-bold">לכל הפעילויות</Link>
        </div>
        {data.activity.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="relative flex flex-col gap-4 pr-4">
            <span className="bg-line absolute bottom-2 right-[5px] top-2 w-px" />
            {data.activity.slice(0, 6).map((a) => (
              <li key={a.id} className="relative flex items-start gap-3">
                <span className="bg-brand absolute right-[-3px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--color-card)]" />
                <span className="text-muted w-12 shrink-0 pt-0.5 text-[11px] font-bold tabular-nums">{a.time}</span>
                <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={a.icon} size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-bold">{a.entity}</p>
                  <p className="text-muted truncate text-xs">{t(a.detailKey)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Right — AI opportunity radar */}
      <div className="bg-card border-line rounded-[24px] border p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="zono-ai-gradient grid h-8 w-8 place-items-center rounded-xl text-white"><Icon name="Locate" size={16} /></span>
          <h3 className="text-ink text-base font-black">AI Opportunity Radar</h3>
        </div>
        {data.opportunities.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.opportunities.map((o) => (
              <Link key={o.id} href={o.href} className="bg-surface/70 hover:bg-brand-soft/60 flex items-center gap-3 rounded-2xl p-3 transition">
                <span className="bg-brand-soft text-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={RADAR_ICON[o.kind] ?? o.icon} size={18} /></span>
                <p className="text-ink min-w-0 flex-1 text-[13px] font-semibold">{t(o.reasonKey)}</p>
                <span className="bg-brand text-white grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black tabular-nums">{o.count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 6 — AI COMMAND CENTER  (full-width dark "mission control")
   ──────────────────────────────────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const r = 64, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, score) / 100);
  return (
    <div className="relative grid h-44 w-44 place-items-center">
      <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="url(#aiGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        <defs><linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
      </svg>
      <div className="text-center">
        <p className="text-5xl font-black text-white tabular-nums">{Math.round(score)}</p>
        <p className="text-[11px] font-bold tracking-widest text-white/60">AI SCORE</p>
      </div>
    </div>
  );
}


export function AICommandCenterSection({ t, data }: { t: Translate; data: DashboardHomeData }) {
  void t;
  const oppTotal = data.opportunities.reduce((s, o) => s + o.count, 0);
  const score = Math.max(0, Math.min(99, Math.round(data.dealProbabilityPct)));
  const hasData = data.opportunities.length > 0 || data.dealProbabilityPct > 0 || data.hotProperties.length > 0;
  const metrics = [
    { l: "הזדמנויות פעילות", v: String(oppTotal), sub: "זוהו ע״י AI", tone: "text-brand-light" },
    { l: "נכסים חמים", v: String(data.hotProperties.length), sub: "פעילים כעת", tone: "text-white" },
  ];
  return (
    <section className="relative overflow-hidden rounded-[28px] p-6 sm:p-8" style={{ background: "linear-gradient(135deg, #1b1340 0%, #120c2c 60%, #0b0820 100%)" }}>
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/30 blur-3xl" />
      <div className="relative mb-6 flex items-center gap-2">
        <span className="zono-ai-gradient grid h-9 w-9 place-items-center rounded-xl text-white"><Icon name="Sparkles" size={18} /></span>
        <h2 className="text-xl font-black text-white">AI Command Center</h2>
      </div>
      {!hasData ? (
        <EmptyStateDark className="relative" />
      ) : (
      <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto]">
        {/* Left metrics */}
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((m) => (
            <div key={m.l} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className={cn("text-3xl font-black tabular-nums", m.tone)}>{m.v}</p>
              <p className="mt-1 text-[13px] font-bold text-white/85">{m.l}</p>
              <p className="text-[11px] font-medium text-white/50">{m.sub}</p>
            </div>
          ))}
        </div>
        {/* AI score */}
        <div className="flex flex-col items-center gap-3">
          <ScoreRing score={score} />
          <p className="max-w-[220px] text-center text-[12px] font-medium text-white/70">ההמלצה של ZONO: זוהו {data.opportunities.length} הזדמנויות פעילות</p>
          <Link href="/command" className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-bold text-white">ראה המלצות</Link>
        </div>
      </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 7 — AI DEAL FORECAST  (funnel · top opportunities · market pulse)
   ──────────────────────────────────────────────────────────────────────── */
export function AIDealForecastSection({ t, data }: { t: Translate; data: DashboardHomeData }) {
  void t;
  // Top opportunities — real AI opportunity signals (already-Hebrew titles).
  const topOpps = data.opportunities.slice(0, 5);

  // Market pulse — only the metrics with a real value from the heatmap cells.
  const cn0 = data.cityNow;
  const hasMarket = data.heatZones.length > 0 || cn0.newListings > 0 || cn0.priceDrops > 0 || cn0.demandTrendPct > 0 || !!cn0.hotNeighborhood;
  const pulse = [
    { l: "ביקוש בשוק", v: `${cn0.demandTrendPct > 0 ? "+" : ""}${cn0.demandTrendPct}%`, up: cn0.demandTrendPct >= 0, icon: "TrendingUp" },
    { l: "ירידות מחיר", v: String(cn0.priceDrops), up: false, icon: "TrendingDown" },
    { l: "נכסים חדשים", v: String(cn0.newListings), up: true, icon: "Sparkles" },
    ...(cn0.hotNeighborhood ? [{ l: "שכונה מובילה", v: cn0.hotNeighborhood, up: true, icon: "Flame" }] : []),
  ];

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Top opportunities */}
      <div className="bg-card border-line rounded-[24px] border p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-ink mb-4 text-base font-black">ההזדמנויות החזקות</h3>
        {topOpps.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2">
            {topOpps.map((o, i) => (
              <Link key={o.id} href={o.href} className="bg-surface/70 hover:bg-brand-soft/60 flex items-center gap-3 rounded-2xl p-2.5 transition">
                <span className="bg-brand-soft text-brand-strong grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-black">{i + 1}</span>
                <p className="text-ink min-w-0 flex-1 truncate text-sm font-bold">{t(o.reasonKey)}</p>
                <span className="bg-brand text-white shrink-0 rounded-full px-2 py-0.5 text-xs font-black tabular-nums">{o.confidence}%</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Market pulse */}
      <div className="bg-card border-line rounded-[24px] border p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-ink mb-4 text-base font-black">דופק שוק</h3>
        {!hasMarket ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2.5">
            {pulse.map((p) => (
              <div key={p.l} className="bg-surface/70 flex items-center justify-between gap-2 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-8 w-8 place-items-center rounded-lg", p.up ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}><Icon name={p.icon} size={15} /></span>
                  <span className="text-ink text-[13px] font-bold">{p.l}</span>
                </div>
                <span className={cn("text-sm font-black", p.up ? "text-success" : "text-danger")}>{p.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION 8 — ZONO NEVER SLEEPS  (cinematic dark, animated live counters)
   ──────────────────────────────────────────────────────────────────────── */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const dur = 1200, t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className="tabular-nums">{n}</span>;
}

export function ZonoNeverSleepsSection({ t, data }: { t: Translate; data: DashboardHomeData }) {
  void t;
  const oppFound = data.opportunities.length;
  const attentionFound = data.attention.length;
  const zonesScanned = data.heatZones.length;
  const competitorsTracked = data.competitors.length;
  const counters = [
    { v: oppFound, l: "הזדמנויות שזוהו", i: "Target" },
    { v: attentionFound, l: "פריטים שדורשים טיפול", i: "ShieldAlert" },
    { v: zonesScanned, l: "אזורי שוק שנסרקו", i: "MapPin" },
    { v: competitorsTracked, l: "מתחרים במעקב", i: "Users" },
  ];
  const hasData = oppFound + attentionFound + zonesScanned + competitorsTracked > 0;
  return (
    <section className="relative overflow-hidden rounded-[28px] p-8 sm:p-10" style={{ background: "radial-gradient(120% 120% at 85% 20%, #3b1d6e 0%, #1a1140 45%, #0a0720 100%)" }}>
      <div className="absolute -right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(167,139,250,0.5), transparent 70%)" }} />
      <div className="relative flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="zono-ai-gradient grid h-10 w-10 place-items-center rounded-2xl text-white"><Icon name="Sparkles" size={20} /></span>
          <div>
            <h2 className="text-2xl font-black text-white sm:text-3xl">ZONO עובד עבורך גם עכשיו</h2>
            <p className="text-sm font-medium text-white/70">המנוע סורק, מתאים ומזהה הזדמנויות מסביב לשעון — גם כשאתה לא מחובר</p>
          </div>
        </div>
        {!hasData ? (
          <EmptyStateDark />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {counters.map((c) => (
              <div key={c.l} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-sm">
                <span className="text-brand-light mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-white/10"><Icon name={c.i} size={18} /></span>
                <p className="text-4xl font-black text-white"><CountUp to={c.v} /></p>
                <p className="mt-1 text-[12px] font-semibold text-white/70">{c.l}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
