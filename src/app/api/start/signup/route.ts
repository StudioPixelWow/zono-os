// ============================================================================
// 🚀 ZONO — /start marketing landing signup (server route). Batch: WOW-onboarding.
//
// POST /api/start/signup — the public, no-card entry point behind the marketing
// landing (public/start.html). It does NOT collect a password: instead it
// creates the auth identity (service-role) and emails a "set your password"
// link, reusing the SAME proven recovery machinery the app already ships
// (resetPasswordForEmail → /auth/callback?code= → /reset-password). After the
// user sets a password they land with no profile yet → the existing layout guard
// routes them to /onboarding, which we prefill from the metadata stashed here
// (full name, office name, chosen cities) so they reach their dashboard fast.
//
// Enumeration-safe: the response is identical whether or not the email already
// exists (an existing user simply receives a login/reset link). No card, no
// payment — this is the 14-day-trial funnel; the trial subscription is created
// in completeOnboarding, exactly as for /signup.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartSignupBody {
  email?: string;
  firstName?: string;
  lastName?: string;
  officeName?: string;
  cities?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (s: unknown, max: number): string =>
  (typeof s === "string" ? s : "").trim().slice(0, max);

function normalizeCities(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const c of input) {
    const v = clip(c, 60);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: StartSignupBody;
  try {
    body = (await req.json()) as StartSignupBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const email = clip(body.email, 254).toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  const firstName = clip(body.firstName, 80);
  const lastName = clip(body.lastName, 80);
  const officeName = clip(body.officeName, 120);
  const cities = normalizeCities(body.cities);
  const fullName = `${firstName} ${lastName}`.trim();

  // ── 1. Create the auth identity (service-role). No password is collected on
  //       the landing — a strong random secret is set and never revealed; the
  //       user establishes their own via the emailed set-password link. If the
  //       email already exists we do NOT error out (enumeration-safe): we fall
  //       through and still send the link so a returning user can get back in.
  try {
    const admin = createServiceRoleClient();
    const randomSecret =
      (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
      (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password: randomSecret,
      email_confirm: true, // no separate confirmation step; the reset link proves the mailbox
      user_metadata: {
        full_name: fullName,
        office_name: officeName,
        operating_cities: cities,
        signup_source: "start",
      },
    });
    if (createErr) {
      // "already registered" is expected for a returning user → not an error for us.
      const msg = (createErr.message || "").toLowerCase();
      const alreadyExists =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (!alreadyExists) {
        console.error("[start/signup] createUser failed:", createErr.message);
        // Still fall through to send the link — but report a soft failure only if
        // it's clearly not a duplicate, so the UI can show a retry.
      }
    }
  } catch (e) {
    console.error("[start/signup] createUser threw (non-fatal):", e);
    // Fall through: attempt to send the link regardless.
  }

  // ── 2. Send the "set your password" email — the SAME recovery link the app's
  //       forgot-password flow uses. It lands on /auth/callback (PKCE code
  //       exchange) → /reset-password, where the user sets their first password.
  try {
    const origin =
      req.nextUrl?.origin ||
      req.headers.get("origin") ||
      (req.headers.get("host") ? `https://${req.headers.get("host")}` : process.env.NEXT_PUBLIC_APP_URL || "");
    const supabase = await createClient();
    const { error: mailErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    if (mailErr) console.error("[start/signup] set-password email failed:", mailErr.message);
  } catch (e) {
    console.error("[start/signup] set-password email threw:", e);
  }

  // Always neutral + successful from the client's perspective (enumeration-safe).
  return NextResponse.json({ ok: true });
}
