"use client";
// ============================================================================
// ZONO — Facebook Groups import panel. Lets a connected user import the groups
// they are a member of (via the paired Chrome extension), instead of typing them
// by hand, and pick — per group — whether ZONO may publish to it (yes/no).
// Real server actions only; honest states. Imported groups feed the canonical
// distribution_groups registry → campaigns → posts → jobs → events.
// ============================================================================
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import {
  requestGroupScanAction, disconnectExtensionAction, setGroupPublishSelectionAction,
} from "@/lib/distribution/group-connection-actions";
import type { GroupConnectionOverview, SyncEventView, ImportedGroupView } from "@/lib/distribution/group-import-service";

const ACTION_HE: Record<string, string> = {
  scan_requested: "התבקשה סריקה", scan_started: "סריקה החלה", group_imported: "קבוצה יובאה",
  group_updated: "קבוצה עודכנה", group_reactivated: "קבוצה הופעלה מחדש", group_archived: "קבוצה הועברה לארכיון",
  group_selected: "נבחרה לפרסום", group_unselected: "הוסרה מפרסום",
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

export function FacebookGroupsImportPanel({ overview, events, groups = [] }: { overview: GroupConnectionOverview; events: SyncEventView[]; groups?: ImportedGroupView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Local, optimistic copy of the group list so a toggle feels instant.
  const [groupList, setGroupList] = useState<ImportedGroupView[]>(groups);
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [onlySelected, setOnlySelected] = useState(false);

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

  const selectedCount = useMemo(() => groupList.filter((g) => g.selected).length, [groupList]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return groupList.filter((g) => (!onlySelected || g.selected) && (!term || g.name.toLowerCase().includes(term)));
  }, [groupList, q, onlySelected]);

  function toggleGroup(id: string, next: boolean) {
    setSavingId(id);
    setMsg(null);
    setGroupList((l) => l.map((g) => (g.id === id ? { ...g, selected: next, status: next ? "active" : "discovered" } : g)));
    startTransition(async () => {
      const res = await setGroupPublishSelectionAction(id, next);
      if (!res.ok) {
        // revert optimistic change on failure
        setGroupList((l) => l.map((g) => (g.id === id ? { ...g, selected: !next, status: !next ? "active" : "discovered" } : g)));
        setMsg(res.error ?? "עדכון הבחירה נכשל");
      }
      setSavingId(null);
    });
  }

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
              ייבא את הקבוצות שאתה חבר בהן דרך תוסף ה-Chrome, וסמן לאילו קבוצות מותר ל-ZONO לפרסם.
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
          ["נבחרו לפרסום", String(selectedCount)],
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
          <Icon name="Download" size={15} /> ייבא / רענן קבוצות
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

      {/* ── The groups themselves: name + a yes/no publish toggle per group ── */}
      {groupList.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-ink text-sm font-black">הקבוצות שלי — בחר לאן לפרסם</h3>
            <span className="text-muted text-xs font-bold">{selectedCount} מתוך {groupList.length} נבחרו</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="bg-surface border-line flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2">
              <Icon name="Search" size={14} className="text-muted shrink-0" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="חפש קבוצה לפי שם…"
                className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <button type="button" onClick={() => setOnlySelected((v) => !v)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${onlySelected ? "bg-brand text-white" : "bg-surface text-ink"}`}>
              {onlySelected ? "מציג נבחרות" : "רק נבחרות"}
            </button>
          </div>

          <div className="border-line divide-line/60 max-h-[420px] divide-y overflow-y-auto rounded-xl border">
            {filtered.length === 0 ? (
              <p className="text-muted p-4 text-center text-sm">לא נמצאו קבוצות תואמות.</p>
            ) : filtered.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-bold">{g.name || "קבוצה ללא שם"}</p>
                  <p className="text-muted truncate text-[11px]">
                    {g.membersCount ? `${g.membersCount.toLocaleString("he-IL")} חברים · ` : ""}
                    {g.selected ? "מפורסם" : "לא מפורסם"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-[11px] font-bold ${g.selected ? "text-success" : "text-muted"}`}>
                    {g.selected ? "כן" : "לא"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={g.selected}
                    aria-label={g.selected ? "בטל פרסום לקבוצה זו" : "אפשר פרסום לקבוצה זו"}
                    disabled={savingId === g.id}
                    onClick={() => toggleGroup(g.id, !g.selected)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${g.selected ? "bg-brand" : "bg-line"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${g.selected ? "start-0.5" : "start-[22px]"}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-muted mt-2 text-[11px]">
            רק קבוצות שסומנו ״כן״ ייכללו בפרסום ובתזמון היומי. אפשר לשנות בכל עת.
          </p>
        </div>
      )}

      {/* Audit trail — secondary, collapsed by default */}
      {events.length > 0 && (
        <details className="mt-5">
          <summary className="text-ink cursor-pointer text-sm font-black">יומן ייבוא וסנכרון</summary>
          <div className="divide-line/60 mt-2 divide-y">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink text-xs font-bold">{ACTION_HE[e.action] ?? e.action}</span>
                <span className="text-muted text-[11px]">
                  {typeof e.details?.members === "number" ? `${e.details.members} חברים · ` : ""}{timeAgo(e.occurredAt)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
