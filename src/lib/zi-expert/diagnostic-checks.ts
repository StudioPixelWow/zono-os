// ============================================================================
// ZI Expert™ Diagnostics — issue-detection rules (Phase 24, PURE / client-safe).
// Deterministic checks: given a safe signal snapshot + the issue type, produce
// findings, a likely cause, status and next steps. No data access, no actions.
// ============================================================================
import { ROLE_RANK } from "./permissions";
import type {
  DiagnosticFinding, DiagnosticSignals, DiagnosticStatus, FindingSeverity, IssueType,
} from "./diagnostic-types";

const f = (id: string, severity: FindingSeverity, title: string, detail: string, fixHint?: string): DiagnosticFinding =>
  ({ id, severity, title, detail, fixHint: fixHint ?? null });

const STALE_MS = 26 * 60 * 60 * 1000; // a sync older than ~26h is "stale"

function syncFindings(s: DiagnosticSignals): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  if (!s.hasApifyToken) out.push(f("apify_missing", "critical", "ספק הסריקה לא מוגדר", "APIFY_TOKEN חסר — אין מקור לנתוני שוק חיצוניים.", "הגדר APIFY_TOKEN ב‑env והרץ סנכרון."));
  if (!s.lastSync) out.push(f("no_sync", "warning", "לא בוצע סנכרון", "לא נמצאה ריצת סנכרון אחרונה.", "הפעל 'סנכרון' במסך המודעות החיצוניות."));
  else {
    if (s.lastSync.status === "failed") out.push(f("sync_failed", "critical", "הסנכרון האחרון נכשל", `שגיאה: ${s.lastSync.error ?? "לא ידועה"}.`, "בדוק את כלי ה‑debug של הספק והרץ שוב."));
    else if (s.lastSync.status === "running") out.push(f("sync_running", "info", "סנכרון בריצה", "סנכרון פעיל כרגע — ייתכן שהנתונים עדיין נטענים.", "המתן לסיום הסנכרון."));
    const fin = s.lastSync.finishedAt ? Date.parse(s.lastSync.finishedAt) : 0;
    if (fin && Date.now() - fin > STALE_MS) out.push(f("sync_stale", "warning", "הנתונים מהסנכרון אינם טריים", "הסנכרון האחרון הסתיים לפני יותר מ‑26 שעות.", "ודא שה‑cron פעיל או הרץ סנכרון ידני."));
  }
  if (!s.hasCronSecret) out.push(f("cron_secret_missing", "warning", "סנכרון אוטומטי לא מאומת", "CRON_SECRET חסר — ריצות ה‑cron עלולות לא לרוץ.", "הגדר CRON_SECRET ב‑env."));
  return out;
}

function aiFindings(s: DiagnosticSignals): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  if (s.aiDisabled) out.push(f("ai_disabled", "warning", "ה‑AI כבוי", "ZONO_AI_DISABLED מופעל — פועל מצב fallback דטרמיניסטי.", "כבה את ZONO_AI_DISABLED כדי להפעיל AI."));
  else if (!s.hasAiProvider) out.push(f("ai_no_key", "warning", "לא מוגדר ספק AI", "אין OPENAI_API_KEY או ANTHROPIC_API_KEY — ZI עובד במצב fallback.", "הגדר מפתח AI ב‑env."));
  else out.push(f("ai_ok", "ok", "ספק AI מוגדר", "קיים מפתח AI פעיל.", undefined));
  return out;
}

function operatingAreaFinding(s: DiagnosticSignals): DiagnosticFinding | null {
  if (s.operatingAreaCount === 0) return f("no_area", "critical", "לא הוגדר אזור התמחות", "בלי אזור התמחות אין מה לנטר.", "הגדר אזור התמחות ב‑/settings/operating-areas.");
  return null;
}

function permissionFinding(s: DiagnosticSignals, minRole: RoleKeyish): DiagnosticFinding | null {
  if (!s.role) return f("no_role", "warning", "תפקיד לא ידוע", "לא זוהה תפקיד למשתמש.", "פנה למנהל הארגון.");
  if (ROLE_RANK[s.role] < ROLE_RANK[minRole]) return f("role_low", "warning", "אין הרשאה למסך זה", `המסך דורש הרשאת ${minRole} ומעלה.`, "פנה למנהל הארגון להרשאה.");
  return null;
}
type RoleKeyish = keyof typeof ROLE_RANK;

