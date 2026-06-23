"use client";
import { motion } from "framer-motion";

/** The 12 explored creative CONCEPTS (text-level strategy cards — NOT finished
 *  images). Premium Israeli real-estate directions; exact Hebrew angles. */
export const CONCEPTS: { style: string; angle: string }[] = [
  { style: "Luxury Editorial", angle: "יוקרה שקטה, תמונת נכס גדולה, טיפוגרפיה נקייה" },
  { style: "Boutique Residence", angle: "תחושת בוטיק משפחתית, צבעים חמים, קומפוזיציה רגועה" },
  { style: "Investor Angle", angle: "הדגשת הזדמנות נדל״נית, מחיר, מיקום ופוטנציאל" },
  { style: "Premium Clean", angle: "מינימליסטי, הרבה מרחב לבן, הנכס כגיבור" },
  { style: "Penthouse Collection", angle: "יוקרה כהה, תחושת פנטהאוז, ניגודיות עמוקה" },
  { style: "Urban Prestige", angle: "יוקרה עירונית, תאורת לילה, ניגודיות חזקה" },
  { style: "Architectural Showcase", angle: "דגש אדריכלי, קווים נקיים, קומפוזיציה מדודה" },
  { style: "Family Living", angle: "אווירה משפחתית חמה, איכות חיים" },
  { style: "New Project Launch", angle: "תחושת השקה, קמפיין חזק, אנרגיה" },
  { style: "High Conversion", angle: "מחיר דומיננטי, קריאה לפעולה ברורה" },
  { style: "Developer Campaign", angle: "פרימיום קורפורטיבי, אמינות יזמית" },
  { style: "Investment Opportunity", angle: "תשואה, פוטנציאל והזדמנות שוק" },
];

const QA_LABEL: Record<string, string> = { low: "QA: נמוך", medium: "QA: בינוני", high: "QA: גבוה" };
const QA_TONE: Record<string, string> = { low: "text-success", medium: "text-warning", high: "text-danger" };

export function CreativeConceptGrid({
  generated, scored, scores, qaRisk, selectedSet, selectPhase,
}: {
  generated: number;           // how many of 12 concepts are "created"
  scored: boolean;             // show Wow scores
  scores: number[];            // 12 pseudo wow scores
  qaRisk: ("low" | "medium" | "high")[];
  selectedSet: Set<number>;    // the 2 chosen concepts
  selectPhase: boolean;        // highlight winners + dim the rest
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {CONCEPTS.map((cc, i) => {
        const isGen = i < generated;
        const isSel = selectPhase && selectedSet.has(i);
        const isRej = selectPhase && !selectedSet.has(i);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0.35, y: 8 }}
            animate={{ opacity: isRej ? 0.4 : isGen ? 1 : 0.5, y: 0, scale: isSel ? 1.02 : 1 }}
            transition={{ duration: 0.35, delay: isGen ? 0 : 0.05 }}
            className={`relative flex flex-col gap-1 rounded-xl border p-2.5 text-right ${
              isSel ? "border-brand-strong ring-brand-strong/40 bg-brand-soft/40 shadow-[0_0_16px_rgba(124,58,237,0.4)] ring-2" : "border-line/50 bg-surface/60"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="bg-ink/80 text-card grid h-4 w-4 place-items-center rounded text-[8px] font-black">{i + 1}</span>
              {scored && isGen ? (
                <span className={`rounded-md px-1 py-0.5 text-[9px] font-black ${isSel ? "bg-brand-strong text-card" : "bg-ink/10 text-ink"}`}>Wow {scores[i]}</span>
              ) : (
                <span className="text-muted/50 text-[9px] font-bold">Wow —</span>
              )}
            </div>
            <p className={`text-[11px] font-black ${isGen ? "text-ink" : "text-muted/60"}`}>{cc.style}</p>
            <p className={`text-[9.5px] leading-tight ${isGen ? "text-muted" : "text-muted/40"}`}>{isGen ? cc.angle : "מנתח כיוון…"}</p>
            <span className={`mt-0.5 text-[9px] font-bold ${scored && isGen ? QA_TONE[qaRisk[i]] : "text-muted/40"}`}>
              {scored && isGen ? QA_LABEL[qaRisk[i]] : "QA: —"}
            </span>
            {isSel && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-brand-strong text-card absolute -top-2 right-2 rounded-md px-1.5 py-0.5 text-[8px] font-black shadow">
                נבחר להפקה
              </motion.span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
