import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Public auth pages. Already-authenticated users are bounced onward. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { state } = await getSessionContext();
  if (state === "ready") redirect("/");
  if (state === "onboarding") redirect("/onboarding");

  return (
    <div className="bg-surface flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="from-brand to-brand-light mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-lg font-black text-white shadow-[0_8px_22px_rgba(124,58,237,0.4)]">
            Z
          </div>
          <h1 className="text-ink text-2xl font-black">ZONO</h1>
          <p className="text-muted text-sm">מערכת ההפעלה החכמה לסוכני נדל״ן</p>
        </div>
        <div className="bg-card border-line rounded-[24px] border p-6 shadow-[var(--shadow-card)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
