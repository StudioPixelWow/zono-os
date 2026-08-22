"use client";
// ============================================================================
// ZONO — Login Experience 3.0 ("Premium Gateway Edition").
// An asymmetric, single-screen sign-in: the login form sits center-left, a LARGE
// ZI character (zi-login-access) stands on the physical-right welcoming the user
// in, both sharing ONE calm white-lavender background. Fits 100vh without scroll
// on standard desktops (clamp-sized), stacks cleanly on mobile. Wired to the REAL
// `signIn` server action — NO auth/session/redirect logic changed. RTL Hebrew,
// accessible, honors prefers-reduced-motion. The ZI image is decorative; every
// message it "says" is real HTML text. Capability chips sit AROUND ZI, never over it.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, MessageCircle, Building2 } from "lucide-react";
import { signIn, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

const EASE = [0.22, 1, 0.36, 1] as const;

// Demo capability chips shown around ZI — a FIXED illustration of the OS, never
// randomised or cycled. Single source of truth.
const LOGIN_CHIPS = [
  { Icon: MessageCircle, title: "3 שיחות WhatsApp חדשות", sub: "ממתינות למענה", tone: "g" as const, pos: "top" as const },
  { Icon: Building2, title: "עסקה חדשה נרשמה", sub: "דירת 4 חדרים · ₪2.4M", tone: "v" as const, pos: "bottom" as const },
];

export function LoginExperience() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  const [showPw, setShowPw] = useState(false);
  const reduce = useReducedMotion();

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
    show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: reduce ? 0 : 0.1 } },
  };
  const rise: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  };

  return (
    <div dir="rtl" className="zauth">
      {/* Decorative background — shared across both zones; below the form. */}
      <div className="zauth-decor" aria-hidden="true">
        <div className="zauth-aura a1" />
        <div className="zauth-aura a2" />
        <RealEstateAmbient />
        <OrbitArcs />
        <Skyline />
        <div className="zauth-particles">
          {particles.map((p, i) => (
            <span key={i} className="zauth-dot" style={{ left: `${p.left}%`, bottom: "-12px", width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
          ))}
        </div>
      </div>

      {/* Foreground: asymmetric 2-zone gateway. */}
      <main className="zauth-shell">
        <motion.div className="zlogin-grid" variants={container} initial="hidden" animate="show">

          {/* Form zone (center-left in RTL). */}
          <section className="zlogin-form-col">
            <motion.header className="zlogin-head" variants={rise}>
              <span className="zauth-logo-wrap"><ZonoLogo priority width={166} height={53} /></span>
              <h1 className="zlogin-title">ברוכים הבאים לזון שלכם</h1>
              <p className="zlogin-lede">כל הנכסים, הלקוחות, העסקאות והפעולות שלכם — במקום אחד חכם.</p>
            </motion.header>

            <motion.form action={action} className="zauth-card zauth-glass zlogin-card" variants={rise}>
              <h2 className="zauth-card-title">התחברות</h2>
              <p className="zauth-card-sub">הזינו את הפרטים והמשיכו למרכז השליטה שלכם</p>

              <div aria-live="polite">
                {state.error && <p className="zauth-err" role="alert">{state.error}</p>}
              </div>

              <div className="zauth-field">
                <label htmlFor="zauth-email" className="zauth-label">אימייל</label>
                <div className="zauth-input-wrap">
                  <Mail className="zauth-input-ico" size={18} aria-hidden="true" />
                  <input id="zauth-email" name="email" type="email" required dir="ltr" autoComplete="email" placeholder="you@agency.co.il" className="zauth-input" />
                </div>
              </div>

              <div className="zauth-field">
                <label htmlFor="zauth-password" className="zauth-label">סיסמה</label>
                <div className="zauth-input-wrap">
                  <Lock className="zauth-input-ico" size={18} aria-hidden="true" />
                  <input id="zauth-password" name="password" type={showPw ? "text" : "password"} required dir="ltr" autoComplete="current-password" placeholder="••••••••" className="zauth-input has-trail" />
                  <button type="button" className="zauth-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}>
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <p className="zauth-alt" style={{ marginTop: -4, marginBottom: 4, textAlign: "start" }}>
                <Link href="/forgot-password" className="zauth-link">שכחת סיסמה?</Link>
              </p>

              <button type="submit" disabled={pending} className="zauth-btn">
                <span>{pending ? "מתחברים…" : "כניסה למערכת"}</span>
                {!pending && <ArrowLeft size={18} className="zauth-btn-arrow" aria-hidden="true" />}
              </button>

              <p className="zauth-alt">
                אין לך חשבון?{" "}
                <Link href="/signup" className="zauth-link">הרשמה</Link>
              </p>
            </motion.form>
          </section>

          {/* Brand zone (physical-right in RTL) — a large ZI welcomes the user in. */}
          <motion.aside
            className="zlogin-zi-col"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.3, duration: 0.6, ease: EASE }}
          >
            <div className="zlogin-zi-stage">
              <span className="zlogin-zi-glow" aria-hidden="true" />
              <Image
                src="/characters/zi/zi-login-access.png"
                alt=""
                aria-hidden="true"
                width={623}
                height={895}
                priority
                className="zlogin-zi-img"
                draggable={false}
              />
              <span className="zlogin-zi-floor" aria-hidden="true" />
              <span className="zlogin-zi-label">ZI כבר מחכה לכם בפנים</span>

              {LOGIN_CHIPS.map((chip) => {
                const Icon = chip.Icon;
                return (
                  <div key={chip.title} className={`zauth-chip zauth-glass zlogin-chip ${chip.pos === "top" ? "is-top" : "is-bottom"}`} aria-hidden="true">
                    <span className="zauth-chip-inner">
                      <span className="zauth-chip-ico"><Icon size={16} /></span>
                      <span className="zauth-chip-body">
                        <span className="zauth-chip-title">{chip.title}</span>
                        <span className="zauth-chip-sub">{chip.sub}</span>
                      </span>
                      <span className={`zauth-chip-live ${chip.tone === "v" ? "v" : ""}`} />
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.aside>

        </motion.div>
      </main>
    </div>
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
        <ellipse cx="720" cy="450" rx="600" ry="320" fill="none" stroke="rgba(167,139,250,0.09)" strokeWidth="1" />
        <ellipse cx="720" cy="450" rx="440" ry="520" fill="none" stroke="rgba(167,139,250,0.06)" strokeWidth="1" transform="rotate(26 720 450)" />
        <ellipse cx="720" cy="450" rx="760" ry="430" fill="none" stroke="rgba(167,139,250,0.045)" strokeWidth="1" transform="rotate(-18 720 450)" />
        <circle cx="120" cy="450" r="2.6" fill="url(#zauth-node)" />
        <circle cx="1320" cy="450" r="2.6" fill="url(#zauth-node)" />
        <circle cx="720" cy="130" r="2.2" fill="url(#zauth-node)" />
      </g>
    </svg>
  );
}

/** Minimal, almost-invisible futuristic skyline on the far (physical-left) side. */
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
          <rect x={t.x} y={320 - t.h} width={t.w} height={t.h} rx="3" fill="rgba(124,58,237,0.04)" stroke="rgba(124,58,237,0.08)" strokeWidth="1" />
          {Array.from({ length: Math.floor(t.h / 26) }).map((_, r) => (
            <rect key={r} x={t.x + 5} y={320 - t.h + 12 + r * 24} width={t.w - 10} height="3" rx="1" fill="rgba(124,58,237,0.06)" />
          ))}
        </g>
      ))}
    </svg>
  );
}

