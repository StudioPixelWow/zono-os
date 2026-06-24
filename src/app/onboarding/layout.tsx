import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

export const dynamic = "force-dynamic";

/** Onboarding requires a session but no completed profile. */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { state } = await getSessionContext();
  if (state === "unauthenticated") redirect("/login");
  if (state === "ready") redirect("/");

  return (
    <div dir="rtl" className="bg-surface min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-7 flex flex-col items-center text-center">
          <ZonoLogo priority width={150} height={50} className="drop-shadow-[0_8px_26px_rgba(124,58,237,0.28)]" />
          <p className="text-muted mt-3 text-sm font-semibold">בוא נגדיר את מערכת ההפעלה שלך לנדל״ן</p>
        </div>
        {children}
      </div>
    </div>
  );
}
