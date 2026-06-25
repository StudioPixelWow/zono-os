import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { usageSummaryAction, listFeedbackAction, listImpersonationAction } from "@/lib/launch/server/actions";
import { SupportView } from "./SupportView";

export const dynamic = "force-dynamic";

export default async function SupportRoute() {
  const [usage, feedback, imp] = await Promise.all([usageSummaryAction(30), listFeedbackAction(), listImpersonationAction()]);
  if (!usage.ok) {
    return (
      <div className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Shield" size={24} /></span>
        <p className="text-ink font-extrabold">אין הרשאה</p>
        <p className="text-muted text-sm">{usage.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return (
    <SupportView
      usage={usage.data}
      feedback={feedback.ok ? feedback.data.rows : []}
      impersonation={imp.ok ? imp.data.rows : []}
    />
  );
}
