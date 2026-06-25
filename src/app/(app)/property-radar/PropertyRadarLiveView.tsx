"use client";
// ============================================================================
// ZONO Property Radar™ — Live Command Center (Phase 13).
// A premium, real-time market-intelligence terminal that sits ABOVE the CRM
// dashboard: KPI strip · live market feed · hot deals · buyer-match stream ·
// action center · provider health · credit monitor · activity · real map.
// Realtime via the existing property_alerts channel + a 30s polling reconcile.
// All data is REAL + org-scoped (loaded server-side); lists are windowed.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Building2, Flame, ArrowDownRight, RotateCcw, Trash2, Users, Phone,
  MessageCircle, ExternalLink, Clock, Search, MapPin, Gauge, ShieldCheck, X, Layers,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import { ZonoMap, type ZonoMapPoint } from "@/components/maps/ZonoMap";
import { BuyerMatchPanel } from "@/components/property-radar";
import { buildWhatsappUrl, normalizePhoneForWhatsapp } from "@/lib/property-radar/utils";
import { getPropertyRadarLiveDataAction, getPropertySidePanelAction } from "@/lib/property-radar/live/actions";
import { filterFeed, windowItems } from "@/lib/property-radar/live/filter";
import type {
  ActionItem, BuyerStreamItem, HotDealItem, LiveEventKind, LiveFeedItem,
  PropertyRadarLiveData, PropertySidePanelData,
} from "@/lib/property-radar/live/types";

const POLL_MS = 30_000;

