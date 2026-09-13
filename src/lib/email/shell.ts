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
  // Every text cell is EXPLICITLY dir="rtl" + right-aligned (align attr + inline
  // style), because Gmail/Outlook frequently ignore <html dir="rtl">. Belt and
  // suspenders so Hebrew always reads right-to-left in every client.
  const cta = o.cta
    ? `<tr><td align="center" dir="rtl" style="padding:30px 32px 6px;text-align:center">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
          <td bgcolor="#7c3aed" align="center" style="background:#7c3aed;background:linear-gradient(90deg,#6d28d9,#a855f7);border-radius:999px;box-shadow:0 14px 32px -10px rgba(124,58,237,.65)">
            <a href="${o.cta.url}" style="display:inline-block;padding:18px 46px;color:#ffffff;font-size:18px;font-weight:800;text-decoration:none;letter-spacing:.2px">${o.cta.label}</a>
          </td></tr></table></td></tr>`
    : "";
  const bubble = o.ziSays
    ? `<tr><td dir="rtl" align="right" style="padding:26px 32px 0;text-align:right">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td dir="rtl" align="right" style="background:#f4f0ff;border:1px solid #ece5ff;border-radius:18px;padding:18px 20px;text-align:right;direction:rtl">
            <div style="font-size:13px;font-weight:800;color:#7c3aed;letter-spacing:.4px;text-align:right;direction:rtl">ZI · העוזר החכם שלך</div>
            <div style="font-size:16.5px;line-height:1.75;color:#3a2f57;margin-top:8px;text-align:right;direction:rtl">${o.ziSays}</div>
          </td></tr></table></td></tr>`
    : "";
  const foot = o.footnote
    ? `<tr><td dir="rtl" align="right" style="padding:18px 32px 4px;text-align:right"><div style="font-size:12.5px;color:#a49dba;line-height:1.7;text-align:right;direction:rtl">${o.footnote}</div></td></tr>`
    : "";

  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body dir="rtl" style="margin:0;padding:0;background:#efeafb;direction:rtl;text-align:right;font-family:Arial,'Segoe UI',Helvetica,sans-serif;color:#160f2e">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${o.preheader}</div>
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="background:#efeafb;direction:rtl"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" dir="rtl" width="580" cellpadding="0" cellspacing="0" style="width:580px;max-width:100%;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px -26px rgba(76,29,149,.5);direction:rtl">
      <!-- DARK PREMIUM HERO -->
      <tr><td bgcolor="#160f2e" style="background:#160f2e;background:linear-gradient(140deg,#140f2b 0%,#2a1a5e 52%,#5b21b6 100%);padding:0">
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="direction:rtl"><tr>
          <td dir="rtl" align="right" style="padding:34px 32px 32px;text-align:right;direction:rtl" width="60%" valign="middle">
            <div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:2px;text-align:right;direction:rtl">ZONO</div>
            ${o.eyebrow ? `<div style="color:#c4b5fd;font-size:13px;font-weight:700;letter-spacing:.8px;margin-top:20px;text-align:right;direction:rtl">${o.eyebrow}</div>` : `<div style="height:16px"></div>`}
            <div style="color:#ffffff;font-size:31px;line-height:1.28;font-weight:800;margin-top:8px;text-align:right;direction:rtl">${o.heading}</div>
          </td>
          <td width="40%" valign="middle" align="center" style="padding:22px 10px">
            ${zi ? `<img src="${zi}" width="168" alt="ZI — העוזר החכם של ZONO" style="display:block;border:0;outline:none;width:168px;max-width:100%;height:auto">` : `<div style="color:#c4b5fd;font-size:12px">ZI</div>`}
          </td>
        </tr></table>
        <div style="height:5px;background:linear-gradient(90deg,#a855f7,#6d28d9,#22d3ee)"></div>
      </td></tr>
      ${bubble}
      <!-- BODY -->
      <tr><td dir="rtl" align="right" style="padding:26px 32px 0;font-size:17px;line-height:1.8;color:#4b4363;text-align:right;direction:rtl">${o.bodyHtml}</td></tr>
      ${cta}
      ${foot}
      <tr><td style="padding:24px 32px 28px"></td></tr>
      <tr><td bgcolor="#0f0a22" align="center" style="background:#0f0a22;text-align:center;padding:22px">
        <div style="color:#b8aee0;font-size:15px;font-weight:800;letter-spacing:1.5px">ZONO</div>
        <div style="color:#6f6597;font-size:12.5px;margin-top:4px">מערכת ההפעלה החכמה לנדל״ן</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
