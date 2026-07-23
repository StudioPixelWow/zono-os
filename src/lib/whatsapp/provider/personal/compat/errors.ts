// ============================================================================
// 📘 C9 COMPAT — Evolution ERROR normalization (server-only, pure).
// ----------------------------------------------------------------------------
// Turns Evolution HTTP failures into a small, STABLE internal error category the
// adapter and UI can reason about without knowing Evolution. New Evolution error
// shapes are absorbed here only.
// ============================================================================

/** Stable internal error categories surfaced above the compat boundary. */
export type PersonalErrorCategory =
  | "unavailable"      // worker not configured / unreachable
  | "auth"             // Evolution rejected our apikey
  | "not_found"        // instance/session missing
  | "rate_limited"     // Evolution/WhatsApp throttled us
  | "invalid"          // bad request / unsupported
  | "session_dead"     // needs re-pair (QR)
  | "network"          // timeout / connection error
  | "unknown";

export interface PersonalError { category: PersonalErrorCategory; message: string }

/** Classify an HTTP status + body snippet into a stable category. */
export function classifyHttp(status: number, bodySnippet: string): PersonalError {
  const b = bodySnippet.toLowerCase();
  if (status === 401 || status === 403) return { category: "auth", message: "unauthorized" };
  if (status === 404) return { category: "not_found", message: "instance_not_found" };
  if (status === 429) return { category: "rate_limited", message: "rate_limited" };
  if (/logged out|not connected|close|qr|pairing/.test(b)) return { category: "session_dead", message: "session_requires_repair" };
  if (status >= 400 && status < 500) return { category: "invalid", message: "invalid_request" };
  if (status >= 500) return { category: "unknown", message: "evolution_error" };
  return { category: "unknown", message: "unknown" };
}

/** A short, non-sensitive Hebrew label for a category (safe for the UI). */
export function errorLabel(cat: PersonalErrorCategory): string {
  switch (cat) {
    case "unavailable": return "השירות אינו פעיל";
    case "auth": return "אימות מול השרת נכשל";
    case "not_found": return "לא נמצאה התחברות";
    case "rate_limited": return "יותר מדי בקשות — נסה שוב מאוחר יותר";
    case "invalid": return "בקשה לא תקינה";
    case "session_dead": return "נדרש חיבור מחדש (סריקת QR)";
    case "network": return "שגיאת רשת";
    default: return "שגיאה";
  }
}
