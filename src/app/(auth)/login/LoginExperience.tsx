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

        {/* Premium real-estate / AI / mapping ambience — purely additive, sits
            behind every other decorative element. Pure CSS + SVG, no assets. */}
        <RealEstateAmbient />

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

/**
 * Premium real-estate / AI / mapping ambience for the login background. Purely
 * additive and decorative — pure CSS + SVG, no bitmap assets. Communicates luxury
 * real estate, AI intelligence, data, mapping and market insight without ever
 * competing with the centred login card. Everything is extremely faint, slow and
 * positioned toward the edges/corners; honors prefers-reduced-motion via CSS.
 */
function RealEstateAmbient() {
  return (
    <div className="zauth-amb">
      {/* Dashboard dotted grid — faded everywhere, denser toward the top. */}
      <div className="zauth-amb-grid" />

      {/* Large blurred translucent geometric shapes — depth only. */}
      <span className="zauth-amb-blob b1" />
      <span className="zauth-amb-blob b2" />
      <span className="zauth-amb-blob b3" />

      {/* Topographic contour lines — top-right, like a premium map. */}
      <svg className="zauth-amb-topo" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {[40, 78, 120, 166, 216, 270, 328].map((r, i) => (
          <ellipse key={r} cx="470" cy="120" rx={r * 1.35} ry={r} fill="none"
            stroke="rgba(124,58,237,0.07)" strokeWidth="1" transform={`rotate(${-18 + i} 470 120)`} />
        ))}
      </svg>

      {/* Street-map geometry — roads, intersections, districts, location nodes &
          property clusters, anchored to the bottom band (behind the skyline). */}
      <svg className="zauth-amb-map" viewBox="0 0 1440 500" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <g stroke="rgba(124,58,237,0.08)" strokeWidth="1.2" fill="none">
          {/* primary roads */}
          <path d="M-20 360 L1460 300" />
          <path d="M-20 440 L1460 410" />
          <path d="M120 500 L260 180" />
          <path d="M460 500 L560 160" />
          <path d="M880 160 L980 500" />
          <path d="M1180 200 L1240 500" />
          {/* district connectors */}
          <path d="M180 320 L520 300 L900 330 L1280 310" strokeWidth="1" stroke="rgba(99,102,241,0.07)" />
        </g>
        {/* district blocks */}
        <g fill="rgba(124,58,237,0.035)" stroke="rgba(124,58,237,0.07)" strokeWidth="0.8">
          <rect x="230" y="330" width="120" height="80" rx="6" />
          <rect x="600" y="345" width="150" height="70" rx="6" />
          <rect x="1010" y="335" width="130" height="85" rx="6" />
        </g>
        {/* property clusters + location nodes */}
        <g>
          {[[300, 300], [560, 285], [905, 320], [1230, 300]].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="3.2" fill="rgba(139,92,246,0.5)" />
              <circle cx={cx} cy={cy} r="9" fill="none" stroke="rgba(139,92,246,0.18)" strokeWidth="1" />
              <circle className={`zauth-amb-scan s${i % 3}`} cx={cx} cy={cy} r="9" fill="none" stroke="rgba(139,92,246,0.22)" strokeWidth="1.2" />
            </g>
          ))}
        </g>
      </svg>

      {/* Architectural line-art — abstract modern residential silhouettes rising
          softly from the bottom corners. Thin vector strokes only. */}
      <svg className="zauth-amb-arch left" viewBox="0 0 360 280" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
        <g fill="none" stroke="rgba(124,58,237,0.10)" strokeWidth="1.1">
          <path d="M20 280 L20 120 L80 92 L80 280 Z" />
          <path d="M80 280 L80 60 L150 60 L150 280" />
          <path d="M150 280 L150 150 L210 150 L210 280" />
          <path d="M30 140 H70 M30 168 H70 M30 196 H70 M30 224 H70" stroke="rgba(124,58,237,0.07)" />
          <path d="M95 86 H140 M95 120 H140 M95 154 H140 M95 188 H140 M95 222 H140" stroke="rgba(124,58,237,0.07)" />
          <path d="M165 176 H200 M165 208 H200 M165 240 H200" stroke="rgba(124,58,237,0.07)" />
        </g>
      </svg>
      <svg className="zauth-amb-arch right" viewBox="0 0 360 280" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
        <g fill="none" stroke="rgba(109,63,242,0.10)" strokeWidth="1.1">
          <path d="M340 280 L340 100 L270 76 L270 280 Z" />
          <path d="M270 280 L270 46 L196 46 L196 280" />
          <path d="M196 280 L196 168 L140 168 L140 280" />
          <path d="M286 100 H330 M286 134 H330 M286 168 H330 M286 202 H330 M286 236 H330" stroke="rgba(109,63,242,0.07)" />
          <path d="M210 70 H258 M210 104 H258 M210 138 H258 M210 172 H258 M210 206 H258 M210 240 H258" stroke="rgba(109,63,242,0.07)" />
        </g>
      </svg>

      {/* AI network overlay — connected nodes, flowing routing lines, orbit
          circles and glowing connection points. Slow, almost-still. */}
      <svg className="zauth-amb-ai" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="zauth-amb-glow">
            <stop offset="0" stopColor="#a78bfa" stopOpacity="0.8" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="zauth-amb-ai-lines" stroke="rgba(139,92,246,0.10)" strokeWidth="1" fill="none">
          <path d="M210 230 L430 330 L300 520 L120 430 Z" />
          <path d="M430 330 L760 250 L980 360" />
          <path d="M980 360 L1180 250 L1300 470" />
          <path d="M760 250 L820 470 L640 560" />
          <path d="M300 520 L640 560 L900 640" />
        </g>
        <g className="zauth-amb-orbits" fill="none" stroke="rgba(99,102,241,0.10)" strokeWidth="1">
          <circle cx="430" cy="330" r="46" strokeDasharray="3 8" />
          <circle cx="980" cy="360" r="58" strokeDasharray="3 10" />
          <circle cx="760" cy="250" r="38" strokeDasharray="2 9" />
        </g>
        {[[210, 230], [430, 330], [300, 520], [760, 250], [980, 360], [1180, 250], [1300, 470], [820, 470], [640, 560], [900, 640], [120, 430]].map(([cx, cy], i) => (
          <g key={i} className="zauth-amb-node" style={{ animationDelay: `${(i % 6) * 1.7}s` }}>
            <circle cx={cx} cy={cy} r="18" fill="url(#zauth-amb-glow)" opacity="0.5" />
            <circle cx={cx} cy={cy} r="2.6" fill="rgba(139,92,246,0.7)" />
          </g>
        ))}
      </svg>

      {/* Soft glowing particles drifting along gentle curved paths. */}
      <span className="zauth-amb-spark p1" />
      <span className="zauth-amb-spark p2" />
      <span className="zauth-amb-spark p3" />
      <span className="zauth-amb-spark p4" />

      {/* Property-management HUD — tiny icon-only glass chips at the far edges,
          suggesting listings / analytics / deals / notifications. No content. */}
      <div className="zauth-amb-hud h1"><HudIcon kind="home" /></div>
      <div className="zauth-amb-hud h2"><HudIcon kind="chart" /></div>
      <div className="zauth-amb-hud h3"><HudIcon kind="pin" /></div>
      <div className="zauth-amb-hud h4"><HudIcon kind="bell" /></div>
    </div>
  );
}

/** Minimal single-glyph icons for the icon-only HUD chips (no readable text). */
function HudIcon({ kind }: { kind: "home" | "chart" | "pin" | "bell" }) {
  const common = { fill: "none", stroke: "rgba(124,58,237,0.55)", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      {kind === "home" && <path {...common} d="M4 11 L12 5 L20 11 M6 10 V19 H18 V10" />}
      {kind === "chart" && <path {...common} d="M5 19 V12 M10 19 V8 M15 19 V14 M20 19 V6" />}
      {kind === "pin" && <path {...common} d="M12 21 C12 21 18 14.5 18 10 A6 6 0 1 0 6 10 C6 14.5 12 21 12 21 Z M12 10 h0" />}
      {kind === "bell" && <path {...common} d="M7 17 V11 a5 5 0 0 1 10 0 V17 l1.5 2 H5.5 Z M10 21 h4" />}
    </svg>
  );
}
