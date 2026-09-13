"use client";
// ============================================================================
// ZONO — set new password. Reached from the reset email via /auth/callback,
// which established the recovery session. Submitting sets the new password and
// enters the app. Same premium RTL auth styling.
// ============================================================================
import Link from "next/link";
import { useActionState, useState } from "react";
import { Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { updatePassword, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});
  const [showPw, setShowPw] = useState(false);

  return (
    <div dir="rtl" className="zauth">
      <div className="zauth-aura a1" />
      <div className="zauth-aura a2" />
      <main className="zauth-shell">
        <div className="zauth-stage">
          <header className="zauth-head">
            <span className="zauth-logo-wrap"><ZonoLogo priority width={210} height={68} /></span>
            <p className="zauth-sub" style={{ marginTop: 16 }}>מערכת ההפעלה החכמה לנדל״ן</p>
          </header>

          <form action={action} className="zauth-card zauth-glass">
            <h1 className="zauth-card-title">בחירת סיסמה חדשה</h1>
            <p className="zauth-card-sub">הזן/י סיסמה חדשה לחשבון שלך</p>

            {state.error && <p className="zauth-err" role="alert">{state.error}</p>}

            <div className="zauth-field">
              <label htmlFor="zauth-pw-reset" className="zauth-label">סיסמה חדשה</label>
              <div className="zauth-input-wrap">
                <Lock className="zauth-input-ico" size={18} aria-hidden="true" />
                <input
                  id="zauth-pw-reset" name="password" type={showPw ? "text" : "password"} required minLength={6}
                  dir="ltr" autoComplete="new-password" placeholder="••••••••" className="zauth-input has-trail"
                />
                <button
                  type="button" className="zauth-eye" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={pending} className="zauth-btn">
              <span>{pending ? "מעדכן…" : "עדכן סיסמה והתחבר"}</span>
              {!pending && <ArrowLeft size={18} className="zauth-btn-arrow" aria-hidden="true" />}
            </button>

            <p className="zauth-alt">
              <Link href="/login" className="zauth-link">חזרה להתחברות</Link>
            </p>
          </form>

          <p className="zauth-foot">ZONO · Real Estate Operating System</p>
        </div>
      </main>
    </div>
  );
}
