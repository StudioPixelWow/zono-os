"use client";

// Celebratory success popup + purple confetti, fired after create flows redirect
// with a `?created=<type>` query flag (e.g. /properties/123?created=property).
// Mounted once in the app shell so every create flow gets the same delightful
// moment. Reads the flag, plays confetti, shows a modal, then cleans the URL so
// it never re-fires on refresh.
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";

const MESSAGES: Record<string, { title: string; subtitle: string }> = {
  property: { title: "הנכס נוצר בהצלחה!", subtitle: "הנכס נוסף למערכת ומוכן לשיווק 🎉" },
  buyer: { title: "הקונה נוסף בהצלחה!", subtitle: "הקונה נשמר ומחובר למנוע ההתאמות 🎉" },
  seller: { title: "המוכר נוסף בהצלחה!", subtitle: "פרופיל המוכר נשמר במערכת 🎉" },
  deal: { title: "העסקה נוצרה בהצלחה!", subtitle: "העסקה מנוהלת עכשיו ב-ZONO 🎉" },
  default: { title: "נוצר בהצלחה!", subtitle: "הפעולה הושלמה 🎉" },
};

const CONFETTI_COLORS = ["#7c3aed", "#6d28d9", "#a78bfa", "#8b5cf6", "#c084fc", "#ddd6fe"];

interface Piece {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  w: number; h: number; color: string; life: number;
}

/** Lightweight purple confetti burst on a full-screen canvas (no dependencies). */
function fireConfetti(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = [];
  const make = (originX: number) => {
    for (let i = 0; i < 70; i++) {
      const angle = (Math.PI / 2) * (Math.random() - 0.5) - Math.PI / 2;
      const speed = 7 + Math.random() * 9;
      pieces.push({
        x: originX, y: H * 0.32,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * speed - 3,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 9 + Math.random() * 8,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 1,
      });
    }
  };
  // Two side bursts for a fuller spread.
  make(W * 0.3);
  make(W * 0.7);

  let raf = 0;
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of pieces) {
      p.vy += 0.28;          // gravity
      p.vx *= 0.99;          // drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (frame > 60) p.life -= 0.012;
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

function CelebrationInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const created = params.get("created");
  const [shown, setShown] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // When the flag appears, capture it, then immediately strip it from the URL.
  // Deferred to a microtask so we don't setState synchronously inside the effect.
  useEffect(() => {
    if (!created) return;
    queueMicrotask(() => {
      setShown(created);
      const sp = new URLSearchParams(Array.from(params.entries()));
      sp.delete("created");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  // Run confetti + auto-dismiss whenever the modal opens.
  useEffect(() => {
    if (!shown || !canvasRef.current) return;
    const stop = fireConfetti(canvasRef.current);
    const timer = setTimeout(() => setShown(null), 4200);
    return () => { stop(); clearTimeout(timer); };
  }, [shown]);

  const msg = shown ? MESSAGES[shown] ?? MESSAGES.default : null;

  return (
    <AnimatePresence>
      {shown && msg && (
        <motion.div
          key="celebrate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={() => setShown(null)}
          dir="rtl"
        >
          <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", damping: 18, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card relative z-10 flex w-full max-w-sm flex-col items-center gap-3 rounded-[28px] p-7 text-center shadow-[var(--shadow-lift)]"
          >
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 12, stiffness: 240, delay: 0.1 }}
              className="zono-gradient grid h-20 w-20 place-items-center rounded-full text-white shadow-[var(--zono-glow-shadow,0_12px_32px_rgba(109,40,217,0.28))]"
            >
              <Icon name="Check" size={40} strokeWidth={3} />
            </motion.span>
            <h2 className="text-ink text-2xl font-black">{msg.title}</h2>
            <p className="text-muted text-sm">{msg.subtitle}</p>
            <button
              onClick={() => setShown(null)}
              className="btn-zono-primary mt-2 inline-flex h-11 items-center justify-center rounded-xl px-8 text-sm"
            >
              מצוין!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Mount once in the app shell. Suspense-wrapped because it reads searchParams. */
export function CreatedCelebration() {
  return (
    <Suspense fallback={null}>
      <CelebrationInner />
    </Suspense>
  );
}
