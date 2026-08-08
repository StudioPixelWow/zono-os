"use client";
// ============================================================================
// ZONO — Facebook Groups import panel. Lets a connected user import the groups
// they are a member of (via the paired Chrome extension), instead of typing them
// by hand. Real server actions only; honest states. Imported groups feed the
// canonical distribution_groups registry → campaigns → posts → jobs → events.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import {
  requestGroupScanAction, disconnectExtensionAction,
} from "@/lib/distribution/group-connection-actions";
import type { GroupConnectionOverview, SyncEventView } from "@/lib/distribution/group-import-service";

const ACTION_HE: Record<string, string> = {
  scan_requested: "התבקשה סריקה", scan_started: "סריקה החלה", group_imported: "קבוצה יובאה",
  group_updated: "קבוצה עודכנה", group_reactivated: "קבוצה הופעלה מחדש", group_archived: "קבוצה הועברה לארכיון",
  sync: "סנכרון", disconnect: "ניתוק", reconnect: "חיבור מחדש",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime(); if (Number.isNaN(t)) return "—";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "עכשיו"; if (min < 60) return `לפני ${min} ד׳`;
  const hr = Math.round(min / 60); if (hr < 24) return `לפני ${hr} ש׳`;
  return `לפני ${Math.round(hr / 24)} ימים`;
}

export function FacebookGroupsImportPanel({ overview, events }: { overview: GroupConnectionOverview; events: SyncEventView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!overview.ready) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg(res.error === "no_extension"
          ? "אין תוסף מחובר. חבר את תוסף ה-Chrome ל-ZONO תחילה (למעלה)."
          : (res.error ?? "הפעולה נכשלה"));
      } else setMsg(okMsg);
      router.refresh();
    });
  };

  const connected = overview.connected;

  return (
    <section dir="rtl" className="bg-card border-line mt-5 rounded-[22px] border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-brand-soft text-brand grid h-11 w-11 place-items-center rounded-2xl">
            <Icon name="Users" size={22} />
          </span>
          <div>
            <h2 className="text-ink text-lg font-black">ייבוא הקבוצות שלך מפייסבוק</h2>
            <p className="text-muted text-xs font-medium">
              ייבא אוטומטית את הקבוצות שאתה חבר בהן דרך תוסף ה-Chrome — במקום להזין ידנית.
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${connected ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>
          <Icon name={connected ? "BadgeCheck" : "Minus"} size={13} />
          {connected ? (overview.status === "ready" ? "מחובר · Facebook פעיל" : "תוסף מותקן") : "לא מחובר"}
        </span>
      </div>

      {msg && <div className="bg-brand-soft text-brand-strong mt-3 rounded-xl px-3 py-2 text-sm font-semibold">{msg}</div>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["קבוצות שיובאו", String(overview.groupsImported)],
          ["פרופיל", overview.facebookProfileName ?? "—"],
          ["סריקה אחרונה", timeAgo(overview.lastScanAt)],
          ["פעילות אחרונה", timeAgo(overview.lastSeenAt)],
        ].map(([l, v]) => (
          <div key={l} className="bg-surface rounded-xl px-3 py-2 text-center">
            <div className="text-ink line-clamp-1 text-sm font-black">{v}</div>
            <div className="text-muted text-[10px] font-bold">{l}</div>
          </div>
        ))}
      </div>

      {overview.scanRequested && (
        <div className="bg-warning-soft text-warning mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
          <Icon name="Loader" size={13} /> סריקה התבקשה — התוסף יבצע אותה כשהדפדפן פתוח עם Facebook מחובר.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={pending}
          onClick={() => run(requestGroupScanAction, "בקשת הייבוא נשלחה לתוסף. הקבוצות יופיעו כאן לאחר הסריקה.")}
          className="bg-brand inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50">
          <Icon name="Download" size={15} /> ייבא את הקבוצות שלי
        </button>
        <button type="button" disabled={pending} onClick={() => router.refresh()}
          className="bg-surface text-ink inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-50">
          <Icon name="RefreshCw" size={15} /> רענון
        </button>
        {connected && (
          <button type="button" disabled={pending}
            onClick={() => run(disconnectExtensionAction, "התוסף נותק. ניתן לחבר מחדש דרך תהליך ההתאמה למעלה.")}
            className="text-danger inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-50">
            <Icon name="Lock" size={15} /> נתק תוסף
          </button>
        )}
      </div>

      {!connected && (
        <p className="text-muted mt-3 text-xs">
          כדי לייבא קבוצות יש קודם לחבר את תוסף ה-Chrome של ZONO (חלק ״חיבור דרך התוסף״ למעלה) ולהיות מחובר ל-Facebook בדפדפן.
        </p>
      )}

      {/* Audit trail */}
      {events.length > 0 && (
        <div className="mt-5">
          <h3 className="text-ink mb-2 text-sm font-black">יומן ייבוא וסנכרון</h3>
          <div className="divide-line/60 divide-y">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink text-xs font-bold">{ACTION_HE[e.action] ?? e.action}</span>
                <span className="text-muted text-[11px]">
                  {typeof e.details?.members === "number" ? `${e.details.members} חברים · ` : ""}{timeAgo(e.occurredAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
