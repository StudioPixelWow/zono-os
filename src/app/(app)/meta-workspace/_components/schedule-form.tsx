// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Schedule form. Phase 3B UI (client, RTL).
// A small client control to schedule an approved draft for a future LOCAL time in
// a chosen IANA timezone (defaults to the browser's). It POSTs to the protected,
// authenticated schedule API; the actual publish runs later in the background. No
// token, lease, or raw error is ever handled here.
// ============================================================================
"use client";
import { useState } from "react";

export function ScheduleForm({ draftId, targetIds }: { draftId: string; targetIds: readonly string[] }) {
  const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } })();
  const [localDateTime, setLocalDateTime] = useState("");
  const [timezone, setTimezone] = useState(browserTz);
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!localDateTime) { setState("error"); setMessage("יש לבחור תאריך ושעה"); return; }
    setState("saving"); setMessage(null);
    try {
      const res = await fetch("/api/meta/publish/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draftId, targetIds, localDateTime, timezone }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState("error"); setMessage(String(data?.error ?? "התזמון נכשל")); return; }
      setState("ok"); setMessage("הפרסום תוזמן");
    } catch { setState("error"); setMessage("שגיאת רשת"); }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h3 className="mb-2 font-semibold">תזמון פרסום</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-gray-700">
          תאריך ושעה
          <input type="datetime-local" value={localDateTime} onChange={(e) => setLocalDateTime(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          אזור זמן
          <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1 w-56 rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <button onClick={submit} disabled={state === "saving" || state === "ok"} className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300">
          {state === "saving" ? "מתזמן…" : "תזמן"}
        </button>
      </div>
      {message && <p className={`mt-2 text-sm ${state === "error" ? "text-red-600" : "text-green-700"}`}>{message}</p>}
      <p className="mt-2 text-xs text-gray-400">הפרסום יישלח ל-Meta ברקע בזמן שנבחר. ניתן לבטל עד לרגע הביצוע.</p>
    </div>
  );
}
