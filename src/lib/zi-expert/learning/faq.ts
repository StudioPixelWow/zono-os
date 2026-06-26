// ZI Learning — built-in smart FAQ (Phase 25, PURE), grouped by module.
import type { FaqItem } from "./types";
import type { RoleKey } from "../types";
import { ROLE_RANK } from "../permissions";

type RoleKeyish = RoleKey;

export const FAQ: FaqItem[] = [
  { slug: "radar-empty", module: "property-radar", question: "למה רדאר הנכסים ריק?", answer: "ודא שהגדרת אזור התמחות ושבוצע סנכרון מוצלח. הרדאר מציג רק נכסים שנמשכו מהשוק לאזור שלך. אפשר ללחוץ „סנכרון” במסך המודעות.", roleMin: "agent" },
  { slug: "radar-opp-score", module: "property-radar", question: "איך מחושב Opportunity Score?", answer: "השילוב של מחיר מול ממוצע השוק, איכות נתוני המודעה, סימני מוכר פרטי ופוטנציאל בלעדיות. ככל שגבוה יותר — הזדמנות חזקה יותר.", roleMin: "agent" },
  { slug: "matching-zero", module: "buyer-matching", question: "למה אין התאמות לקונה?", answer: "בדוק שלקונה מוגדרים תקציב, אזור וסוג נכס, ושיש נכסים פעילים תואמים בטווח. בלי תקציב/אזור אין על מה להשוות.", roleMin: "agent" },
  { slug: "journey-not-running", module: "journeys", question: "למה המסע לא רץ?", answer: "ודא שהמסע מופעל ושיש לו טריגר. ייתכן שהשלב ממתין (השהיה/SLA) או שה‑queue עוד מעבד. בדוק את היסטוריית ההרצות של המסע.", roleMin: "manager" },
  { slug: "ai-not-working", module: "ai-office", question: "למה ה‑AI לא עונה?", answer: "ייתכן שה‑AI כבוי (ZONO_AI_DISABLED) או שאין מפתח ספק. תמיד מתקבל מענה — במצב fallback דטרמיניסטי. למנהל: ודא מפתח AI בהגדרות.", roleMin: "agent" },
  { slug: "settings-areas", module: "settings", question: "איך מגדירים אזור התמחות?", answer: "הגדרות → אזורי התמחות. הוסף עיר/שכונה. זה משפיע על רדאר, סנכרון, התאמות ומפת החום.", roleMin: "agent" },
  { slug: "office-intel", module: "office-intelligence", question: "מה מציג מודיעין המשרד?", answer: "בריאות המשרד, דליפות הזדמנויות, ופעולות ניהול מומלצות — מתעשר ככל שמצטברת פעילות אמיתית במשרד.", roleMin: "manager" },
  { slug: "competitor-intel", module: "competitor-intelligence", question: "איך עובד מודיעין מתחרים?", answer: "מזהה משרדי תיווך פעילים באזור מתוך המודעות, ומחשב נתח שוק, דומיננטיות ומגמות — ללא נתונים פרטיים של מתחרים.", roleMin: "manager" },
];

const NORM = (s: string) => s.toLowerCase().normalize("NFKC");

export function faqForModule(moduleId: string | null, role: RoleKeyish): FaqItem[] {
  const rank = ROLE_RANK[role];
  return FAQ.filter((f) => ROLE_RANK[f.roleMin] <= rank && (!moduleId || f.module === moduleId));
}

export function searchFaq(query: string, role: RoleKeyish, limit = 8): FaqItem[] {
  const q = NORM(query.trim());
  const rank = ROLE_RANK[role];
  if (!q) return [];
  return FAQ
    .filter((f) => ROLE_RANK[f.roleMin] <= rank)
    .map((f) => {
      const hay = NORM(`${f.question} ${f.answer}`);
      let score = 0;
      if (hay.includes(q)) score += 40;
      for (const w of q.split(/\s+/)) if (w && hay.includes(w)) score += 8;
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

export const faqBySlug = (slug: string): FaqItem | null => FAQ.find((f) => f.slug === slug) ?? null;