const worst = (findings: DiagnosticFinding[]): DiagnosticStatus => {
  if (findings.some((x) => x.severity === "critical")) return "critical";
  if (findings.some((x) => x.severity === "warning")) return "warning";
  if (findings.length && findings.every((x) => x.severity === "ok")) return "healthy";
  return findings.length ? "warning" : "unknown";
};

export interface CheckOutput {
  status: DiagnosticStatus;
  findings: DiagnosticFinding[];
  likelyCause: string | null;
  userNextSteps: string[];
  adminNextSteps: string[];
  relatedScreens: { label: string; route: string }[];
}

/** Run the deterministic checks for a given issue type. Pure. */
export function runChecks(issueType: IssueType, s: DiagnosticSignals): CheckOutput {
  const findings: DiagnosticFinding[] = [];
  const userNextSteps: string[] = [];
  const adminNextSteps: string[] = [];
  const relatedScreens: { label: string; route: string }[] = [];
  let likelyCause: string | null = null;

  const area = operatingAreaFinding(s);

  switch (issueType) {
    case "property_radar_empty": {
      if (area) findings.push(area);
      findings.push(...syncFindings(s));
      if (s.externalActiveCount === 0) findings.push(f("no_listings", "warning", "אין מודעות חיצוניות פעילות", "טרם נמשכו מודעות מהשוק.", "הרץ סנכרון."));
      else findings.push(f("listings_ok", "ok", `${s.externalActiveCount} מודעות פעילות`, "קיימות מודעות במאגר.", undefined));
      likelyCause = area ? "לא הוגדר אזור התמחות, ולכן הרדאר לא מנטר אזור." : (s.lastSync?.status === "failed" ? "הסנכרון האחרון נכשל." : s.externalActiveCount === 0 ? "טרם בוצע סנכרון מוצלח." : null);
      userNextSteps.push("ודא שהגדרת אזור התמחות.", "הפעל 'סנכרון' במסך המודעות החיצוניות.");
      adminNextSteps.push("בדוק APIFY_TOKEN ושה‑cron פעיל.", "בדוק את ריצת ה‑import_jobs האחרונה.");
      relatedScreens.push({ label: "רדאר נכסים", route: "/property-radar" }, { label: "אזורי התמחות", route: "/settings/operating-areas" });
      break;
    }
    case "map_empty": {
      // Rendering uses MapLibre GL over OSM — no Google browser key required.
      findings.push(f("maps_engine_ok", "ok", "מנוע מפות OSM/MapLibre", "המפות נטענות ב‑MapLibre מעל OpenStreetMap — אין צורך במפתח Google.", undefined));
      const coords = s.externalWithCoords + s.internalWithCoords;
      if (coords === 0) findings.push(f("no_coords", "warning", "אין נכסים עם קואורדינטות", "המפה מציגה רק מיקומים אמיתיים — אין כאלה כעת.", "הרץ 'גאוקד חוסרים' ב‑/admin/geocoding."));
      else findings.push(f("coords_ok", "ok", `${coords} נקודות עם מיקום`, "קיימות קואורדינטות להצגה.", undefined));
      if (!s.hasGeocodeKey) findings.push(f("no_geocode_key", "warning", "מפתח גיאוקודינג חסר", "GOOGLE_MAPS_GEOCODE_API_KEY חסר — השלמת מיקומים בשרת מוגבלת (בחירה ידנית עובדת דרך OSM Nominatim).", "הגדר מפתח שרת לגיאוקודינג (אופציונלי)."));
      likelyCause = coords === 0 ? "אין נכסים עם קואורדינטות — חסר גיאוקודינג." : null;
      userNextSteps.push("רענן את העמוד.", "בדוק את הסינונים הפעילים על המפה.");
      adminNextSteps.push("לפרודקשן הגדר ספק אריחים (NEXT_PUBLIC_MAP_TILE_URL/STYLE_URL).", "הרץ גיאוקודינג למודעות חסרות ב‑/admin/geocoding.");
      relatedScreens.push({ label: "גיאוקודינג", route: "/admin/geocoding" });
      break;
    }
    case "buyer_matching_zero": {
      if (s.activeBuyerCount === 0) findings.push(f("no_buyers", "warning", "אין קונים פעילים", "אין למי להתאים נכסים.", "הוסף קונים עם העדפות."));
      else findings.push(f("buyers_ok", "ok", `${s.activeBuyerCount} קונים פעילים`, "קיימים קונים במאגר.", undefined));
      if (s.activeBuyerCount > 0 && s.buyersWithBudget === 0) findings.push(f("no_budget", "warning", "לקונים אין תקציב/אזור", "בלי תקציב ואזור אין על מה להשוות.", "השלם תקציב ואזור לקונים."));
      if (s.externalActiveCount === 0 && s.internalPropertyCount === 0) findings.push(f("no_props", "warning", "אין נכסים להשוואה", "אין מלאי שניתן להתאים.", "הוסף נכסים או הרץ סנכרון."));
      likelyCause = s.activeBuyerCount === 0 ? "אין קונים פעילים." : (s.buyersWithBudget === 0 ? "לקונים חסרים תקציב/אזור." : "ייתכן שאין נכסים תואמים בטווח.");
      userNextSteps.push("ודא שלקונים מוגדרים תקציב, אזור וסוג נכס.", "בדוק שיש נכסים פעילים תואמים.");
      adminNextSteps.push("בדוק שמנוע ההתאמות רץ לאחרונה.");
      relatedScreens.push({ label: "קונים", route: "/buyers" }, { label: "התאמות", route: "/matches" });
      break;
    }
    case "seller_intelligence_empty": {
      if (area) findings.push(area);
      findings.push(...syncFindings(s));
      if (s.externalActiveCount === 0) findings.push(f("no_private", "warning", "אין נכסים פרטיים מזוהים", "מודיעין מוכרים מבוסס נכסים פרטיים מהרדאר.", "הרץ סנכרון לאיתור נכסים פרטיים."));
      likelyCause = area ? "לא הוגדר אזור התמחות." : "טרם נמשכו נכסים פרטיים מהשוק.";
      userNextSteps.push("ודא אזור התמחות.", "הרץ סנכרון נכסים.");
      adminNextSteps.push("בדוק ספק סריקה וריצת cron.");
      relatedScreens.push({ label: "הזדמנויות בלעדיות", route: "/exclusive-opportunities" });
      break;
    }
    case "journey_not_running": {
      findings.push(f("journey_hint", "info", "בדיקת מסע", "ZI בודק הרשאה, טריגר וריצות אחרונות של המסע.", undefined));
      const perm = permissionFinding(s, "manager");
      if (perm) findings.push(perm);
      likelyCause = perm ? "אין הרשאת ניהול לבניית/הרצת מסעות." : "ייתכן שהטריגר לא הופעל או שהשלב ממתין ל‑SLA.";
      userNextSteps.push("ודא שהמסע מופעל ושיש לו טריגר.", "בדוק אם השלב ממתין (delay/SLA).");
      adminNextSteps.push("בדוק את היסטוריית ההרצות וה‑queue של המסע.");
      relatedScreens.push({ label: "מסעות", route: "/journeys" }, { label: "Journey Builder", route: "/journey-builder" });
      break;
    }
    case "ai_unavailable": {
      findings.push(...aiFindings(s));
      likelyCause = s.aiDisabled ? "ה‑AI כבוי (ZONO_AI_DISABLED)." : (!s.hasAiProvider ? "לא מוגדר מפתח AI." : "ייתכן הגבלת קצב זמנית — ZI עובר ל‑fallback.");
      userNextSteps.push("נסה שוב בעוד רגע — תמיד מתקבל מענה (גם במצב fallback).");
      adminNextSteps.push("ודא OPENAI_API_KEY/ANTHROPIC_API_KEY וש‑ZONO_AI_DISABLED כבוי.");
      relatedScreens.push({ label: "AI Office", route: "/ai-office" });
      break;
    }
    case "provider_sync_failed": case "cron_not_running": {
      findings.push(...syncFindings(s));
      likelyCause = s.lastSync?.status === "failed" ? `הסנכרון נכשל: ${s.lastSync.error ?? "שגיאה לא ידועה"}.` : (!s.hasCronSecret ? "CRON_SECRET חסר — ה‑cron עלול לא לרוץ." : "ייתכן שה‑cron אינו מתוזמן בפריסה.");
      userNextSteps.push("הרץ סנכרון ידני כדי לבדוק.");
      adminNextSteps.push("ודא CRON_SECRET + הגדרות ה‑cron ב‑vercel.json.", "בדוק את כלי ה‑debug של הספק.");
      relatedScreens.push({ label: "בריאות מערכת", route: "/system-health" });
      break;
    }
    case "permission_denied": {
      const perm = permissionFinding(s, "manager");
      findings.push(perm ?? f("perm_ok", "ok", "הרשאה תקינה", "לא זוהתה בעיית הרשאה כללית.", undefined));
      likelyCause = perm ? "התפקיד אינו מספיק למסך/לפעולה." : "ייתכן שהמסך מוגבל ליכולת ספציפית.";
      userNextSteps.push("פנה למנהל הארגון לקבלת הרשאה מתאימה.");
      adminNextSteps.push("בדוק את תפקיד המשתמש והרשאות המודול.");
      relatedScreens.push({ label: "הרשאות", route: "/admin/permissions" });
      break;
    }
    case "credits_exhausted": {
      findings.push(...syncFindings(s));
      likelyCause = "ייתכן שמכסת הסריקה/הספק מוצתה — נבדק מול ריצות הסנכרון.";
      userNextSteps.push("המתן לחלון המכסה הבא או פנה למנהל.");
      adminNextSteps.push("בדוק מכסות Apify/ספק ושימוש.");
      relatedScreens.push({ label: "בריאות מערכת", route: "/system-health" });
      break;
    }
    case "reports_not_generating": {
      const perm = permissionFinding(s, "manager");
      if (perm) findings.push(perm);
      findings.push(f("reports_hint", "info", "בדיקת דוחות", "דוחות מתעשרים עם הצטברות נתונים ופעילות.", undefined));
      likelyCause = perm ? "אין הרשאת ניהול לדוחות." : "ייתכן שאין מספיק נתונים שהצטברו עדיין.";
      userNextSteps.push("ודא שיש פעילות/עסקאות שהצטברו.");
      adminNextSteps.push("בדוק ריצת מנוע ה‑BI/דוחות האחרונה.");
      relatedScreens.push({ label: "מודיעין הנהלה", route: "/executive-intelligence" });
      break;
    }
    case "notifications_missing": {
      if (s.recentNotificationCount === 0) findings.push(f("no_notifs", "info", "אין התראות אחרונות", "לא נוצרו התראות חדשות.", "התראות נוצרות מאירועים אמיתיים (התאמות, ירידות מחיר וכו')."));
      else findings.push(f("notifs_ok", "ok", `${s.recentNotificationCount} התראות אחרונות`, "קיימות התראות.", undefined));
      likelyCause = s.recentNotificationCount === 0 ? "טרם נוצרו אירועים שמייצרים התראות." : null;
      userNextSteps.push("ודא שהפעילות (סנכרון/התאמות) רצה — היא מייצרת התראות.");
      adminNextSteps.push("בדוק שה‑cron והמנועים פעילים.");
      relatedScreens.push({ label: "התראות", route: "/notifications" });
      break;
    }
    case "realtime_not_arriving": {
      findings.push(f("realtime_hint", "info", "עדכוני זמן אמת", "עדכונים חיים תלויים בחיבור Realtime פעיל.", undefined));
      likelyCause = "ייתכן ניתוק זמני של חיבור ה‑Realtime — רענון העמוד בדרך כלל פותר.";
      userNextSteps.push("רענן את העמוד.", "בדוק חיבור אינטרנט.");
      adminNextSteps.push("בדוק את מצב ה‑Realtime ב‑/system-health.");
      relatedScreens.push({ label: "בריאות מערכת", route: "/system-health" });
      break;
    }
    case "feature_unavailable": default: {
      const perm = permissionFinding(s, "agent");
      if (perm) findings.push(perm);
      findings.push(...aiFindings(s));
      if (area) findings.push(area);
      likelyCause = perm ? "ייתכן שהיכולת מוגבלת להרשאה/חבילה." : null;
      userNextSteps.push("ודא הרשאה והגדרות בסיסיות (אזור התמחות, מפתחות).");
      adminNextSteps.push("בדוק דגלי תכונה (Feature Flags) והרשאות מודול.");
      relatedScreens.push({ label: "בריאות מערכת", route: "/system-health" }, { label: "ניהול פלטפורמה", route: "/platform-admin" });
      break;
    }
  }

  return { status: worst(findings), findings, likelyCause, userNextSteps, adminNextSteps, relatedScreens };
}
