"use client";
// ZONO — Agent avatar with graceful fallback. Renders the resolved photo; on a
// missing/broken image it falls back to the initials chip (never a broken image).
// Used everywhere a named agent appears in the manager workspace.
import { useState } from "react";
import { agentInitials } from "@/lib/office/avatar";

export function AgentAvatar({ url, name, size = 44, className = "", ring = true }: { url: string | null; name: string; size?: number; className?: string; ring?: boolean }) {
  const [err, setErr] = useState(false);
  const alt = `תמונה של ${name}`;
  const border = ring ? "border-line border" : "";
  if (url && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local/CDN avatar; next/image loader not configured for arbitrary hosts
      <img
        src={url} alt={alt} width={size} height={size} loading="lazy" onError={() => setErr(true)}
        className={`bg-surface shrink-0 rounded-full object-cover ${border} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-label={alt} role="img"
      className={`bg-brand-soft text-brand-strong grid shrink-0 place-items-center rounded-full font-black ${border} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {agentInitials(name)}
    </span>
  );
}
