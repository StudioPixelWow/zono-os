// ============================================================================
// 👤 Broker Workspace layout — a thin RTL header frame around the composed page.
// Presentational only; the (app) shell provides sidebar/header, auth and org
// context. No data fetching here. Same design language as the Executive
// Workspace.
// ============================================================================
import type { ReactNode } from "react";

export default function BrokerWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">סביבת העבודה שלי</h1>
        <p className="text-muted text-[12px]">הבוקר שלך במסך אחד — הקונים, המוכרים, המסעות והמשימות שלך בלבד. מורכב ממנועי ZONO הקיימים, ללא חישוב מחדש.</p>
      </header>
      {children}
    </div>
  );
}
