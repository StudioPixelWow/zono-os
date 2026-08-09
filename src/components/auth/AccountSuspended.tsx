// Full-screen block shown to a suspended/disabled account (P5.3). Rendered by
// the app layout INSTEAD of the app when the session guard returns "suspended",
// so a blocked user cannot reach any in-app screen. Offers only sign-out.
import { signOut } from "@/lib/auth/actions";
import { Icon } from "@/components/dashboard/Icon";

export function AccountSuspended() {
  return (
    <div dir="rtl" className="bg-surface grid min-h-screen place-items-center p-6">
      <div className="border-line bg-card w-full max-w-md rounded-3xl border p-8 text-center">
        <span className="bg-danger-soft text-danger mx-auto grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Lock" size={26} /></span>
        <h1 className="text-ink mt-4 text-xl font-black">החשבון מושהה</h1>
        <p className="text-muted mt-2 text-sm">הגישה לחשבון זה הושעתה. לפרטים נוספים יש לפנות למנהל הארגון או לתמיכת ZONO.</p>
        <form action={signOut} className="mt-5">
          <button type="submit" className="btn-zono-secondary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold">
            <Icon name="ArrowLeft" size={15} />התנתקות
          </button>
        </form>
      </div>
    </div>
  );
}
