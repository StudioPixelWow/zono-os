"use client";
// ============================================================================
// ZONO Property Radar™ — alert action bar. Phone-aware (disables call/WhatsApp
// when no number), RTL, premium. All handlers are passed in from the provider.
// ============================================================================
import { useState } from "react";
import { Phone, MessageCircle, Building2, Users, BellRing, CheckCheck, X } from "lucide-react";
import type { PropertyRadarAlertDTO } from "@/lib/property-radar/alerts/types";

export interface AlertActionHandlers {
  onCall: () => void;
  onWhatsapp: () => void;
  onOpenProperty: () => void;
  onFindBuyers: () => void;
  onReminder: () => Promise<void> | void;
  onContacted: () => void;
  onDismiss: () => void;
}

export function PropertyRadarAlertActions({
  alert,
  handlers,
}: {
  alert: PropertyRadarAlertDTO;
  handlers: AlertActionHandlers;
}) {
  const m = alert.metadata ?? {};
  const hasPhone = Boolean(m.phone || m.callUrl || m.whatsappUrl);
  const canOpen = Boolean(alert.linkedPropertyId || m.externalUrl);
  const [reminderState, setReminderState] = useState<"idle" | "saving" | "done">("idle");

  async function handleReminder() {
    setReminderState("saving");
    await handlers.onReminder();
    setReminderState("done");
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3 border-t border-black/5 bg-white/60 px-5 py-4">
      {!hasPhone && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700">
          מספר טלפון לא זמין
        </p>
      )}

      {/* Primary row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!hasPhone}
          onClick={handlers.onCall}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-strong px-3 py-3 text-sm font-black text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Phone size={17} /> התקשר עכשיו
        </button>
        <button
          type="button"
          disabled={!hasPhone}
          onClick={handlers.onWhatsapp}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1faf54] px-3 py-3 text-sm font-black text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MessageCircle size={17} /> שלח וואטסאפ מוכן
        </button>
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canOpen}
          onClick={handlers.onOpenProperty}
          className="zono-glass inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-ink transition hover:text-brand-strong disabled:opacity-40"
        >
          <Building2 size={16} /> פתח נכס ב‑ZONO
        </button>
        <button
          type="button"
          onClick={handlers.onFindBuyers}
          className="zono-glass inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-ink transition hover:text-brand-strong"
        >
          <Users size={16} /> מצא קונים מתאימים
        </button>
      </div>

      {/* Tertiary row */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={reminderState !== "idle"}
          onClick={handleReminder}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold text-ink/70 transition hover:bg-black/5 disabled:opacity-60"
        >
          <BellRing size={15} /> {reminderState === "done" ? "נקבעה תזכורת" : "תזכיר לי"}
        </button>
        <button
          type="button"
          onClick={handlers.onContacted}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
        >
          <CheckCheck size={15} /> טיפלתי בזה
        </button>
        <button
          type="button"
          onClick={handlers.onDismiss}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold text-ink/50 transition hover:bg-black/5"
        >
          <X size={15} /> סגור
        </button>
      </div>
    </div>
  );
}
