"use client";
// Support View expiry countdown (client). Purely presentational — when it hits
// zero it refreshes the route, which re-checks the session server-side (the
// authoritative expiry) and returns the operator to the gate/platform.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function SupportViewCountdown({ expiresAtMs }: { expiresAtMs: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, expiresAtMs - Date.now());
      setRemaining(r);
      if (r <= 0) { clearInterval(id); router.refresh(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtMs, router]);
  if (remaining === null) return <span className="tabular-nums">…</span>;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return <span className="tabular-nums">{m}:{String(s).padStart(2, "0")}</span>;
}
