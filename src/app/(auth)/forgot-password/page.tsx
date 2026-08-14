"use client";
// ============================================================================
// ZONO — forgot password. Sends a reset link (branded ZONO email) that lands on
// /auth/callback → /reset-password. Same premium RTL auth styling as login.
// ============================================================================
import Link from "next/link";
import { useActionState } from "react";
import { Mail, ArrowLeft } from "lucide-react";
import { requestPasswordReset, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});

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
            <h1 className="zauth-card-title">איפוס סיסמה</h1>
            <p className="zauth-card-sub">הזן/י את כתובת המייל שלך ונשלח קישור לאיפוס</p>

            {state.error && <p className="zauth-err" role="alert">{state.error}</p>}
            {state.message && <p className="zauth-ok" role="status">{state.message}</p>}

            <div className="zauth-field">
              <label htmlFor="zauth-email-fp" className="zauth-label">אימייל</label>
              <div className="zauth-input-wrap">
                <Mail className="zauth-input-ico" size={18} aria-hidden="true" />
                <input
                  id="zauth-email-fp" name="email" type="email" required dir="ltr" autoComplete="email"
                  placeholder="you@agency.co.il" className="zauth-input"
                />
              </div>
            </div>

            <button type="submit" disabled={pending} className="zauth-btn">
              <span>{pending ? "שולח…" : "שלח קישור לאיפוס"}</span>
              {!pending && <ArrowLeft size={18} className="zauth-btn-arrow" aria-hidden="true" />}
            </button>

            <p className="zauth-alt">
              נזכרת בסיסמה?{" "}
              <Link href="/login" className="zauth-link">התחברות</Link>
            </p>
          </form>

          <p className="zauth-foot">ZONO · Real Estate Operating System</p>
        </div>
      </main>
    </div>
  );
}
