"use client";

import { useState } from "react";
import Link from "next/link";
import { Glass, SectionHeading, Toggle, Icon } from "./shared";

interface AutomationDef {
  key: string;
  icon: string;
  title: string;
  body: string;
  status: "active" | "assisted" | "soon";
  href?: string;
}

const AUTOMATIONS: AutomationDef[] = [
  { key: "repost", icon: "Repeat", title: "פרסום חוזר אוטומטי", body: "ZONO ירכיב מחדש פוסטים מנצחים בקהילות עם ROI גבוה לפי תדירות מומלצת. במצב הנוכחי המערכת מכינה את הפוסטים ואתה מאשר לפני פרסום.", status: "assisted", href: "/distribution/daily" },
  { key: "comments", icon: "MessageSquare", title: "אוטומציית תגובות", body: "זיהוי תגובות עם כוונת רכישה ומענה מוצע אוטומטי. דורש חיבור Meta — יופעל לאחר אישור הרשאות הקהילה.", status: "soon" },
  { key: "whatsapp", icon: "MessageCircle", title: "אוטומציית וואטסאפ", body: "העברת לידים חמים ישירות לוואטסאפ עם הודעת פתיחה מותאמת. מנוהל דרך מרכז הוואטסאפ של ZONO.", status: "active", href: "/whatsapp" },
  { key: "routing", icon: "Route", title: "ניתוב לידים", body: "הקצאת לידים מההפצה לסוכן המתאים לפי אזור, התמחות ועומס. מנוהל דרך מנוע הניתוב.", status: "active", href: "/routing" },
];

const STATUS_META: Record<AutomationDef["status"], { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-success-soft text-success" },
  assisted: { label: "ידני-מסייע", cls: "bg-brand-soft text-brand-strong" },
  soon: { label: "בקרוב", cls: "bg-warning-soft text-warning" },
};

export function AutomationCenterSection() {
  const [on, setOn] = useState<Record<string, boolean>>({ repost: true, comments: false, whatsapp: true, routing: true });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="מרכז אוטומציה" subtitle="הגדרת הזרמים האוטומטיים של ההפצה — תחת בקרה אנושית" icon="Workflow" />

      <Glass className="zono-glass-dark flex items-start gap-2.5 rounded-2xl p-4">
        <Icon name="ShieldCheck" size={18} className="text-brand-strong mt-0.5 shrink-0" />
        <p className="text-ink text-[13px] font-semibold leading-relaxed">
          ZONO פועל במודל מסייע: כל פרסום עובר אישור שלך לפני שהוא יוצא. האוטומציות מכינות, מתזמנות וממליצות — אתה תמיד הגורם המאשר.
        </p>
      </Glass>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {AUTOMATIONS.map((a) => {
          const meta = STATUS_META[a.status];
          return (
            <Glass key={a.key} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="zono-ai-gradient grid h-10 w-10 place-items-center rounded-xl text-white"><Icon name={a.icon} size={18} /></span>
                  <div>
                    <p className="text-ink text-sm font-extrabold">{a.title}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                  </div>
                </div>
                <Toggle on={!!on[a.key]} disabled={a.status === "soon"} onChange={() => setOn((s) => ({ ...s, [a.key]: !s[a.key] }))} />
              </div>
              <p className="text-muted text-xs leading-relaxed">{a.body}</p>
              {a.href && <Link href={a.href} className="text-brand-strong text-sm font-bold">פתח הגדרות ←</Link>}
            </Glass>
          );
        })}
      </div>
    </div>
  );
}
