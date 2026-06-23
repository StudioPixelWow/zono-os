"use client";
import { AnimatePresence, motion } from "framer-motion";

/** Rotating "what's happening now" messages (exact Hebrew, RTL). */
export const TICKER_MESSAGES = [
  "מנתחת את תמונות הנכס",
  "מזהה את נקודות המכירה החזקות ביותר",
  "בוחרת שפה עיצובית מתאימה",
  "יוצרת 16 קומפוזיציות שונות",
  "מבצעת QA לטקסטים בעברית",
  "בודקת RTL וקריאות במובייל",
  "מדרגת לפי Wow Score",
  "בוחרת את 4 המודעות החזקות ביותר",
] as const;

export function CreativeStatusTicker({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-[12px] font-bold">כעת המערכת:</span>
      <div className="relative h-7 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-ink absolute inset-0 text-[15px] font-black"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
