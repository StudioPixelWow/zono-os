"use client";
// Small client action reused on the Distribution home: explicit "publish now" —
// sets the one-shot claim priority via the SAME requestPublishNowAction, then
// refreshes server data. No new publishing mechanics.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestPublishNowAction } from "@/lib/distribution/publishing-control-actions";

export function PublishNowButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [requested, setRequested] = useState(false);
  if (requested) return <span className="text-brand text-[12px] font-bold">בתור לפרסום ✓ · ודא שהתוסף פעיל</span>;
  return (
    <button
      disabled={pending}
      onClick={() => { setRequested(true); start(async () => { await requestPublishNowAction(postId); router.refresh(); }); }}
      className="bg-brand rounded-xl px-5 py-2 text-sm font-black text-white disabled:opacity-50"
    >{pending ? "מכינים את הפרסום…" : "פרסום עכשיו"}</button>
  );
}
