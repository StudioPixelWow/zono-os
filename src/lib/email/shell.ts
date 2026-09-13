// ============================================================================
// ZONO — SHARED transactional email shell. Every ZONO email (welcome, password,
// invoice, invite, notification…) renders through renderZonoEmail so they all
// carry the same premium, ZI-fronted look as the app. Email-client-safe: table
// layout, inline styles, a SOLID dark bgcolor under every gradient (Outlook
// ignores gradients), and the ZI character is an ENHANCEMENT — the mail reads
// fully if images are blocked.
// ============================================================================

export type ZiPose =
  | "celebrate" | "success" | "pointing" | "scanning" | "thinking" | "alert" | "empty" | "login-access";

export interface ZonoEmailOptions {
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  /** Small uppercase label above the heading (e.g. "ברוכים הבאים"). */
  eyebrow?: string;
  /** The big white headline in the dark hero. */
  heading: string;
  /** ZI pose for the hero. Defaults to celebrate. */
  ziPose?: ZiPose;
  /** Optional ZI speech-bubble line (adds the "ZI · העוזר החכם שלך" bubble). */
  ziSays?: string;
  /** Main body — safe inline HTML (already escaped by the caller). */
  bodyHtml: string;
  /** Primary button. */
  cta?: { label: string; url: string };
  /** Small print under the button (link fallback, expiry, legal…). */
  footnote?: string;
}

const BASE = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
const ziUrl = (pose: ZiPose): string => (BASE ? `${BASE}/characters/zi/zi-${pose}.png` : "");

/**
 * Render a full ZONO email. Premium DARK hero (deep purple, glowing ZI) over a
 * light premium card — the same visual language as the app's hero.
 */
export function renderZonoEmail(o: ZonoEmailOptions): string {
  const zi = ziUrl(o.ziPose ?? "celebrate");
  const cta = o.cta
    ? `<tr><td align="center" style="padding:26px 30px 4px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td bgcolor="#7c3aed" style="background:#7c3aed;background:linear-gradient(90deg,#6d28d9,#a855f7);border-radius:999px;box-shadow:0 12px 28px -10px rgba(124,58,237,.6)">
            <a href="${o.cta.url}" style="display:inline-block;padding:15px 36px;color:#ffffff;font-size:16px;font-weight:800;text-decoration:none">${o.cta.label}</a>
          </td></tr></table></td></tr>`
    : "";
  const bubble = o.ziSays
    ? `<tr><td style="padding:24px 30px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#f4f0ff;border:1px solid #ece5ff;border-radius:16px;padding:15px 18px">
            <div style="font-size:11.5px;font-weight:800;color:#7c3aed;letter-spacing:.4px">ZI · העוזר החכם שלך</div>
            <div style="font-size:14.5px;line-height:1.65;color:#3a2f57;margin-top:6px">${o.ziSays}</div>
          </td></tr></table></td></tr>`
    : "";
  const foot = o.footnote
    ? `<tr><td style="padding:16px 30px 4px"><div style="font-size:11.5px;color:#a49dba;line-height:1.6">${o.footnote}</div></td></tr>`
    : "";

  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#efeafb;font-family:Arial,'Segoe UI',Helvetica,sans-serif;color:#160f2e">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${o.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeafb"><tr><td align="center" style="padding:30px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:26px;overflow:hidden;box-shadow:0 24px 60px -26px rgba(76,29,149,.5)">
      <!-- DARK PREMIUM HERO -->
      <tr><td bgcolor="#160f2e" style="background:#160f2e;background:linear-gradient(140deg,#140f2b 0%,#2a1a5e 52%,#5b21b6 100%);padding:0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:32px 30px 30px" width="62%" valign="middle">
            <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:2px">ZONO</div>
            ${o.eyebrow ? `<div style="color:#c4b5fd;font-size:11.5px;font-weight:700;letter-spacing:.8px;margin-top:18px">${o.eyebrow}</div>` : `<div style="height:14px"></div>`}
            <div style="color:#ffffff;font-size:24px;line-height:1.35;font-weight:800;margin-top:6px">${o.heading}</div>
          </td>
          <td width="38%" valign="middle" align="center" style="padding:20px 10px">
            ${zi ? `<img src="${zi}" width="150" alt="ZI — העוזר החכם של ZONO" style="display:block;border:0;outline:none;width:150px;max-width:100%;height:auto">` : `<div style="color:#c4b5fd;font-size:12px">ZI</div>`}
          </td>
        </tr></table>
        <div style="height:4px;background:linear-gradient(90deg,#a855f7,#6d28d9,#22d3ee)"></div>
      </td></tr>
      ${bubble}
      <!-- BODY -->
      <tr><td style="padding:22px 30px 0;font-size:15px;line-height:1.7;color:#4b4363">${o.bodyHtml}</td></tr>
      ${cta}
      ${foot}
      <tr><td style="padding:22px 30px 26px"></td></tr>
      <tr><td bgcolor="#0f0a22" style="background:#0f0a22;text-align:center;padding:18px">
        <div style="color:#b8aee0;font-size:13px;font-weight:800;letter-spacing:1.5px">ZONO</div>
        <div style="color:#6f6597;font-size:11px;margin-top:3px">מערכת ההפעלה החכמה לנדל״ן</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
