"use client";
// ============================================================================
// ZONO — Login Experience 2.0 ("Luxury Technology Edition").
// A calm, premium, almost-monochrome black-purple sign-in that feels like
// entering the operating system of the Israeli real-estate industry. Real
// glassmorphism, near-invisible ambient light + orbital arcs, an elegant
// type hierarchy, refined inputs, an expensive primary button, two quiet
// signature chips, and the ZI assistant resting beside the card inside a soft
// ambient circle. Framer-Motion orchestrated reveal + micro-interactions, RTL
// Hebrew, accessible, honors prefers-reduced-motion. Wired to the REAL `signIn`
// server action. The ZONO logo + brand purple are used exactly as provided.
// ============================================================================
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, MessageCircle, Home, TrendingDown, Building2, UserPlus, Star, Activity } from "lucide-react";
import { signIn, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

// The ZI mascot is hosted by the brand site; if hotlinking is blocked it falls
// back to a local /zono-robot.png (drop the PNG in /public to self-host).
const ROBOT_REMOTE = "https://s-pixel.co.il/wp-content/uploads/2026/06/41a88c3f-7369-4e03-9571-65dbe5c7a470-1.png";
const ROBOT_LOCAL = "/zono-robot.png";

const EASE = [0.22, 1, 0.36, 1] as const;

export function LoginExperience() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  const [showPw, setShowPw] = useState(false);
  const reduce = useReducedMotion();

  // Near-invisible drifting particles — generated once, stable across renders.
  const particles = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({
      left: Math.round((i * 41 + 9) % 100),
      delay: (i * 1.3) % 11,
      dur: 15 + (i % 6) * 2,
      size: 1.5 + (i % 3) * 0.6,
    })),
    [],
  );

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.1, delayChildren: reduce ? 0 : 0.12 } },
  };
  const rise: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
  };

  return (
    <div dir="rtl" className="zauth">
      {/* Ambient breathing light — huge, soft, almost invisible */}
      <div className="zauth-aura a1" />
      <div className="zauth-aura a2" />

      {/* Very subtle orbital arcs */}
      <OrbitArcs />

      {/* Near-invisible particles */}
      <div className="zauth-particles" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className="zauth-dot"
            style={{
              left: `${p.left}%`,
              bottom: "-12px",
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Live signals — keep popping in across BOTH sides at random, refreshing */}
      <PopupSwarm reduce={!!reduce} />

      {/* ZI assistant — anchored to the right edge, never touching the form */}
      <Robot reduce={!!reduce} />

      {/* Foreground: the login card is the hero */}
      <main className="zauth-shell">
        <motion.div className="zauth-stage" variants={container} initial="hidden" animate="show">
          {/* Logo + headline */}
          <motion.header className="zauth-head" variants={rise}>
            <span className="zauth-logo-wrap">
              <ZonoLogo priority width={236} height={76} />
            </span>
            <h1 className="zauth-title">הבינה שתהפוך אותך לסוכן הכי חזק בזון שלך.</h1>
            <p className="zauth-sub">נהל נכסים, לקוחות, עסקאות ובינה עסקית — במקום אחד.</p>
          </motion.header>

          {/* Glass login card */}
          <motion.form action={action} className="zauth-card zauth-glass" variants={rise}>
            <h2 className="zauth-card-title">התחברות</h2>
            <p className="zauth-card-sub">ברוך/ה הבא/ה למרכז השליטה</p>

            {state.error && (
              <p className="zauth-err" role="alert">{state.error}</p>
            )}

            <div className="zauth-field">
              <label htmlFor="zauth-email" className="zauth-label">אימייל</label>
              <div className="zauth-input-wrap">
                <Mail className="zauth-input-ico" size={18} aria-hidden="true" />
                <input
                  id="zauth-email" name="email" type="email" required dir="ltr" autoComplete="email"
                  placeholder="you@agency.co.il" className="zauth-input"
                />
              </div>
            </div>

            <div className="zauth-field">
              <label htmlFor="zauth-password" className="zauth-label">סיסמה</label>
              <div className="zauth-input-wrap">
                <Lock className="zauth-input-ico" size={18} aria-hidden="true" />
                <input
                  id="zauth-password" name="password" type={showPw ? "text" : "password"} required dir="ltr"
                  autoComplete="current-password" placeholder="••••••••" className="zauth-input has-trail"
                />
                <button
                  type="button" className="zauth-eye"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={pending} className="zauth-btn">
              <span>{pending ? "מתחבר…" : "התחברות"}</span>
              {!pending && <ArrowLeft size={18} className="zauth-btn-arrow" aria-hidden="true" />}
            </button>

            <p className="zauth-alt">
              אין לך חשבון?{" "}
              <Link href="/signup" className="zauth-link">הרשמה</Link>
            </p>
          </motion.form>

          <motion.p className="zauth-foot" variants={rise}>
            ZONO · Real Estate Operating System
          </motion.p>
        </motion.div>
      </main>
    </div>
  );
}

