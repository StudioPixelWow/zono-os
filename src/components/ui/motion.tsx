"use client";
// ============================================================================
// ZONO — Motion system (global UX polish · phase 2). Selective, premium, and
// PERFORMANCE-FIRST. Built on framer-motion (already a dependency → ~0 new
// bundle) + CSS/SVG. Every primitive here:
//   • respects prefers-reduced-motion (renders the settled state, no animation),
//   • settles (no continuous looping celebration — §14),
//   • is used only where motion adds MEANING (§10) — never on sidebar/KPI/every
//     button.
// A lazy Lottie wrapper is provided for FUTURE brand assets: it dynamically
// imports the player only when an asset is passed, pauses off-screen, and falls
// back to a static poster — so ZERO heavy JSON ships today (§11C/§12).
// ============================================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

// ── Reveal on mount (staggerable) — for editorial rows / lists (§4) ──────────
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const STAGGER: Variants = { show: { transition: { staggerChildren: 0.05 } } };
const STAGGER_ITEM: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } } };

export function StaggerGrid({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={STAGGER} initial="hidden" animate="show">{children}</motion.div>;
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={STAGGER_ITEM}>{children}</motion.div>;
}

// ── SuccessBurst (§14) — a 600–1200ms celebration that SETTLES, no loop ──────
export function SuccessBurst({ label, icon = "BadgeCheck", className }: { label?: string; icon?: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)} role="status" aria-live="polite">
      <motion.span
        className="bg-success-soft text-success grid place-items-center rounded-full p-4"
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18, duration: 0.7 }}
      >
        <Icon name={icon} size={34} strokeWidth={2.3} />
      </motion.span>
      {label && <span className="text-ink text-sm font-black">{label}</span>}
    </div>
  );
}

// ── ConnectionPulse (§19 matching) — buyer ↔ property, subtle, settles ───────
export function ConnectionPulse({ active = true, className }: { active?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden>
      <span className="bg-info-soft text-info grid place-items-center rounded-xl p-2"><Icon name="UserRound" size={18} /></span>
      <span className="relative h-0.5 w-12 overflow-hidden rounded-full bg-[var(--brand-soft,#efeaff)]">
        {!reduce && active && (
          <motion.span
            className="absolute inset-y-0 w-1/3 rounded-full bg-[var(--brand,#6d28d9)]"
            initial={{ x: "-120%" }} animate={{ x: "360%" }}
            transition={{ duration: 1.1, repeat: 2, ease: "easeInOut" }}
          />
        )}
      </span>
      <span className="bg-brand-soft text-[var(--brand-strong,#6d28d9)] grid place-items-center rounded-xl p-2"><Icon name="Building2" size={18} /></span>
    </div>
  );
}

// ── ProcessStages (§15) — real, contextual loading (NO fake percentage) ──────
export function ProcessStages({ title, stages, active = 0, className }: { title: string; stages: string[]; active?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("border-line bg-card flex flex-col gap-3 rounded-2xl border p-5 text-right shadow-[var(--shadow-card)]", className)} dir="rtl" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="bg-brand-soft relative grid place-items-center rounded-xl p-2">
          {!reduce && <motion.span className="absolute inset-0 rounded-xl ring-2 ring-[var(--brand,#6d28d9)]/40" animate={{ opacity: [0.2, 0.7, 0.2] }} transition={{ duration: 1.4, repeat: Infinity }} />}
          <Icon name="Loader" size={18} className="text-[var(--brand-strong,#6d28d9)]" />
        </span>
        <span className="text-ink text-sm font-black">{title}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {stages.map((s, i) => {
          const done = i < active, current = i === active;
          return (
            <li key={i} className={cn("flex items-center gap-2 text-[13px]", done ? "text-success" : current ? "text-ink font-bold" : "text-muted")}>
              <Icon name={done ? "Check" : current ? "Circle" : "Circle"} size={13} strokeWidth={done ? 2.4 : 2} />
              {s}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── LottieLazy (§11C/§12) — FUTURE brand-asset player, degrades to a poster ──
// Ships no JSON and references NO player package today (so `next build` can
// never fail on a missing dep). The player + asset are INJECTED by the caller
// once a vetted brand asset exists: `loadPlayer` returns the component, and
// `getAnimationData` returns the JSON. We load both only on view, pause
// off-screen, and honor reduced-motion. Absent injection → static poster, 0 KB.
export type LottiePlayerComponent = (p: { animationData: unknown; loop?: boolean; className?: string }) => ReactNode;

export function LottieLazy({
  loadPlayer, getAnimationData, poster, className, ariaLabel,
}: {
  loadPlayer?: () => Promise<LottiePlayerComponent>;
  getAnimationData?: () => Promise<unknown>;
  poster: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [Player, setPlayer] = useState<LottiePlayerComponent | null>(null);

  const active = Boolean(loadPlayer && getAnimationData) && !reduce;

  useEffect(() => {
    if (!ref.current || !active) return;
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [active]);

  useEffect(() => {
    if (!inView || !active || data) return;
    let alive = true;
    (async () => {
      try {
        const [player, animation] = await Promise.all([loadPlayer!(), getAnimationData!()]);
        if (!alive) return;
        setPlayer(() => player);
        setData(animation);
      } catch { /* keep poster */ }
    })();
    return () => { alive = false; };
  }, [inView, active, data, loadPlayer, getAnimationData]);

  return (
    <div ref={ref} className={className} aria-label={ariaLabel} role={ariaLabel ? "img" : undefined}>
      {Player && data ? <Player animationData={data} loop={false} /> : poster}
    </div>
  );
}