// ── formatting ────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("he-IL");
function price(p: number | null): string | null { return p == null ? null : `₪${fmt(p)}`; }
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} ד׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} ש׳`;
  return `לפני ${Math.round(h / 24)} ימים`;
}

const KIND: Record<LiveEventKind, { label: string; tone: string; Icon: typeof Flame }> = {
  new_property: { label: "נכס חדש", tone: "bg-brand text-white", Icon: Building2 },
  price_drop: { label: "ירידת מחיר", tone: "bg-amber-500 text-white", Icon: ArrowDownRight },
  hot_deal: { label: "עסקה חמה", tone: "bg-red-500 text-white", Icon: Flame },
  back_on_market: { label: "חזר לשוק", tone: "bg-emerald-500 text-white", Icon: RotateCcw },
  removed: { label: "הוסר", tone: "bg-black/50 text-white", Icon: Trash2 },
  buyer_match: { label: "התאמת קונים", tone: "bg-violet-500 text-white", Icon: Users },
  status_change: { label: "שינוי", tone: "bg-slate-500 text-white", Icon: Activity },
};

type TimeWindow = "today" | "24h" | "7d" | "all";
const TIME_FILTERS: { key: TimeWindow; label: string }[] = [
  { key: "today", label: "היום" }, { key: "24h", label: "24ש׳" }, { key: "7d", label: "7 ימים" }, { key: "all", label: "הכל" },
];
const KIND_FILTERS: { key: LiveEventKind | "private" | "broker" | "project"; label: string }[] = [
  { key: "private", label: "פרטי" }, { key: "broker", label: "תיווך" }, { key: "project", label: "פרויקטים" },
  { key: "price_drop", label: "ירידות מחיר" }, { key: "hot_deal", label: "עסקאות חמות" }, { key: "back_on_market", label: "חזרו לשוק" },
];

function openUrl(url: string | null, newTab = true) {
  if (!url || typeof window === "undefined") return;
  if (newTab) window.open(url, "_blank", "noopener,noreferrer"); else window.location.href = url;
}
function telOf(phone: string | null): string | null { const n = normalizePhoneForWhatsapp(phone); return n ? `tel:+${n}` : null; }

// ── small UI atoms ──────────────────────────────────────────────────────────
function ScorePill({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone = score >= 90 ? "bg-red-100 text-red-700" : score >= 75 ? "bg-amber-100 text-amber-700" : "bg-brand-soft text-brand-strong";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone}`}>ציון {Math.round(score)}</span>;
}
function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-white/40 bg-white/70 shadow-sm backdrop-blur-xl ${className}`}>{children}</section>;
}

export function PropertyRadarLiveView({ initial }: { initial: PropertyRadarLiveData }) {
  const org = useCurrentOrganization();
  const [data, setData] = useState<PropertyRadarLiveData>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [live, setLive] = useState(false);

  // filters / search
  const [tw, setTw] = useState<TimeWindow>("today");
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [highOnly, setHighOnly] = useState(false);
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(20);
  const [filterKey, setFilterKey] = useState("");

  // side panel
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PropertySidePanelData | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await getPropertyRadarLiveDataAction();
    if (res.ok) setData(res.data);
    setRefreshing(false);
  }, []);

  // 30s polling reconcile.
  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Realtime: new alerts pulse the counter + trigger an immediate refresh.
  useEffect(() => {
    if (!org?.id) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`radar_live:${org.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "property_alerts", filter: `org_id=eq.${org.id}` }, () => {
        setPulse((p) => p + 1);
        void refresh();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { setLive(false); void supabase.removeChannel(ch); };
  }, [org?.id, refresh]);

  // ── filtering ──────────────────────────────────────────────────────────
  const windowMs = tw === "today" || tw === "24h" ? 24 * 3600_000 : tw === "7d" ? 7 * 24 * 3600_000 : Infinity;
  const filteredFeed = useMemo(
    () => filterFeed(data.feed, { windowMs, highOnly, kinds, query: q }),
    [data.feed, windowMs, highOnly, kinds, q],
  );

  // Reset the window when filters change — "adjust state during render" pattern.
  const nextKey = `${tw}|${[...kinds].sort().join(",")}|${highOnly}|${q}`;
  if (nextKey !== filterKey) { setFilterKey(nextKey); setVisible(20); }
  const shownFeed = windowItems(filteredFeed, visible).items;

  // lazy "load more" sentinel
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setVisible((v) => Math.min(v + 20, filteredFeed.length)); });
    io.observe(el);
    return () => io.disconnect();
  }, [filteredFeed.length]);

  const openPanel = useCallback(async (sourceId: string | null) => {
    if (!sourceId) return;
    setPanelId(sourceId); setPanel(null); setPanelLoading(true);
    const res = await getPropertySidePanelAction(sourceId);
    if (res.ok) setPanel(res.data);
    setPanelLoading(false);
  }, []);

  const toggleKind = (k: string) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const mapPoints: ZonoMapPoint[] = data.mapPoints.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone === "neutral" ? "brand" : p.tone }));

  const k = data.kpis;
  const kpiCards: { label: string; value: number; filter?: () => void; hot?: boolean }[] = [
    { label: "נכסים חדשים", value: k.newListings, filter: () => { setKinds(new Set(["new_property"])); } },
    { label: "נכסים פרטיים", value: k.privateListings, filter: () => { setKinds(new Set(["private"])); } },
    { label: "ירידות מחיר", value: k.priceDrops, filter: () => { setKinds(new Set(["price_drop"])); } },
    { label: "עסקאות חמות", value: k.hotDeals, hot: true, filter: () => { setKinds(new Set(["hot_deal"])); } },
    { label: "חזרו לשוק", value: k.backOnMarket, filter: () => { setKinds(new Set(["back_on_market"])); } },
    { label: "התאמות קונים", value: k.buyerMatchesCreated, filter: () => { setKinds(new Set(["buyer_match"])); } },
    { label: "התראות נשלחו", value: k.alertsSent },
    { label: "משימות נוצרו", value: k.tasksCreated },
    { label: "קרדיטים שנחסכו", value: k.creditsSaved },
    { label: "סריקות כפולות שנחסכו", value: k.duplicateScansAvoided },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-brand-soft/30 via-transparent to-transparent p-3 sm:p-4">
      {/* Header */}
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30"><Activity size={20} /></span>
          <div>
            <h1 className="text-xl font-black text-ink">Property Radar — מרכז פיקוד חי</h1>
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink/55">
              <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-ink/30"}`} />
              {live ? "מחובר בזמן אמת" : "מסונכרן"} · עודכן {timeAgo(data.generatedAt)}
            </p>
          </div>
        </div>
        <div className="relative ms-auto flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש כתובת, שכונה, טלפון, ספק…"
              className="w-56 rounded-xl border border-black/10 bg-white/80 py-2 pe-3 ps-8 text-sm font-semibold text-ink placeholder:text-ink/40" />
          </div>
          <button onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-black text-white disabled:opacity-60">
            <RotateCcw size={15} className={refreshing ? "animate-spin" : ""} /> רענן
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((c) => (
          <button key={c.label} onClick={c.filter} className={`flex flex-col items-start rounded-2xl border p-3 text-right transition hover:scale-[1.02] ${c.hot ? "border-red-200 bg-red-50/70" : "border-white/40 bg-white/70"} backdrop-blur-xl`}>
            <span className="text-[11px] font-bold text-ink/55">{c.label}</span>
            <span key={`${c.label}-${c.value}-${pulse}`} className={`text-2xl font-black ${c.hot ? "text-red-600" : "text-brand-strong"}`}>{fmt(c.value)}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {TIME_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setTw(f.key)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${tw === f.key ? "bg-brand text-white" : "bg-white/70 text-ink/70 hover:bg-white"}`}>{f.label}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-black/10" />
        {KIND_FILTERS.map((f) => (
          <button key={f.key} onClick={() => toggleKind(f.key)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${kinds.has(f.key) ? "bg-brand-strong text-white" : "bg-white/70 text-ink/70 hover:bg-white"}`}>{f.label}</button>
        ))}
        <button onClick={() => setHighOnly((v) => !v)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${highOnly ? "bg-amber-500 text-white" : "bg-white/70 text-ink/70 hover:bg-white"}`}>ציון גבוה בלבד</button>
        {(kinds.size > 0 || highOnly || q) && (
          <button onClick={() => { setKinds(new Set()); setHighOnly(false); setQ(""); }} className="rounded-full px-3 py-1 text-xs font-bold text-ink/50 hover:text-ink">נקה</button>
        )}
      </div>

      {/* Three-column command grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* LEFT — Live Market Feed */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <Glass className="p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Activity size={15} className="text-brand-strong" /> פיד שוק חי</h2>
            {shownFeed.length === 0 ? (
              <p className="rounded-xl bg-black/5 px-3 py-6 text-center text-sm font-medium text-ink/50">אין אירועים תואמים לסינון הנוכחי.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {shownFeed.map((it) => <FeedCard key={it.id} item={it} onOpen={() => openPanel(it.marketPropertySourceId)} />)}
                <div ref={sentinel} />
                {visible < filteredFeed.length && <p className="py-2 text-center text-xs font-bold text-ink/40">טוען עוד…</p>}
              </div>
            )}
          </Glass>
        </div>

        {/* CENTER — Hot deals + Buyer stream + Map */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <Glass className="p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Flame size={15} className="text-red-500" /> עסקאות חמות</h2>
            {data.hotDeals.length === 0 ? (
              <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין עסקאות חמות כרגע.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">{data.hotDeals.slice(0, 6).map((h) => <HotDealCard key={h.marketPropertySourceId} item={h} onOpen={() => openPanel(h.marketPropertySourceId)} />)}</div>
            )}
          </Glass>

          <Glass className="p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Users size={15} className="text-violet-500" /> זרם התאמות קונים</h2>
            {data.buyerStream.length === 0 ? (
              <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין התאמות פעילות כרגע.</p>
            ) : (
              <div className="flex flex-col gap-2">{data.buyerStream.slice(0, 6).map((b) => <BuyerStreamCard key={b.marketPropertySourceId} item={b} onOpen={() => openPanel(b.marketPropertySourceId)} />)}</div>
            )}
          </Glass>

          <Glass className="overflow-hidden p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><MapPin size={15} className="text-brand-strong" /> מפת שוק</h2>
            <ZonoMap points={mapPoints} heightClass="h-72" emptyMessage="אין נכסים עם קואורדינטות אמיתיות לתצוגה במפה כרגע." clusterThreshold={12} />
          </Glass>
        </div>

        {/* RIGHT — Action center + widgets */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <Glass className="p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Clock size={15} className="text-brand-strong" /> מרכז פעולה</h2>
            {data.actionCenter.length === 0 ? (
              <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין פעולות פתוחות.</p>
            ) : (
              <div className="flex flex-col gap-1.5">{data.actionCenter.slice(0, 12).map((a) => <ActionCard key={a.id} item={a} onOpen={() => openPanel(a.marketPropertySourceId)} />)}</div>
            )}
          </Glass>

          <ProviderHealthWidget data={data} />
          <CreditMonitorWidget data={data} />

          <Glass className="p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Layers size={15} className="text-brand-strong" /> פעילות אחרונה</h2>
            {data.activity.length === 0 ? (
              <p className="rounded-xl bg-black/5 px-3 py-4 text-center text-xs font-medium text-ink/50">אין פעילות מתועדת.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {data.activity.slice(0, 12).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[12px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span className="truncate font-semibold text-ink/80">{a.title || a.eventType}</span>
                    <span className="ms-auto shrink-0 text-ink/40">{timeAgo(a.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Glass>
        </div>
      </div>

      {panelId && (
        <PropertySidePanel id={panelId} data={panel} loading={panelLoading} onClose={() => { setPanelId(null); setPanel(null); }} />
      )}
    </div>
  );
}

// ── cards ─────────────────────────────────────────────────────────────────
function ActionButtons({ phone, externalUrl, sourceId, onOpen, onBuyers }: { phone: string | null; externalUrl: string | null; sourceId: string | null; onOpen: () => void; onBuyers?: () => void }) {
  const tel = telOf(phone);
  const wa = phone ? buildWhatsappUrl(phone, "שלום, מתעניין/ת בנכס.") : null;
  return (
    <div className="flex flex-wrap gap-1">
      <button onClick={onOpen} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand-strong hover:bg-brand-soft/70"><ExternalLink size={12} /> פתח</button>
      {tel && <a href={tel} className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold text-ink/80 hover:bg-black/10"><Phone size={12} /> חיוג</a>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"><MessageCircle size={12} /> וואטסאפ</a>}
      {externalUrl && <button onClick={() => openUrl(externalUrl)} className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold text-ink/70 hover:bg-black/10">מקור</button>}
      {onBuyers && sourceId && <button onClick={onBuyers} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-100"><Users size={12} /> קונים</button>}
    </div>
  );
}

function FeedCard({ item, onOpen }: { item: LiveFeedItem; onOpen: () => void }) {
  const meta = KIND[item.kind];
  const Ic = meta.Icon;
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-2.5">
      <div className="flex gap-2.5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-soft/40">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : <div className="grid h-full w-full place-items-center text-brand-strong/30"><Building2 size={22} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${meta.tone}`}><Ic size={11} /> {meta.label}</span>
            <ScorePill score={item.opportunityScore} />
            <span className="ms-auto text-[10px] font-bold text-ink/40">{timeAgo(item.at)}</span>
          </div>
          <p className="mt-1 truncate text-[13px] font-bold text-ink">{item.addressText ?? item.city ?? "נכס"}</p>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink/60">
            {price(item.price) && <span className="text-brand-strong">{price(item.price)}</span>}
            {item.priceDelta != null && item.priceDelta < 0 && <span className="text-amber-600">{fmt(item.priceDelta)} ₪</span>}
            {item.buyerMatchCount > 0 && <span className="text-violet-600">{item.buyerMatchCount} קונים</span>}
          </div>
        </div>
      </div>
      {item.exclusiveProbability != null && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-brand-soft/30 px-2 py-1 text-[11px] font-bold">
          <span className={`rounded-full px-1.5 py-0.5 ${item.exclusiveBand === "very_high" || item.exclusiveBand === "high" ? "bg-emerald-100 text-emerald-700" : item.exclusiveBand === "medium" ? "bg-amber-100 text-amber-700" : "bg-black/5 text-ink/55"}`}>בלעדיות {item.exclusiveProbability}%</span>
          {item.sellerScore != null && <span className="text-ink/60">ציון מוכר {item.sellerScore}</span>}
          {item.recommendedAction && <span className="text-brand-strong">{EXCLUSIVE_ACTION_LABEL[item.recommendedAction] ?? ""}</span>}
          {item.lastContactAt && <span className="text-ink/45">קשר אחרון {timeAgo(item.lastContactAt)}</span>}
        </div>
      )}
      <div className="mt-2"><ActionButtons phone={item.phone} externalUrl={item.externalUrl} sourceId={item.marketPropertySourceId} onOpen={onOpen} onBuyers={item.buyerMatchCount > 0 ? onOpen : undefined} /></div>
    </div>
  );
}

