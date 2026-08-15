/**
 * QA lead — server-authoritative EXTERNAL-DELIVERY suppression (P9.6C).
 *
 * A lead submitted through the real public site may suppress EXTERNAL delivery
 * (WhatsApp / email / SMS / marketing automation) for QA — but ONLY when it
 * presents the secret QA token that matches the server-side env secret
 * (`ZONO_QA_LEAD_TOKEN`). A random public visitor cannot disable production
 * automations: a missing/weak env secret or a wrong token always returns false,
 * so normal public leads behave EXACTLY as before.
 */
export function isQaSuppressAuthorized(
  token: string | null | undefined,
  envToken: string | null | undefined,
): boolean {
  // No secret configured (or too weak to be a real secret) → never suppress.
  if (!envToken || typeof envToken !== "string" || envToken.length < 16) return false;
  if (!token || typeof token !== "string") return false;
  if (token.length !== envToken.length) return false;
  // Constant-time compare — don't leak length/prefix via early-exit timing.
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ envToken.charCodeAt(i);
  return diff === 0;
}
