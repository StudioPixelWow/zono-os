// ZI Learning — ordered learning paths (Phase 25, PURE).
import type { LearningPath } from "./types";

export const LEARNING_PATHS: LearningPath[] = [
  {
    slug: "new-agent", title: "מסלול סוכן חדש", description: "הצעדים הראשונים ב‑ZONO — מנכס ראשון ועד התאמות.",
    steps: [
      { kind: "tutorial", slug: "first-property", title: "הוספת הנכס הראשון" },
      { kind: "tutorial", slug: "buyer-basics", title: "ניהול קונים נכון" },
      { kind: "walkthrough", slug: "buyer-matching", title: "התאמת קונים" },
      { kind: "walkthrough", slug: "property-radar", title: "רדאר נכסים" },
    ],
  },
  {
    slug: "manager-intel", title: "מסלול מנהל משרד", description: "להוביל את המשרד עם מודיעין ואוטומציה.",
    steps: [
      { kind: "tutorial", slug: "office-intel-basics", title: "קריאת מודיעין משרד" },
      { kind: "walkthrough", slug: "journey-builder", title: "בניית מסע" },
    ],
  },
];

export const pathBySlug = (slug: string): LearningPath | null => LEARNING_PATHS.find((p) => p.slug === slug) ?? null;
