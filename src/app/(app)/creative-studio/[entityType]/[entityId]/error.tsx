"use client";

// Route-level error boundary for the Creative Studio entity page. Catches any
// render/runtime error so the user gets a friendly retry instead of the bare
// "This page couldn't load" screen — and logs the error for diagnosis.
import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";

export default function CreativeStudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[creative-studio] route error:", error?.message, error?.digest, error);
  }, [error]);

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="bg-danger-soft text-danger grid h-14 w-14 place-items-center rounded-2xl">
        <Icon name="AlertTriangle" size={26} />
      </span>
      <h1 className="text-ink text-xl font-black">לא ניתן לטעון את ZONO קריאייטיב</h1>
      <p className="text-muted max-w-md text-sm">
        אירעה שגיאה בטעינת הסטודיו לנכס הזה. נסה/י שוב — אם זה חוזר, פתח/י את הקריאייטיב מתוך עמוד הנכס.
      </p>
      {(error?.message || error?.digest) && (
        <pre dir="ltr" className="bg-surface border-line text-danger max-w-xl overflow-x-auto rounded-xl border p-3 text-left font-mono text-[11px] leading-relaxed">
          {error?.message || "(no message)"}{error?.digest ? `\n\nref: ${error.digest}` : ""}
        </pre>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={() => reset()} leadingIcon={<Icon name="RefreshCw" size={16} />}>נסה שוב</Button>
        <Link href="/properties" className="contents">
          <Button variant="secondary" leadingIcon={<Icon name="Building2" size={16} />}>חזרה לנכסים</Button>
        </Link>
        <Link href="/creative-studio" className="contents">
          <Button variant="ghost">ZONO קריאייטיב</Button>
        </Link>
      </div>
    </main>
  );
}