// Pool of live "signals" that the floating chips cycle through — each one reads
// like a real moment inside the operating system.
const POPUPS = [
  { Icon: MessageCircle, title: "3 שיחות WhatsApp חדשות", sub: "ממתינות למענה", tone: "g" },
  { Icon: Home, title: "נמצאה התאמת נכס", sub: "94% התאמה", tone: "v" },
  { Icon: TrendingDown, title: "ירידת מחיר באזור שלך", sub: "‎-6% בשבוע האחרון", tone: "v" },
  { Icon: Building2, title: "עסקה חדשה נרשמה", sub: "רמת השרון · ₪2.4M", tone: "v" },
  { Icon: UserPlus, title: "ליד חדש מהאתר", sub: "מחפש/ת 4 חדרים", tone: "g" },
  { Icon: Star, title: "נכס בלעדי זוהה", sub: "פוטנציאל גבוה", tone: "v" },
  { Icon: Activity, title: "השוק התחמם באזור", sub: "ביקוש עולה", tone: "v" },
] as const;

// Anchor spots for the popups — spread across BOTH physical sides (corners), so
// signals pop in left AND right. Right-side spots sit in the top/bottom corners
// to stay clear of the ZI robot (which hugs the right edge at mid-height) and
// the centered card. `enterX` makes each chip slide in from its own edge.
// In RTL: insetInlineEnd = physical LEFT, insetInlineStart = physical RIGHT.
interface Spot { style: CSSProperties; enterX: number }
const POPUP_SPOTS: Spot[] = [
  { style: { top: "8%", insetInlineEnd: "7%" }, enterX: -26 },   // left · top
  { style: { top: "40%", insetInlineEnd: "4%" }, enterX: -26 },  // left · mid
  { style: { bottom: "11%", insetInlineEnd: "6%" }, enterX: -26 }, // left · bottom
  { style: { top: "9%", insetInlineStart: "6%" }, enterX: 26 },  // right · top corner
  { style: { bottom: "13%", insetInlineStart: "7%" }, enterX: 26 }, // right · bottom corner
];
interface ActivePopup { id: number; spotIdx: number; popup: (typeof POPUPS)[number] }

/** A living swarm of live-signal popups that keep popping in, refreshing and
 *  leaving — so the screen feels alive (instead of two static chips). Spots are
 *  picked at random across both sides; an occupancy set prevents overlaps. */
