// Shared "no permission" view for org-admin tooling pages (P5.0 hardening).
export function AdminDenied() {
  return (
    <div dir="rtl" className="grid min-h-[50vh] place-items-center">
      <div className="border-line bg-card rounded-[22px] border p-8 text-center">
        <p className="text-ink text-lg font-black">אין הרשאה</p>
        <p className="text-muted mt-1 text-sm">כלי הניהול זמינים למנהלי מערכת בלבד.</p>
      </div>
    </div>
  );
}