const EXCLUSIVE_ACTION_LABEL: Record<string, string> = {
  call_today: "להתקשר היום", send_whatsapp: "וואטסאפ", schedule_meeting: "לקבוע פגישה", follow_up_tomorrow: "מעקב מחר", wait: "להמתין",
};

function HotDealCard({ item, onOpen }: { item: HotDealItem; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex flex-col rounded-2xl border border-red-100 bg-gradient-to-b from-red-50/80 to-white p-2.5 text-right transition hover:scale-[1.01]">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white"><Flame size={11} /> חמה</span>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700">ציון {Math.round(item.opportunityScore)}</span>
        <span className="ms-auto text-[10px] font-bold text-ink/40">{timeAgo(item.publishedAt)}</span>
      </div>
      <p className="mt-1.5 truncate text-[13px] font-black text-ink">{item.addressText ?? item.city ?? "נכס"}</p>
      <p className="text-[12px] font-semibold text-ink/55">{[item.neighborhood, item.city].filter(Boolean).join(", ")}</p>
      <div className="mt-1 flex items-center gap-2 text-[12px] font-bold">
        {price(item.price) && <span className="text-brand-strong">{price(item.price)}</span>}
        {item.buyerMatchCount > 0 && <span className="text-violet-600">{item.buyerMatchCount} קונים</span>}
      </div>
    </button>
  );
}

