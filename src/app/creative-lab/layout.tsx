import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labEnabled } from "@/lib/creative-runtime/lab-runtime";
import { getLabSession } from "./actions";

export const dynamic = "force-dynamic";

// The lab is a deterministic TEST-RUNTIME surface. Outside the guarded test
// runtime (i.e. in production/staging) the whole route tree 404s — it is never
// reachable, never wired to real data, and shares nothing with the production
// /creative-studio launcher.
export default async function CreativeLabLayout({ children }: { children: ReactNode }) {
  if (!labEnabled()) notFound();
  const session = await getLabSession();
  const who = session.orgId ? `${session.orgId} · ${session.userId} (${session.role})${session.active ? "" : " · inactive"}` : "anonymous";

  return (
    <div dir="rtl" data-testid="lab-root" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2 border-b border-line pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-ink text-xl font-black">ZONO Creative — Test Runtime</h1>
          <span data-testid="lab-session" className="rounded-lg bg-surface px-2 py-1 text-[11px] text-muted">{who}</span>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs">
          <Link href="/creative-lab" className="rounded-lg bg-surface px-3 py-1 font-bold text-ink hover:bg-brand hover:text-white" data-testid="nav-workspace">סטודיו יחיד</Link>
          <Link href="/creative-lab/bulk" className="rounded-lg bg-surface px-3 py-1 font-bold text-ink hover:bg-brand hover:text-white" data-testid="nav-bulk">מחולל נכסים בכמות</Link>
          <span className="mr-auto flex gap-1">
            {["alpha-owner", "alpha-agent", "alpha-inactive", "beta-owner", "anonymous"].map((as) => (
              <a key={as} href={`/creative-lab/session?as=${as}`} data-testid={`login-${as}`} className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted hover:border-brand">{as}</a>
            ))}
          </span>
        </nav>
      </header>
      {children}
    </div>
  );
}
