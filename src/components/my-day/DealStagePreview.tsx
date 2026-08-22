"use client";
// ============================================================================
// ZONO — "העסקאות שלי" deal-stage HOVER INTELLIGENCE preview (home dashboard only).
// Enhances the EXISTING stage rows: hover (desktop) / tap (mobile) reveals a
// bounded, lazy-loaded floating preview of the real deals in that stage. Presentation
// + bounded retrieval only — data comes from the canonical loadDealStagePreviewAction.
// No router navigation and no dashboard reload on open/close; per-stage session cache
// so the first hover loads and subsequent hovers are instant. RTL + Hebrew only.
// ============================================================================
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { loadDealStagePreviewAction } from "@/lib/my-day/deal-stage-preview-actions";
import type { DealStagePreview, DealPreviewItem } from "@/lib/my-day/deal-stage-preview-core";

// Per page-session cache (survives row remounts; naturally cleared on full reload).
const previewCache = new Map<string, DealStagePreview>();
const inflight = new Map<string, Promise<DealStagePreview | null>>();

function loadStage(stage: string): Promise<DealStagePreview | null> {
  const cached = previewCache.get(stage);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(stage);
  if (existing) return existing;
  const pr = loadDealStagePreviewAction(stage)
    .then((res) => { if (res) previewCache.set(stage, res); inflight.delete(stage); return res; })
    .catch(() => { inflight.delete(stage); return null; });
  inflight.set(stage, pr);
  return pr;
}

const OPEN_DELAY = 150;
const CLOSE_DELAY = 200;
const PANEL_W = 384;

