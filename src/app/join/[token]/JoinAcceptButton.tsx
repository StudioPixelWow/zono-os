"use client";

import { useState, useTransition } from "react";
import { acceptInvitationAction } from "@/lib/team-admin/actions";

export function JoinAcceptButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitationAction(token);
            // On success the action redirects; only errors return here.
            if (res?.error) setError(res.error);
          })
        }
        className="bg-brand hover:bg-brand-strong inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "מצטרף…" : "הצטרף עכשיו"}
      </button>
      {error && <p className="text-danger text-xs font-semibold">{error}</p>}
    </div>
  );
}
