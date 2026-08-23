"use client";
// Premium property gallery (spec §9/§38) — editorial grid + full-screen lightbox.
// Property photography leads; brand is accents only. Lazy images; keyboard nav.
import { useEffect, useState, useCallback, useRef } from "react";

export function PropertyGallery({ images, title }: { images: string[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const n = images.length;
  // Touch-swipe tracking for the mobile lightbox (no external carousel dep).
  const touchX = useRef<number | null>(null);

  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); if (e.key === "ArrowLeft") go(1); if (e.key === "ArrowRight") go(-1); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, go]);

  if (n === 0) return null;
  const openAt = (idx: number) => { setI(idx); setOpen(true); };
  // Horizontal swipe → prev/next (RTL-consistent with ArrowLeft=next). A short
  // vertical/tiny drag is ignored so taps and scroll intent aren't hijacked.
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.changedTouches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || n < 2) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 45) return;
    go(dx < 0 ? 1 : -1);
  };
  const adj = (d: number) => images[(i + d + n) % n];

  return (
    <>
      {/* Editorial grid: 1 large + up to 4 secondary */}
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-2xl sm:grid-cols-4 sm:grid-rows-2">
          <button type="button" onClick={() => openAt(0)} className="relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden bg-[var(--brand-surface)] sm:aspect-auto">
            <img src={images[0]} alt={title} className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
          </button>
          {images.slice(1, 5).map((src, k) => (
            <button type="button" key={k} onClick={() => openAt(k + 1)} className="relative aspect-[4/3] overflow-hidden bg-[var(--brand-surface)]">
              <img src={src} alt={`${title} ${k + 2}`} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
              {k === 3 && n > 5 && (
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-[15px] font-black text-white">+{n - 5} תמונות</span>
              )}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => openAt(0)} className="mt-3 text-[14px] font-bold text-[color:var(--brand-link)]">כל התמונות ({n}) ←</button>
      </div>

      {/* Lightbox */}
      {open && (
        <div className="fixed inset-0 z-[60] flex touch-pan-y items-center justify-center overflow-hidden bg-black/92" role="dialog" aria-modal="true" onClick={() => setOpen(false)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button type="button" aria-label="סגירה" className="absolute end-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl text-white" onClick={() => setOpen(false)}>✕</button>
          <span className="absolute start-1/2 top-5 -translate-x-1/2 text-[13px] font-semibold text-white/80">{i + 1} / {n}</span>
          {n > 1 && <button type="button" aria-label="הבא" className="absolute end-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-2xl text-white" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>}
          <img src={images[i]} alt={`${title} ${i + 1}`} className="max-h-[86vh] max-w-[92vw] select-none object-contain" draggable={false} onClick={(e) => e.stopPropagation()} />
          {n > 1 && <button type="button" aria-label="הקודם" className="absolute start-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-2xl text-white" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>}
          {/* Preload the adjacent frames so a swipe doesn't flash blank on mobile. */}
          {n > 1 && <div className="hidden"><img src={adj(1)} alt="" aria-hidden /><img src={adj(-1)} alt="" aria-hidden /></div>}
        </div>
      )}
    </>
  );
}