const ils = (n: number | null): string | null =>
  n && n > 0 ? (n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${n}`) : null;
const daysLabel = (d: number | null): string | null =>
  d == null ? null : d <= 0 ? "נכנס היום" : d === 1 ? "יום בשלב" : `${d} ימים בשלב`;

export function DealStagePreview({ stage, label, count, value, last }: {
  stage: string; label: string; count: number; value: number; last: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DealStagePreview | null>(() => previewCache.get(stage) ?? null);
  const [loading, setLoading] = useState(false);
  // Coarse pointer (no hover) → tap opens a bottom sheet instead of a popover.
  // Read once during render (guarded for SSR) — pointer type is stable per session.
  const [coarse] = useState<boolean>(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: none)").matches);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const beginLoad = useCallback(() => {
    if (previewCache.has(stage)) { setData(previewCache.get(stage)!); return; }
    setLoading(true);
    loadStage(stage).then((res) => { setData(res); setLoading(false); });
  }, [stage]);

  // Desktop popover position — RTL-aware, clamped to the viewport (fixed).
  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    // Prefer the side with more room; in RTL the card sits on the start(right) edge.
    const spaceLeft = r.left;
    const spaceRight = window.innerWidth - r.right;
    let left = spaceLeft >= PANEL_W + gap || spaceLeft >= spaceRight ? r.left - PANEL_W - gap : r.right + gap;
    left = Math.max(8, Math.min(left, window.innerWidth - PANEL_W - 8));
    const top = Math.max(8, Math.min(r.top, window.innerHeight - 260));
    setPos({ top, left });
  }, []);

  const doOpen = useCallback(() => {
    if (count <= 0) return; // zero-count stage never opens
    clearTimers();
    if (!coarse) computePosition();
    setOpen(true);
    beginLoad();
  }, [count, coarse, computePosition, beginLoad]);

  const scheduleOpen = () => {
    if (coarse || count <= 0) return;
    clearTimers();
    openTimer.current = setTimeout(doOpen, OPEN_DELAY);
  };
  const scheduleClose = () => {
    if (coarse) return;
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };
  const closeNow = useCallback(() => { clearTimers(); setOpen(false); }, []);

  // ESC closes and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { closeNow(); triggerRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeNow]);

  useEffect(() => () => clearTimers(), []);

  const total = data?.total ?? count;
  const inconsistent = !!data && count > 0 && data.total === 0;
  if (inconsistent && typeof console !== "undefined") {
    // count>0 on the dashboard but the server preview returned nothing — surface, don't fabricate.
    console.warn(`[deal-stage-preview] stage "${stage}" shows ${count} but preview returned 0`);
  }

  const panel = open ? (
    <div
      id={panelId}
      role="dialog"
      aria-label={`${total} עסקאות בסטטוס ${label}`}
      dir="rtl"
      onMouseEnter={() => { if (!coarse) clearTimers(); }}
      onMouseLeave={scheduleClose}
      className={
        coarse
          ? "fixed inset-x-0 bottom-0 z-[60] max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-4 shadow-[0_-16px_50px_-12px_rgba(15,23,42,0.4)]"
          : "fixed z-[60] w-[384px] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]"
      }
      style={coarse ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : { top: pos?.top ?? 0, left: pos?.left ?? 0 }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
        <p className="text-ink text-[13px] font-black">{total} עסקאות בסטטוס {label}</p>
        {coarse && <button type="button" onClick={closeNow} aria-label="סגירה" className="text-muted hover:text-ink text-lg leading-none">✕</button>}
      </div>

      <div className="flex flex-col gap-1 p-2">
        {loading && !data ? (
          <>{[0, 1].map((i) => <SkeletonRow key={i} />)}</>
        ) : data && data.items.length > 0 ? (
          data.items.map((it) => <PreviewRow key={it.id} it={it} />)
        ) : (
          <div className="text-muted px-3 py-6 text-center text-[12.5px]">לא נמצאו עסקאות להצגה</div>
        )}
      </div>

      <div className="border-t border-line/70 p-2">
        <Link href="/deals" prefetch={false} className="text-brand-strong hover:bg-surface flex items-center justify-center rounded-lg px-3 py-2 text-[12.5px] font-bold transition">
          צפה בכל העסקאות בשלב ←
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${count} עסקאות בסטטוס ${label} — הצגת תצוגה מקדימה`}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={() => { if (!coarse) computePosition(); }}
        onClick={() => (open ? closeNow() : doOpen())}
        className="group/stage hover:bg-surface focus-visible:ring-brand/40 flex w-full items-stretch gap-2.5 rounded-lg px-1 py-0.5 text-right transition focus:outline-none focus-visible:ring-2"
      >
        <div className="flex flex-col items-center">
          <span className="bg-brand-soft text-brand-strong grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-black tabular-nums">{count}</span>
          {!last && <span className="bg-line my-0.5 w-px flex-1" />}
        </div>
        <div className="flex flex-1 items-center pb-1.5">
          <span className="text-ink text-[12.5px] font-bold leading-tight">{label}</span>
          {value > 0 && <span className="text-muted mr-auto text-[11px] font-semibold tabular-nums">{`₪${Math.round(value / 1000)}K`}</span>}
          <span aria-hidden className="text-brand-strong ms-1.5 shrink-0 text-[11px] opacity-0 transition group-hover/stage:opacity-100">‹</span>
        </div>
      </button>
      {coarse && open && <div className="fixed inset-0 z-[55] bg-black/20" onClick={closeNow} aria-hidden />}
      {panel}
    </>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <div className="bg-surface h-16 w-16 shrink-0 animate-pulse rounded-xl" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="bg-surface h-3 w-3/4 animate-pulse rounded" />
        <div className="bg-surface h-3 w-1/2 animate-pulse rounded" />
      </div>
      <div className="bg-surface h-8 w-8 shrink-0 animate-pulse rounded-full" />
    </div>
  );
}

function PreviewRow({ it }: { it: DealPreviewItem }) {
  const price = ils(it.price);
  const time = daysLabel(it.daysInStage);
  return (
    <div className="hover:bg-surface flex items-center gap-3 rounded-lg px-2 py-2 transition">
      <div className="bg-brand-soft relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
        {it.image
          ? <img src={it.image} alt={it.propertyTitle} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <span className="text-brand-strong grid h-full w-full place-items-center">
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden><path d="M4 11l8-6 8 6M6 10v9h12v-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ink line-clamp-1 text-[13px] font-black">{it.propertyTitle}</span>
        {it.area && <span className="text-muted line-clamp-1 text-[11.5px]">{it.area}</span>}
        <div className="mt-0.5 flex items-center gap-2">
          {price && <span className="text-brand-strong text-[12.5px] font-black tabular-nums">{price}</span>}
          {time && <span className="text-muted text-[11px]">· {time}</span>}
        </div>
        {it.detail && <span className="text-muted line-clamp-1 text-[11px]">{it.detail}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        {it.agentPhoto
          ? <img src={it.agentPhoto} alt={it.agentName ?? "סוכן"} loading="lazy" className="h-8 w-8 rounded-full object-cover" />
          : <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-full text-[12px] font-black">{(it.agentName ?? "•").slice(0, 1)}</span>}
      </div>
    </div>
  );
}
