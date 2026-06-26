"use client";
// ============================================================================
// ZONO — sign-up, matched to Login Experience 2.0 ("Luxury Technology Edition").
// A calm, centered dark-glass card on the same black-purple environment, with
// the refined icon inputs + password show/hide, an expensive primary button and
// a Framer-Motion staggered reveal. RTL Hebrew, accessible, reduced-motion
// aware. Wired to the REAL `signUp` server action; keeps invite-link support.
// ============================================================================
import Link from "next/link";
import { Suspense, useActionState, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { User, Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { signUp, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});
  const [showPw, setShowPw] = useState(false);
  const reduce = useReducedMotion();
  const invite = useSearchParams().get("invite") ?? "";

  const particles = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({
      left: Math.round((i * 47 + 11) % 100),
      delay: (i * 1.4) % 11,
      dur: 16 + (i % 5) * 2,
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
      <div className="zauth-aura a1" />
      <div className="zauth-aura a2" />

      <svg className="zauth-orbits" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="zauth-node-su">
            <stop offset="0" stopColor="#c4b5fd" stopOpacity="0.7" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="zauth-orbit-spin" style={{ transformOrigin: "720px 450px" }}>
          <ellipse cx="720" cy="450" rx="600" ry="320" fill="none" stroke="rgba(167,139,250,0.10)" strokeWidth="1" />
          <ellipse cx="720" cy="450" rx="440" ry="520" fill="none" stroke="rgba(167,139,250,0.07)" strokeWidth="1" transform="rotate(26 720 450)" />
          <circle cx="120" cy="450" r="2.6" fill="url(#zauth-node-su)" />
          <circle cx="1320" cy="450" r="2.6" fill="url(#zauth-node-su)" />
        </g>
      </svg>

      <div className="zauth-particles" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className="zauth-dot"
            style={{
              left: `${p.left}%`, bottom: "-12px",
              width: p.size, height: p.size,
              animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <main className="zauth-shell">
        <motion.div className="zauth-stage" variants={container} initial="hidden" animate="show">
          <motion.header className="zauth-head" variants={rise}>
            <span className="zauth-logo-wrap">
              <ZonoLogo priority width={210} height={68} />
            </span>
            <p className="zauth-sub" style={{ marginTop: 16 }}>מערכת ההפעלה החכמה לנדל״ן</p>
          </motion.header>

          <motion.form action={action} className="zauth-card zauth-glass" variants={rise}>
            <h1 className="zauth-card-title">יצירת חשבון</h1>
            <p className="zauth-card-sub">הצטרפ/י למרכז השליטה של ZONO</p>

            {invite && <input type="hidden" name="invite" value={invite} />}
            {invite && (
              <p className="zauth-note" role="status">
                הרשמה לפי הזמנה — לאחר ההרשמה תצורף/י אוטומטית למשרד שהזמין אותך.
              </p>
            )}

            {state.error && <p className="zauth-err" role="alert">{state.error}</p>}
            {state.message && <p className="zauth-ok" role="status">{state.message}</p>}

            <div className="zauth-field">
              <label htmlFor="zauth-name" className="zauth-label">שם מלא</label>
              <div className="zauth-input-wrap">
                <User className="zauth-input-ico" size={18} aria-hidden="true" />
                <input id="zauth-name" name="fullName" type="text" required className="zauth-input" />
              </div>
            </div>

            <div className="zauth-field">
              <label htmlFor="zauth-email-su" className="zauth-label">אימייל</label>
              <div className="zauth-input-wrap">
                <Mail className="zauth-input-ico" size={18} aria-hidden="true" />
                <input
                  id="zauth-email-su" name="email" type="email" required dir="ltr" autoComplete="email"
                  placeholder="you@agency.co.il" className="zauth-input"
                />
              </div>
            </div>

            <div className="zauth-field">
              <label htmlFor="zauth-pw-su" className="zauth-label">סיסמה</label>
              <div className="zauth-input-wrap">
                <Lock className="zauth-input-ico" size={18} aria-hidden="true" />
                <input
                  id="zauth-pw-su" name="password" type={showPw ? "text" : "password"} required minLength={6}
                  dir="ltr" autoComplete="new-password" placeholder="••••••••" className="zauth-input has-trail"
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
              <span>{pending ? "יוצר חשבון…" : "הרשמה"}</span>
              {!pending && <ArrowLeft size={18} className="zauth-btn-arrow" aria-hidden="true" />}
            </button>

            <p className="zauth-alt">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="zauth-link">התחברות</Link>
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
