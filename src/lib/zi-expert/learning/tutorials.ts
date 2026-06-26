// ZI Learning — built-in tutorials (Phase 25, PURE). Short lessons per module.
import type { RoleKey } from "../types";
import { ROLE_RANK } from "../permissions";
import type { Tutorial } from "./types";

const step = (id: string, title: string, body: string) => ({ id, title, body, screen: null, tip: null });

export const TUTORIALS: Tutorial[] = [
  {
    slug: "first-property", module: "properties", title: "הוספת הנכס הראשון", summary: "ללמוד להוסיף נכס ולמלא את הפרטים החשובים.",
    estimatedMinutes: 4, roleMin: "agent",
    steps: [step("s1", "צור נכס", "לחץ „נכס חדש” ומלא כתובת, חדרים ומ״ר."), step("s2", "הוסף תמונות", "גלריית תמונות משפרת חשיפה והתאמות."), step("s3", "פרסם", "פרסום מפעיל את מנועי המודיעין על הנכס.")],
  },
  {
    slug: "buyer-basics", module: "buyers", title: "ניהול קונים נכון", summary: "להגדיר קונה עם העדפות כדי לקבל התאמות איכותיות.",
    estimatedMinutes: 3, roleMin: "agent",
    steps: [step("s1", "צור קונה", "הוסף תקציב, אזור וסוג נכס."), step("s2", "עדכן העדפות", "ככל שמדויק יותר — ההתאמות חזקות יותר."), step("s3", "עקוב אחר התאמות", "בדוק את ההתאמות המומלצות לקונה.")],
  },
  {
    slug: "office-intel-basics", module: "office-intelligence", title: "קריאת מודיעין משרד", summary: "להבין בריאות משרד, דליפות ופעולות ניהול.",
    estimatedMinutes: 4, roleMin: "manager",
    steps: [step("s1", "בריאות המשרד", "ציון כולל של ביצועי המשרד."), step("s2", "דליפות הזדמנויות", "היכן מתפספסות עסקאות."), step("s3", "פעולות ניהול", "המלצות לפעולה — ZONO מציע, אתה מחליט.")],
  },
];

export function tutorialsForRole(role: RoleKey | null): Tutorial[] {
  const rank = role ? ROLE_RANK[role] : ROLE_RANK.viewer;
  return TUTORIALS.filter((t) => ROLE_RANK[t.roleMin] <= rank);
}

export const tutorialBySlug = (slug: string): Tutorial | null => TUTORIALS.find((t) => t.slug === slug) ?? null;
