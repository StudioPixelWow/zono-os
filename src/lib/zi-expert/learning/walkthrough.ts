// ZI Learning — built-in guided walkthroughs (Phase 25, PURE).
import type { RoleKey } from "../types";
import { ROLE_RANK } from "../permissions";
import type { Walkthrough } from "./types";

const step = (id: string, title: string, body: string, screen?: string, tip?: string) =>
  ({ id, title, body, screen: screen ?? null, tip: tip ?? null });

export const WALKTHROUGHS: Walkthrough[] = [
  {
    slug: "property-radar", module: "property-radar-live", title: "רדאר נכסים — סיור מודרך",
    goal: "להבין איך לזהות הזדמנויות נכסים חמות באזור שלך ולפעול עליהן.",
    estimatedMinutes: 3, prerequisites: ["הגדרת אזור התמחות"], roleMin: "agent",
    steps: [
      step("s1", "פתח את הרדאר", "היכנס למסך „רדאר נכסים”. כאן מרוכזות כל המודעות שנמשכו מהשוק לאזור שלך.", "/property-radar"),
      step("s2", "סנן לפי Opportunity Score", "מיין לפי הציון הגבוה — אלו ההזדמנויות החזקות ביותר.", "/property-radar", "ציון 80+ הוא בדרך כלל Hot Deal."),
      step("s3", "זהה מוכרים פרטיים", "מודעות פרטיות הן הזדמנות לבלעדיות. חפש את התגית „מוכר פרטי”.", "/property-radar"),
      step("s4", "אימות סופי", "ודא שהאזור והסינונים נכונים, ושיש מודעות פעילות. אם ריק — בצע סנכרון.", "/property-radar"),
    ],
    commonMistakes: ["לא הוגדר אזור התמחות", "לא בוצע סנכרון אחרון", "סינון מחמיר מדי שמסתיר תוצאות"],
    proTips: ["עבוד מהציון הגבוה כלפי מטה", "סמן מוכרים פרטיים לבלעדיות מהירה"],
  },
  {
    slug: "buyer-matching", module: "matches", title: "התאמת קונים — סיור מודרך",
    goal: "ללמוד איך ZONO מתאימה קונים לנכסים ואיך לשפר את ההתאמות.",
    estimatedMinutes: 3, prerequisites: ["קונים עם תקציב ואזור"], roleMin: "agent",
    steps: [
      step("s1", "בדוק את פרטי הקונה", "ודא שלקונה מוגדרים תקציב, אזור, חדרים וסוג נכס.", "/buyers"),
      step("s2", "פתח את ההתאמות", "במסך ההתאמות תראה את ציון ההתאמה וההסבר לכל זוג קונה–נכס.", "/matches"),
      step("s3", "פעל לפי ציון", "התחל מהציון הגבוה — הסיכוי לסגירה גבוה יותר.", "/matches"),
      step("s4", "אימות סופי", "אם אין התאמות — חסר תקציב/אזור לקונה, או אין נכסים תואמים בטווח.", "/matches"),
    ],
    commonMistakes: ["לקונה אין תקציב או אזור", "אין נכסים פעילים תואמים"],
    proTips: ["השלם תקציב ואזור לכל קונה", "עדכן העדפות אחרי כל שיחה"],
  },
  {
    slug: "journey-builder", module: "journey-builder", title: "Journey Builder — בניית מסע",
    goal: "להרכיב מסע אוטומטי עם טריגר, שלבים ופעולות.",
    estimatedMinutes: 4, prerequisites: ["הרשאת מנהל"], roleMin: "manager",
    steps: [
      step("s1", "צור מסע חדש", "בחר תבנית או התחל מאפס.", "/journey-builder"),
      step("s2", "הגדר טריגר", "מתי המסע מתחיל — לדוגמה, נכס חדש או קונה חם.", "/journey-builder"),
      step("s3", "הוסף שלבים", "פעולות, השהיות ותנאים. ZONO מנהל את הסדר.", "/journey-builder"),
      step("s4", "הפעל ואמת", "ודא שהמסע מופעל ושהטריגר תקין. בדוק הרצה ראשונה.", "/journeys"),
    ],
    commonMistakes: ["המסע לא הופעל", "אין טריגר מוגדר"],
    proTips: ["התחל מתבנית מוכנה", "בדוק את ההרצה הראשונה לפני הפעלה רחבה"],
  },
];

export function walkthroughsForRole(role: RoleKey | null): Walkthrough[] {
  const rank = role ? ROLE_RANK[role] : ROLE_RANK.viewer;
  return WALKTHROUGHS.filter((w) => ROLE_RANK[w.roleMin] <= rank);
}

export const walkthroughBySlug = (slug: string): Walkthrough | null => WALKTHROUGHS.find((w) => w.slug === slug) ?? null;

/** Step-by-step plain text for "show me step by step". */
export function walkthroughAsSteps(w: Walkthrough): string {
  const lines = [`**${w.title}** · ⏱️ ${w.estimatedMinutes} דק׳`, `🎯 ${w.goal}`, ""];
  w.steps.forEach((s, i) => {
    lines.push(`**שלב ${i + 1}: ${s.title}**`);
    lines.push(s.body);
    if (s.tip) lines.push(`💡 ${s.tip}`);
    lines.push("↓");
  });
  lines.push("**אימות סופי** — ודא שהשלמת את כל השלבים. אני כאן אם משהו לא ברור.");
  return lines.join("\n");
}
