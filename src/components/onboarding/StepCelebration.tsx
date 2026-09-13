"use client";

// ============================================================================
// ZONO — Onboarding step-completion celebration. Fires a quick confetti burst +
// a ZI-fronted milestone popup EACH TIME a step is completed and the activation
// percentage grows. Non-blocking: it auto-dismisses (~1.8s) so it never gets in
// the way of the flow, and it animates the activation bar from the previous % to
// the new % so the user *feels* the progress. No dependencies beyond framer-motion
// (already used by CreatedCelebration) — confetti is a self-contained canvas burst.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

const CONFETTI_COLORS = ["#7c3aed", "#6d28d9", "#a78bfa", "#8b5cf6", "#c084fc", "#ddd6fe", "#22d3ee"];

interface Piece {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  w: number; h: number; color: string; life: number;
}

/** Compact purple/cyan confetti burst on a full-screen canvas (no dependencies). */
function fireConfetti(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = [];
  const count = reduce ? 24 : 54;
  const make = (originX: number) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / 2) * (Math.random() - 0.5) - Math.PI / 2;
      const speed = 6 + Math.random() * 8;
      pieces.push({
        x: originX, y: H * 0.34,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * speed - 3,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 9 + Math.random() * 8,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 1,
      });
    }
  };
  make(W * 0.32);
  make(W * 0.68);

  let raf = 0;
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of pieces) {
      p.vy += 0.28;   // gravity
      p.vx *= 0.99;   // drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (frame > 44) p.life -= 0.016;
      if (p.life > 0 && p.y < H + 40) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    if (alive) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// Rotating motivational lines — each completed step nudges toward "strongest in ZONO".
const LINES = [
  "עוד צעד בדרך להיות הכי חזק בזונו שלך! 💪",
  "מעולה! ההפעלה שלך מתחזקת 🚀",
  "כל הכבוד — עוד שלב הושלם ✨",
  "אתה בונה זירה חזקה. ממשיכים! ⚡",
  "יופי! ZI כבר מסדר לך את הזירה 🎯",
  "עוד קצת ואתה בפנים עם הכל ממופה 🔥",
];

export interface StepCelebrationHandle {
  trigger: number;   // increments on each completed step (0 = nothing yet)
  fromPct: number;   // activation % before this step
  toPct: number;     // activation % after this step
  label?: string;    // e.g. "שלב 2 מתוך 7"
}

/**
 * Renders nothing until `trigger` increments. Each increment fires confetti and a
 * milestone card, animating the activation bar from fromPct → toPct, then auto-hides.
 */
export function StepCelebration({ trigger, fromPct, toPct, label }: StepCelebrationHandle) {
  const [show, setShow] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firstRun = useRef(true);
  const line = useMemo(() => LINES[Math.max(0, trigger - 1) % LINES.length], [trigger]);

  // Fire on every trigger change except the initial mount (trigger starts at 0).
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (trigger <= 0) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 1850);
    return () => clearTimeout(timer);
  }, [trigger]);

  useEffect(() => {
    if (!show || !canvasRef.current) return;
    const stop = fireConfetti(canvasRef.current);
    return () => stop();
  }, [show]);

  const reached = toPct >= 100;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="step-celebrate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed inset-0 z-[95] grid place-items-center p-4"
          dir="rtl"
          aria-live="polite"
        >
          <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", damping: 17, stiffness: 280 }}
            className="relative z-10 flex w-full max-w-[300px] flex-col items-center gap-2.5 rounded-[26px] border border-white/10 bg-[linear-gradient(150deg,#1b1338_0%,#2a1a5e_55%,#4c1d95_100%)] p-6 text-center shadow-[0_28px_70px_-24px_rgba(76,29,149,0.75)]"
          >
            <motion.div
              initial={{ scale: 0, rotate: -18 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 11, stiffness: 240, delay: 0.06 }}
              className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white/10 ring-1 ring-white/15"
            >
              <Image
                src={reached ? "/characters/zi/zi-success.png" : "/characters/zi/zi-celebrate.png"}
                alt="ZI חוגג"
                width={64}
                height={64}
                className="h-16 w-16 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
                priority
              />
            </motion.div>

            <h3 className="text-lg font-black text-white">
              {reached ? "הזון שלך מוכן! 🎉" : "כל הכבוד!"}
            </h3>
            <p className="text-[13px] leading-snug text-violet-100/90">{line}</p>

            {/* Activation bar animating from the previous % to the new % */}
            <div className="mt-1 w-full">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
                <span className="text-violet-200/80">{label ?? "ההפעלה שלך"}</span>
                <motion.span
                  className="tabular-nums text-white"
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                >
                  <AnimatedPercent from={fromPct} to={toPct} />
                </motion.span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/12">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#a855f7,#22d3ee)]"
                  initial={{ width: `${Math.max(0, Math.min(100, fromPct))}%` }}
                  animate={{ width: `${Math.max(0, Math.min(100, toPct))}%` }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.12 }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Counts the displayed percentage up from `from` to `to` over ~0.7s. */
function AnimatedPercent({ from, to }: { from: number; to: number }) {
  const [v, setV] = useState(Math.round(from));
  useEffect(() => {
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <>{v}%</>;
}