/**
 * Premium real-estate / AI / mapping ambience — pure CSS + SVG, no bitmap assets.
 * Calmer behind the form, a touch more alive behind ZI. Honors reduced-motion.
 */
function RealEstateAmbient() {
  return (
    <div className="zauth-amb">
      <div className="zauth-amb-grid" />
      <span className="zauth-amb-blob b1" />
      <span className="zauth-amb-blob b2" />
      <span className="zauth-amb-blob b3" />
      <svg className="zauth-amb-topo" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {[40, 78, 120, 166, 216, 270, 328].map((r, i) => (
          <ellipse key={r} cx="470" cy="120" rx={r * 1.35} ry={r} fill="none" stroke="rgba(124,58,237,0.06)" strokeWidth="1" transform={`rotate(${-18 + i} 470 120)`} />
        ))}
      </svg>
      <svg className="zauth-amb-map" viewBox="0 0 1440 500" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <g stroke="rgba(124,58,237,0.07)" strokeWidth="1.2" fill="none">
          <path d="M-20 360 L1460 300" />
          <path d="M-20 440 L1460 410" />
          <path d="M120 500 L260 180" />
          <path d="M460 500 L560 160" />
          <path d="M880 160 L980 500" />
          <path d="M1180 200 L1240 500" />
          <path d="M180 320 L520 300 L900 330 L1280 310" strokeWidth="1" stroke="rgba(99,102,241,0.06)" />
        </g>
        <g fill="rgba(124,58,237,0.03)" stroke="rgba(124,58,237,0.06)" strokeWidth="0.8">
          <rect x="230" y="330" width="120" height="80" rx="6" />
          <rect x="600" y="345" width="150" height="70" rx="6" />
          <rect x="1010" y="335" width="130" height="85" rx="6" />
        </g>
        <g>
          {[[300, 300], [560, 285], [905, 320], [1230, 300]].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="3.2" fill="rgba(139,92,246,0.45)" />
              <circle cx={cx} cy={cy} r="9" fill="none" stroke="rgba(139,92,246,0.16)" strokeWidth="1" />
              <circle className={`zauth-amb-scan s${i % 3}`} cx={cx} cy={cy} r="9" fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="1.2" />
            </g>
          ))}
        </g>
      </svg>
      <svg className="zauth-amb-ai" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="zauth-amb-glow">
            <stop offset="0" stopColor="#a78bfa" stopOpacity="0.7" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="zauth-amb-ai-lines" stroke="rgba(139,92,246,0.08)" strokeWidth="1" fill="none">
          <path d="M210 230 L430 330 L300 520 L120 430 Z" />
          <path d="M430 330 L760 250 L980 360" />
          <path d="M980 360 L1180 250 L1300 470" />
          <path d="M760 250 L820 470 L640 560" />
          <path d="M300 520 L640 560 L900 640" />
        </g>
        {[[210, 230], [430, 330], [300, 520], [760, 250], [980, 360], [1180, 250], [1300, 470], [820, 470], [640, 560], [900, 640], [120, 430]].map(([cx, cy], i) => (
          <g key={i} className="zauth-amb-node" style={{ animationDelay: `${(i % 6) * 1.7}s` }}>
            <circle cx={cx} cy={cy} r="18" fill="url(#zauth-amb-glow)" opacity="0.45" />
            <circle cx={cx} cy={cy} r="2.6" fill="rgba(139,92,246,0.6)" />
          </g>
        ))}
      </svg>
      <span className="zauth-amb-spark p1" />
      <span className="zauth-amb-spark p2" />
      <span className="zauth-amb-spark p3" />
      <span className="zauth-amb-spark p4" />
    </div>
  );
}
