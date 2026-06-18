import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

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
    <div className="bg-surface min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
