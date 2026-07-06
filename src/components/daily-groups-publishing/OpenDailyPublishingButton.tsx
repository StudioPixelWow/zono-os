"use client";
// 📣 ZONO — trigger for the Daily FB Groups Publishing popup. PHASE 49.0.
// Dispatches the global event the provider listens for. No data/logic here.
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";

export function OpenDailyPublishingButton({ label = "פרסום היום", size = "sm" }: { label?: string; size?: "sm" | "md" | "lg" }) {
  const open = () => { try { window.dispatchEvent(new Event("zono:open-daily-publishing")); } catch { /* ignore */ } };
  return <Button size={size} variant="secondary" onClick={open} leadingIcon={<Icon name="Megaphone" size={15} />}>{label}</Button>;
}