function BuyerStreamCard({ item, onOpen }: { item: BuyerStreamItem; onOpen: () => void }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-2.5">
      <button onClick={onOpen} className="flex w-full items-center gap-2 text-right">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-brand-soft/40">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : <div className="grid h-full w-full place-items-center text-brand-strong/30"><Building2 size={16} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">{item.addressText ?? item.city ?? "נכס"}</p>
          <p className="text-[11px] font-semibold text-ink/55">{price(item.price) ?? "—"} · {item.buyers.length} קונים מתאימים</p>
        </div>
      </button>
      <div className="mt-1.5 flex flex-col gap-1">
        {item.buyers.slice(0, 3).map((b) => (
          <div key={b.matchId} className="flex items-center gap-2 rounded-lg bg-brand-soft/30 px-2 py-1 text-[11px]">
            <span className="font-black text-violet-700">{b.matchScore}</span>
            <span className="truncate font-bold text-ink">{b.buyerName || "קונה"}</span>
            {b.positives[0] && <span className="ms-auto truncate text-emerald-700">{b.positives[0]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const PRIORITY_TONE: Record<string, string> = { urgent: "bg-red-100 text-red-700", high: "bg-amber-100 text-amber-700", medium: "bg-brand-soft text-brand-strong", low: "bg-black/5 text-ink/60" };
function ActionCard({ item, onOpen }: { item: ActionItem; onOpen: () => void }) {
  const tel = telOf(item.phone);
  return (
    <div className={`rounded-xl border p-2 ${item.overdue ? "border-red-200 bg-red-50/60" : "border-black/5 bg-white"}`}>
      <div className="flex items-center gap-1.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${PRIORITY_TONE[item.priority] ?? PRIORITY_TONE.medium}`}>{item.kind === "alert" ? "התראה" : "משימה"}</span>
        {item.overdue && <span className="text-[10px] font-black text-red-600">באיחור</span>}
        {item.dueAt && <span className="ms-auto text-[10px] font-bold text-ink/40">{timeAgo(item.dueAt)}</span>}
      </div>
      <p className="mt-1 truncate text-[12px] font-bold text-ink">{item.title}</p>
      {item.subtitle && <p className="truncate text-[11px] text-ink/55">{item.subtitle}</p>}
      <div className="mt-1.5 flex gap-1">
        {item.marketPropertySourceId && <button onClick={onOpen} className="rounded-lg bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-strong">פתח</button>}
        {tel && <a href={tel} className="rounded-lg bg-black/5 px-2 py-0.5 text-[10px] font-bold text-ink/70">חיוג</a>}
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<string, string> = { mock: "בדיקה", yad2: "יד2", madlan: "מדלן" };
const HEALTH_TONE: Record<string, string> = { online: "bg-emerald-100 text-emerald-700", not_configured: "bg-black/5 text-ink/50", disabled: "bg-black/5 text-ink/50", error: "bg-red-100 text-red-700", unknown: "bg-amber-100 text-amber-700" };
function ProviderHealthWidget({ data }: { data: PropertyRadarLiveData }) {
  const providers = data.providerHealth.filter((p) => p.provider !== "mock");
  return (
    <Glass className="p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><ShieldCheck size={15} className="text-brand-strong" /> בריאות ספקים</h2>
      <div className="flex flex-col gap-1.5">
        {providers.map((p) => (
          <div key={p.provider} className="flex items-center gap-2 rounded-xl bg-white/60 px-2.5 py-1.5">
            <span className="text-[12px] font-black text-ink">{PROVIDER_LABEL[p.provider] ?? p.provider}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${HEALTH_TONE[p.status] ?? HEALTH_TONE.unknown}`}>{p.message}</span>
            <span className="ms-auto text-[11px] font-semibold text-ink/50">{p.averageDurationMs != null ? `${Math.round(p.averageDurationMs)}ms` : "—"}</span>
          </div>
        ))}
      </div>
    </Glass>
  );
}

function CreditMonitorWidget({ data }: { data: PropertyRadarLiveData }) {
  const c = data.creditMonitor;
  return (
    <Glass className="p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Gauge size={15} className="text-brand-strong" /> ניטור קרדיטים</h2>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="נוצלו היום" value={data.creditMonitor.usedToday} />
        <Mini label="נחסכו" value={c.savedToday} highlight />
        <Mini label="נותרו" value={c.remainingToday} />
        <Mini label="יעילות" value={c.efficiencyPct} suffix="%" highlight />
      </div>
    </Glass>
  );
}
function Mini({ label, value, suffix = "", highlight = false }: { label: string; value: number; suffix?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-white/60 p-2">
      <p className="text-[10px] font-bold text-ink/50">{label}</p>
      <p className={`text-lg font-black ${highlight ? "text-emerald-600" : "text-brand-strong"}`}>{fmt(value)}{suffix}</p>
    </div>
  );
}

// ── side panel ───────────────────────────────────────────────────────────
function PropertySidePanel({ id, data, loading, onClose }: { id: string; data: PropertySidePanelData | null; loading: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="סגור" />
      <div className="relative ms-auto h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl">
        <div className="zono-gradient sticky top-0 z-10 flex items-center justify-between px-4 py-3 text-white">
          <p className="font-black">פרטי נכס</p>
          <button onClick={onClose} className="rounded-lg bg-white/20 p-1"><X size={18} /></button>
        </div>
        {loading || !data ? (
          <div className="p-6 text-center text-sm font-semibold text-ink/50">טוען…</div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {data.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.images[0]} alt="" className="h-44 w-full rounded-2xl object-cover" />
            )}
            <div>
              <p className="text-lg font-black text-ink">{data.addressText ?? data.city ?? "נכס"}</p>
              <p className="text-sm font-semibold text-ink/55">{[data.neighborhood, data.city].filter(Boolean).join(", ")}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[12px] font-bold text-ink/80">
              {data.price != null && <span className="rounded-lg bg-brand-soft px-2 py-1 text-brand-strong">₪{fmt(data.price)}</span>}
              {data.rooms != null && <span className="rounded-lg bg-black/5 px-2 py-1">{data.rooms} חד׳</span>}
              {data.sizeSqm != null && <span className="rounded-lg bg-black/5 px-2 py-1">{data.sizeSqm} מ״ר</span>}
              {data.floor && <span className="rounded-lg bg-black/5 px-2 py-1">קומה {data.floor}</span>}
              {data.propertyType && <span className="rounded-lg bg-black/5 px-2 py-1">{data.propertyType}</span>}
            </div>
            <ActionButtons phone={data.phone} externalUrl={data.externalUrl} sourceId={id} onOpen={() => data.externalUrl && openUrl(data.externalUrl)} />

            {data.competitorName && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-[12px] font-black text-amber-800">משויך כנראה ל: {data.competitorName}</p>
                <p className="mt-0.5 text-[11px] font-bold text-amber-700/80">
                  {data.competitorConfidence != null ? `ודאות: ${data.competitorConfidence}%` : ""}
                  {data.competitorSourceLabel ? ` · ${data.competitorSourceLabel}` : ""}
                </p>
              </div>
            )}

            {data.priceHistory.length > 0 && (
              <div className="rounded-2xl bg-brand-soft/30 p-3">
                <p className="mb-1.5 text-xs font-black text-brand-strong">היסטוריית מחיר</p>
                <div className="flex flex-col gap-1">
                  {data.priceHistory.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px] font-semibold text-ink/70"><span>{new Date(p.at).toLocaleDateString("he-IL")}</span><span className="text-brand-strong">{p.price != null ? `₪${fmt(p.price)}` : "—"}</span></div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-black text-ink/70">קונים מתאימים</p>
              <BuyerMatchPanel marketPropertySourceId={id} />
            </div>

            {data.timeline.length > 0 && (
              <div className="rounded-2xl border border-black/5 p-3">
                <p className="mb-1.5 text-xs font-black text-ink/70">ציר זמן</p>
                <div className="flex flex-col gap-1.5">
                  {data.timeline.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span className="font-semibold text-ink/80">{e.label}</span>
                      <span className="ms-auto text-ink/40">{new Date(e.at).toLocaleDateString("he-IL")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
