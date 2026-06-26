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
import { useActionState, useMemo, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, MessageCircle, Home } from "lucide-react";
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

      {/* Signature chips — quiet, floating glass */}
      <motion.div
        className="zauth-chip zauth-glass zauth-float-a"
        style={{ top: "9%", insetInlineEnd: "8%" }}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 1.05, duration: 0.6, ease: EASE }}
      >
        <span className="zauth-chip-ico"><MessageCircle size={16} /></span>
        <span className="zauth-chip-body">
          <span className="zauth-chip-title">3 שיחות WhatsApp חדשות</span>
          <span className="zauth-chip-sub">ממתינות למענה</span>
        </span>
        <span className="zauth-chip-live" aria-hidden="true" />
      </motion.div>

      <motion.div
        className="zauth-chip zauth-glass zauth-float-b"
        style={{ bottom: "12%", insetInlineEnd: "6.5%" }}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 1.22, duration: 0.6, ease: EASE }}
      >
        <span className="zauth-chip-ico"><Home size={16} /></span>
        <span className="zauth-chip-body">
          <span className="zauth-chip-title">נמצאה התאמת נכס</span>
          <span className="zauth-chip-sub">94% התאמה</span>
        </span>
        <span className="zauth-chip-live v" aria-hidden="true" />
      </motion.div>

      {/* ZI assistant — secondary, beside the card inside a soft ambient circle */}
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
