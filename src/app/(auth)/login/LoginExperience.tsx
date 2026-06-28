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
import { useActionState, useMemo, useState, type CSSProperties } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, MessageCircle, Building2, Activity } from "lucide-react";
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
      {/* ── Decorative layer — ALL background/robot/widgets live here. It is
            absolute + pointer-events:none and sits BELOW the form, so nothing
            here can shift the form away from the true viewport centre. ── */}
      <div className="zauth-decor" aria-hidden="true">
        {/* Ambient breathing light — huge, soft, almost invisible */}
        <div className="zauth-aura a1" />
        <div className="zauth-aura a2" />

        {/* Very subtle orbital arcs */}
        <OrbitArcs />

        {/* Minimal, almost-invisible futuristic skyline on the far side */}
        <Skyline />

        {/* Near-invisible particles */}
        <div className="zauth-particles">
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

        {/* Live signal widgets — decorative only */}
        <PopupSwarm reduce={!!reduce} />

        {/* ZI assistant — decorative only, never affects the form centring */}
        <Robot reduce={!!reduce} />
      </div>

      {/* Foreground: the login column, perfectly centred in the viewport */}
      <main className="zauth-shell">
        <motion.div className="zauth-stage" variants={container} initial="hidden" animate="show">
          {/* Logo + headline */}
          <motion.header className="zauth-head" variants={rise}>
            <span className="zauth-logo-wrap">
              <ZonoLogo priority width={283} height={91} />
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

// Exactly THREE quiet floating widgets — each reads like a real moment inside
// the operating system. Calm, glassy, never flashy (premium light edition).
const POPUPS = [
  { Icon: MessageCircle, title: "3 שיחות WhatsApp חדשות", sub: "ממתינות למענה", tone: "g" },
  { Icon: Building2, title: "עסקה חדשה נרשמה", sub: "דירת 4 חדרים · ₪2.4M", tone: "v" },
  { Icon: Activity, title: "השוק התחמם באזור", sub: "ביקוש עולה", tone: "v" },
] as const;

// Three fixed corners. In RTL: insetInlineStart = physical RIGHT, insetInlineEnd
// = physical LEFT. Right-side spots sit in the corners, clear of the robot/card.
interface Spot { style: CSSProperties; enterX: number }
const POPUP_SPOTS: Spot[] = [
  { style: { top: "9%", insetInlineStart: "6%" }, enterX: 26 },    // physical right · top
  { style: { bottom: "13%", insetInlineStart: "7%" }, enterX: 26 }, // physical right · bottom
  { style: { bottom: "12%", insetInlineEnd: "7%" }, enterX: -26 },  // physical left · bottom
];

/** Three calm glass widgets that fade in one after another. Static (no cycling)
 *  so the premium light composition stays quiet and uncluttered. */
function PopupSwarm({ reduce }: { reduce: boolean }) {
  return (
    <>
      {POPUPS.map((popup, i) => {
        const Icon = popup.Icon;
        const spot = POPUP_SPOTS[i];
        return (
          <motion.div
            key={i} className={`zauth-chip zauth-glass ${i % 2 ? "zauth-float-b" : "zauth-float-a"}`} style={spot.style} aria-hidden="true"
            initial={reduce ? false : { opacity: 0, x: spot.enterX, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: reduce ? 0 : 1.4 + i * 0.45, duration: 0.6, ease: EASE }}
          >
            <span className="zauth-chip-inner">
              <span className="zauth-chip-ico"><Icon size={16} /></span>
              <span className="zauth-chip-body">
                <span className="zauth-chip-title">{popup.title}</span>
                <span className="zauth-chip-sub">{popup.sub}</span>
              </span>
              <span className={`zauth-chip-live ${popup.tone === "v" ? "v" : ""}`} />
            </span>
          </motion.div>
        );
      })}
    </>
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
      {/* Concentric orbital rings behind the robot — faint, premium. */}
      <svg className="zauth-robot-rings" viewBox="0 0 400 400" aria-hidden="true">
        {[80, 130, 180].map((r, i) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="rgba(139,92,246,0.16)" strokeWidth="1" strokeDasharray={i === 1 ? "3 7" : undefined} />
        ))}
        <circle cx="200" cy="20" r="3" fill="#8b5cf6" opacity="0.5" />
        <circle cx="372" cy="230" r="2.4" fill="#8b5cf6" opacity="0.4" />
        <circle cx="40" cy="250" r="2.2" fill="#8b5cf6" opacity="0.35" />
      </svg>
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

/** Minimal, almost-invisible futuristic skyline on the far (physical-left) side —
 *  only noticeable on a careful look. Hidden on small screens. */
function Skyline() {
  const towers = [
    { x: 8, w: 26, h: 150 }, { x: 38, w: 34, h: 232 }, { x: 76, w: 22, h: 120 },
    { x: 102, w: 40, h: 286 }, { x: 146, w: 28, h: 196 }, { x: 178, w: 32, h: 250 },
    { x: 214, w: 24, h: 138 }, { x: 242, w: 38, h: 210 }, { x: 284, w: 26, h: 168 },
  ];
  return (
    <svg className="zauth-skyline" viewBox="0 0 320 320" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {towers.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={320 - t.h} width={t.w} height={t.h} rx="3" fill="rgba(124,58,237,0.05)" stroke="rgba(124,58,237,0.10)" strokeWidth="1" />
          {Array.from({ length: Math.floor(t.h / 26) }).map((_, r) => (
            <rect key={r} x={t.x + 5} y={320 - t.h + 12 + r * 24} width={t.w - 10} height="3" rx="1" fill="rgba(124,58,237,0.07)" />
          ))}
        </g>
      ))}
    </svg>
  );
}
