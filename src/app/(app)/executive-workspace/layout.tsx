// ============================================================================
// 🏛️ Executive Workspace layout — a thin RTL header frame around the composed
// page. Presentational only; the (app) shell already provides sidebar/header,
// auth and org context. No data fetching here.
// ============================================================================
import type { ReactNode } from "react";

export default function ExecutiveWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">סביבת העבודה הניהולית</h1>
        <p className="text-muted text-[12px]">כל מה שצריך החלטה, במסך אחד — מורכב ממנועי ZONO הקיימים, ללא חישוב מחדש.</p>
      </header>
      {children}
    </div>
  );
}
