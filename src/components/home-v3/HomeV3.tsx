"use client";
// ============================================================================
// 🌅 ZONO — Home V3 CINEMATIC (PHASE 61.3 "Bring ZONO to life").
// 100% UX/UI layer. NO business logic, NO new engines/tables/services, NO route
// or permission changes. Every section is composed from the data ALREADY fetched
// (`daily` = Daily OS · `data` = dashboard-home pipeline). Motion is subtle,
// premium, reduced-motion + mobile-performance safe. The magic is the FEELING
// that ZONO worked before the broker arrived — not the particles.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Reveal } from "@/components/dashboard/motion";
import { tr, type DashboardDict } from "@/lib/dashboard-home/i18n";
import type { DashboardHomeData, PropertyCard } from "@/lib/dashboard-home/types";
import type { DailyOS } from "@/lib/daily-os/types";
import type { ScoredEntity } from "@/lib/broker-workspace/types";
import { CountUp, LiveOrb, HeroParticles, RotatingFeed } from "./life";
// Loved premium real-estate sections — reused verbatim.
import { HotPropertiesSection } from "@/components/dashboard-home/components/HotPropertiesSection";
import { HomeHeatmapSection } from "@/components/dashboard-home/components/HomeHeatmapSection";
import { TodayAttentionSection } from "@/components/dashboard-home/components/TodayAttentionSection";

const priCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const priHe: Record<string, string> = { high: "דחוף", medium: "חשוב", low: "רגיל" };
const ils = (n: number) => `₪${n.toLocaleString("he-IL")}`;
const openSearch = () => { try { window.dispatchEvent(new CustomEvent("zono:open-search")); } catch { /* ignore */ } };

const QUICK_ACTIONS: { l: string; i: string; h: string }[] = [
  { l: "נכס חדש", i: "Building", h: "/properties/new" },
  { l: "קונה חדש", i: "UserPlus", h: "/buyers/new" },
  { l: "מוכר חדש", i: "Handshake", h: "/sellers/new" },
  { l: "קבע פגישה", i: "Calendar", h: "/calendar" },
  { l: "WhatsApp", i: "MessageCircle", h: "/whatsapp" },
  { l: "פרסום פייסבוק", i: "Megaphone", h: "/facebook" },
  { l: "מצלמה / מסמך", i: "Presentation", h: "/documents" },
  { l: "צור שיווק", i: "Sparkles", h: "/creative" },
  { l: "הקלטה קולית", i: "MessageCircle", h: "/voice" },
  { l: "ייבוא נכס", i: "Download", h: "/property-radar" },
  { l: "מרקטפלייס", i: "Building", h: "/marketplace" },
  { l: "מוח הברוקר", i: "Sparkles", h: "/brain" },
];

