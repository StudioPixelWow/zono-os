"use client";

import Link from "next/link";
import { journeyProperties, journeyStages } from "@/data/mock";
import type { JourneyProperty, JourneyRailStage } from "@/types/dashboard";
import { cn } from "@/lib/utils";
import { Icon } from "../Icon";
import { SectionShell } from "../SectionShell";
import { motion } from "../motion";

const nodeColor = {
  done: "bg-success border-success text-white",
  active: "bg-brand border-brand text-white zono-glow",
  risk: "bg-danger border-danger text-white",
  upcoming: "bg-card border-line text-muted",
} as const;

export function JourneysSection({ stages = journeyStages, properties = journeyProperties }: { stages?: JourneyRailStage[]; properties?: JourneyProperty[] } = {}) {
  return (
    <SectionShell title="מסע הנכסים הפעילים שלך" eyebrow="פייפליין חי" actionHref="/properties" actionLabel="לכל הנכסים">
      <div className="bg-card border-line rounded-[24px] border p-5 shadow-[var(--shadow-card)] sm:p-6">
        {/* Timeline rail */}
        <div className="no-scrollbar -mx-1 overflow-x-auto pb-2">
          <div className="relative flex min-w-[680px] items-start justify-between px-1">
            {/* connector line */}
            <span className="bg-line absolute end-6 start-6 top-5 h-0.5" />
            {stages.map((s, i) => (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-black",
                    nodeColor[s.state],
                  )}
                >
                  {s.count}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    s.state === "active"
                      ? "text-brand-strong"
                      : s.state === "risk"
                        ? "text-danger"
                        : s.state === "done"
                          ? "text-ink"
                          : "text-muted",
                  )}
                >
                  {s.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Property mini cards */}
        <div className="no-scrollbar mt-6 -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
          {properties.map((p, i) => {
            const main = i === 0;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -4 }}
              >
              <Link
                href={p.href ?? `/properties/${p.id}`}
                className={cn(
                  "flex w-[230px] shrink-0 flex-col overflow-hidden rounded-[20px] border bg-card transition-shadow",
                  main
                    ? "border-brand-light shadow-[var(--shadow-lift)]"
                    : "border-line shadow-[var(--shadow-soft)]",
                )}
              >
                <div className={cn("relative h-20 overflow-hidden bg-gradient-to-br", p.gradient)}>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  )}
                  <span className="bg-card/90 text-brand absolute end-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-extrabold backdrop-blur">
                    {p.score}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  <p className="text-ink text-sm font-extrabold">{p.address}</p>
                  <div className="flex items-center gap-2">
                    <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">
                      {p.stage}
                    </span>
                    <span className="text-muted text-[10px]">{p.progressLabel}</span>
                  </div>
                  <div className="text-muted mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
                    <Icon name="ArrowUpRight" size={13} className="text-brand" />
                    {p.nextAction}
                  </div>
                </div>
              </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
