// ============================================================================
// 🚀 ZONO — /start marketing landing signup (server route). No-card trial funnel.
//
// POST /api/start/signup — creates the auth identity (service-role) and emails a
// branded WELCOME + "set your password" link. It does NOT use the browser PKCE
// recovery flow (a server-generated PKCE link fails with otp_expired because the
// browser holds no code_verifier). Instead it uses the OFFICIAL server pattern:
//   admin.generateLink({type:'recovery'}) → take the one-time `hashed_token`
//   → email our own link to /auth/confirm?token_hash=…&type=recovery&next=/reset-password
//   → /auth/confirm verifies with verifyOtp (works in ANY browser, no PKCE, no
//     Supabase redirect-allowlist dependency) → user lands on /reset-password.
//
// The email is sent through the app's OWN Resend transport (same one the app
// already uses), so wording/branding is fully controlled and it does not reuse
// Supabase's "reset password" template. Enumeration-safe: identical response
// whether or not the email already existed. No card, no payment — the 14-day
// trial subscription is created later in completeOnboarding.
// ============================================================================
import { renderZonoEmail } from "@/lib/email/shell";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartSignupBody {
  email?: string; firstName?: string; lastName?: string; officeName?: string; cities?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (s: unknown, max: number): string => (typeof s === "string" ? s : "").trim().slice(0, max);

function normalizeCities(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const c of input) { const v = clip(c, 60); if (v && !out.includes(v)) out.push(v); if (out.length >= 20) break; }
  return out;
}

function appBase(req: NextRequest): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  return req.nextUrl?.origin || (req.headers.get("host") ? `https://${req.headers.get("host")}` : "");
}

/** Branded Hebrew welcome + set-password email, sent via the app's Resend transport. */
async function sendWelcomeSetupEmail(to: string, fullName: string, url: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error("[start/signup] RESEND_API_KEY not configured — cannot send setup email"); return false; }
  const from = process.env.RESEND_FROM || "ZONO <noreply@zono.co.il>";
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  const html = renderZonoEmail({
    preheader: `היי${first ? " " + first : ""}, ZI כבר סרק את הזירה שלך — נותר רק לקבוע סיסמה.`,
    eyebrow: "ברוכים הבאים ל‑ZONO",
    heading: `היי${first ? " " + first : ""},<br>הזון שלך כבר מוכן 🎉`,
    ziPose: "celebrate",
    ziSays: "כבר סרקתי את הזירה שלך והתחלתי למפות את הנכסים, המתווכים והמשרדים באזור שלך. נותר רק צעד אחד קטן — לקבוע סיסמה, ואתה בפנים.",
    bodyHtml: `החשבון שלך נפתח. לחיצה אחת ואתה בתוך מערכת ההפעלה החכמה לנדל״ן — עם הזירה שלך כבר ממופה ומחכה.`,
    cta: { label: "קביעת סיסמה וכניסה למערכת ←", url },
    footnote: `אם הכפתור לא עובד, העתק את הקישור לדפדפן:<br><a href="${url}" style="color:#7c3aed;word-break:break-all">${url}</a><br><br>הקישור תקף לזמן מוגבל. אם לא ביקשת להירשם ל‑ZONO, אפשר להתעלם מהמייל הזה.`,
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: "ברוכים הבאים ל‑ZONO — קביעת סיסמה וכניסה", html }),
    });
    if (!res.ok) { console.error("[start/signup] Resend send failed:", res.status); return false; }
    return true;
  } catch (e) { console.error("[start/signup] Resend send threw:", e); return false; }
}

export async function POST(req: NextRequest) {
  let body: StartSignupBody;
  try { body = (await req.json()) as StartSignupBody; }
  catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }

  const email = clip(body.email, 254).toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  const firstName = clip(body.firstName, 80);
  const lastName = clip(body.lastName, 80);
  const officeName = clip(body.officeName, 120);
  const cities = normalizeCities(body.cities);
  const fullName = `${firstName} ${lastName}`.trim();

  const admin = createServiceRoleClient();

  // 1. Ensure the auth identity exists (no password collected here; a strong
  //    random secret is set and never revealed). Idempotent for a returning user.
  const randomSecret =
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  const { error: createErr } = await admin.auth.admin.createUser({
    email, password: randomSecret, email_confirm: true,
    user_metadata: { full_name: fullName, office_name: officeName, operating_cities: cities, signup_source: "start" },
  });
  if (createErr) {
    const msg = (createErr.message || "").toLowerCase();
    const exists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!exists) console.error("[start/signup] createUser failed:", createErr.message);
    // If it already exists we still send a set-password/login link below.
  }

  // 2. Generate a one-time recovery token (server-side) and email OUR OWN branded
  //    link to /auth/confirm (verifyOtp) — no PKCE, no Supabase redirect allowlist.
  try {
    const base = appBase(req);
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery", email,
      options: { redirectTo: `${base}/reset-password` },
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      console.error("[start/signup] generateLink failed:", linkErr?.message ?? "no hashed_token");
    } else {
      const url = `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent("/reset-password")}`;
      await sendWelcomeSetupEmail(email, fullName, url);
    }
  } catch (e) {
    console.error("[start/signup] link/email step threw:", e);
  }

  // Always neutral + successful from the client's perspective (enumeration-safe).
  return NextResponse.json({ ok: true });
}
