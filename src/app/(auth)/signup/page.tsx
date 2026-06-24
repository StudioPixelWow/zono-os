"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUp, type AuthFormState } from "@/lib/auth/actions";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});
  const invite = useSearchParams().get("invite") ?? "";

  return (
    <div dir="rtl" className="zauth">
      <div className="zauth-aura a1" />
      <div className="zauth-aura a2" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <ZonoLogo priority width={170} height={56} className="drop-shadow-[0_8px_30px_rgba(124,58,237,0.45)]" />
            <p className="mt-4 text-[13px] font-semibold tracking-wide text-[#b9a9f0]">
              מערכת ההפעלה החכמה לנדל״ן
            </p>
          </div>

          <form action={action} className="zauth-card zauth-glass p-7 sm:p-8">
            <h1 className="mb-6 text-center text-xl font-black text-white">יצירת חשבון</h1>
            {invite && <input type="hidden" name="invite" value={invite} />}
            {invite && (
              <p className="mb-4 rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-center text-xs font-semibold text-violet-100">
                הרשמה לפי הזמנה — לאחר ההרשמה תצורף/י אוטומטית למשרד שהזמין אותך.
              </p>
            )}

            {state.error && (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-center text-xs font-semibold text-red-200">
                {state.error}
              </p>
            )}
            {state.message && (
              <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-center text-xs font-semibold text-emerald-200">
                {state.message}
              </p>
            )}

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs font-bold text-[#c9bdf0]">שם מלא</span>
              <input name="fullName" type="text" required className="zauth-input text-sm" />
            </label>

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs font-bold text-[#c9bdf0]">אימייל</span>
              <input name="email" type="email" required dir="ltr" autoComplete="email" placeholder="you@agency.co.il" className="zauth-input text-sm" />
            </label>

            <label className="mb-6 block">
              <span className="mb-1.5 block text-xs font-bold text-[#c9bdf0]">סיסמה</span>
              <input name="password" type="password" required minLength={6} dir="ltr" autoComplete="new-password" placeholder="••••••••" className="zauth-input text-sm" />
            </label>

            <button type="submit" disabled={pending} className="zauth-btn text-sm">
              {pending ? "יוצר חשבון…" : "הרשמה"}
            </button>

            <p className="mt-5 text-center text-xs text-[#a896e0]">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="font-bold text-[#c4b5fd] underline-offset-2 hover:underline">
                התחברות
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
