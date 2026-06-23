"use client";
import { motion } from "framer-motion";

/** Subtle premium AI background — floating ad-card wireframes, moving layout
 *  blocks, glowing lines, creative-analysis chips and animated Wow numbers.
 *  Pure CSS/Framer (no video). Light, premium motion — decorative only. */
export function AICanvasAnimation() {
  const chips = ["Wow 96", "RTL ✓", "ניתוח", "פרימיום", "מחיר", "סוכן", "לוגו", "92", "98"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* soft glowing radial wash */}
      <div className="absolute -right-20 -top-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.28),transparent_70%)] blur-2xl" />
      <div className="absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.18),transparent_70%)] blur-2xl" />

      {/* floating ad-card wireframes assembling themselves */}
      {[
        { top: "12%", left: "8%", d: 7, delay: 0 },
        { top: "58%", left: "14%", d: 9, delay: 1.2 },
        { top: "26%", left: "78%", d: 8, delay: 0.6 },
        { top: "68%", left: "72%", d: 10, delay: 1.8 },
      ].map((c, i) => (
        <motion.div
          key={i}
          className="absolute h-20 w-16 rounded-lg border border-white/15 bg-white/5 backdrop-blur-sm"
          style={{ top: c.top, left: c.left }}
          initial={{ opacity: 0, y: 10, rotate: -3 }}
          animate={{ opacity: [0, 0.7, 0.5, 0.7], y: [10, -8, 6, 10], rotate: [-3, 2, -2, -3] }}
          transition={{ duration: c.d, delay: c.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="m-1.5 h-8 rounded bg-white/12" />
          <div className="mx-1.5 mt-1 h-1.5 w-9 rounded-full bg-white/20" />
          <div className="mx-1.5 mt-1 h-1.5 w-6 rounded-full bg-white/12" />
          <div className="mx-1.5 mt-1.5 h-2.5 w-7 rounded-full bg-[rgba(124,58,237,0.5)]" />
        </motion.div>
      ))}

      {/* glowing connecting lines */}
      <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none">
        <motion.line x1="10%" y1="20%" x2="80%" y2="35%" stroke="rgba(124,58,237,0.5)" strokeWidth="1"
          animate={{ opacity: [0.1, 0.6, 0.1] }} transition={{ duration: 5, repeat: Infinity }} />
        <motion.line x1="15%" y1="65%" x2="75%" y2="72%" stroke="rgba(124,58,237,0.4)" strokeWidth="1"
          animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 6, repeat: Infinity, delay: 1 }} />
      </svg>

      {/* drifting creative-analysis chips + animated wow numbers */}
      {chips.map((label, i) => (
        <motion.span
          key={label}
          className="absolute rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[9px] font-bold text-white/70 backdrop-blur-sm"
          style={{ top: `${12 + (i * 9) % 76}%`, left: `${(i * 37) % 84}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0], y: [6, -14, 6] }}
          transition={{ duration: 6 + (i % 4), delay: i * 0.7, repeat: Infinity, ease: "easeInOut" }}
        >
          {label}
        </motion.span>
      ))}
    </div>
  );
}
