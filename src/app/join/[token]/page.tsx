import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { JoinAcceptButton } from "./JoinAcceptButton";

export const dynamic = "force-dynamic";

/** Public invitation landing page. Validates the token; if the invited person
 *  is signed in with the matching email, they can join in one click. Otherwise
 *  it routes them to sign up with the invited email (token carried through). */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  interface Invite { email: string; role_key: string; status: string; org_id: string; full_name: string | null }
  let invite: Invite | null = null;
  let orgName = "";
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("org_invitations")
      .select("email,role_key,status,org_id,full_name")
      .eq("token", token)
      .maybeSingle();
    invite = (data as unknown as Invite | null) ?? null;
    if (invite) {
      const { data: org } = await supabase.from("organizations").select("name").eq("id", invite.org_id).maybeSingle();
      orgName = (org as { name?: string } | null)?.name ?? "";
    }
  } catch (e) {
    console.error("[join] lookup failed:", e);
  }

  const valid = invite && invite.status === "pending";
  const authUser = await getAuthUser();
  const emailMatches = !!authUser && !!invite && (authUser.email ?? "").toLowerCase() === invite.email.toLowerCase();

  return (
    <main dir="rtl" className="bg-surface flex min-h-screen items-center justify-center p-6">
      <div className="bg-card border-line w-full max-w-md rounded-[24px] border p-8 text-center shadow-sm">
        <div className="bg-brand text-white mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl text-lg font-black">Z</div>
        {valid ? (
          <>
            <h1 className="text-ink text-2xl font-black">הוזמנת להצטרף{orgName ? ` ל${orgName}` : ""}</h1>
            <p className="text-muted mt-3 text-sm leading-relaxed">
              {invite?.full_name ? `${invite.full_name}, ` : ""}הוזמנת כ{roleLabel(invite!.role_key)}
              {" "}עם האימייל <span className="text-ink font-bold" dir="ltr">{invite!.email}</span>.
            </p>
            {authUser ? (
              emailMatches ? (
                <div className="mt-6"><JoinAcceptButton token={token} /></div>
              ) : (
                <p className="bg-warning-soft text-warning mt-6 rounded-xl px-3 py-2 text-sm font-semibold">
                  את/ה מחובר/ת עם אימייל אחר. התנתק/י והירשם/י עם <span dir="ltr">{invite!.email}</span>.
                </p>
              )
            ) : (
              <Link href={`/signup?invite=${encodeURIComponent(token)}`} className="bg-brand hover:bg-brand-strong mt-6 inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold text-white">
                המשך להרשמה
              </Link>
            )}
          </>
        ) : (
          <>
            <h1 className="text-ink text-2xl font-black">ההזמנה אינה תקפה</h1>
            <p className="text-muted mt-3 text-sm">הקישור אינו תקף, פג תוקפו או שכבר נעשה בו שימוש. בקש/י מהמשרד קישור חדש.</p>
            <Link href="/login" className="text-brand-strong mt-6 inline-block text-sm font-bold">חזרה להתחברות</Link>
          </>
        )}
      </div>
    </main>
  );
}

function roleLabel(key: string): string {
  const map: Record<string, string> = { owner: "בעלים", admin: "מנהל מערכת", manager: "מנהל", agent: "סוכן", viewer: "צופה" };
  return map[key] ?? "סוכן";
}
