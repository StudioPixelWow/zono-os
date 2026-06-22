"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUp, type AuthFormState } from "@/lib/auth/actions";

const inputClass =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUp,
    {},
  );
  const invite = useSearchParams().get("invite") ?? "";

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-ink text-lg font-extrabold">יצירת חשבון</h2>
      {invite && <input type="hidden" name="invite" value={invite} />}
      {invite && (
        <p className="bg-brand-soft text-brand-strong rounded-xl px-3 py-2 text-xs font-semibold">
          הרשמה לפי הזמנה — לאחר ההרשמה תצורף/י אוטומטית למשרד שהזמין אותך.
        </p>
      )}

      {state.error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-xs font-semibold">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-xs font-semibold">
          {state.message}
        </p>
      )}

      <label className="block">
        <span className="text-muted text-xs font-semibold">שם מלא</span>
        <input name="fullName" type="text" required className={`${inputClass} mt-1`} />
      </label>

      <label className="block">
        <span className="text-muted text-xs font-semibold">אימייל</span>
        <input name="email" type="email" required dir="ltr" className={`${inputClass} mt-1`} />
      </label>

      <label className="block">
        <span className="text-muted text-xs font-semibold">סיסמה</span>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          dir="ltr"
          className={`${inputClass} mt-1`}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-strong mt-2 inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold text-white transition disabled:opacity-60"
      >
        {pending ? "יוצר חשבון…" : "הרשמה"}
      </button>

      <p className="text-muted text-center text-xs">
        כבר יש לך חשבון?{" "}
        <Link href="/login" className="text-brand font-bold">
          התחברות
        </Link>
      </p>
    </form>
  );
}
