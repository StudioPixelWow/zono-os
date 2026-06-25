"use client";
// ============================================================================
// ZONO — login experience. A deep navy/purple "living operating system" sign-in:
// ambient breathing glow, a digital-city intelligence network with drifting
// particles, the ZONO robot mascot standing beside a glass login card, and two
// signature live chips (WhatsApp + property-match). RTL Hebrew. Wired to the
// REAL `signIn` server action. Honors reduced-motion. (Phase 19.5 visual pass.)
// ============================================================================
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { MessageCircle, Home } from "lucide-react";
import { signIn, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

// The mascot is hosted by the brand site; if hotlinking is blocked it falls back
// to a local /zono-robot.png (drop the PNG in /public to self-host).
const ROBOT_REMOTE = "https://s-pixel.co.il/wp-content/uploads/2026/06/41a88c3f-7369-4e03-9571-65dbe5c7a470-1.png";
const ROBOT_LOCAL = "/zono-robot.png";

export function LoginExperience() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});

  // Particles: generated once, stable across renders.
  const particles = useMemo(
    () => Array.from({ length: 20 }, (_, i) => ({
      left: Math.round((i * 53 + 7) % 100),
      delay: (i * 0.7) % 9,
      dur: 9 + (i % 6),
      size: 2 + (i % 3),
    })),
    [],
  );

  return (
    <div dir="rtl" className="zauth">
      {/* Ambient breathing glow */}
      <div className="zauth-aura a1" />
      <div className="zauth-aura a2" />
      <div className="zauth-aura a3" />

      {/* Living real-estate intelligence network */}
      <NetworkBackground />

      {/* Drifting particles */}
      <div className="pointer-events-none absolute inset-0">
        {particles.map((p, i) => (
          <span
            key={i}
            className="zauth-particle"
            style={{
              left: `${p.left}%`, bottom: "-10px",
              width: p.size, height: p.size,
              animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Robot mascot beside the card */}
      <RobotMascot />

      {/* Signature live chips */}
      <div className="zauth-chip zauth-glass" style={{ top: "8%", insetInlineEnd: "9%" }}>
        <span className="zauth-chip-ico"><MessageCircle size={17} /></span>
        <span>
          <span className="zauth-chip-title block">3 שיחות WhatsApp חדשות</span>
          <span className="zauth-chip-sub">ממתינות למענה</span>
        </span>
      </div>
      <div className="zauth-chip c2 zauth-glass" style={{ bottom: "12%", insetInlineEnd: "7%" }}>
        <span className="zauth-chip-ico"><Home size={17} /></span>
        <span>
          <span className="zauth-chip-title block">נמצאה התאמת נכס</span>
          <span className="zauth-chip-sub">94% התאמה</span>
        </span>
      </div>

      {/* Foreground: logo + login panel */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          {/* Logo hero */}
          <div className="zauth-logo mb-7 flex flex-col items-center text-center">
            <ZonoLogo priority width={188} height={62} className="drop-shadow-[0_8px_30px_rgba(124,58,237,0.45)]" />
            <p className="mt-4 text-[13px] font-semibold tracking-wide text-[#b9a9f0]">
              מערכת ההפעלה החכמה לנדל״ן
            </p>
          </div>

          {/* Glass login card */}
          <form action={action} className="zauth-card zauth-glass p-7 sm:p-8">
            <h1 className="mb-1 text-center text-xl font-black text-white">התחברות</h1>
            <p className="mb-6 text-center text-xs text-[#a896e0]">ברוך/ה הבא/ה למרכז השליטה</p>

            {state.error && (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-center text-xs font-semibold text-red-200">
                {state.error}
              </p>
            )}

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs font-bold text-[#c9bdf0]">אימייל</span>
              <input
                name="email" type="email" required dir="ltr" autoComplete="email"
                placeholder="you@agency.co.il" className="zauth-input text-sm"
              />
            </label>

            <label className="mb-6 block">
              <span className="mb-1.5 block text-xs font-bold text-[#c9bdf0]">סיסמה</span>
              <input
                name="password" type="password" required dir="ltr" autoComplete="current-password"
                placeholder="••••••••" className="zauth-input text-sm"
              />
            </label>

            <button type="submit" disabled={pending} className="zauth-btn text-sm">
              {pending ? "מתחבר…" : "התחברות"}
            </button>

            <p className="mt-5 text-center text-xs text-[#a896e0]">
              אין לך חשבון?{" "}
              <Link href="/signup" className="font-bold text-[#c4b5fd] underline-offset-2 hover:underline">
                הרשמה
              </Link>
            </p>
          </form>

          <p className="mt-6 text-center text-[11px] text-[#6f5fa6]">
            ZONO · Real Estate Operating System
          </p>
        </div>
      </div>
    </div>
  );
}

/** ZONO robot mascot. Tries the brand-hosted image (no-referrer to dodge hotlink
 *  protection), falls back to a local self-hosted copy, then hides gracefully. */
function RobotMascot() {
  const [src, setSrc] = useState(ROBOT_REMOTE);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="ZONO"
      className="zauth-robot"
      referrerPolicy="no-referrer"
      onError={() => { if (src !== ROBOT_LOCAL) setSrc(ROBOT_LOCAL); else setHidden(true); }}
    />
  );
}

/** Subtle SVG "digital city": faint streets, property-cluster nodes, lead-flow
 *  routes with animated dashes, and glowing packets riding the routes. */
function NetworkBackground() {
  return (
    <svg className="zauth-net" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="zauth-route-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" stopOpacity="0.0" />
          <stop offset="0.5" stopColor="#a855f7" stopOpacity="0.6" />
          <stop offset="1" stopColor="#c084fc" stopOpacity="0.0" />
        </linearGradient>
        <radialGradient id="zauth-node-grad">
          <stop offset="0" stopColor="#d8b4fe" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* faint street grid */}
      <g stroke="rgba(167,139,250,0.07)" strokeWidth="1">
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 130} y1="0" x2={i * 130} y2="900" />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 130} x2="1440" y2={i * 130} />
        ))}
      </g>

      {/* lead-flow routes */}
      <g fill="none" stroke="url(#zauth-route-grad)" strokeWidth="2">
        <path id="zauth-r1" className="zauth-route" d="M120,760 C360,620 520,520 760,470 S1180,360 1320,200" />
        <path id="zauth-r2" className="zauth-route" d="M80,200 C300,300 460,360 720,400 S1160,470 1360,640" style={{ animationDelay: "1.2s" }} />
        <path id="zauth-r3" className="zauth-route" d="M220,860 C420,760 560,700 720,560 S1080,300 1300,360" style={{ animationDelay: "2.1s" }} />
      </g>

      {/* property-cluster nodes */}
      <g>
        {[
          [120, 760], [760, 470], [1320, 200], [80, 200], [720, 400], [1360, 640],
          [220, 860], [720, 560], [1300, 360], [480, 300], [980, 520], [560, 700],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="16" fill="url(#zauth-node-grad)" opacity="0.5" />
            <circle cx={x} cy={y} r="3" className="zauth-node-pulse" fill="#e9d5ff" style={{ animationDelay: `${(i % 5) * 0.4}s` }} />
          </g>
        ))}
      </g>

      {/* glowing packets riding the routes (native SVG motion) */}
      {["zauth-r1", "zauth-r2", "zauth-r3"].map((rid, i) => (
        <circle key={rid} r="3.4" fill="#f0e7ff" opacity="0.95">
          <animateMotion dur={`${6 + i}s`} repeatCount="indefinite" rotate="auto" begin={`${i * 1.4}s`}>
            <mpath href={`#${rid}`} />
          </animateMotion>
        </circle>
      ))}
    </svg>
  );
}
