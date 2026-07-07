"use client";
// ============================================================================
// 🌱 ZONO — Home V3 "life" primitives (PHASE 61.3). PURE PRESENTATION.
// No business logic, no data fetching, no engines. These components only add
// subtle motion over data that is ALREADY fetched, to make the broker feel that
// ZONO was working before he arrived. All are reduced-motion / mobile safe
// (the CSS in globals.css neutralizes animation under those conditions).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const prefersReduced = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

/** CountUp — animates a number from 0 → value once, on mount. Presentational. */
export function CountUp({ value, className, format, durationMs = 1000, prefix = "", suffix = "" }: {
  value: number; className?: string; format?: (n: number) => string; durationMs?: number; prefix?: string; suffix?: string;
}) {
  // Initialize to the final value when we won't animate (reduced-motion / non-
  // positive) — this keeps the effect free of any synchronous setState.
  const [display, setDisplay] = useState(() => (prefersReduced() || value <= 0 ? value : 0));
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReduced() || value <= 0) return; // nothing to animate
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(value * eased)); // async (inside rAF) — lint-safe
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, durationMs]);
  const text = format ? format(display) : display.toLocaleString("he-IL");
  return <span className={className}>{prefix}{text}{suffix}</span>;
}

/** LiveOrb — a breathing "heart of ZONO". Glow speed scales with health score
 *  (higher score → calmer, more confident breathing). Never a spinner. */
export function LiveOrb({ score, size = 128, label = "ציון היום", className }: {
  score: number | null; size?: number; label?: string; className?: string;
}) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  // Healthier business → slower, calmer breath (3.4s) · lower → quicker (5.2s).
  const speed = (5.2 - (s / 100) * 1.8).toFixed(2);
  return (
    <div className={cn("zono-orb-live zono-gradient grid shrink-0 place-items-center rounded-full text-white", className)}
      style={{ width: size, height: size, ["--orb-speed" as string]: `${speed}s` }}>
      <div className="text-center leading-none">
        <div className="text-4xl font-black">{score ?? "—"}</div>
        <div className="mt-1 text-[10px] font-bold opacity-90">{label}</div>
      </div>
    </div>
  );
}

/** HeroParticles — a few floating micro-dots for depth. Decorative; hidden on
 *  mobile + reduced-motion via CSS. Fixed positions (no randomness on render). */
const PARTICLES = [
  { top: "18%", left: "12%", size: 6, delay: "0s" },
  { top: "62%", left: "22%", size: 4, delay: "1.4s" },
  { top: "30%", left: "78%", size: 5, delay: "0.6s" },
  { top: "72%", left: "68%", size: 7, delay: "2.1s" },
  { top: "44%", left: "48%", size: 3, delay: "1.0s" },
  { top: "12%", left: "60%", size: 4, delay: "2.6s" },
];
export function HeroParticles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLES.map((p, i) => (
        <span key={i} className="zono-particle" style={{ top: p.top, left: p.left, width: p.size, height: p.size, animationDelay: p.delay }} />
      ))}
    </div>
  );
}

/** RotatingFeed — cycles through ALREADY-fetched items to feel alive, showing a
 *  window of them and advancing on an interval. No polling, no new data. */
export function RotatingFeed<T>({ items, render, intervalMs = 4200, windowSize = 4 }: {
  items: T[]; render: (item: T, i: number) => React.ReactNode; intervalMs?: number; windowSize?: number;
}) {
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prefersReduced() || items.length <= windowSize) return;
    const id = setInterval(() => { setOffset((o) => (o + 1) % items.length); setTick((n) => n + 1); }, intervalMs);
    return () => clearInterval(id);
  }, [items.length, intervalMs, windowSize]);
  const view = items.length <= windowSize
    ? items
    : Array.from({ length: windowSize }, (_, k) => items[(offset + k) % items.length]);
  return (
    <div key={tick} className="space-y-2">
      {view.map((it, i) => (
        <div key={i} className="zono-feed-rise" style={{ animationDelay: `${i * 60}ms` }}>{render(it, i)}</div>
      ))}
    </div>
  );
}
