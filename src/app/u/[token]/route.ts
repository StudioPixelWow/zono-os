// ============================================================================
// ZONO — Public one-click UNSUBSCRIBE for outbound customer messages.
// GET /u/<signed-token> — verifies the HMAC token (no auth, no DB lookup needed
// to validate) and records an opt-out for that contact+channel via service role.
// Compliance requirement for the conservative consent model. Idempotent.
// ============================================================================
import { verifyUnsubToken } from "@/lib/customer-comm/unsubscribe";
import { setConsent, type CustomerChannel } from "@/lib/customer-comm/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string, ok: boolean): Response {
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="background:#fff;max-width:420px;margin:16px;padding:32px;border-radius:20px;box-shadow:0 8px 30px -18px rgba(15,23,42,.4);text-align:center">
<div style="font-size:40px">${ok ? "✅" : "⚠️"}</div>
<h1 style="color:#0f172a;font-size:20px;margin:12px 0 8px">${title}</h1>
<p style="color:#475569;font-size:15px;line-height:1.6;margin:0">${message}</p>
</div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyUnsubToken(token);
  if (!p) return page("קישור לא תקין", "הקישור להסרה אינו תקין או שפג תוקפו. אפשר לפנות למשרד להסרה ידנית.", false);

  const channels: CustomerChannel[] = p.ch === "all" ? ["email", "whatsapp"] : [p.ch];
  const channelLabel = p.ch === "all" ? "אימייל ו-WhatsApp" : p.ch === "whatsapp" ? "WhatsApp" : "אימייל";
  try {
    for (const ch of channels) await setConsent(p.o, p.t, p.c, ch, "opted_out", "unsubscribe_link");
  } catch {
    return page("שגיאה זמנית", "לא הצלחנו לעדכן את ההעדפה כרגע. אפשר לנסות שוב מאוחר יותר או לפנות למשרד.", false);
  }
  // Honest scope: opting out stops ZONO's automatic messages on this channel entirely.
  // The agent can still reach the customer directly; renewal is via the office.
  return page("העדפת התקשורת עודכנה ✓", `הפסקנו לשלוח אליכם הודעות אוטומטיות בערוץ ${channelLabel}. הסוכן/ת שלכם עדיין יכול/ה ליצור קשר ישירות. לחידוש הקבלה — אפשר לפנות למשרד.`, true);
}
