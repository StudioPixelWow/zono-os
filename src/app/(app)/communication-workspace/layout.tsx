// ============================================================================
// 💬 Communication Workspace layout — thin RTL header frame. Presentational
// only; the (app) shell provides sidebar/header, auth and org context. No data
// fetching here. Same design language as the Executive / Broker workspaces.
// ============================================================================
import type { ReactNode } from "react";

export default function CommunicationWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">מרכז התקשורת</h1>
        <p className="text-muted text-[12px]">תיבת דואר אחת מעל כל הערוצים — לקוח אחד, היסטוריה אחת. מורכב אך ורק ממנוע התקשורת הקנוני, ללא סנכרון וללא לוגיקה עסקית.</p>
      </header>
      {children}
    </div>
  );
}