export function HomeV3({ dict, data, daily }: { dict: DashboardDict; data: DashboardHomeData; daily: DailyOS | null }) {
  const t = useMemo(() => (k: string) => tr(dict, k), [dict]);
  const [now] = useState(() => Date.now());
  const b = daily?.briefing ?? null;
  const mission = daily?.actionFeed?.[0] ?? null;
  const deals = daily?.deals ?? null;
  const perf = daily?.performance ?? null;

  // Commission opportunity — surfaced emotionally. Derived from the EXISTING
  // expected-revenue KPI (k2); no new computation, no new data.
  const commission = useMemo(() => {
    const raw = data.kpis.find((k) => k.id === "k2")?.value ?? "";
    const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }, [data.kpis]);

  // "While you were away" — a re-composition of numbers ZONO already produced.
  const digest = useMemo(() => {
    const d: { icon: string; text: string; tone: string }[] = [];
    if (deals?.hotBuyers.length) d.push({ icon: "Flame", text: `${deals.hotBuyers.length} קונים חמים מוכנים לפעולה`, tone: "text-brand-light" });
    if ((perf?.conversionOpportunities ?? 0) > 0) d.push({ icon: "TrendingUp", text: `מצאתי ${perf!.conversionOpportunities} הזדמנויות המרה`, tone: "text-brand-light" });
    const pubs = (daily?.marketing.groupsToPublish ?? 0) + (daily?.marketing.scheduledToday ?? 0);
    if (pubs > 0) d.push({ icon: "Megaphone", text: `הכנתי ${pubs} פרסומים לשיווק`, tone: "text-brand-light" });
    if (daily?.conversation.drafts.length) d.push({ icon: "MessageCircle", text: `ניסחתי ${daily.conversation.drafts.length} טיוטות WhatsApp`, tone: "text-brand-light" });
    if (deals?.sellersAtRisk.length) d.push({ icon: "AlertTriangle", text: `${deals.sellersAtRisk.length} מוכרים דורשים תשומת לב`, tone: "text-warning" });
    if (b?.biggestOpportunity) d.push({ icon: "Star", text: b.biggestOpportunity.label, tone: "text-success" });
    return d;
  }, [daily, deals, perf, b]);

  const spotlight = data.featuredProperty ?? data.hotProperties[0] ?? null;

  return (
    <div dir="rtl" className="relative flex flex-col gap-10 sm:gap-12">
      {/* ── S1 · CINEMATIC HERO — arrival. "ZONO worked before you arrived." ── */}
      <Reveal>
        <section className="zono-hero-cine relative rounded-[32px] p-6 text-white sm:p-9">
          <HeroParticles />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-9">
            {/* Orb — the living heart */}
            <div className="flex items-center gap-4 lg:flex-col lg:items-center lg:gap-3">
              <LiveOrb score={b?.dailyScore ?? null} size={132} />
              <div className="lg:text-center">
                <p className="text-[11px] font-bold text-brand-light">ZONO · הבוקר שלך</p>
                <h1 className="mt-0.5 text-2xl font-black sm:text-3xl">{b?.greeting ?? "בוקר טוב"}</h1>
              </div>
            </div>

            {/* Digest — while you were away */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/85">בזמן שלא היית, המשכתי לעבוד בשבילך:</p>
              <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {(digest.length ? digest : [{ icon: "Sparkles", text: "אני מנתח את השוק ומכין לך את היום", tone: "text-brand-light" }]).map((it, i) => (
                  <li key={i} className="zono-digest-line flex items-center gap-2.5 text-[14px] font-semibold" style={{ animationDelay: `${i * 110}ms` }}>
                    <span className={cn("shrink-0", it.tone)}><Icon name={it.icon} size={16} /></span>
                    <span className="text-white/95">{it.text}</span>
                  </li>
                ))}
              </ul>
              {b?.aiSummary && <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-white/70">{b.aiSummary}</p>}
            </div>

            {/* Commission + CTA + search */}
            <div className="flex shrink-0 flex-col gap-3 lg:w-64">
              {commission > 0 && (
                <div className="rounded-2xl bg-white/10 p-4 text-center backdrop-blur-sm ring-1 ring-white/15">
                  <p className="text-[11px] font-bold text-brand-light">עמלה פוטנציאלית היום</p>
                  <CountUp value={commission} format={ils} className="zono-figure-glow mt-1 block text-3xl font-black text-white sm:text-4xl" />
                </div>
              )}
              <Link href="/today" className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-[#2b1a5e] shadow-lg transition hover:bg-white/90">להתחיל את היום <span>←</span></Link>
              <button onClick={openSearch} className="zono-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-[13px] font-bold text-white ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/15"><Icon name="Sparkles" size={15} /> חיפוש חכם · ⌘K</button>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── S2 · TODAY'S MISSION — one premium mission card ── */}
      {mission && (
        <Reveal>
          <Link href={mission.href} className="bg-card border-line hover:border-brand-light block rounded-[24px] border p-6 shadow-[var(--shadow-card)] transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-brand text-[11px] font-bold">⟡ המשימה של היום</p>
                <p className="text-ink mt-1 text-xl font-black sm:text-2xl">{mission.title}</p>
                {mission.why && <p className="text-muted mt-1 text-sm leading-relaxed">{mission.why}</p>}
              </div>
              <span className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-bold", priCls[mission.priority] ?? priCls.low)}>{priHe[mission.priority] ?? "רגיל"}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {b?.biggestOpportunity && <Chip icon="TrendingUp" label={`פוטנציאל: ${b.biggestOpportunity.label}`} tone="text-success" />}
              {perf && <Chip icon="Target" label={`שיעור מעקב ${perf.followUpRatePct}%`} />}
              <span className="btn-zono-primary zono-focus-ring me-auto inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white">בצע עכשיו →</span>
            </div>
          </Link>
        </Reveal>
      )}

      {/* ── PROPERTY SPOTLIGHT — the star (Netflix / Airbnb feel) ── */}
      {spotlight && <Spotlight t={t} p={spotlight} />}

      {/* ── S3 · QUICK ACTIONS — the morning launchpad ── */}
      <Reveal>
        <section>
          <SectionTitle icon="Sparkles" title="פעולות מהירות" />
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {QUICK_ACTIONS.map((q) => (
              <Link key={q.h + q.l} href={q.h} className="bg-card border-line hover:border-brand-light group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition">
                <span className="bg-brand-soft text-brand-strong group-hover:zono-gradient grid h-11 w-11 place-items-center rounded-xl transition group-hover:text-white"><Icon name={q.i} size={19} /></span>
                <span className="text-ink text-[12px] font-bold leading-tight">{q.l}</span>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── S6 · AI FEED — alive: cycles through what ZONO noticed ── */}
      {daily && <AIFeed daily={daily} />}

      {/* ── S7 · RELATIONSHIP CENTER — who needs you ── */}
      {deals && (deals.hotBuyers.length + deals.sellersAtRisk.length + deals.leadFollowUps.length) > 0 && (
        <Reveal>
          <section className="bg-card border-line rounded-[22px] border p-5">
            <SectionTitle icon="Users" title="מי צריך אותך" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <PeopleColumn title="🔥 קונים חמים" items={deals.hotBuyers} />
              <PeopleColumn title="⚠️ מוכרים בסיכון" items={deals.sellersAtRisk} />
              <PeopleColumn title="📞 מעקב לידים" items={deals.leadFollowUps} />
            </div>
          </section>
        </Reveal>
      )}

      {/* ── S8 · MEETINGS (countdown) · S9 · MARKETING TODAY ── */}
      {daily && (
        <Reveal>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MeetingsSection daily={daily} now={now} />
            <MarketingToday daily={daily} />
          </div>
        </Reveal>
      )}

      {/* ── S4 · LIVE ACTIVITY · S5 · PROGRESS ── */}
      {daily && (
        <Reveal>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LiveActivity daily={daily} />
            <ProgressSection daily={daily} />
          </div>
        </Reveal>
      )}

      {/* ── S10 · TERRITORY SNAPSHOT — the loved live map + mood ── */}
      <HomeHeatmapSection />
      {daily && (daily.territory.acquisitionStreets.length > 0 || daily.territory.opportunities.length > 0) && (
        <Reveal>
          <section className="bg-card border-line rounded-[22px] border p-5">
            <div className="mb-3 flex items-center justify-between"><SectionTitle icon="Map" title="הטריטוריה שלך" inline /><Link href="/territory" className="text-brand-strong text-[12px] font-bold">מערכת הטריטוריה →</Link></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {daily.territory.acquisitionStreets.slice(0, 4).map((s, i) => (
                <Link key={i} href={s.href} className="bg-surface hover:border-brand-light border-line flex items-center justify-between rounded-xl border p-3 transition"><span className="text-ink text-[13px] font-bold">🛣️ {s.street}{s.city ? ` · ${s.city}` : ""}</span><span className="text-brand-strong text-[12px] font-black">{s.score}</span></Link>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── S11 · PREMIUM PROPERTY CAROUSEL — loved cards (rest) ── */}
      <HotPropertiesSection t={t} properties={data.hotProperties} />

      {/* ── (attention — loved) — what needs handling today ── */}
      <TodayAttentionSection t={t} items={data.attention} />

      {/* ── S14 · APPROVAL · S13 · EXECUTIVE · S12 · ACHIEVEMENTS (warmed) ── */}
      {daily && (
        <Reveal>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ApprovalCenter daily={daily} />
            <ExecutiveSnapshot daily={daily} />
            <Achievements daily={daily} />
          </div>
        </Reveal>
      )}

      {/* ── S15 · ASK ZONO — dock + 3 suggested questions ── */}
      <Reveal>
        <section className="flex flex-col items-center gap-3">
          {daily?.ask && daily.ask.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {daily.ask.slice(0, 3).map((q, i) => (
                <button key={i} onClick={openSearch} className="bg-brand-soft text-brand hover:bg-brand-soft/70 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition">{q}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={openSearch} className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition"><Icon name="Sparkles" size={16} /> שאל את ZONO · ⌘K</button>
            <Link href="/brain" className="text-brand-strong text-sm font-bold hover:underline">מוח הברוקר ←</Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

// ── Sub-components (all read from `daily`/props — no fetching) ────────────────
function SectionTitle({ icon, title, inline }: { icon: string; title: string; inline?: boolean }) {
  return <div className={cn("flex items-center gap-2", !inline && "mb-3")}><span className="text-brand"><Icon name={icon} size={16} /></span><h2 className="text-ink text-sm font-extrabold">{title}</h2></div>;
}
function Chip({ icon, label, tone = "text-muted" }: { icon: string; label: string; tone?: string }) {
  return <span className={cn("bg-surface inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", tone)}><Icon name={icon} size={12} />{label}</span>;
}

function Spotlight({ t, p }: { t: (k: string) => string; p: PropertyCard }) {
  const insight = p.aiInsightKey ? t(p.aiInsightKey) : null;
  const loc = [p.neighborhood, p.city].filter(Boolean).join(" · ");
  return (
    <Reveal>
      <section className="bg-card border-line group relative overflow-hidden rounded-[28px] border shadow-[var(--shadow-card)]">
        <div className="relative h-64 w-full overflow-hidden sm:h-80">
          {p.imageUrl
            ? <div className="zono-kenburns absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${p.imageUrl})` }} />
            : <div className="zono-gradient absolute inset-0" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#160f2e]/95 via-[#160f2e]/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
            <div className="mb-2 flex items-center gap-2">
              <span className="zono-live-dot inline-block h-2 w-2 rounded-full bg-emerald-400 text-emerald-400" />
              <span className="text-[11px] font-black tracking-wide text-brand-light">✦ הנכס של היום</span>
              {p.aiMatchScore != null && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold backdrop-blur-sm">התאמת AI {p.aiMatchScore}</span>}
            </div>
            <h3 className="text-2xl font-black sm:text-3xl">{p.title}</h3>
            {loc && <p className="mt-0.5 text-[13px] font-semibold text-white/80">{loc}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] font-bold text-white/90">
              {p.price > 0 && <span className="text-lg font-black text-white">{ils(p.price)}</span>}
              {p.rooms != null && <span>{p.rooms} חד׳</span>}
              {p.sizeSqm != null && <span>{p.sizeSqm} מ״ר</span>}
            </div>
            {insight && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/75">🧠 {insight}</p>}
            <Link href={p.href} className="zono-focus-ring mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-white px-5 py-2.5 text-[13px] font-black text-[#2b1a5e] transition hover:bg-white/90">צפה בנכס ופעל <span>←</span></Link>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

function AIFeed({ daily }: { daily: DailyOS }) {
  const items: { icon: string; text: string; href: string; tone: string }[] = [];
  if (daily.briefing.biggestOpportunity) items.push({ icon: "TrendingUp", text: `מצאתי הזדמנות: ${daily.briefing.biggestOpportunity.label}`, href: daily.briefing.biggestOpportunity.href, tone: "text-success" });
  const buyer = daily.deals.hotBuyers[0]; if (buyer) items.push({ icon: "Flame", text: `קונה מוכן לסגור: ${buyer.name}`, href: buyer.href, tone: "text-brand-strong" });
  const seller = daily.deals.sellersAtRisk[0]; if (seller) items.push({ icon: "AlertTriangle", text: `המוכר ${seller.name} מתקרר — ${seller.riskLabel ?? "סיכון נטישה"}`, href: seller.href, tone: "text-warning" });
  const stale = daily.deals.criticalListings[0]; if (stale) items.push({ icon: "Home", text: `נכס דורש תשומת לב: ${stale.name}`, href: stale.href, tone: "text-muted" });
  if (daily.marketing.groupsToPublish > 0) items.push({ icon: "Megaphone", text: `${daily.marketing.groupsToPublish} פוסטים מוכנים לפרסום בקבוצות`, href: "/facebook", tone: "text-brand-strong" });
  if (daily.briefing.biggestRisk) items.push({ icon: "AlertTriangle", text: daily.briefing.biggestRisk.label, href: daily.briefing.biggestRisk.href, tone: "text-danger" });
  for (const buyer2 of daily.deals.hotBuyers.slice(1, 4)) items.push({ icon: "Users", text: `התאמה חדשה: ${buyer2.name}${buyer2.reason ? ` — ${buyer2.reason}` : ""}`, href: buyer2.href, tone: "text-brand-strong" });
  if (!items.length) return null;
  return (
    <Reveal>
      <section className="bg-card border-line rounded-[22px] border p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="zono-live-dot inline-block h-2 w-2 rounded-full bg-brand text-brand" />
          <span className="text-brand"><Icon name="Sparkles" size={16} /></span>
          <h2 className="text-ink text-sm font-extrabold">ZONO שם לב</h2>
        </div>
        <RotatingFeed
          items={items}
          render={(it) => (
            <Link href={it.href} className="bg-surface hover:border-brand-light border-line flex items-center gap-3 rounded-xl border p-3 transition">
              <span className={cn("shrink-0", it.tone)}><Icon name={it.icon} size={16} /></span>
              <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">{it.text}</span>
              <span className="text-brand-strong shrink-0 text-[12px] font-bold">→</span>
            </Link>
          )}
        />
      </section>
    </Reveal>
  );
}

function PeopleColumn({ title, items }: { title: string; items: ScoredEntity[] }) {
  return (
    <div>
      <p className="text-muted mb-2 text-[11px] font-bold">{title}</p>
      {items.length === 0 ? <p className="text-muted text-[12px]">—</p> : (
        <div className="space-y-1.5">
          {items.slice(0, 3).map((e) => (
            <Link key={e.id} href={e.href} className="bg-surface hover:border-brand-light border-line flex items-center gap-2.5 rounded-xl border p-2.5 transition">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black", e.healthScore != null ? (e.healthScore >= 70 ? "bg-success-soft text-success" : e.healthScore >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger") : "bg-brand-soft text-brand")}>{e.healthScore ?? e.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><p className="text-ink truncate text-[12px] font-bold">{e.name}</p>{e.reason && <p className="text-muted truncate text-[10px]">{e.reason}</p>}</div>
              {e.riskLabel && <span className="bg-danger-soft text-danger shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold">{e.riskLabel}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingsSection({ daily, now }: { daily: DailyOS; now: number }) {
  const events = daily.timeline.slice(0, 4);
  return (
    <section className="bg-card border-line rounded-[22px] border p-5">
      <div className="mb-3 flex items-center justify-between"><SectionTitle icon="Calendar" title="ציר היום" inline /><Link href="/calendar" className="text-brand-strong text-[12px] font-bold">היומן →</Link></div>
      {events.length === 0 ? <p className="text-muted text-[13px]">אין אירועים מתוזמנים היום.</p> : (
        <div className="space-y-2">
          {events.map((e, i) => {
            const mins = Math.round((new Date(e.at).getTime() - now) / 60000);
            const soon = mins >= 0 && mins <= 90;
            return (
              <Link key={i} href={e.href} className="bg-surface hover:border-brand-light border-line flex items-center gap-3 rounded-xl border p-3 transition">
                <span className="text-lg">{e.icon}</span>
                <div className="min-w-0 flex-1"><p className="text-ink truncate text-[13px] font-bold">{e.title}</p>{e.detail && <p className="text-muted truncate text-[11px]">{e.detail}</p>}</div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", soon ? "bg-brand-soft text-brand" : "bg-surface text-muted")}>{mins >= 0 && mins < 600 ? `עוד ${mins} דק'` : new Date(e.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MarketingToday({ daily }: { daily: DailyOS }) {
  const m = daily.marketing;
  return (
    <section className="bg-card border-line rounded-[22px] border p-5">
      <div className="mb-3 flex items-center justify-between"><SectionTitle icon="Megaphone" title="שיווק היום" inline /><Link href="/facebook" className="text-brand-strong text-[12px] font-bold">מרכז השיווק →</Link></div>
      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="מתוזמן" value={m.scheduledToday} />
        <MiniStat label="קבוצות" value={m.groupsToPublish} tone="text-brand-strong" />
        <MiniStat label="תגובות" value={m.commentsWaiting} />
        <MiniStat label="לאישור" value={m.leadApprovals} tone="text-warning" />
      </div>
      {m.tasks.length > 0 && <div className="mt-2 space-y-1.5">{m.tasks.slice(0, 3).map((tk, i) => <Link key={i} href={tk.href} className="bg-surface hover:border-brand-light border-line flex items-center justify-between rounded-xl border p-2.5 transition"><span className="text-ink truncate text-[12px] font-bold">{tk.title}</span><span className="text-muted shrink-0 text-[10px]">{tk.detail}</span></Link>)}</div>}
    </section>
  );
}

function LiveActivity({ daily }: { daily: DailyOS }) {
  const c = daily.conversation;
  const feed: { icon: string; text: string; href: string }[] = [];
  if (c.whatsappWaiting > 0) feed.push({ icon: "MessageCircle", text: `${c.whatsappWaiting} שיחות WhatsApp ממתינות למענה`, href: "/whatsapp/inbox" });
  for (const w of c.waiting.slice(0, 3)) feed.push({ icon: "MessageCircle", text: `${w.name} — ${w.reason}`, href: w.href });
  if (c.facebookComments > 0) feed.push({ icon: "Megaphone", text: `${c.facebookComments} תגובות פייסבוק חדשות`, href: "/facebook" });
  if (c.facebookLeads > 0) feed.push({ icon: "Users", text: `${c.facebookLeads} לידים מפייסבוק`, href: "/social-leads" });
  return (
    <section className="bg-card border-line rounded-[22px] border p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="zono-live-dot inline-block h-2 w-2 rounded-full bg-emerald-500 text-emerald-500" />
        <span className="text-brand"><Icon name="Activity" size={16} /></span>
        <h2 className="text-ink text-sm font-extrabold">פעילות חיה</h2>
      </div>
      {feed.length === 0 ? <p className="text-muted text-[13px]">שקט כרגע — הכול מטופל ✓</p> : (
        <RotatingFeed
          items={feed}
          intervalMs={5000}
          render={(f) => (
            <Link href={f.href} className="hover:bg-surface flex items-center gap-3 rounded-xl p-2 transition"><span className="bg-success-soft text-success grid h-7 w-7 shrink-0 place-items-center rounded-lg"><Icon name={f.icon} size={13} /></span><span className="text-ink min-w-0 flex-1 truncate text-[12px] font-semibold">{f.text}</span></Link>
          )}
        />
      )}
    </section>
  );
}

function ProgressSection({ daily }: { daily: DailyOS }) {
  const p = daily.performance;
  const openActions = daily.actionFeed.length;
  const rate = Math.max(0, Math.min(100, p?.followUpRatePct ?? 0));
  return (
    <section className="bg-card border-line rounded-[22px] border p-5">
      <SectionTitle icon="TrendingUp" title="ההתקדמות שלך" />
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="פעולות פתוחות" value={openActions} tone="text-brand-strong" />
        <MiniStat label="ציון יומי" value={p?.daily ?? 0} />
        <MiniStat label="הזדמנויות" value={p?.conversionOpportunities ?? 0} tone="text-success" />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between"><span className="text-muted text-[11px] font-bold">שיעור מעקב</span><span className="text-ink text-[11px] font-bold"><CountUp value={rate} suffix="%" /></span></div>
        <div className="bg-surface h-2.5 overflow-hidden rounded-full"><div className="zono-gradient h-full rounded-full transition-all duration-1000" style={{ width: `${rate}%` }} /></div>
        <p className={cn("mt-1.5 text-[11px] font-bold", (p?.weekly ?? 0) >= (p?.daily ?? 0) ? "text-success" : "text-muted")}>מומנטום שבועי {p?.weekly ?? 0} {(p?.weekly ?? 0) >= (p?.daily ?? 0) ? "▲" : "→"}</p>
      </div>
    </section>
  );
}

function ApprovalCenter({ daily }: { daily: DailyOS }) {
  const a = daily.approvals;
  return (
    <section className="from-warning-soft/40 border-line rounded-[22px] border bg-gradient-to-br to-transparent p-5">
      <div className="mb-3 flex items-center justify-between"><SectionTitle icon="CheckCircle" title="ממתין לאישורך" inline />{a.length > 0 && <span className="bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[11px] font-bold">{a.length}</span>}</div>
      {a.length === 0 ? <p className="text-muted text-[13px]">אין אישורים ממתינים ✓</p> : (
        <div className="space-y-1.5">{a.slice(0, 4).map((it) => <Link key={it.id} href={it.href} className="bg-card hover:border-brand-light border-line block rounded-xl border p-2.5 transition"><p className="text-ink truncate text-[12px] font-bold">{it.title}</p><p className="text-muted truncate text-[10px]">{it.source}{it.why ? ` · ${it.why}` : ""}</p></Link>)}</div>
      )}
      <p className="text-muted mt-2 text-[10px]">אישור מתבצע במסך היעד — לא אוטומטי.</p>
    </section>
  );
}

function ExecutiveSnapshot({ daily }: { daily: DailyOS }) {
  const risks = daily.deals.sellersAtRisk.length + daily.deals.criticalListings.length;
  const score = daily.briefing.dailyScore;
  return (
    <section className="from-brand-soft/50 border-line rounded-[22px] border bg-gradient-to-br to-transparent p-5">
      <div className="mb-3 flex items-center justify-between"><SectionTitle icon="Sparkles" title="מצב העסק" inline /><Link href="/executive" className="text-brand-strong text-[12px] font-bold">מוח ניהולי →</Link></div>
      <div className="flex items-center gap-4">
        <div className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-black", score >= 70 ? "bg-success-soft text-success" : score >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}><CountUp value={score} /></div>
        <div className="text-[12px]">
          <p className="text-ink font-bold">בריאות הארגון</p>
          <p className={cn("font-bold", risks > 0 ? "text-warning" : "text-muted")}>{risks} סיכונים פעילים</p>
          <p className="text-muted">{daily.performance.conversionOpportunities} הזדמנויות המרה</p>
        </div>
      </div>
    </section>
  );
}

function Achievements({ daily }: { daily: DailyOS }) {
  // DERIVED read-only momentum — no streak/level persistence (no new table).
  const p = daily.performance;
  const hot = daily.deals.hotBuyers.length;
  const weekly = Math.max(0, Math.min(100, p?.weekly ?? 0));
  return (
    <section className="from-success-soft/40 border-line rounded-[22px] border bg-gradient-to-br to-transparent p-5">
      <SectionTitle icon="Flame" title="מומנטום" />
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="ציון שבועי" value={p?.weekly ?? 0} tone="text-brand-strong" />
        <MiniStat label="קונים חמים" value={hot} tone="text-success" />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between"><span className="text-muted text-[11px] font-bold">כושר שבועי</span><span className="text-ink text-[11px] font-bold">{weekly}/100</span></div>
        <div className="bg-card h-2.5 overflow-hidden rounded-full"><div className="zono-gradient h-full rounded-full transition-all duration-1000" style={{ width: `${weekly}%` }} /></div>
      </div>
      <p className="text-muted mt-2 text-[10px]">מבוסס על ביצועי השבוע — לא יעד מומצא.</p>
    </section>
  );
}

function MiniStat({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return <div className="bg-surface rounded-xl p-2.5 text-center"><div className={cn("text-lg font-black", tone)}><CountUp value={value} /></div><div className="text-muted text-[10px] font-bold">{label}</div></div>;
}
