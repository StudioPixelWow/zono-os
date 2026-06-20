"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { quickActions } from "@/data/mock";
import { Icon } from "../Icon";
import { ZonoOrb } from "../FloatingAssistant";
import { Reveal, motion } from "../motion";

/** Maps a quick-action label to the most relevant destination page. */
function actionHref(label: string): string {
  if (label.includes("שוק") || label.includes("מפה")) return "/market";
  if (label.includes("מתחר")) return "/competitors";
  if (label.includes("גיוס") || label.includes("מלאי")) return "/acquisition";
  if (label.includes("התאמ") || label.includes("קונ")) return "/matches";
  if (label.includes("תחזית") || label.includes("הכנס")) return "/forecast";
  if (label.includes("נכס")) return "/properties";
  return "/command";
}

export function CommandSection() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = (e: React.FormEvent) => { e.preventDefault(); router.push("/command"); };
  return (
    <Reveal>
      <div className="from-brand to-brand-strong relative overflow-hidden rounded-[28px] bg-gradient-to-br p-6 text-white shadow-[0_24px_60px_rgba(124,58,237,0.35)] sm:p-8">
        {/* soft blobs */}
        <span className="absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <span className="absolute -bottom-16 start-20 h-52 w-52 rounded-full bg-white/5" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4 lg:w-72 lg:shrink-0">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <ZonoOrb size={56} />
            </motion.div>
            <div>
              <h2 className="text-2xl font-black leading-tight">
                מה תרצה שזונו יעשה עבורך?
              </h2>
              <p className="text-white/70 text-sm">העוזר החכם שלך, בלחיצה אחת.</p>
            </div>
          </div>

          <div className="flex-1">
            {/* command input */}
            <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl bg-white/15 p-2 backdrop-blur">
              <span className="ps-2 text-white/80">
                <Icon name="Sparkles" size={18} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-9 flex-1 bg-transparent text-sm text-white placeholder:text-white/60 outline-none"
                placeholder="שאל את זונו..."
              />
              <button type="submit" className="text-brand-strong inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold transition hover:bg-white/90">
                <Icon name="Send" size={15} strokeWidth={2.2} />
                שלח
              </button>
            </form>

            {/* quick actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {quickActions.map((a) => (
                <Link
                  key={a.id}
                  href={actionHref(a.label)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3.5 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
                >
                  <Icon name={a.icon} size={15} strokeWidth={2} />
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
