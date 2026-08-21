"use client";
// ============================================================================
// ZONO — "שאל את ZONO" trigger. Opens the EXISTING ZONO chat widget (ZIWidget)
// via a window event — no second chatbot, and in P0 NO seeded context is passed
// (contextual handoff is a later phase). Purely a visual/conversational trigger.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { ZONO_OPEN_CHAT_EVENT } from "./states";

export function AskZono({ label = "שאל את ZONO", className = "" }: { label?: string; className?: string }) {
  const open = () => { try { window.dispatchEvent(new CustomEvent(ZONO_OPEN_CHAT_EVENT)); } catch { /* noop */ } };
  return (
    <button type="button" onClick={open} className={`text-brand-strong inline-flex items-center gap-1 text-[12.5px] font-bold hover:underline ${className}`}>
      <Icon name="Sparkles" size={13} />{label}
    </button>
  );
}
