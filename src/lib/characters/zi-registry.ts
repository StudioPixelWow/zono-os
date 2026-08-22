// ============================================================================
// ZONO — ZI Character System · REGISTRY (pure, client-safe).
// ONE source of truth for the ZI character assets so no component ever hardcodes
// an image path. Nine deliberate states, each used for a specific MOMENT (never
// decoration for its own sake). Assets are self-hosted transparent PNGs under
// /public/characters/zi/. The alt strings describe the STATE/meaning (not the
// look) and are used only when the character carries real meaning; a purely
// decorative placement passes alt="" + aria-hidden instead.
// ============================================================================

export type ZIState =
  | "welcome" | "thinking" | "scanning" | "working" | "pointing"
  | "success" | "alert" | "celebrate" | "empty";

export const ZI_STATES: Record<ZIState, string> = {
  welcome: "/characters/zi/zi-welcome.png",
  thinking: "/characters/zi/zi-thinking.png",
  scanning: "/characters/zi/zi-scanning.png",
  working: "/characters/zi/zi-working.png",
  pointing: "/characters/zi/zi-pointing.png",
  success: "/characters/zi/zi-success.png",
  alert: "/characters/zi/zi-alert.png",
  celebrate: "/characters/zi/zi-celebrate.png",
  empty: "/characters/zi/zi-empty.png",
};

export const ZI_ALL_STATES: ZIState[] = [
  "welcome", "thinking", "scanning", "working", "pointing",
  "success", "alert", "celebrate", "empty",
];

/** Meaningful alt text per state (Hebrew). Used only when the character conveys
 *  state; decorative placements use alt="" + aria-hidden. */
export const ZI_STATE_ALT: Record<ZIState, string> = {
  welcome: "ZI מקבלת אתכם בברכה",
  thinking: "ZI מנתחת את הנתונים",
  scanning: "ZI סורקת את המאגר",
  working: "ZI עובדת על הפעולה",
  pointing: "ZI מצביעה על הפעולה הבאה",
  success: "ZI — הפעולה הושלמה בהצלחה",
  alert: "ZI — נדרשת תשומת לב",
  celebrate: "ZI חוגגת הישג",
  empty: "ZI — אין כאן עדיין נתונים",
};

/** Display levels → the finest control lives in CSS tokens; this maps the intent. */
export type ZISize = "xs" | "sm" | "md" | "lg" | "xl";
/** Where the character sits relative to its container. */
export type ZIPlacement = "inline" | "card-edge" | "center" | "floating";