function PopupSwarm({ reduce }: { reduce: boolean }) {
  // Reduced motion: two static signals — one per side (set via the initializer).
  const [active, setActive] = useState<ActivePopup[]>(() =>
    reduce
      ? [{ id: 1, spotIdx: 0, popup: POPUPS[0] }, { id: 2, spotIdx: 3, popup: POPUPS[1] }]
      : [],
  );
  useEffect(() => {
    if (reduce) return;
    let id = 0, popupIdx = 0;
    const occupied = new Set<number>(); // spot indices currently shown
    const lifeTimers: ReturnType<typeof setTimeout>[] = [];
    const spawn = () => {
      const free = POPUP_SPOTS.map((_, i) => i).filter((i) => !occupied.has(i));
      if (!free.length) return;
      const spotIdx = free[Math.floor(Math.random() * free.length)]; // random side + slot
      const myId = ++id;
      const popup = POPUPS[popupIdx % POPUPS.length];
      popupIdx = (popupIdx + 3) % POPUPS.length;
      occupied.add(spotIdx);
      setActive((prev) => [...prev, { id: myId, spotIdx, popup }]);
      lifeTimers.push(setTimeout(() => {
        occupied.delete(spotIdx);
        setActive((prev) => prev.filter((a) => a.id !== myId));
      }, 4400));
    };
    // First spawns scheduled (not synchronous) so we never setState during the effect body.
    const kick0 = setTimeout(spawn, 250);
    const kick1 = setTimeout(spawn, 1000);
    const loop = setInterval(spawn, 1700);
    return () => { clearInterval(loop); clearTimeout(kick0); clearTimeout(kick1); lifeTimers.forEach(clearTimeout); };
  }, [reduce]);

  return (
    <AnimatePresence>
      {active.map((a) => {
        const Icon = a.popup.Icon;
        const spot = POPUP_SPOTS[a.spotIdx];
        return (
          <motion.div
            key={a.id} className="zauth-chip zauth-glass" style={spot.style} aria-hidden="true"
            initial={reduce ? false : { opacity: 0, x: spot.enterX, scale: 0.88 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: spot.enterX * 0.6, scale: 0.95 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="zauth-chip-inner">
              <span className="zauth-chip-ico"><Icon size={16} /></span>
              <span className="zauth-chip-body">
                <span className="zauth-chip-title">{a.popup.title}</span>
                <span className="zauth-chip-sub">{a.popup.sub}</span>
              </span>
              <span className={`zauth-chip-live ${a.popup.tone === "v" ? "v" : ""}`} />
            </span>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

/** ZI robot mascot inside a soft ambient circle, beside the card. Tries the
 *  brand-hosted image (no-referrer to dodge hotlink protection), falls back to a
 *  local self-hosted copy, then hides gracefully. Pointer-events off so it never
 *  blocks the form. */
function Robot({ reduce }: { reduce: boolean }) {
  const [src, setSrc] = useState(ROBOT_REMOTE);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <motion.div
      className="zauth-robot-wrap"
      aria-hidden="true"
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: reduce ? 0 : 1.35, duration: 0.8, ease: EASE }}
    >
      <span className="zauth-robot-halo" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="zauth-robot"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => { if (src !== ROBOT_LOCAL) setSrc(ROBOT_LOCAL); else setHidden(true); }}
      />
      <span className="zauth-bubble zauth-glass">
        <span className="zauth-bubble-t">שלום! אני ZI</span>
        <span className="zauth-bubble-s">איך אפשר לעזור?</span>
      </span>
    </motion.div>
  );
}

/** Extremely faint orbital arcs that drift very slowly — depth without noise. */
function OrbitArcs() {
  return (
    <svg className="zauth-orbits" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="zauth-node">
          <stop offset="0" stopColor="#c4b5fd" stopOpacity="0.7" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="zauth-orbit-spin" style={{ transformOrigin: "720px 450px" }}>
        <ellipse cx="720" cy="450" rx="600" ry="320" fill="none" stroke="rgba(167,139,250,0.10)" strokeWidth="1" />
        <ellipse cx="720" cy="450" rx="440" ry="520" fill="none" stroke="rgba(167,139,250,0.07)" strokeWidth="1" transform="rotate(26 720 450)" />
        <ellipse cx="720" cy="450" rx="760" ry="430" fill="none" stroke="rgba(167,139,250,0.05)" strokeWidth="1" transform="rotate(-18 720 450)" />
        <circle cx="120" cy="450" r="2.6" fill="url(#zauth-node)" />
        <circle cx="1320" cy="450" r="2.6" fill="url(#zauth-node)" />
        <circle cx="720" cy="130" r="2.2" fill="url(#zauth-node)" />
      </g>
    </svg>
  );
}
