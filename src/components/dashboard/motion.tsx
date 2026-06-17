"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/** Standard "rise + fade" used by sections and cards. */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

/** Stagger container for lists of cards. */
export const staggerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Fades a block in once it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  return (
    <motion.div
      className={className}
      variants={riseVariants}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its children (use with `RevealItem`). */
export function RevealGroup({ children, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      variants={staggerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

/** A single staggered child inside a `RevealGroup`. */
export function RevealItem({ children, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      variants={riseVariants}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export { motion };
