"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/lib/auth/actions";

const inputClass =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-ink text-lg font-extrabold">התחברות</h2>

      {state.error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-xs font-semibold">
          {state.error}
        </p>
      )}

      <label className="block">
        <span className="text-muted text-xs font-semibold">אימייל</span>
        <input name="email" type="email" required dir="ltr" className={`${inputClass} mt-1`} />
      </label>

      <label className="block">
        <span className="text-muted text-xs font-semibold">סיסמה</span>
        <input name="password" type="password" required dir="ltr" className={`${inputClass} mt-1`} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-strong mt-2 inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold text-white transition disabled:opacity-60"
      >
        {pending ? "מתחבר…" : "התחברות"}
      </button>

      <p className="text-muted text-center text-xs">
        אין לך חשבון?{" "}
        <Link href="/signup" className="text-brand font-bold">
          הרשמה
        </Link>
      </p>
    </form>
  );
}
